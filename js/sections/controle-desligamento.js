// Entrevista de Desligamento → guia "Controle de Desligamento".
//
// Substitui a aba "ATUALIZADA (MOVIMENTAR)" da planilha "Controle de
// Desligamento.xlsx": o RH lança o ID de desligamento que chega pelo Forms do
// gestor, acompanha o status na Feedz até o último dia e depois faz o contato
// e a entrevista de desligamento (link gerado aqui mesmo).
//
// Dados: tabela controle_desligamento (supabase-controle-desligamento.sql),
// carregada junto com as tabelas do Recrutamento em
// HUB_RECRUIT_DATA.controle_desligamento (camelCase — ver dal-recrutamento.js).
// O que a planilha fazia com PROCV, aqui é calculado na hora:
//   Headcount  → ID da Feedz gravado no lançamento; no histórico importado,
//                nome completo (exato; depois ignorando espaços), desempatando
//                pela data de desligamento;
//   AVE        → CPF do colaborador; nota = média de todas as competências do
//                gestor incluindo o "Batendo o Martelo" (a mesma da Feedz);
//   Feedbacks  → quantidade recebida (campo "para" da tabela feedbacks);
//   Link       → link de entrevista gerado no Hub (pelo ID do desligamento,
//                senão pelo colaborador).
// Acesso restrito à permissão 'indicadores.controle_desligamento'. O contato
// (celular — na Feedz, a "matrícula") só aparece na ficha de cada
// desligamento: vem da Feedz no lançamento (função controle_desligamento_
// contato_feedz, só para quem tem a permissão) e pode ser editado à mão.
(function () {
  const U = HUB_UTILS;
  const R = HUB_RECRUIT;
  const { kpi, empty } = HUB_UI;
  const esc = U.escapeHtml;
  const TABELA = 'controle_desligamento';

  const STATUS_FEEDZ = ['Pendente', 'Aguardando último dia', 'Finalizado', 'Cancelado', 'ID Duplicado'];
  const STATUS_ENTREVISTA = ['Não Realizada', 'Enviada', 'Realizada', 'Recusado', 'Inelegível'];
  const TIPOS = ['Voluntária - Sem Aviso', 'Voluntária - Com Aviso', 'Involuntária - Sem Aviso', 'Involuntária - Com Aviso', 'Acordo', 'Justa Causa'];
  const CORES_FEEDZ = { 'Pendente': '#eda100', 'Aguardando último dia': '#1C7CEC', 'Finalizado': '#1baf7a', 'Cancelado': '#8A8F98', 'ID Duplicado': '#8A8F98' };
  const CORES_ENTREVISTA = { 'Não Realizada': '#8A8F98', 'Enviada': '#eda100', 'Realizada': '#1baf7a', 'Recusado': '#d03b3b', 'Inelegível': '#5b6472' };
  const PAGE_SIZE = 25;

  const estado = { busca: '', feedz: 'todos', entrevista: 'todos', fila: 'todas', ordem: 'recentes', pagina: 1 };
  let raizAtual = null, filtrosAtuais = null;

  const n = s => U.normalizeText(String(s || '')).replace(/\s+/g, ' ').trim();
  const compacto = s => n(s).replace(/[^a-z]/g, '');
  const dia = s => (s ? new Date(String(s).slice(0, 10) + 'T12:00:00Z').getTime() : null);
  const hojeISO = () => U.todayISO();
  const diasEntre = (a, b) => (a && b ? Math.round((dia(b) - dia(a)) / 86400000) : null);
  const media = arr => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
  const pill = (txt, cor, title) => `<span class="ave-pill" style="--c:${cor}"${title ? ` title="${esc(title)}"` : ''}>${esc(txt)}</span>`;
  const quem = () => (window.HUB_USER && (HUB_USER.nome || HUB_USER.email)) || 'Desconhecido';
  const lancamentos = () => (window.HUB_RECRUIT_DATA && HUB_RECRUIT_DATA[TABELA]) || [];
  const pode = () => !!(window.HUB_PERMISSIONS && HUB_PERMISSIONS.hasPerm(window.HUB_USER, 'indicadores.controle_desligamento'));
  const soDigitos = s => String(s || '').replace(/\D/g, '');
  function linkWhatsapp(contato) {
    let d = soDigitos(contato);
    if (d.length < 10) return null;
    if (d.length <= 11) d = '55' + d;
    return 'https://wa.me/' + d;
  }
  async function contatoDaFeedz(externalId) {
    if (!externalId) return null;
    const { data, error } = await sb.rpc('controle_desligamento_contato_feedz', { p_external_id: String(externalId) });
    if (error) throw error;
    return data || null;
  }

  // ------------------------------------------------------------------
  // Cruzamentos (Headcount, AVE, Feedbacks, links)
  // ------------------------------------------------------------------
  function indexarHeadcount() {
    const porId = new Map(), exato = new Map(), comp = new Map();
    for (const c of (window.HUB_DATA && HUB_DATA.colaboradores) || []) {
      if (c.external_id) porId.set(String(c.external_id), c);
      const nome = c.nome_completo || c.nome;
      const k1 = n(nome), k2 = compacto(nome);
      if (k1) { if (!exato.has(k1)) exato.set(k1, []); exato.get(k1).push(c); }
      if (k2) { if (!comp.has(k2)) comp.set(k2, []); comp.get(k2).push(c); }
    }
    return { porId, exato, comp };
  }
  function acharColaborador(idx, d) {
    if (d.colaboradorExternalId && idx.porId.has(String(d.colaboradorExternalId))) return idx.porId.get(String(d.colaboradorExternalId));
    const cands = idx.exato.get(n(d.colaboradorNome)) || idx.comp.get(compacto(d.colaboradorNome)) || [];
    if (cands.length <= 1) return cands[0] || null;
    const alvo = dia(d.dataDemissao);
    return cands.slice().sort((a, b) => {
      const da = alvo && dia(a.ultimo_dia_trabalhado) ? Math.abs(dia(a.ultimo_dia_trabalhado) - alvo) : Infinity;
      const db = alvo && dia(b.ultimo_dia_trabalhado) ? Math.abs(dia(b.ultimo_dia_trabalhado) - alvo) : Infinity;
      return da - db;
    })[0];
  }
  function indexarAve() {
    const out = { 45: new Map(), 90: new Map() };
    for (const c of [45, 90]) {
      for (const r of (window.HUB_EXPERIENCIA_DATA && HUB_EXPERIENCIA_DATA[c]) || []) if (r.cpf) out[c].set(String(r.cpf).trim(), r);
    }
    return out;
  }
  // Mesma nota que a Feedz exporta (e a planilha usava): média de TODAS as
  // competências avaliadas pelo gestor, incluindo o "Batendo o Martelo".
  // Sem avaliação concluída → sem nota (não conta como nota baixa).
  function notaFeedzGestor(a) {
    if (!a) return null;
    const v = Object.values(a.notas_gestor || {}).filter(x => x >= 1 && x <= 4);
    if (a.martelo >= 1 && a.martelo <= 4) v.push(a.martelo);
    return media(v);
  }
  function notaFeedzAuto(a) {
    if (!a) return null;
    return media(Object.values(a.notas_auto || {}).filter(x => x >= 1 && x <= 4));
  }
  function indexarFeedbacks() {
    const m = new Map();
    for (const f of (window.HUB_DATA && HUB_DATA.feedbacks) || []) {
      for (const nome of String(f.para || '').split(/[,;]/)) {
        const k = n(nome);
        if (k) m.set(k, (m.get(k) || 0) + 1);
      }
    }
    return m;
  }
  function indexarLinks() {
    const m = new Map();
    for (const l of (window.HUB_RECRUIT_DATA && HUB_RECRUIT_DATA.entrevistas_desligamento) || []) {
      if (l.idDesligamento) m.set('d:' + l.idDesligamento, l);
      if (l.colaboradorExternalId) m.set('e:' + l.colaboradorExternalId, l);
      m.set('n:' + n(l.colaboradorNome), l);
    }
    return m;
  }

  function montarRegistros() {
    const hc = indexarHeadcount(), ave = indexarAve(), fb = indexarFeedbacks(), links = indexarLinks();
    return lancamentos().map(d => {
      const c = acharColaborador(hc, d);
      const cpf = (d.colaboradorCpf && String(d.colaboradorCpf).trim()) || (c && c.cpf ? String(c.cpf).trim() : null);
      const a45 = cpf ? ave[45].get(cpf) : null, a90 = cpf ? ave[90].get(cpf) : null;
      const n45 = notaFeedzGestor(a45), n90 = notaFeedzGestor(a90);
      const mediaAve = n45 !== null && n90 !== null ? (n45 + n90) / 2 : null;
      const qtdFeedbacks = fb.get(n(d.colaboradorNome)) || 0;
      const link = links.get('d:' + d.idDesligamento) || (c && c.external_id && links.get('e:' + c.external_id)) || links.get('n:' + n(d.colaboradorNome)) || null;
      const admissao = d.dataAdmissao || (c && c.data_admissao) || null;
      return {
        db: d, id: d.idDesligamento, colab: c,
        data_solicitacao: d.dataSolicitacao, solicitante: d.solicitante, nome: d.colaboradorNome,
        cargo: d.cargo || (c && c.cargo) || null, unidade: d.unidade, departamento: d.departamento,
        data_admissao: admissao, data_demissao: d.dataDemissao,
        tempo_casa: admissao && d.dataDemissao ? diasEntre(admissao, d.dataDemissao) : null,
        email: c && c.email ? c.email : null, situacaoHeadcount: c ? c.situacao : null,
        nota45: n45, auto45: notaFeedzAuto(a45), nota90: n90, auto90: notaFeedzAuto(a90), mediaAve, feedbacks: qtdFeedbacks,
        criterios: (n45 !== null && n45 < 3 ? 1 : 0) + (n90 !== null && n90 < 3 ? 1 : 0) + (mediaAve !== null && mediaAve < 3 ? 1 : 0) + (qtdFeedbacks > 0 ? 1 : 0),
        link,
        data_realizacao: d.dataRealizacao || (link && link.status === 'Preenchido' && link.dataFinalizacao ? String(link.dataFinalizacao).slice(0, 10) : null)
      };
    });
  }

  // Status da entrevista com o link do Hub (automático) por cima do manual:
  // respondido → Realizada; pendente → Enviada (se não houver desfecho).
  function statusEntrevista(r) {
    const st = r.db.statusEntrevista;
    if (r.link && r.link.status === 'Preenchido') return 'Realizada';
    if (r.link && !['Recusado', 'Inelegível', 'Realizada'].includes(st)) return 'Enviada';
    return st || 'Não Realizada';
  }

  // Filas de trabalho (o que precisa de ação do RH)
  function fila(r) {
    const hoje = hojeISO();
    const sf = r.db.statusFeedz;
    const st = statusEntrevista(r);
    if (sf === 'Cancelado' || sf === 'ID Duplicado') return 'encerrado';
    if (sf !== 'Finalizado') return (r.data_demissao && r.data_demissao < hoje) ? 'feedz_atrasado' : 'em_andamento';
    if (st === 'Não Realizada' && r.data_demissao && diasEntre(r.data_demissao, hoje) <= 90) return 'contatar';
    if (st === 'Enviada') return 'aguardando_resposta';
    return 'concluido';
  }
  const FILAS = {
    em_andamento: ['Desligamento em andamento', '#1C7CEC'],
    feedz_atrasado: ['Feedz não finalizada após a demissão', '#d03b3b'],
    contatar: ['Contatar para entrevista', '#eb6834'],
    aguardando_resposta: ['Link enviado, aguardando resposta', '#eda100'],
    concluido: ['Concluído', '#1baf7a'],
    encerrado: ['Cancelado / duplicado', '#8A8F98']
  };

  // ------------------------------------------------------------------
  // Tela
  // ------------------------------------------------------------------
  function render(el, f) {
    raizAtual = el; filtrosAtuais = f;
    if (!pode()) { el.innerHTML = empty('Acesso restrito.', 'O Controle de Desligamento precisa de permissão própria — peça ao administrador.'); return; }
    el.innerHTML = `<div class="empty"><p>Carregando controle de desligamento...</p></div>`;
    Promise.all([45, 90].map(c => HUB_EXPERIENCIA.carregar(c).catch(() => []))).then(() => desenhar(el, f));
  }

  function filtrarGlobal(rows, f) {
    return rows.filter(r => {
      if ((f.start || f.end) && !(r.data_solicitacao && U.inRange(r.data_solicitacao, f.start, f.end))) return false;
      if (!U.matchesAny(r.unidade, f.unidade)) return false;
      if (f.colaborador && !U.normIncludes(r.nome, f.colaborador)) return false;
      return true;
    });
  }

  function desenhar(el, f) {
    const todos = montarRegistros();
    const noPeriodo = filtrarGlobal(todos, f);
    const cont = {}; noPeriodo.forEach(r => { const k = fila(r); cont[k] = (cont[k] || 0) + 1; });
    const semVinculo = noPeriodo.filter(r => !r.colab).length;
    const opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`;
    const vazio = !lancamentos().length;
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <div class="sub" style="font-size:12px;color:var(--muted)">${U.fmtInt(noPeriodo.length)} desligamento(s) no período/filtros${semVinculo ? ` · ${U.fmtInt(semVinculo)} sem cadastro correspondente no Headcount` : ''}</div>
        <button type="button" class="btn btn-sm" style="width:auto" id="cd-novo">+ Lançar desligamento</button>
      </div>
      ${vazio ? `<div class="insight info" style="margin-bottom:14px"><span class="ic">&#8505;&#65039;</span><span>Nenhum desligamento lançado ainda. Importe o histórico da planilha de controle (script SQL) ou lance o primeiro pelo botão acima.</span></div>` : ''}
      <div class="kpi-grid">
        ${kpiFila('em_andamento', cont)}
        ${kpiFila('feedz_atrasado', cont)}
        ${kpiFila('contatar', cont)}
        ${kpiFila('aguardando_resposta', cont)}
        ${kpiFila('concluido', cont)}
      </div>
      <div class="toolbar">
        <input type="text" id="cd-busca" placeholder="Buscar por ID, nome, cargo, unidade ou solicitante..." value="${esc(estado.busca)}">
        <select id="cd-fila">${opt('todas', 'Fila: todas', estado.fila)}${Object.entries(FILAS).map(([k, v]) => opt(k, v[0], estado.fila)).join('')}</select>
        <select id="cd-feedz">${opt('todos', 'Status na Feedz: todos', estado.feedz)}${STATUS_FEEDZ.map(s => opt(s, s, estado.feedz)).join('')}</select>
        <select id="cd-entrevista">${opt('todos', 'Entrevista: todas', estado.entrevista)}${STATUS_ENTREVISTA.map(s => opt(s, s, estado.entrevista)).join('')}</select>
        <select id="cd-ordem">${opt('recentes', 'Solicitação mais recente', estado.ordem)}${opt('demissao', 'Demissão mais recente', estado.ordem)}${opt('id', 'ID (maior primeiro)', estado.ordem)}${opt('criterios', 'Mais critérios primeiro', estado.ordem)}</select>
      </div>
      <div id="cd-tabela"></div>`;
    const redesenhar = () => desenharTabela(el.querySelector('#cd-tabela'), noPeriodo);
    const bind = (id, campo, evt) => el.querySelector(id).addEventListener(evt || 'change', e => { estado[campo] = e.target.value; estado.pagina = 1; redesenhar(); });
    bind('#cd-busca', 'busca', 'input'); bind('#cd-fila', 'fila'); bind('#cd-feedz', 'feedz'); bind('#cd-entrevista', 'entrevista'); bind('#cd-ordem', 'ordem');
    el.querySelectorAll('[data-fila]').forEach(k => k.addEventListener('click', () => { estado.fila = estado.fila === k.dataset.fila ? 'todas' : k.dataset.fila; estado.pagina = 1; desenhar(el, f); }));
    el.querySelector('#cd-novo').addEventListener('click', () => abrirFormulario(null));
    redesenhar();
  }

  function kpiFila(k, cont) {
    const [label, cor] = FILAS[k];
    const ativo = estado.fila === k;
    return `<div data-fila="${k}" style="cursor:pointer;${ativo ? 'outline:2px solid ' + cor + ';border-radius:12px' : ''}" title="Clique para filtrar">${kpi(label, U.fmtInt(cont[k] || 0), ativo ? 'filtrando — clique de novo para limpar' : 'clique para ver a lista', cor)}</div>`;
  }

  function aplicarFiltros(rows) {
    const q = n(estado.busca);
    let out = rows.filter(r => {
      if (q && ![r.id, r.nome, r.cargo, r.unidade, r.departamento, r.solicitante].some(v => n(v).includes(q))) return false;
      if (estado.fila !== 'todas' && fila(r) !== estado.fila) return false;
      if (estado.feedz !== 'todos' && r.db.statusFeedz !== estado.feedz) return false;
      if (estado.entrevista !== 'todos' && statusEntrevista(r) !== estado.entrevista) return false;
      return true;
    });
    const o = estado.ordem;
    const numId = r => Number(String(r.id).replace(/\D/g, '')) || 0;
    out = out.slice().sort((a, b) => {
      if (o === 'id') return numId(b) - numId(a);
      if (o === 'demissao') return String(b.data_demissao || '').localeCompare(String(a.data_demissao || ''));
      if (o === 'criterios') return (b.criterios - a.criterios) || String(b.data_solicitacao || '').localeCompare(String(a.data_solicitacao || ''));
      return String(b.data_solicitacao || '').localeCompare(String(a.data_solicitacao || '')) || numId(b) - numId(a);
    });
    return out;
  }

  function criteriosHtml(r) {
    const dots = [0, 1, 2, 3].map(i => `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:2px;background:${i < r.criterios ? '#eb6834' : '#dfe3e8'}"></span>`).join('');
    return `<span title="Critérios de desligamento: ${r.criterios} de 4">${dots}<b style="margin-left:4px">${r.criterios}</b></span>`;
  }

  function desenharTabela(el, base) {
    const rows = aplicarFiltros(base);
    const paginas = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (estado.pagina > paginas) estado.pagina = paginas;
    const ini = (estado.pagina - 1) * PAGE_SIZE;
    const pag = rows.slice(ini, ini + PAGE_SIZE);
    if (!rows.length) { el.innerHTML = empty('Nenhum desligamento com esses filtros.'); return; }
    el.innerHTML = `
      <div class="table-wrap" style="max-height:none"><table class="dt">
        <thead><tr><th>ID</th><th>Solicitação</th><th>Colaborador</th><th>Unidade / loja</th><th>Demissão</th><th>Tipo</th><th>Status na Feedz</th><th>Entrevista</th><th title="Critérios de desligamento (0 a 4): AVE 45 < 3, AVE 90 < 3, média AVE < 3, recebeu feedback">Critérios</th><th></th></tr></thead>
        <tbody>${pag.map((r, i) => {
          const st = statusEntrevista(r);
          const [fl, cor] = FILAS[fila(r)];
          return `<tr>
            <td><b>${esc(r.id || '—')}</b></td>
            <td>${U.fmtDateBR(r.data_solicitacao) || '—'}<div style="font-size:10.5px;color:var(--muted)">${esc(r.solicitante || '')}</div></td>
            <td><b>${esc(r.nome)}</b><div style="font-size:10.5px;color:var(--muted)">${esc(r.cargo || 'Cargo não informado')}</div></td>
            <td>${esc(r.unidade || '—')}<div style="font-size:10.5px;color:var(--muted)">${esc(r.departamento || '')}</div></td>
            <td>${U.fmtDateBR(r.data_demissao) || '—'}${r.tempo_casa !== null ? `<div style="font-size:10.5px;color:var(--muted)">${U.fmtInt(r.tempo_casa)} dias de casa</div>` : ''}</td>
            <td style="font-size:11px">${esc(r.db.tipo || '—')}</td>
            <td>${pill(r.db.statusFeedz || '—', CORES_FEEDZ[r.db.statusFeedz] || '#8A8F98')}</td>
            <td>${pill(st, CORES_ENTREVISTA[st] || '#8A8F98')}${r.link ? `<div style="font-size:9.5px;color:var(--muted);margin-top:2px">link do Hub: ${r.link.status === 'Preenchido' ? 'respondido' : 'pendente'}</div>` : ''}<div style="margin-top:2px">${pill(fl, cor)}</div></td>
            <td>${criteriosHtml(r)}</td>
            <td><button type="button" class="btn btn-outline btn-sm" style="width:auto" data-abrir="${ini + i}">Abrir</button></td>
          </tr>`;
        }).join('')}</tbody></table></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;flex-wrap:wrap;gap:8px">
        <span class="sub" style="color:var(--muted);font-size:12px">Mostrando ${U.fmtInt(ini + 1)}–${U.fmtInt(Math.min(ini + PAGE_SIZE, rows.length))} de ${U.fmtInt(rows.length)}</span>
        <div style="display:flex;gap:8px;align-items:center">
          <button type="button" class="btn btn-outline btn-sm" style="width:auto" id="cd-prev" ${estado.pagina <= 1 ? 'disabled' : ''}>&lsaquo; Anterior</button>
          <span style="font-size:12px">Página ${estado.pagina} de ${paginas}</span>
          <button type="button" class="btn btn-outline btn-sm" style="width:auto" id="cd-next" ${estado.pagina >= paginas ? 'disabled' : ''}>Próxima &rsaquo;</button>
        </div>
      </div>`;
    const prev = el.querySelector('#cd-prev'), next = el.querySelector('#cd-next');
    if (prev) prev.addEventListener('click', () => { estado.pagina--; desenharTabela(el, base); });
    if (next) next.addEventListener('click', () => { estado.pagina++; desenharTabela(el, base); });
    el.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => abrirFormulario(rows[Number(b.dataset.abrir)])));
  }

  // ------------------------------------------------------------------
  // Modal: lançar (r = null) ou abrir/editar um desligamento
  // ------------------------------------------------------------------
  function modal(titulo, sub, corpo) {
    const ant = document.getElementById('hub-cd-modal'); if (ant) ant.remove();
    const m = document.createElement('div');
    m.id = 'hub-cd-modal';
    m.innerHTML = `
      <div data-fechar style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:998"></div>
      <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.3);width:94%;max-width:920px;max-height:90vh;z-index:999;display:flex;flex-direction:column">
        <div style="padding:16px 22px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:10px">
          <div><div style="font-size:16px;font-weight:700">${titulo}</div>${sub ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">${sub}</div>` : ''}</div>
          <button data-fechar class="btn btn-outline btn-sm" style="width:auto">Fechar</button>
        </div>
        <div style="padding:16px 22px;overflow-y:auto;flex:1">${corpo}</div>
      </div>`;
    document.body.appendChild(m);
    m.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => m.remove()));
    return m;
  }
  const bloco = (titulo, html) => `<div class="card" style="margin-bottom:12px;padding:14px 16px"><div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">${titulo}</div>${html}</div>`;
  const campo = (label, valor) => `<div><span style="color:var(--muted);font-size:11px">${label}</span><br><b style="font-size:12.5px">${valor === null || valor === undefined || valor === '' ? '—' : valor}</b></div>`;
  const grade = itens => `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px 16px">${itens.join('')}</div>`;
  const nota = v => (v === null || v === undefined ? '—' : `<span style="color:${v < 3 ? '#d03b3b' : 'inherit'}">${U.fmt1(v)}</span>`);
  const sel = (id, opcoes, atual, vazio) => `<select id="${id}" style="width:100%">${vazio ? '<option value="">— selecione —</option>' : ''}${(atual && !opcoes.includes(atual) ? [atual] : []).concat(opcoes).map(o => `<option ${o === atual ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  const inp = (id, label, valor, tipo, extra) => `<div class="field"><label>${label}</label><input id="${id}" type="${tipo || 'text'}" value="${esc(valor || '')}" ${extra || ''}></div>`;
  const sugestoes = (id, valores) => `<datalist id="${id}">${Array.from(new Set(valores.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')).map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;

  function camposEditaveis(d) {
    const todos = lancamentos();
    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px 16px">
        ${inp('cd-f-id', 'ID do desligamento', d.idDesligamento)}
        ${inp('cd-f-data', 'Data da solicitação', d.dataSolicitacao || hojeISO(), 'date')}
        ${inp('cd-f-solic', 'Solicitante (gestor)', d.solicitante, 'text', 'list="cd-l-solic"')}
        ${inp('cd-f-dem', 'Data da demissão', d.dataDemissao, 'date')}
        <div class="field"><label>Tipo</label>${sel('cd-f-tipo', TIPOS, d.tipo, true)}</div>
        ${inp('cd-f-tipodesl', 'Tipo do desligamento', d.tipoDesligamento, 'text', 'list="cd-l-tipodesl"')}
        ${inp('cd-f-unid', 'Unidade', d.unidade, 'text', 'list="cd-l-unid"')}
        ${inp('cd-f-depto', 'Departamento / loja', d.departamento)}
        ${inp('cd-f-cargo', 'Cargo', d.cargo)}
      </div>
      <div class="field full" style="margin-top:8px"><label>Motivo do desligamento</label><input id="cd-f-motivo" type="text" list="cd-l-motivo" value="${esc(d.motivo || '')}" placeholder="Escolha uma sugestão ou digite"></div>
      ${sugestoes('cd-l-solic', todos.map(x => x.solicitante))}${sugestoes('cd-l-tipodesl', todos.map(x => x.tipoDesligamento))}
      ${sugestoes('cd-l-unid', todos.map(x => x.unidade))}${sugestoes('cd-l-motivo', todos.map(x => x.motivo))}`;
  }
  function camposAcompanhamento(d, r) {
    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px 16px">
        <div class="field"><label>Status na Feedz</label>${sel('cd-f-feedz', STATUS_FEEDZ, d.statusFeedz || 'Pendente')}</div>
        <div class="field"><label>Status da entrevista</label>${sel('cd-f-entrevista', STATUS_ENTREVISTA, d.statusEntrevista || 'Não Realizada')}</div>
        ${inp('cd-f-realiz', 'Data da realização', d.dataRealizacao || (r && r.data_realizacao) || '', 'date')}
        <div class="field"><label>Contato (celular)</label><div style="display:flex;gap:6px"><input id="cd-f-contato" type="text" value="${esc(d.contato || '')}" placeholder="(DDD) número" style="flex:1"><a id="cd-f-wa" class="btn btn-outline btn-sm" style="width:auto;${linkWhatsapp(d.contato) ? '' : 'display:none'}" target="_blank" rel="noopener" href="${esc(linkWhatsapp(d.contato) || '#')}" title="Abrir conversa no WhatsApp">WhatsApp</a></div>
          ${!d.contato && (d.colaboradorExternalId || (r && r.colab && r.colab.external_id)) ? '<button type="button" class="btn btn-outline btn-sm" style="width:auto;margin-top:4px" id="cd-f-buscar-contato">Buscar na Feedz</button>' : ''}</div>
        <div class="field"><label>&nbsp;</label><label style="display:flex;gap:6px;align-items:center;font-weight:500"><input id="cd-f-natal" type="checkbox" ${d.extraNatal ? 'checked' : ''} style="width:auto"> Extra de Natal</label></div>
      </div>
      <div class="field full" style="margin-top:8px"><label>Observações</label><textarea id="cd-f-obs" rows="3" style="width:100%">${esc(d.observacoes || '')}</textarea></div>
      ${r && r.link ? `<div style="margin-top:6px;font-size:11.5px;color:var(--muted)">Link de entrevista gerado no Hub — <b>${r.link.status === 'Preenchido' ? 'respondido' : 'aguardando resposta'}</b>. O status exibido na lista acompanha o link automaticamente.</div>` : ''}`;
  }
  function lerCampos(m) {
    const v = id => { const e = m.querySelector('#' + id); return e ? e.value.trim() : ''; };
    return {
      idDesligamento: v('cd-f-id'), dataSolicitacao: v('cd-f-data'), solicitante: v('cd-f-solic'), dataDemissao: v('cd-f-dem'),
      tipo: v('cd-f-tipo'), tipoDesligamento: v('cd-f-tipodesl'), unidade: v('cd-f-unid'), departamento: v('cd-f-depto'),
      cargo: v('cd-f-cargo'), motivo: v('cd-f-motivo'), statusFeedz: v('cd-f-feedz'), statusEntrevista: v('cd-f-entrevista'),
      dataRealizacao: v('cd-f-realiz'), contato: v('cd-f-contato'), observacoes: v('cd-f-obs'), extraNatal: !!(m.querySelector('#cd-f-natal') || {}).checked
    };
  }

  function abrirFormulario(r) {
    const novo = !r;
    const d = novo ? { statusFeedz: 'Pendente', statusEntrevista: 'Não Realizada' } : r.db;
    const cols = ((window.HUB_DATA && HUB_DATA.colaboradores) || []).slice().sort((a, b) => (a.nome_completo || a.nome || '').localeCompare(b.nome_completo || b.nome || ''));
    const podeLink = window.HUB_ENTREVISTA_DESLIGAMENTO && HUB_ENTREVISTA_DESLIGAMENTO.canGerarLink();
    let corpo = '';
    if (novo) {
      corpo += bloco('Colaborador', `
        <input id="cd-n-busca" type="text" placeholder="Busque no Headcount pelo nome..." style="width:100%">
        <select id="cd-n-colab" size="6" style="width:100%;margin-top:6px">${cols.map((c, i) => `<option value="${i}">${esc(c.nome_completo || c.nome)} — ${esc(c.situacao || '')} · ${esc(c.unidade || '')}${c.departamento ? ' · ' + esc(c.departamento) : ''}</option>`).join('')}</select>
        <p class="sub" style="margin-top:6px;font-size:11px">Cargo, unidade, departamento e admissão vêm do Headcount (dá para ajustar abaixo). O CPF é guardado no lançamento para ligar a pessoa a uma futura recontratação.</p>`);
    } else {
      corpo += bloco('Colaborador' + (r.colab ? '' : ' <span style="color:#d03b3b;text-transform:none;font-weight:600">· não encontrado no Headcount</span>'), grade([
        campo('Nome', esc(r.nome)), campo('Admissão', U.fmtDateBR(r.data_admissao)),
        campo('Tempo de casa', r.tempo_casa === null ? null : U.fmtInt(r.tempo_casa) + ' dias'),
        campo('E-mail', esc(r.email)), campo('Situação no Headcount', esc(r.situacaoHeadcount))
      ]));
      corpo += bloco('Critérios de desligamento — ' + r.criterios + ' de 4', grade([
        campo('AVE 45 — gestor', nota(r.nota45)), campo('AVE 45 — autoavaliação', nota(r.auto45)),
        campo('AVE 90 — gestor', nota(r.nota90)), campo('AVE 90 — autoavaliação', nota(r.auto90)),
        campo('Média AVE (gestor 45 e 90)', r.mediaAve === null ? 'Não válido' : nota(r.mediaAve)), campo('Feedbacks recebidos', U.fmtInt(r.feedbacks))
      ]) + '<p class="sub" style="margin-top:8px;font-size:11px">Cada critério atendido soma 1: AVE 45 abaixo de 3, AVE 90 abaixo de 3, média abaixo de 3 e ter recebido feedback. Nota da AVE = média de todas as competências do gestor, incluindo o "Batendo o Martelo" (a mesma da Feedz).</p>');
    }
    corpo += bloco('Solicitação', camposEditaveis(d));
    corpo += bloco('Acompanhamento', camposAcompanhamento(d, r));
    corpo += `<div class="msg err" id="cd-f-msg" style="display:none"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px;flex-wrap:wrap">
        ${!novo && podeLink ? (r.link ? '<button type="button" class="btn btn-outline btn-sm" style="width:auto" id="cd-copiar">Copiar link de entrevista</button>' : '<button type="button" class="btn btn-outline btn-sm" style="width:auto" id="cd-gerar">Gerar link de entrevista</button>') : ''}
        <button type="button" class="btn btn-sm" style="width:auto" id="cd-salvar">${novo ? 'Lançar desligamento' : 'Salvar alterações'}</button>
      </div>
      ${!novo ? `<p class="sub" style="margin-top:8px;font-size:10.5px;color:var(--muted);text-align:right">Lançado por ${esc(d.criadoPor || '—')}${d.atualizadoPor ? ` · última alteração por ${esc(d.atualizadoPor)} em ${U.fmtDateBR(String(d.atualizadoEm || '').slice(0, 10))}` : ''}</p>` : ''}`;

    const m = modal(novo ? 'Lançar desligamento' : esc(r.nome), novo ? 'ID que chegou pelo Forms do gestor' : `ID ${esc(r.id)} · ${esc(r.unidade || '')}${r.departamento ? ' · ' + esc(r.departamento) : ''}`, corpo);
    const msg = texto => { const e = m.querySelector('#cd-f-msg'); e.textContent = texto; e.style.display = texto ? 'block' : 'none'; };

    let escolhido = null;
    if (novo) {
      const busca = m.querySelector('#cd-n-busca'), lista = m.querySelector('#cd-n-colab');
      busca.addEventListener('input', () => { const t = n(busca.value); Array.from(lista.options).forEach((o, i) => { o.hidden = t && !n(cols[i].nome_completo || cols[i].nome).includes(t); }); });
      lista.addEventListener('change', () => {
        escolhido = cols[Number(lista.value)];
        const set = (id, v) => { const e = m.querySelector('#' + id); if (e) e.value = v || ''; };
        set('cd-f-unid', escolhido.unidade); set('cd-f-depto', escolhido.departamento); set('cd-f-cargo', escolhido.cargo);
        const alvo = escolhido;
        contatoDaFeedz(alvo.external_id).then(tel => { if (escolhido === alvo) { set('cd-f-contato', tel); atualizarWa(); } }).catch(() => {});
      });
    }

    const inContato = m.querySelector('#cd-f-contato'), aWa = m.querySelector('#cd-f-wa');
    function atualizarWa() { const l = linkWhatsapp(inContato.value); aWa.style.display = l ? '' : 'none'; if (l) aWa.href = l; }
    inContato.addEventListener('input', atualizarWa);
    const btnBuscar = m.querySelector('#cd-f-buscar-contato');
    if (btnBuscar) btnBuscar.addEventListener('click', async () => {
      btnBuscar.disabled = true; btnBuscar.textContent = 'Buscando...';
      try {
        const tel = await contatoDaFeedz(d.colaboradorExternalId || (r.colab && r.colab.external_id));
        if (tel) { inContato.value = tel; atualizarWa(); btnBuscar.remove(); }
        else { btnBuscar.textContent = 'Sem contato na Feedz'; }
      } catch (err) { btnBuscar.textContent = 'Não consegui buscar'; btnBuscar.title = err.message; }
    });

    const btnGerar = m.querySelector('#cd-gerar');
    if (btnGerar) btnGerar.addEventListener('click', () => {
      m.remove();
      HUB_ENTREVISTA_DESLIGAMENTO.abrirGerarLinkPara({ externalId: r.colab && r.colab.external_id, nome: (r.colab && (r.colab.nome_completo || r.colab.nome)) || r.nome, idDesligamento: r.id });
    });
    const btnCopiar = m.querySelector('#cd-copiar');
    if (btnCopiar) btnCopiar.addEventListener('click', () => HUB_ENTREVISTA_DESLIGAMENTO.copiarLink(r.link));

    m.querySelector('#cd-salvar').addEventListener('click', async () => {
      msg('');
      const v = lerCampos(m);
      if (!v.idDesligamento) return msg('Informe o ID do desligamento.');
      if (novo && !escolhido) return msg('Escolha o colaborador no Headcount.');
      const repetido = lancamentos().some(x => String(x.idDesligamento) === v.idDesligamento && (novo || x.id !== d.id));
      if (repetido && !confirm(`O ID ${v.idDesligamento} já está lançado. Lançar mesmo assim? (use o status "ID Duplicado" se for pedido repetido do gestor)`)) return;
      const btn = m.querySelector('#cd-salvar');
      btn.disabled = true; btn.textContent = 'Salvando...';
      const agora = new Date().toISOString();
      try {
        if (novo) {
          const row = Object.assign(v, {
            colaboradorExternalId: escolhido.external_id || null, colaboradorNome: escolhido.nome_completo || escolhido.nome,
            colaboradorCpf: escolhido.cpf || null, dataAdmissao: escolhido.data_admissao || null,
            criadoPor: quem(), atualizadoPor: quem(), atualizadoEm: agora
          });
          const salvo = await R.insertRow(TABELA, row);
          HUB_RECRUIT_DATA[TABELA] = [salvo].concat(lancamentos());
          estado.ordem = 'recentes'; estado.fila = 'todas'; estado.pagina = 1;
        } else {
          const salvo = await R.updateRow(TABELA, d.id, Object.assign(v, { atualizadoPor: quem(), atualizadoEm: agora }));
          HUB_RECRUIT_DATA[TABELA] = lancamentos().map(x => (x.id === d.id ? salvo : x));
        }
      } catch (err) {
        btn.disabled = false; btn.textContent = novo ? 'Lançar desligamento' : 'Salvar alterações';
        const faltaTabela = /does not exist|schema cache|could not find/i.test(err.message || '');
        return msg(faltaTabela ? 'A tabela do Controle de Desligamento ainda não foi criada no Supabase — rode o script supabase-controle-desligamento.sql.' : 'Não consegui salvar: ' + err.message);
      }
      m.remove();
      if (raizAtual && document.body.contains(raizAtual)) desenhar(raizAtual, filtrosAtuais);
    });
  }

  window.HUB_CONTROLE_DESLIGAMENTO = { render, pode, statusEntrevista };
})();
