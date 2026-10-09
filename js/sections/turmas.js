// Treinamento e Desenvolvimento → Turmas e Multiplicadoras: turmas presenciais e
// online dadas pelas multiplicadoras (tabela treinamento_turmas). Duas abas:
//   Indicadores   contas sobre todas as turmas visíveis (metrics-turmas.js)
//   Lançamentos   a multiplicadora lança as próprias turmas (mesmo molde do
//                 Controle de Desligamento); turmas de planilha aparecem só para leitura
// Acesso: treinamento_dev.turmas (T&D e RH: vê e edita tudo) ou
// treinamento_dev.turmas_lancar (multiplicadora: vê e edita só o que lançou —
// a mesma regra está na policy e nas funções de supabase-treinamento-turmas.sql).
//
// A tela tem seletores próprios (período, multiplicadora, marca, tipo): a barra
// de filtros do topo é de unidade/departamento, que estas turmas não têm.
(function () {
  const U = HUB_UTILS;
  const T = HUB_METRICS_TURMAS;
  const { kpi, empty, card, barChart, comboChart } = HUB_UI;
  const esc = s => U.escapeHtml(s == null ? '' : String(s));

  const hoje = new Date();
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const state = { aba: null, de: `${hoje.getFullYear()}-01`, ate: mesAtual, multiplicadora: '', marca: '', categoria: '', mostrarTodas: false, busca: '', origem: '' };
  const podeTudo = () => HUB_PERMISSIONS.hasPerm(HUB_USER, 'treinamento_dev.turmas');
  const podeLancar = () => podeTudo() || HUB_PERMISSIONS.hasPerm(HUB_USER, 'treinamento_dev.turmas_lancar');

  const int = v => (v == null ? '—' : U.fmtInt(Math.round(v)));
  const hrs = v => (v == null ? '—' : `${U.fmt1(v)} h`);
  const pct = v => (v == null ? '—' : U.fmtPct(v, 0));
  const fimDoMes = m => { const [y, mm] = m.split('-').map(Number); return new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10); };
  const dataBR = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
  const nota = txt => `<p class="sub" style="color:var(--muted);font-size:11.5px;margin:0 0 12px">${txt}</p>`;

  // "▲ 12%" contra o mesmo período do ano anterior.
  function variacao(atual, anterior) {
    if (anterior == null || !anterior) return '';
    const v = (atual - anterior) / anterior;
    if (Math.abs(v) < 0.005) return '= ao ano anterior';
    return `<span style="color:${v > 0 ? '#0f8a4c' : 'var(--critical)'}">${v > 0 ? '▲' : '▼'} ${U.fmtPct(Math.abs(v), 0)}</span> vs. ano anterior`;
  }

  function tabela(linhas, primeira) {
    if (!linhas.length) return empty('Sem turmas.');
    return `<div class="table-wrap fit"><table class="dt fit"><thead><tr><th>${primeira}</th><th>Turmas</th><th>Horas de turma</th><th>Horas entregues</th><th>Presentes</th><th>Aderência</th></tr></thead><tbody>
      ${linhas.map(x => `<tr><td>${esc(x.label)}</td><td>${int(x.turmas)}</td><td>${hrs(x.horas)}</td><td>${int(x.horasPessoa)}</td><td>${int(x.presentes)}</td><td>${pct(x.presenca)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }

  // Rótulo longo em duas ou mais linhas (o Chart.js aceita lista), para não cortar.
  function quebrar(texto, max) {
    const linhas = [];
    let atual = '';
    for (const p of String(texto).split(/\s+/)) {
      if (atual && (atual + ' ' + p).length > max) { linhas.push(atual); atual = p; } else atual = atual ? atual + ' ' + p : p;
    }
    if (atual) linhas.push(atual);
    return linhas.length > 1 ? linhas : texto;
  }

  // Quadro do fim da página: de onde vem e como é calculado cada número.
  function explicacao(f) {
    const itens = [
      ['De onde vêm os dados', 'Das planilhas "Controle de Treinamentos" de cada multiplicadora, enviadas em Administração → Upload de Planilhas. Cada linha da planilha é uma turma. Só entram turmas com data; o período escolhido no topo filtra pela data da turma.'],
      ['Turmas', 'Quantidade de turmas realizadas no período. Turma dada por duas multiplicadoras conta uma vez no total.'],
      ['Horas de treinamento', 'Soma da duração das turmas (coluna "Volume de horas"). Mostra o tempo que as multiplicadoras passaram em sala — o esforço de quem treina, sem importar quantas pessoas estavam presentes.'],
      ['Horas entregues', 'Duração da turma × presentes, somado no período. Mostra quanto treinamento chegou às pessoas. Exemplo: uma integração de 8 h com 2 presentes entrega 16 h; um treinamento de 4 h com 16 presentes entrega 64 h. Por isso muitas turmas pequenas podem entregar menos horas que poucas turmas grandes.'],
      ['Presentes', 'Soma dos presentes de todas as turmas. Uma pessoa que fez duas turmas conta duas vezes (a planilha não traz nomes).'],
      ['Aderência', 'Presentes ÷ convocados (a "Taxa de Adesão" da planilha). Numa turma lançada com mais presentes que convocados, conta no máximo 100% (a turma aparece em "Para conferir nas planilhas").'],
      ['Setas ▲ ▼', 'Comparação com o mesmo período do ano anterior: ' + `${dataBR(T.umAnoAntes(f.de))} a ${dataBR(T.umAnoAntes(f.ate))}` + '. Verde subiu, vermelho caiu.'],
      ['Gráfico "Por mês"', 'Barras azuis (eixo da esquerda) = horas entregues no mês. Linha verde (eixo da direita) = número de turmas no mês. Linha alta com barra baixa = muitas turmas pequenas; barra alta = treinamento com muita gente no mês. Passe o mouse para ver os dois números.'],
      ['Por multiplicadora, marca, tipo, público e canal', 'As mesmas contas separadas por grupo. Turma em dupla entra na linha de cada multiplicadora; turma de mais de uma marca (ex.: "Sfera/Boti") entra em cada marca — por isso a soma das linhas pode passar do total. O tipo sai do tema: integração/onboarding, liderança e comportamento, produto e vendas.'],
      ['Cobertura da integração', 'Estimativa: presentes nas turmas de integração ÷ admitidos no período (cadastro de Colaboradores), por marca. Sfera = Escritório. Não é exata: sem a lista de quem participou, não dá para cruzar pessoa a pessoa; a integração pode cair no mês seguinte à admissão; e há turmas com revendedores. Marca sem planilha de multiplicadora no Hub aparece com cobertura baixa.'],
      ['Gráfico "Temas"', 'Horas entregues por tema no período, do maior para o menor. Os temas com erro de digitação são corrigidos na importação (ex.: "NTEGRAÇÃO" → "INTEGRAÇÃO").'],
      ['Turmas e "Para conferir nas planilhas"', 'A lista de turmas do período, da mais recente para a mais antiga. Em amarelo, as que têm algo a corrigir na planilha da multiplicadora: presentes maior que convocados, volume de horas diferente do horário, falta de marca, multiplicadora ou quantidades.']
    ];
    return `<dl style="margin:0;display:grid;grid-template-columns:minmax(160px,230px) 1fr;gap:10px 18px;font-size:12.5px;line-height:1.5">
      ${itens.map(([t, x]) => `<dt style="font-weight:700">${esc(t)}</dt><dd style="margin:0;color:var(--muted)">${esc(x)}</dd>`).join('')}
    </dl>`;
  }

  function opcoes(valores, atual, todos) {
    return `<option value="">${todos}</option>` + valores.map(v => `<option value="${esc(v)}"${v === atual ? ' selected' : ''}>${esc(v)}</option>`).join('');
  }

  function renderTurmas(el) {
    if (!state.aba) state.aba = podeTudo() ? 'indicadores' : 'lancamentos';
    el.innerHTML = `<div class="tab-bar">${[['indicadores', 'Indicadores'], ['lancamentos', 'Lançamentos']].map(([k, l]) => `<button class="tab-btn${state.aba === k ? ' active' : ''}" data-aba="${k}">${l}</button>`).join('')}</div><div id="tt-corpo"></div>`;
    el.querySelectorAll('.tab-btn[data-aba]').forEach(b => b.addEventListener('click', () => { state.aba = b.dataset.aba; renderTurmas(el); }));
    const corpo = el.querySelector('#tt-corpo');
    if (state.aba === 'lancamentos') abaLancamentos(corpo); else abaIndicadores(corpo);
  }

  function abaIndicadores(el) {
    const todas = (window.HUB_DATA && HUB_DATA.treinamento_turmas) || [];
    if (!todas.length) {
      el.innerHTML = empty('Nenhuma turma ainda.', HUB_PERMISSIONS.hasPerm(HUB_USER, 'admin.upload')
        ? 'Lance as turmas na aba Lançamentos, ou envie a planilha "Controle de Treinamentos" de cada multiplicadora em Administração → Upload de Planilhas.'
        : 'Lance as turmas na aba Lançamentos.');
      return;
    }
    const f = { de: state.de + '-01', ate: fimDoMes(state.ate), multiplicadora: state.multiplicadora, marca: state.marca, categoria: state.categoria };
    const d = T.painel(todas, f, (window.HUB_DATA && HUB_DATA.colaboradores) || []);
    const t = d.total, a = d.anterior;
    const multis = Array.from(new Set(todas.flatMap(x => x.multiplicadoras || []))).sort((x, y) => x.localeCompare(y, 'pt-BR'));
    const marcas = Array.from(new Set(todas.flatMap(x => x.marcas || []))).sort((x, y) => x.localeCompare(y, 'pt-BR'));
    const cats = Array.from(new Set(todas.map(x => x.categoria).filter(Boolean))).sort();
    const ultimaImportacao = todas.map(x => x.importado_em).filter(Boolean).sort().pop();

    const filtros = `<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:16px;font-size:12px">
      <label style="display:flex;flex-direction:column;gap:3px">De<input type="month" id="tt-de" value="${state.de}"></label>
      <label style="display:flex;flex-direction:column;gap:3px">Até<input type="month" id="tt-ate" value="${state.ate}"></label>
      <label style="display:flex;flex-direction:column;gap:3px">Multiplicadora<select id="tt-multi">${opcoes(multis, state.multiplicadora, 'Todas')}</select></label>
      <label style="display:flex;flex-direction:column;gap:3px">Marca<select id="tt-marca">${opcoes(marcas, state.marca, 'Todas')}</select></label>
      <label style="display:flex;flex-direction:column;gap:3px">Tipo<select id="tt-cat">${opcoes(cats, state.categoria, 'Todos')}</select></label>
      <span style="color:var(--muted);margin-left:auto">Planilhas: ${esc(d.planilhas.join(', '))}${ultimaImportacao ? ` · importadas até ${dataBR(ultimaImportacao)}` : ''}</span>
    </div>`;

    if (!t.turmas) {
      el.innerHTML = filtros + empty('Nenhuma turma no período e filtros escolhidos.');
      ligar(el);
      return;
    }

    const cobertura = d.cobertura.filter(x => x.admitidos || x.integrados);
    const coberturaHtml = cobertura.length ? `${nota('Estimativa: presentes nas turmas de integração ÷ admitidos no período (cadastro de Colaboradores), por marca. Sem a lista de participantes, não dá para saber quem foi integrado — a integração pode cair no mês seguinte à admissão, e há turmas com revendedores. Marcas sem planilha de multiplicadora (ex.: O Boticário) aparecem com poucos integrados.')}
      <div class="table-wrap fit"><table class="dt fit"><thead><tr><th>Marca</th><th>Presentes em integração</th><th>Admitidos</th><th>Cobertura estimada</th></tr></thead><tbody>
      ${cobertura.map(x => `<tr><td>${esc(x.marca)}</td><td>${int(x.integrados)}</td><td>${int(x.admitidos)}</td><td>${x.cobertura == null ? '—' : `<b style="color:${x.cobertura >= 0.9 ? '#0f8a4c' : x.cobertura >= 0.6 ? '#b7791f' : 'var(--critical)'}">${pct(x.cobertura)}</b>`}</td></tr>`).join('')}
      </tbody></table></div>` : empty('Sem integrações nem admissões no período.');

    const lista = d.lista.slice().sort((x, y) => String(y.data).localeCompare(String(x.data)));
    const mostrar = state.mostrarTodas ? lista : lista.slice(0, 50);
    const turmasHtml = `<div class="table-wrap" style="max-height:520px"><table class="dt"><thead><tr><th>Data</th><th>Tema</th><th>Tipo</th><th>Marca</th><th>Canal</th><th>Público</th><th>Modalidade</th><th>Local</th><th>Horário</th><th>Horas</th><th>Presentes</th><th>Multiplicadora</th></tr></thead><tbody>
      ${mostrar.map(x => `<tr${(x.alertas || []).length ? ` title="${esc(x.alertas.join('; '))}" style="background:#FFF8E6"` : ''}><td>${dataBR(x.data)}</td><td>${esc(x.tema)}</td><td>${esc(x.categoria)}</td><td>${esc((x.marcas || []).join(', '))}</td><td>${esc(x.canal)}</td><td>${esc(x.publico)}</td><td>${esc(x.modalidade)}</td><td>${esc(x.local)}</td><td>${x.hora_inicio ? `${esc(x.hora_inicio)}–${esc(x.hora_fim || '')}` : '—'}</td><td>${hrs(x.horas)}</td><td>${x.presentes == null ? '—' : `${int(x.presentes)}/${int(x.convocados)}`}</td><td>${esc((x.multiplicadoras || []).join(', '))}</td></tr>`).join('')}
      </tbody></table></div>${lista.length > 50 ? `<button type="button" class="btn btn-outline btn-sm" id="tt-todas" style="margin-top:10px">${state.mostrarTodas ? 'Mostrar só as 50 mais recentes' : `Mostrar todas as ${lista.length}`}</button>` : ''}`;

    const alertasHtml = d.comAlerta.length ? `<div class="table-wrap" style="max-height:320px"><table class="dt"><thead><tr><th>Planilha</th><th>Linha</th><th>Data</th><th>Tema</th><th>O que conferir</th></tr></thead><tbody>
      ${d.comAlerta.map(x => `<tr><td>${esc(x.planilha)}</td><td>${int(x.linha)}</td><td>${dataBR(x.data)}</td><td>${esc(x.tema)}</td><td>${esc(x.alertas.join('; '))}</td></tr>`).join('')}
      </tbody></table></div>` : '';

    el.innerHTML = filtros + `
      <div class="kpi-grid">
        ${kpi('Turmas', int(t.turmas), variacao(t.turmas, a && a.turmas) || `${t.multiplicadoras} multiplicadora(s)`, 'var(--p1)')}
        ${kpi('Horas de treinamento', hrs(t.horas), variacao(t.horas, a && a.horas) || 'soma da duração das turmas', '#eda100')}
        ${kpi('Horas entregues', int(t.horasPessoa), (variacao(t.horasPessoa, a && a.horasPessoa) ? variacao(t.horasPessoa, a && a.horasPessoa) + ' · ' : '') + 'duração × presentes', '#4a3aa7')}
        ${kpi('Presentes', int(t.presentes), variacao(t.presentes, a && a.presentes) || `de ${int(t.convocados)} convocados`, '#1baf7a')}
        ${kpi('Aderência', pct(t.presenca), a && a.presenca != null ? `${pct(a.presenca)} no mesmo período do ano anterior` : 'presentes ÷ convocados', 'var(--p2)')}
      </div>
      ${nota(`Comparação com ${dataBR(T.umAnoAntes(f.de))} a ${dataBR(T.umAnoAntes(f.ate))}. Como cada número é calculado: veja "Como ler os indicadores", no fim da página.`)}
      <div class="grid2">
        ${card('Por mês', '&#128200;', '<div class="chart-h"><canvas id="c-tt-mes"></canvas></div>', { full: true })}
        ${card('Por multiplicadora', '&#128100;', tabela(d.porMultiplicadora, 'Multiplicadora'))}
        ${card('Por marca', '&#127970;', nota('Turma de mais de uma marca entra em cada uma.') + tabela(d.porMarca, 'Marca'))}
        ${card('Por tipo de turma', '&#128202;', tabela(d.porCategoria, 'Tipo'))}
        ${card('Por público e canal', '&#128101;', tabela(d.porPublico, 'Público') + '<div style="height:12px"></div>' + tabela(d.porCanal, 'Canal'))}
        ${card('Cobertura da integração', '&#127919;', coberturaHtml, { full: true })}
        ${card('Temas', '&#128218;', '<div class="chart-scroll"><div class="chart-inner" id="c-tt-tema-wrap"><canvas id="c-tt-tema"></canvas></div></div>', { full: true })}
        ${card(`Turmas (${int(lista.length)})`, '&#128203;', nota('Linhas em amarelo têm algo a conferir na planilha (passe o mouse).') + turmasHtml, { full: true })}
        ${d.comAlerta.length ? card(`Para conferir nas planilhas (${d.comAlerta.length})`, '&#9888;&#65039;', alertasHtml, { full: true }) : ''}
        ${card('Como ler os indicadores', '&#8505;&#65039;', explicacao(f), { full: true })}
      </div>`;

    // Número de turmas só no tooltip: rótulo da linha em cima da barra embolava.
    comboChart('c-tt-mes', d.porMes.map(x => x.label), { label: 'Horas entregues', data: d.porMes.map(x => Math.round(x.horasPessoa)) }, { label: 'Turmas', data: d.porMes.map(x => x.turmas), rotulos: false });
    const temas = d.porTema.slice().sort((x, y) => y.horasPessoa - x.horasPessoa);
    document.getElementById('c-tt-tema-wrap').style.height = Math.max(temas.reduce((s, x) => s + (x.label.length > 34 ? 46 : 32), 0), 200) + 'px';
    const gt = barChart('c-tt-tema', temas.map(x => quebrar(x.label, 34)), temas.map(x => Math.round(x.horasPessoa)), { horizontal: true, singleColor: U.color(0) });
    // Todos os temas com nome (o Chart.js pula rótulos quando acha que não cabem).
    if (gt) { gt.options.scales.y.ticks = Object.assign({}, gt.options.scales.y.ticks, { autoSkip: false }); gt.update(); }
    ligar(el);
  }

  function ligar(el) {
    const on = (id, fn) => { const x = el.querySelector('#' + id); if (x) x.addEventListener('change', e => { fn(e.target.value); HUB_RENDER_CURRENT(); }); };
    on('tt-de', v => { if (v) state.de = v; if (state.ate < state.de) state.ate = state.de; });
    on('tt-ate', v => { if (v) state.ate = v; if (state.ate < state.de) state.de = state.ate; });
    on('tt-multi', v => { state.multiplicadora = v; });
    on('tt-marca', v => { state.marca = v; });
    on('tt-cat', v => { state.categoria = v; });
    const b = el.querySelector('#tt-todas');
    if (b) b.addEventListener('click', () => { state.mostrarTodas = !state.mostrarTodas; HUB_RENDER_CURRENT(); });
  }

  // ==================================================================
  // LANÇAMENTOS
  // ==================================================================
  const MARCAS = ["Levi's", 'Hering', 'Sfera', 'O Boticário', 'Quem disse, Berenice?'];
  const meuNome = () => (window.HUB_USER && (HUB_USER.nome || HUB_USER.email)) || '';
  // Pode editar/excluir: só turma lançada no Hub; T&D/RH qualquer uma, a multiplicadora só as dela.
  const editavel = x => x.origem === 'hub' && (podeTudo() || (x.criado_por && window.HUB_USER && x.criado_por === HUB_USER.id));

  function abaLancamentos(el) {
    const todas = ((window.HUB_DATA && HUB_DATA.treinamento_turmas) || []);
    const de = state.de + '-01', ate = fimDoMes(state.ate);
    const busca = U.normalizeText(state.busca);
    const lista = todas.filter(x => {
      const d = String(x.data).slice(0, 10);
      if (d < de || d > ate) return false;
      if (state.origem && (x.origem || 'planilha') !== state.origem) return false;
      if (state.multiplicadora && !(x.multiplicadoras || []).includes(state.multiplicadora)) return false;
      if (busca && !U.normalizeText([x.tema, x.local, (x.marcas || []).join(' '), (x.multiplicadoras || []).join(' ')].join(' ')).includes(busca)) return false;
      return true;
    }).sort((x, y) => String(y.data).localeCompare(String(x.data)) || String(y.hora_inicio || '').localeCompare(String(x.hora_inicio || '')));
    const doHub = todas.filter(x => x.origem === 'hub').length;
    const multis = Array.from(new Set(todas.flatMap(x => x.multiplicadoras || []))).sort((x, y) => x.localeCompare(y, 'pt-BR'));

    const linhas = lista.map(x => `<tr${editavel(x) ? ` data-id="${x.id}" style="cursor:pointer"` : ''}>
        <td>${dataBR(x.data)}</td><td><b>${esc(x.tema)}</b>${x.observacao ? `<div style="font-size:11px;color:var(--muted)">${esc(x.observacao)}</div>` : ''}</td>
        <td>${esc((x.marcas || []).join(', '))}</td><td>${x.hora_inicio ? `${esc(x.hora_inicio)}–${esc(x.hora_fim || '')}` : '—'}</td><td>${hrs(x.horas)}</td>
        <td>${x.presentes == null ? '—' : `${int(x.presentes)}/${int(x.convocados)}${x.convocados ? ` · ${pct(Math.min(x.presentes, x.convocados) / x.convocados)}` : ''}`}</td><td>${esc((x.multiplicadoras || []).join(', '))}</td>
        <td>${x.origem === 'hub' ? `<span class="ave-pill" style="--c:#1C7CEC">Hub</span><div style="font-size:10.5px;color:var(--muted)">${esc(x.criado_por_nome || '')}</div>` : '<span class="ave-pill" style="--c:#8A8F98" title="Importada da planilha: corrija na planilha e reenvie">Planilha</span>'}</td>
        <td style="white-space:nowrap">${editavel(x) ? '<button type="button" class="btn btn-outline btn-sm" style="width:auto">Editar</button>' : ''}</td></tr>`).join('');

    el.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:12px">
        <span style="font-size:12.5px;color:var(--muted)">${int(lista.length)} turma(s) no período · ${int(doHub)} lançada(s) no Hub${podeTudo() ? '' : ' (você vê só as que lançou)'}</span>
        ${podeLancar() ? '<button type="button" class="btn btn-sm" style="width:auto" id="tt-novo">+ Lançar turma</button>' : ''}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:14px;font-size:12px">
        <input type="text" id="tt-busca" placeholder="Buscar por tema, local, marca..." value="${esc(state.busca)}" style="min-width:220px">
        <label style="display:flex;flex-direction:column;gap:3px">De<input type="month" id="tt-de" value="${state.de}"></label>
        <label style="display:flex;flex-direction:column;gap:3px">Até<input type="month" id="tt-ate" value="${state.ate}"></label>
        ${podeTudo() ? `<label style="display:flex;flex-direction:column;gap:3px">Multiplicadora<select id="tt-multi">${opcoes(multis, state.multiplicadora, 'Todas')}</select></label>
        <label style="display:flex;flex-direction:column;gap:3px">Origem<select id="tt-origem"><option value="">Todas</option><option value="hub"${state.origem === 'hub' ? ' selected' : ''}>Lançadas no Hub</option><option value="planilha"${state.origem === 'planilha' ? ' selected' : ''}>Importadas de planilha</option></select></label>` : ''}
      </div>
      ${lista.length ? `<div class="table-wrap" style="max-height:640px"><table class="dt"><thead><tr><th>Data</th><th>Tema</th><th>Marca</th><th>Horário</th><th>Horas</th><th>Presentes</th><th>Multiplicadora</th><th>Origem</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
        : empty('Nenhuma turma no período.', podeLancar() ? 'Clique em "+ Lançar turma" para registrar a primeira.' : '')}
      ${nota('Turmas importadas da planilha não são editadas aqui: corrija na planilha e reenvie em Administração → Upload. Quem lança no Hub deixa de enviar a planilha; um reenvio de planilha nunca apaga as turmas lançadas no Hub.')}`;

    const novo = el.querySelector('#tt-novo');
    if (novo) novo.addEventListener('click', () => abrirFormulario(null));
    el.querySelectorAll('[data-id]').forEach(tr => tr.addEventListener('click', () => abrirFormulario(todas.find(x => String(x.id) === tr.dataset.id))));
    const buscaEl = el.querySelector('#tt-busca');
    buscaEl.addEventListener('change', () => { state.busca = buscaEl.value; HUB_RENDER_CURRENT(); });
    const on = (id, fn) => { const x = el.querySelector('#' + id); if (x) x.addEventListener('change', e => { fn(e.target.value); HUB_RENDER_CURRENT(); }); };
    on('tt-de', v => { if (v) state.de = v; if (state.ate < state.de) state.ate = state.de; });
    on('tt-ate', v => { if (v) state.ate = v; if (state.ate < state.de) state.de = state.ate; });
    on('tt-multi', v => { state.multiplicadora = v; });
    on('tt-origem', v => { state.origem = v; });
  }

  function modal(titulo, sub, corpo) {
    const ant = document.getElementById('hub-tt-modal'); if (ant) ant.remove();
    const m = document.createElement('div');
    m.id = 'hub-tt-modal';
    m.innerHTML = `
      <div data-fechar style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:998"></div>
      <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.3);width:94%;max-width:820px;max-height:90vh;z-index:999;display:flex;flex-direction:column">
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
  const grade = html => `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px 16px">${html}</div>`;
  const inp = (id, label, valor, tipo, extra) => `<div class="field"><label>${label}</label><input id="${id}" type="${tipo || 'text'}" value="${esc(valor == null ? '' : valor)}" ${extra || ''}></div>`;
  const sel = (id, label, lista, atual) => `<div class="field"><label>${label}</label><select id="${id}" style="width:100%">${lista.map(o => `<option ${o === atual ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
  const sugestoes = (id, valores) => `<datalist id="${id}">${Array.from(new Set(valores.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')).map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
  const minutos = h => (/^\d{1,2}:\d{2}$/.test(h || '') ? +h.split(':')[0] * 60 + +h.split(':')[1] : null);

  function abrirFormulario(x) {
    const novo = !x;
    const d = x || { data: new Date().toISOString().slice(0, 10), modalidade: 'Presencial', publico: 'Liderados', canal: 'Loja', marcas: [], multiplicadoras: [] };
    const todas = (window.HUB_DATA && HUB_DATA.treinamento_turmas) || [];
    const multis = todas.flatMap(t => t.multiplicadoras || []).concat(meuNome());
    const principal = (d.multiplicadoras || [])[0] || (podeTudo() ? '' : meuNome());
    const dupla = (d.multiplicadoras || []).slice(1).join(', ');
    const corpo = bloco('Turma', grade(`
        ${inp('tf-data', 'Data *', String(d.data || '').slice(0, 10), 'date')}
        <div class="field" style="grid-column:span 2"><label>Tema *</label><input id="tf-tema" list="tf-l-tema" value="${esc(d.tema || '')}" placeholder="Ex.: INTEGRAÇÃO HERING"></div>
        ${sel('tf-mod', 'Modalidade', ['Presencial', 'Online'], d.modalidade)}
        <div class="field"><label>Local</label><input id="tf-local" list="tf-l-local" value="${esc(d.local || '')}"></div>
        ${inp('tf-ini', 'Início *', d.hora_inicio, 'time')}
        ${inp('tf-fim', 'Fim *', d.hora_fim, 'time')}
        ${inp('tf-horas', 'Duração (h) *', d.horas, 'number', 'step="0.25" min="0"')}`)
        + '<p class="sub" style="margin-top:6px;font-size:11px">A duração é preenchida pelo horário; ajuste se houve intervalo (ex.: 10:00–15:00 com 30 min de almoço = 4,5 h).</p>')
      + bloco('Público e entrega', grade(`
        ${sel('tf-pub', 'Público', ['Liderados', 'Líderes', 'Líderes e liderados'], d.publico)}
        ${sel('tf-canal', 'Canal', ['Loja', 'Escritório', 'Loja e Escritório'], d.canal)}
        ${inp('tf-conv', 'Convocados *', d.convocados, 'number', 'min="0" step="1"')}
        ${inp('tf-pres', 'Presentes *', d.presentes, 'number', 'min="0" step="1"')}
        <div class="field"><label>Aderência</label><div id="tf-ader" style="padding:9px 0;font-size:15px;font-weight:700">—</div></div>`)
        + `<div class="field" style="margin-top:10px"><label>Marca(s) *</label><div style="display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px">${MARCAS.concat((d.marcas || []).filter(mm => !MARCAS.includes(mm))).map(mm => `<label style="display:inline-flex;align-items:center;gap:5px;font-weight:400;white-space:nowrap;width:auto;margin:0"><input type="checkbox" class="tf-marca" style="width:auto;margin:0" value="${esc(mm)}" ${(d.marcas || []).includes(mm) ? 'checked' : ''}> ${esc(mm)}</label>`).join('')}</div></div>`)
      + bloco('Multiplicadora', grade(`
        ${podeTudo() ? `<div class="field"><label>Multiplicadora *</label><input id="tf-multi" list="tf-l-multi" value="${esc(principal)}"></div>` : `<div class="field"><label>Multiplicadora</label><input id="tf-multi" value="${esc(principal)}" disabled></div>`}
        <div class="field"><label>Junto com (turma em dupla)</label><input id="tf-dupla" list="tf-l-multi" value="${esc(dupla)}" placeholder="opcional"></div>`)
        + `<div class="field" style="margin-top:10px"><label>Observação</label><textarea id="tf-obs" rows="2" style="width:100%" placeholder="opcional: turma com revendedores, material, o que foi trabalhado...">${esc(d.observacao || '')}</textarea></div>`)
      + sugestoes('tf-l-tema', todas.map(t => t.tema)) + sugestoes('tf-l-local', todas.map(t => t.local)) + sugestoes('tf-l-multi', multis)
      + `<div class="msg err" id="tf-msg" style="display:none"></div>
        <div style="display:flex;gap:8px;justify-content:space-between;margin-top:4px;flex-wrap:wrap">
          <span>${!novo ? '<button type="button" class="btn btn-outline btn-sm" style="width:auto;color:var(--critical)" id="tf-excluir">Excluir turma</button>' : ''}</span>
          <button type="button" class="btn btn-sm" style="width:auto" id="tf-salvar">${novo ? 'Lançar turma' : 'Salvar alterações'}</button>
        </div>
        ${!novo ? `<p class="sub" style="margin-top:8px;font-size:10.5px;color:var(--muted);text-align:right">Lançada por ${esc(d.criado_por_nome || '—')} em ${dataBR(d.importado_em)}${d.atualizado_por ? ` · última alteração por ${esc(d.atualizado_por)} em ${dataBR(d.atualizado_em)}` : ''}</p>` : ''}`;

    const m = modal(novo ? 'Lançar turma' : esc(d.tema), novo ? 'Registre a turma logo depois de dar o treinamento.' : `${dataBR(d.data)} · ${esc((d.multiplicadoras || []).join(', '))}`, corpo);
    const $ = id => m.querySelector('#' + id);
    const msg = t => { const e = $('tf-msg'); e.textContent = t; e.style.display = t ? 'block' : 'none'; };

    // Duração calculada a cada mudança no início ou no fim (dá para ajustar depois, ex.: intervalo).
    const calcular = () => {
      const a = minutos($('tf-ini').value), b = minutos($('tf-fim').value);
      if (a != null && b != null && b > a) $('tf-horas').value = Math.round((b - a) / 60 * 100) / 100;
    };
    ['input', 'change'].forEach(ev => { $('tf-ini').addEventListener(ev, calcular); $('tf-fim').addEventListener(ev, calcular); });

    // Aderência = presentes ÷ convocados, na hora em que os dois são preenchidos.
    const aderencia = () => {
      const c = Number($('tf-conv').value), p = Number($('tf-pres').value), e = $('tf-ader');
      if ($('tf-conv').value === '' || $('tf-pres').value === '' || !(c > 0)) { e.textContent = '—'; e.style.color = ''; return; }
      if (p > c) { e.textContent = 'presentes acima dos convocados'; e.style.color = 'var(--critical)'; return; }
      const v = p / c;
      e.textContent = U.fmtPct(v, 0);
      e.style.color = v >= 0.9 ? '#0f8a4c' : v >= 0.7 ? '#b7791f' : 'var(--critical)';
    };
    ['input', 'change'].forEach(ev => { $('tf-conv').addEventListener(ev, aderencia); $('tf-pres').addEventListener(ev, aderencia); });
    aderencia();

    $('tf-salvar').addEventListener('click', async () => {
      const P = HUB_PARSERS_TURMAS._internal;
      const tema = P.tema($('tf-tema').value);
      const marcas = Array.from(m.querySelectorAll('.tf-marca:checked')).map(c => c.value);
      const multiPrincipal = ($('tf-multi').value || '').trim();
      const multisTurma = [multiPrincipal].concat(P.multiplicadoras($('tf-dupla').value)).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
      const conv = $('tf-conv').value === '' ? null : Math.round(Number($('tf-conv').value));
      const pres = $('tf-pres').value === '' ? null : Math.round(Number($('tf-pres').value));
      const horas = Number(String($('tf-horas').value).replace(',', '.'));
      const ini = $('tf-ini').value, fim = $('tf-fim').value;
      if (!$('tf-data').value || !tema) return msg('Informe a data e o tema.');
      if (!ini || !fim || minutos(fim) <= minutos(ini)) return msg('Informe o horário de início e de fim (o fim depois do início).');
      if (!(horas > 0)) return msg('Informe a duração da turma.');
      if (conv == null || pres == null) return msg('Informe convocados e presentes.');
      if (pres > conv) return msg('Presentes não pode ser maior que convocados. Se veio gente a mais, aumente os convocados.');
      if (!marcas.length) return msg('Marque pelo menos uma marca.');
      if (!multiPrincipal) return msg('Informe a multiplicadora.');
      const dados = {
        data: $('tf-data').value, tema, categoria: P.categoria(tema), modalidade: $('tf-mod').value, local: P.local($('tf-local').value),
        hora_inicio: ini, hora_fim: fim, horas, publico: $('tf-pub').value, canal: $('tf-canal').value,
        convocados: conv, presentes: pres, marcas, marca_original: marcas.join(' / '),
        multiplicadoras: multisTurma, multiplicador_original: multisTurma.join(' & '), planilha: multiPrincipal,
        observacao: $('tf-obs').value.trim(), usuario: meuNome()
      };
      const btn = $('tf-salvar');
      btn.disabled = true; btn.textContent = 'Salvando...'; msg('');
      try {
        await HUB_DAL.salvarTurmaHub(novo ? null : d.id, dados);
        m.remove();
        HUB_RENDER_CURRENT();
      } catch (err) {
        msg(err.message);
        btn.disabled = false; btn.textContent = novo ? 'Lançar turma' : 'Salvar alterações';
      }
    });

    const exc = $('tf-excluir');
    if (exc) exc.addEventListener('click', async () => {
      if (!confirm(`Excluir a turma "${d.tema}" de ${dataBR(d.data)}? Não dá para desfazer.`)) return;
      exc.disabled = true;
      try { await HUB_DAL.excluirTurmaHub(d.id); m.remove(); HUB_RENDER_CURRENT(); }
      catch (err) { msg(err.message); exc.disabled = false; }
    });
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderTurmas = renderTurmas;
})();
