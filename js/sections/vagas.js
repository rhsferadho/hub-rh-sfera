// Recrutamento → Controle de Vagas (+ "Nova Vaga"). Portado de
// renderVagas/renderVagasTable/openEditDrawer/renderNovaVaga do Sfera
// Recruiter original (index.html antigo, ~4751-6140), adaptado às
// convenções do hub: sem <script> de ícones (Lucide) — botões de texto em
// vez de ícones; sem elemento de drawer no shell novo — editar vaga troca o
// conteúdo da própria seção por um formulário (como a Nova Vaga já fazia),
// em vez de abrir um painel lateral; listas de dropdown (marca/unidade/
// cargo/etapa/fonte/portal/nível/recrutador) vêm de HUB_RECRUIT_DATA em vez
// dos arrays fixos do app original. Estado local (filtros/ordenação/
// paginação/wizard) fica em `let`s do módulo, no mesmo padrão de
// js/admin/usuarios.js.
//
// Adaptação de schema: no app original, Departamento cascateava a partir de
// Unidade (loja/local). No hub novo, a tabela `recrutamento_departamentos`
// tem coluna `marca` (não `unidade`) — ver supabase-migration.sql linha
// ~544 e o comentário da policy `vagas_select` — então aqui Departamento
// cascateia a partir de MARCA.
(function () {
  const U = HUB_UTILS;
  const R = HUB_RECRUIT;
  const MR = HUB_METRICS_RECRUTAMENTO;

  // ---- Enums fixos do domínio (fonte: index.html original ~2140-2149) ----
  const STATUS_VAGA = ['Aberto', 'Andamento', 'Congelado', 'Finalizada', 'Cancelada'];
  const MOTIVOS_SLA = ['Perfil Específico', 'Prioridade em Outros Processos', 'Processo Suspenso', 'Volume Alto de Vagas', 'Dificuldade de Atração'];
  const TIPOS_VAGA = ['Operacional', 'Estratégica'];
  const TIPOS_MOV = ['Aumento de Quadro', 'Substituição'];
  const MOTIVOS_AUMENTO = ['Ajuste Estrutural do Setor', 'Expansão de Negócios', 'Novo Projeto'];
  const TIPOS_RECRUT = ['Externo', 'Interno', 'Misto'];
  const SIGILO = ['Sim', 'Não'];

  function D() { return window.HUB_RECRUIT_DATA || {}; }
  function canWrite() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'recrutamento.vagas'); }
  // Não existe mais um perfil "Administrador" que passa direto por cima da
  // fila de aprovação — a permissão mais próxima disso no catálogo novo é
  // quem também enxerga a tela de Aprovações: se a pessoa pode aprovar,
  // aplica a ação direto; senão, vira solicitação (mesma lógica de
  // isAdmin() no app original, só que via permissão granular).
  function canApprove() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'recrutamento.aprovacoes'); }

  function marcasAtivas() { return R.activeNames('marcas'); }
  function unidadesAtivas() { return R.activeNames('unidades'); }
  function cargosAtivos() { return R.activeNames('cargos'); }
  function etapasAtivas() { return R.activeNames('etapas'); }
  function fontesAtivas() { return R.activeNames('fontes_captacao'); }
  function portaisAtivosLista() { return R.activeNames('portais'); }
  function niveisAtivos() { return R.activeNames('niveis_vaga'); }
  function recrutadoresAtivos() { return R.activeNames('recrutadores'); }
  function departamentosPorMarca(marca) {
    return U.uniqueSorted((D().recrutamento_departamentos || [])
      .filter(r => r.ativo !== false && (!marca || r.marca === marca))
      .map(r => r.nome));
  }

  // ---- Badges / formatadores de célula (portados de badgeStatusVaga,
  // badgeStatusSLA, formatFitCel, formatSLACel — adaptados às classes
  // .badge .b1..b5 do hub, sem CSS/ícones próprios do app original) ----
  function badgeStatusVaga(s) {
    const map = { Aberto: 'b1', Andamento: 'b4', Congelado: 'b5', Finalizada: 'b2', Cancelada: 'b3' };
    return `<span class="badge ${map[s] || 'b5'}">${U.escapeHtml(s || '—')}</span>`;
  }
  function badgeStatusSLA(s) {
    if (s === 'No Prazo') return '<span class="badge b2">No Prazo</span>';
    if (s === 'Atenção (>80%)') return '<span class="badge b4">Atenção</span>';
    return '<span class="badge b3">Expirou</span>';
  }
  function formatFitCel(fit) {
    if (fit === null || fit === undefined) return '<span style="color:var(--muted)">—</span>';
    const v = Math.max(0, Math.min(100, fit));
    let cor = 'var(--critical)';
    if (v >= 80) cor = 'var(--good)'; else if (v >= 60) cor = 'var(--warning)';
    return `<span style="font-weight:700;color:${cor}">${v}%</span>`;
  }
  function formatSLACel(dias) {
    if (dias === null || dias === undefined) return '<span style="color:var(--muted)">—</span>';
    const cor = dias > 7 ? 'var(--critical)' : (dias > 3 ? 'var(--warning)' : 'var(--good)');
    return `<span style="font-weight:700;color:${cor}">${dias}d</span>`;
  }

  // ---- slaEntreDatas/slaAdmissaoVaga: HUB_METRICS_RECRUTAMENTO só exporta
  // calcularSLA/statusSLA (reaproveitados abaixo via MR.*) — estas duas não
  // são exportadas por metrics-recrutamento.js, então são reimplementadas
  // aqui (idênticas ao original ~3072-3096; não dá para editar aquele
  // arquivo, fora do escopo desta tarefa). ----
  function slaEntreDatas(dContato, dAgendada) {
    if (!dContato || !dAgendada) return null;
    const c = new Date(dContato), a = new Date(dAgendada);
    if (isNaN(c) || isNaN(a)) return null;
    return Math.max(0, Math.round((a - c) / 86400000));
  }
  function slaAdmissaoVaga(vaga) {
    if (!vaga.dataFechamento || !vaga.dataPrevistaAdmissao) return null;
    return slaEntreDatas(vaga.dataFechamento, vaga.dataPrevistaAdmissao);
  }

  // ---- Agregados de candidatos por vaga (portados de contarCandsDaVaga,
  // contarEntrevistadosDaVaga, contarReprovadosDaVaga, contarDesistentesDaVaga,
  // mediaFitDaVaga, fitContratadoDaVaga, slaEtapaCandidatoUltimo) ----
  function candidatosDaVaga(vagaId) { return (D().candidatos || []).filter(c => c.vagaId === vagaId); }
  function contarCandsDaVaga(id) { return candidatosDaVaga(id).length; }
  function contarEntrevistadosDaVaga(id) {
    return candidatosDaVaga(id).filter(c => c.etapaRHStatus === 'Concluída' || (c.resultadoRH && c.resultadoRH !== 'Em andamento')).length;
  }
  function contarReprovadosDaVaga(id) {
    return candidatosDaVaga(id).filter(c => c.resultadoFinal === 'Reprovado' || c.resultadoRH === 'Reprovado' || c.resultadoAnalise === 'Reprovado' || c.resultadoChecagem === 'Reprovado' || c.resultadoGestor === 'Reprovado').length;
  }
  // resultadoFinal usa RESULTADO_FINAL_V2 no formulário novo (['Aprovado',
  // 'Reprovado','Desistente','Banco de Talentos']) — "Desistente", não mais
  // "Desistiu" como no v1/v2 do app original.
  function contarDesistentesDaVaga(id) { return candidatosDaVaga(id).filter(c => c.resultadoFinal === 'Desistente').length; }
  function mediaFitDaVaga(id) {
    const cands = candidatosDaVaga(id).filter(c => typeof c.fitPct === 'number' && c.fitPct > 0);
    if (!cands.length) return null;
    return Math.round(cands.reduce((s, c) => s + c.fitPct, 0) / cands.length);
  }
  function fitContratadoDaVaga(vaga) {
    const cands = candidatosDaVaga(vaga.id);
    const contratado = cands.find(c => c.resultadoFinal === 'Aprovado' || (c.dataAdmissao && c.dataAdmissao !== ''));
    if (contratado && typeof contratado.fitPct === 'number') return contratado.fitPct;
    if (vaga.contratado) {
      const byName = cands.find(c => c.nome === vaga.contratado);
      if (byName && typeof byName.fitPct === 'number') return byName.fitPct;
    }
    if (vaga.status === 'Finalizada' && typeof vaga.fitPct === 'number' && vaga.fitPct > 0) return vaga.fitPct;
    return null;
  }
  function slaEtapaCandidatoUltimo(vagaId, etapa) {
    const cands = candidatosDaVaga(vagaId).slice().sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0));
    if (!cands.length) return null;
    const c = cands[0];
    const map = {
      RH: ['dataContatoRH', 'dataAgendadaRH'], Analise: ['dataContatoAnalise', 'dataAgendadaAnalise'],
      Checagem: ['dataContatoChecagem', 'dataAgendadaChecagem'], Gestor: ['dataContatoGestor', 'dataAgendadaGestor']
    };
    const pair = map[etapa];
    return pair ? slaEntreDatas(c[pair[0]], c[pair[1]]) : null;
  }

  // ================================================================
  // Estado do módulo
  // ================================================================
  let listState = {
    search: '', filterMarca: 'todas', filterRecrutador: 'todos', filterStatusArray: [],
    filterTipo: 'todos', filterSLA: 'todos', filterDataIni: '', filterDataFim: '',
    sortKey: 'dataAbertura', sortDir: 'desc', page: 1, pageSize: 10
  };
  let view = 'list'; // 'list' | 'nova' | 'editar'
  let rootEl = null;
  let editingVagaId = null;
  let editHistorico = null; // carregado sob demanda ao entrar em "editar"
  let novaVagaStep = 1;
  let novaVagaDados = {};
  let finalistasSelecionados = [];
  let contratadosSelecionados = [];

  // `f` (filtro compartilhado da barra superior) é ignorado de propósito —
  // esta é uma tela operacional com seu próprio painel de filtros, igual a
  // js/admin/usuarios.js. Parâmetro mantido só para bater com a assinatura
  // padrão function renderX(el, f) usada por app.js.
  function renderVagas(el, f) {
    rootEl = el;
    render();
  }

  function render() {
    if (!rootEl) return;
    if (view === 'nova') renderNovaVagaView(rootEl);
    else if (view === 'editar') renderEditView(rootEl);
    else renderListView(rootEl);
  }

  async function reloadAndRender() {
    try { await R.reload(); } catch (err) { /* mantém dados antigos na tela mesmo se o reload falhar */ }
    render();
  }

  // ================================================================
  // LISTA
  // ================================================================
  function filtrarVagas() {
    let res = (D().vagas || []).slice();
    const s = listState.search.toLowerCase().trim();
    if (s) res = res.filter(v => Object.values(v).some(val => Array.isArray(val) ? val.join(' ').toLowerCase().includes(s) : String(val || '').toLowerCase().includes(s)));
    if (listState.filterMarca !== 'todas') res = res.filter(v => v.marca === listState.filterMarca);
    if (listState.filterRecrutador !== 'todos') res = res.filter(v => v.responsavel === listState.filterRecrutador);
    if (listState.filterStatusArray.length) res = res.filter(v => listState.filterStatusArray.includes(v.status));
    if (listState.filterTipo !== 'todos') res = res.filter(v => v.tipoVaga === listState.filterTipo);
    if (listState.filterSLA !== 'todos') {
      res = res.filter(v => {
        const ss = MR.statusSLA(v);
        if (listState.filterSLA === 'no-prazo') return ss === 'No Prazo';
        if (listState.filterSLA === 'atencao') return ss === 'Atenção (>80%)';
        if (listState.filterSLA === 'vencido') return ss === 'Expirou SLA';
        return true;
      });
    }
    if (listState.filterDataIni) res = res.filter(v => (v.dataAbertura || '') >= listState.filterDataIni);
    if (listState.filterDataFim) res = res.filter(v => (v.dataAbertura || '') <= listState.filterDataFim);
    const k = listState.sortKey;
    res.sort((a, b) => {
      let va, vb;
      if (k === 'sla') { va = MR.calcularSLA(a); vb = MR.calcularSLA(b); }
      else { va = a[k]; vb = b[k]; }
      if (typeof va === 'number' && typeof vb === 'number') return listState.sortDir === 'asc' ? va - vb : vb - va;
      va = String(va || '').toLowerCase(); vb = String(vb || '').toLowerCase();
      if (va < vb) return listState.sortDir === 'asc' ? -1 : 1;
      if (va > vb) return listState.sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return res;
  }

  function sortIcon(k) {
    if (listState.sortKey !== k) return '';
    return listState.sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  function renderListView(el) {
    const all = filtrarVagas();
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / listState.pageSize));
    if (listState.page > totalPages) listState.page = totalPages;
    const start = (listState.page - 1) * listState.pageSize;
    const page = all.slice(start, start + listState.pageSize);

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div>
          <h2 style="font-size:16px">Controle de Vagas</h2>
          <p class="sub" style="color:var(--muted);font-size:12px;margin-top:2px">Gerencie vagas em aberto, andamento ou finalizadas</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline btn-sm" id="vg-export">Exportar CSV</button>
          ${canWrite() ? '<button class="btn btn-primary btn-sm" id="vg-nova">+ Nova vaga</button>' : ''}
        </div>
      </div>
      <div class="card full">
        <div class="toolbar">
          <input type="text" id="vg-search" placeholder="Buscar em todos os campos..." value="${U.escapeHtml(listState.search)}">
          <select id="vg-f-marca"><option value="todas">Todas as marcas</option>${marcasAtivas().map(m => `<option value="${U.escapeHtml(m)}" ${listState.filterMarca === m ? 'selected' : ''}>${U.escapeHtml(m)}</option>`).join('')}</select>
          <select id="vg-f-recrut"><option value="todos">Todos recrutadores</option>${recrutadoresAtivos().map(r => `<option value="${U.escapeHtml(r)}" ${listState.filterRecrutador === r ? 'selected' : ''}>${U.escapeHtml(r)}</option>`).join('')}</select>
          <select id="vg-f-tipo"><option value="todos">Todos os tipos</option>${TIPOS_VAGA.map(t => `<option ${listState.filterTipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <select id="vg-f-sla">
            <option value="todos">SLA: todos</option>
            <option value="no-prazo" ${listState.filterSLA === 'no-prazo' ? 'selected' : ''}>SLA: No prazo</option>
            <option value="atencao" ${listState.filterSLA === 'atencao' ? 'selected' : ''}>SLA: Atenção</option>
            <option value="vencido" ${listState.filterSLA === 'vencido' ? 'selected' : ''}>SLA: Vencido</option>
          </select>
          <input type="date" id="vg-f-ini" value="${listState.filterDataIni}" title="Abertura - de">
          <input type="date" id="vg-f-fim" value="${listState.filterDataFim}" title="Abertura - até">
        </div>
        <div class="checks" style="margin-bottom:14px">
          ${STATUS_VAGA.map(s => `<label class="chk"><input type="checkbox" data-status="${s}" ${listState.filterStatusArray.includes(s) ? 'checked' : ''}>${s}</label>`).join('')}
        </div>
        ${page.length === 0 ? HUB_UI.empty('Nenhuma vaga encontrada.', 'Ajuste os filtros ou cadastre uma nova vaga.') : `
        <div class="table-wrap"><table class="dt">
          <thead><tr>
            <th data-k="id" style="cursor:pointer">ID${sortIcon('id')}</th>
            <th data-k="cargo" style="cursor:pointer">Cargo${sortIcon('cargo')}</th>
            <th data-k="marca" style="cursor:pointer">Marca${sortIcon('marca')}</th>
            <th data-k="departamento" style="cursor:pointer">Depto.${sortIcon('departamento')}</th>
            <th data-k="dataAbertura" style="cursor:pointer">Abertura${sortIcon('dataAbertura')}</th>
            <th data-k="responsavel" style="cursor:pointer">Responsável${sortIcon('responsavel')}</th>
            <th data-k="status" style="cursor:pointer">Status${sortIcon('status')}</th>
            <th data-k="etapa" style="cursor:pointer">Etapa${sortIcon('etapa')}</th>
            <th data-k="sla" style="cursor:pointer">SLA${sortIcon('sla')}</th>
            <th>SLA Status</th><th>Motivo SLA</th><th>Média FIT</th><th>FIT Contratado</th>
            <th>Cand.</th><th>Entrev.</th><th>Reprov.</th><th>Desist.</th>
            <th data-k="numInscricoes" style="cursor:pointer">Inscrições${sortIcon('numInscricoes')}</th>
            <th data-k="tipoVaga" style="cursor:pointer">Tipo${sortIcon('tipoVaga')}</th>
            <th></th>
          </tr></thead>
          <tbody>
            ${page.map(v => {
              const sla = MR.calcularSLA(v), ss = MR.statusSLA(v);
              return `<tr>
                <td>${U.escapeHtml(v.id)}</td>
                <td><strong>${U.escapeHtml(v.cargo || '')}</strong></td>
                <td>${U.escapeHtml(v.marca || '')}</td>
                <td>${U.escapeHtml(v.departamento || '')}</td>
                <td>${U.fmtDateBR(v.dataAbertura)}</td>
                <td>${U.escapeHtml(v.responsavel || '')}</td>
                <td>${badgeStatusVaga(v.status)}</td>
                <td>${U.escapeHtml(v.etapa || '')}</td>
                <td>${sla}d</td>
                <td>${badgeStatusSLA(ss)}</td>
                <td style="max-width:150px;white-space:normal">${v.motivoSLAText ? U.escapeHtml(v.motivoSLAText) : '<span style="color:var(--muted)">—</span>'}</td>
                <td>${formatFitCel(mediaFitDaVaga(v.id))}</td>
                <td>${formatFitCel(fitContratadoDaVaga(v))}</td>
                <td style="text-align:center">${contarCandsDaVaga(v.id)}</td>
                <td style="text-align:center">${contarEntrevistadosDaVaga(v.id)}</td>
                <td style="text-align:center">${contarReprovadosDaVaga(v.id)}</td>
                <td style="text-align:center">${contarDesistentesDaVaga(v.id)}</td>
                <td style="text-align:center">${v.numInscricoes || 0}</td>
                <td>${U.escapeHtml(v.tipoVaga || '')}</td>
                <td class="row-actions">
                  <button class="btn btn-outline btn-sm" data-editar="${v.id}">${canWrite() ? 'Editar' : 'Ver'}</button>
                  ${canWrite() ? `<button class="btn btn-danger btn-sm" data-excluir="${v.id}">${canApprove() ? 'Excluir' : 'Solicitar exclusão'}</button>` : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;flex-wrap:wrap;gap:10px">
          <span style="font-size:12px;color:var(--muted)">Mostrando ${page.length} de ${total} vaga(s)</span>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="btn btn-outline btn-sm" id="vg-prev" ${listState.page === 1 ? 'disabled' : ''}>‹ Anterior</button>
            <span style="font-size:12px">Página ${listState.page} de ${totalPages}</span>
            <button class="btn btn-outline btn-sm" id="vg-next" ${listState.page === totalPages ? 'disabled' : ''}>Próxima ›</button>
          </div>
        </div>`}
      </div>`;
    wireListEvents(el, totalPages);
  }

  function wireListEvents(el, totalPages) {
    const $ = sel => el.querySelector(sel);
    $('#vg-search') && $('#vg-search').addEventListener('input', e => { listState.search = e.target.value; listState.page = 1; render(); });
    $('#vg-f-marca') && $('#vg-f-marca').addEventListener('change', e => { listState.filterMarca = e.target.value; listState.page = 1; render(); });
    $('#vg-f-recrut') && $('#vg-f-recrut').addEventListener('change', e => { listState.filterRecrutador = e.target.value; listState.page = 1; render(); });
    $('#vg-f-tipo') && $('#vg-f-tipo').addEventListener('change', e => { listState.filterTipo = e.target.value; listState.page = 1; render(); });
    $('#vg-f-sla') && $('#vg-f-sla').addEventListener('change', e => { listState.filterSLA = e.target.value; listState.page = 1; render(); });
    $('#vg-f-ini') && $('#vg-f-ini').addEventListener('change', e => { listState.filterDataIni = e.target.value; listState.page = 1; render(); });
    $('#vg-f-fim') && $('#vg-f-fim').addEventListener('change', e => { listState.filterDataFim = e.target.value; listState.page = 1; render(); });
    el.querySelectorAll('[data-status]').forEach(chk => chk.addEventListener('change', () => {
      listState.filterStatusArray = Array.from(el.querySelectorAll('[data-status]:checked')).map(c => c.dataset.status);
      listState.page = 1; render();
    }));
    el.querySelectorAll('th[data-k]').forEach(th => th.addEventListener('click', () => {
      const k = th.dataset.k;
      if (listState.sortKey === k) listState.sortDir = listState.sortDir === 'asc' ? 'desc' : 'asc';
      else { listState.sortKey = k; listState.sortDir = 'asc'; }
      render();
    }));
    el.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => openEditar(b.dataset.editar)));
    el.querySelectorAll('[data-excluir]').forEach(b => b.addEventListener('click', () => acaoExcluirVaga(b.dataset.excluir)));
    $('#vg-export') && $('#vg-export').addEventListener('click', exportarVagasCSV);
    $('#vg-nova') && $('#vg-nova').addEventListener('click', openNovaVaga);
    $('#vg-prev') && $('#vg-prev').addEventListener('click', () => { if (listState.page > 1) { listState.page--; render(); } });
    $('#vg-next') && $('#vg-next').addEventListener('click', () => { if (listState.page < totalPages) { listState.page++; render(); } });
  }

  function exportarVagasCSV() {
    const header = ['ID', 'Data Abertura', 'Marca', 'Departamento', 'Cargo', 'Solicitante', 'Responsável', 'Status', 'Etapa', 'SLA (dias)', 'Status SLA', 'Tipo Vaga', 'Tipo Movimentação', 'Tipo Recrutamento', 'Fonte', 'Data Fechamento', 'Contratado', '% FIT', 'Observações'];
    const rows = [header].concat((D().vagas || []).map(v => [
      v.id, v.dataAbertura, v.marca, v.departamento, v.cargo, v.solicitante, v.responsavel, v.status, v.etapa,
      MR.calcularSLA(v), MR.statusSLA(v), v.tipoVaga, v.tipoMovimentacao, v.tipoRecrutamento, v.fonte,
      v.dataFechamento, v.contratado, v.fitPct, v.observacoes
    ]));
    baixarCSV(`vagas_${U.todayISO()}.csv`, rows);
  }

  function baixarCSV(filename, rows) {
    const csv = rows.map(r => r.map(v => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ================================================================
  // EXCLUIR (com fila de aprovação — portado de acaoExcluirVaga)
  // ================================================================
  async function acaoExcluirVaga(vagaId) {
    const vaga = (D().vagas || []).find(v => v.id === vagaId);
    if (!vaga) return;
    if (canApprove()) {
      if (!confirm(`Excluir definitivamente a vaga ${vaga.id} — ${vaga.cargo}?\n\nEsta ação não pode ser desfeita.`)) return;
      try {
        await R.deleteRow('vagas', vagaId);
        await R.logAcao({ acao: 'Exclusão de Vaga', vagaId, detalhes: `Vaga excluída: ${vaga.cargo} (${vaga.marca})` });
      } catch (err) { alert('Erro ao excluir: ' + err.message); return; }
    } else {
      const motivo = prompt(`Solicitar exclusão da vaga ${vaga.id} — ${vaga.cargo}.\n\nInforme o motivo:`);
      if (motivo === null) return;
      try {
        await R.criarSolicitacao({
          tipo: 'excluir-vaga', payload: { vagaId, cargo: vaga.cargo, marca: vaga.marca },
          descricao: `Excluir vaga ${vagaId} — ${vaga.cargo} (${vaga.marca}). Motivo: ${motivo || 'não informado'}`
        });
      } catch (err) { alert('Erro ao enviar solicitação: ' + err.message); return; }
      alert('Solicitação de exclusão enviada para aprovação.');
    }
    await reloadAndRender();
  }

  // ================================================================
  // EDITAR (substitui o drawer do app original — o shell novo não tem
  // elemento de drawer/overlay, então "editar" troca o conteúdo da seção
  // por um formulário de página inteira, com botão "Voltar")
  // ================================================================
  function openEditar(vagaId) {
    const vaga = (D().vagas || []).find(v => v.id === vagaId);
    if (!vaga) return;
    editingVagaId = vagaId;
    finalistasSelecionados = (vaga.finalistas || '').split(',').map(s => s.trim()).filter(Boolean);
    contratadosSelecionados = (vaga.contratado || '').split(',').map(s => s.trim()).filter(Boolean);
    editHistorico = null;
    view = 'editar';
    render();
    R.listHistorico().then(list => {
      editHistorico = list.filter(l => l.vagaId === vagaId);
      if (view === 'editar' && editingVagaId === vagaId) render();
    }).catch(() => { editHistorico = []; });
  }

  function selOpts(arr, val, emptyLabel) {
    return `<option value="">${emptyLabel || '—'}</option>` + arr.map(o => `<option value="${U.escapeHtml(o)}" ${val === o ? 'selected' : ''}>${U.escapeHtml(o)}</option>`).join('');
  }

  function finalistasListHTML(vagaId) {
    const opcoes = candidatosDaVaga(vagaId).map(c => c.nome).filter(n => !finalistasSelecionados.includes(n));
    return `${finalistasSelecionados.map(n => `<span class="tag-chip">${U.escapeHtml(n)} <span class="x" data-rm-finalista="${U.escapeHtml(n)}">×</span></span>`).join('')}
      ${opcoes.length ? `<select id="vg-finalista-add" style="max-width:220px"><option value="">+ selecionar candidato...</option>${opcoes.map(n => `<option value="${U.escapeHtml(n)}">${U.escapeHtml(n)}</option>`).join('')}</select>` : (finalistasSelecionados.length ? '' : '<span style="font-size:12px;color:var(--muted)">Nenhum candidato vinculado a esta vaga ainda.</span>')}`;
  }
  function contratadoListHTML(vagaId) {
    const opcoes = candidatosDaVaga(vagaId).filter(c => c.resultadoGestor === 'Aprovado').map(c => c.nome).filter(n => !contratadosSelecionados.includes(n));
    return `${contratadosSelecionados.map(n => `<span class="tag-chip">${U.escapeHtml(n)} <span class="x" data-rm-contratado="${U.escapeHtml(n)}">×</span></span>`).join('')}
      ${opcoes.length ? `<select id="vg-contratado-add" style="max-width:220px"><option value="">+ selecionar candidato...</option>${opcoes.map(n => `<option value="${U.escapeHtml(n)}">${U.escapeHtml(n)}</option>`).join('')}</select>` : (contratadosSelecionados.length ? '' : '<span style="font-size:12px;color:var(--muted)">Nenhum candidato aprovado na etapa Gestor ainda.</span>')}`;
  }

  function formVagaFieldsHTML(v, opts) {
    opts = opts || {};
    const disabled = opts.readOnly ? 'disabled' : '';
    const slaExpirada = MR.statusSLA(v) === 'Expirou SLA';
    return `
      <div class="form-grid">
        <div class="field"><label>ID da Vaga</label><input value="${U.escapeHtml(v.id)}" readonly style="background:var(--bg)"></div>
        <div class="field"><label>Data de Abertura <span class="req">*</span></label><input type="date" id="ev_dataAbertura" value="${v.dataAbertura || ''}" ${disabled}></div>
        <div class="field"><label>Marca <span class="req">*</span></label><select id="ev_marca" ${disabled}>${selOpts(marcasAtivas(), v.marca)}</select></div>
        <div class="field"><label>Unidade</label><select id="ev_unidade" ${disabled}>${selOpts(unidadesAtivas(), v.unidade)}</select></div>
        <div class="field"><label>Departamento</label><select id="ev_departamento" ${disabled}>${selOpts(departamentosPorMarca(v.marca), v.departamento)}</select></div>
        <div class="field"><label>Nível da Vaga</label><select id="ev_nivelVaga" ${disabled}>${selOpts(niveisAtivos(), v.nivelVaga)}</select></div>
        <div class="field"><label>Solicitante</label><input id="ev_solicitante" value="${U.escapeHtml(v.solicitante || '')}" ${disabled}></div>
        <div class="field"><label>Cargo <span class="req">*</span></label><select id="ev_cargo" ${disabled}>${selOpts(cargosAtivos(), v.cargo)}</select></div>
        <div class="field"><label>Vaga Sigilosa?</label><select id="ev_sigilosa" ${disabled}>${selOpts(SIGILO, v.sigilosa)}</select></div>
        <div class="field"><label>Tipo da Vaga</label><select id="ev_tipoVaga" ${disabled}>${selOpts(TIPOS_VAGA, v.tipoVaga)}</select></div>
        <div class="field"><label>Responsável (Recrutador) <span class="req">*</span></label><select id="ev_responsavel" ${disabled}>${selOpts(recrutadoresAtivos(), v.responsavel)}</select></div>
        <div class="field"><label>Status da Vaga <span class="req">*</span></label><select id="ev_status" ${disabled}>${selOpts(STATUS_VAGA, v.status)}</select></div>
        <div class="field"><label>Tipo de Movimentação</label><select id="ev_tipoMovimentacao" ${disabled}>${selOpts(TIPOS_MOV, v.tipoMovimentacao)}</select></div>
        <div class="field" id="ev_wrap_motivoAumento" style="${v.tipoMovimentacao === 'Aumento de Quadro' ? '' : 'display:none'}"><label>Motivo Aumento de Quadro</label><select id="ev_motivoAumento" ${disabled}>${selOpts(MOTIVOS_AUMENTO, v.motivoAumento)}</select></div>
        <div class="field" id="ev_wrap_pessoaSubstituida" style="${v.tipoMovimentacao === 'Substituição' ? '' : 'display:none'}"><label>Pessoa Substituída</label><input id="ev_pessoaSubstituida" value="${U.escapeHtml(v.pessoaSubstituida || '')}" ${disabled}></div>
        <div class="field"><label>Tipo de Recrutamento</label><select id="ev_tipoRecrutamento" ${disabled}>${selOpts(TIPOS_RECRUT, v.tipoRecrutamento)}</select></div>
        <div class="field"><label>Etapa da Vaga</label><select id="ev_etapa" ${disabled}>${selOpts(etapasAtivas(), v.etapa)}</select></div>
        <div class="field"><label>Motivo SLA <span class="hint">${slaExpirada ? '' : '(só quando SLA expirar)'}</span></label><select id="ev_motivoSLA" ${slaExpirada ? disabled : 'disabled'}>${selOpts(MOTIVOS_SLA, v.motivoSLA)}</select></div>
        <div class="field"><label>Data do Congelamento</label><input type="date" id="ev_dataCongelamento" value="${v.dataCongelamento || ''}" ${disabled}></div>
        <div class="field"><label>Data do Retorno</label><input type="date" id="ev_dataRetorno" value="${v.dataRetorno || ''}" ${disabled}></div>
        <div class="field"><label>Data do Cancelamento</label><input type="date" id="ev_dataCancelamento" value="${v.dataCancelamento || ''}" ${disabled}></div>
        <div class="field"><label>Data de Fechamento</label><input type="date" id="ev_dataFechamento" value="${v.dataFechamento || ''}" ${disabled}></div>
        <div class="field"><label>Data de Início</label><input type="date" id="ev_dataInicio" value="${v.dataInicio || ''}" ${disabled}></div>
        <div class="field"><label>Data Prevista de Admissão</label><input type="date" id="ev_dataPrevistaAdmissao" value="${v.dataPrevistaAdmissao || ''}" ${disabled}></div>
        <div class="field"><label>Última Divulgação</label><input type="date" id="ev_ultimaDivulgacao" value="${v.ultimaDivulgacao || ''}" ${disabled}></div>
        <div class="field"><label>Data Última Divulgação</label><input type="date" id="ev_dataUltimaDivulgacao" value="${v.dataUltimaDivulgacao || ''}" ${disabled}></div>
        <div class="field"><label>Nº Inscrições Recebidas</label><input type="number" min="0" id="ev_numInscricoes" value="${v.numInscricoes || 0}" ${disabled}></div>
        <div class="field full"><label>Motivo SLA (texto livre) <span class="hint">${slaExpirada ? '' : '(só quando SLA expirar)'}</span></label><input id="ev_motivoSLAText" value="${U.escapeHtml(v.motivoSLAText || '')}" ${slaExpirada ? disabled : 'disabled'}></div>
        <div class="field"><label>% FIT</label><input type="number" min="0" max="100" id="ev_fitPct" value="${v.fitPct || 0}" ${disabled}></div>
        <div class="field"><label>Fonte</label><select id="ev_fonte" ${disabled}>${selOpts(fontesAtivas(), v.fonte)}</select></div>
        <div class="field"><label>Quem Indicou</label><input id="ev_quemIndicou" value="${U.escapeHtml(v.quemIndicou || '')}" ${disabled}></div>
        <div class="field full"><label>Finalistas</label><div class="tag-list" id="ev_finalistasList">${finalistasListHTML(v.id)}</div></div>
        <div class="field full"><label>Contratado(a) <span class="hint">(aprovados na Entrevista Gestor)</span></label><div class="tag-list" id="ev_contratadoList">${contratadoListHTML(v.id)}</div></div>
        <div class="field full">
          <label>Portais ativos</label>
          <div class="checks">${portaisAtivosLista().map(p => `<label class="chk"><input type="checkbox" data-portal="${U.escapeHtml(p)}" ${(v.portaisAtivos || []).includes(p) ? 'checked' : ''} ${disabled}>${U.escapeHtml(p)}</label>`).join('')}</div>
        </div>
        <div class="field full"><label>Observações</label><textarea id="ev_observacoes" rows="3" ${disabled}>${U.escapeHtml(v.observacoes || '')}</textarea></div>
      </div>`;
  }

  function renderEditView(el) {
    const vaga = (D().vagas || []).find(v => v.id === editingVagaId);
    if (!vaga) { view = 'list'; render(); return; }
    const readOnly = !canWrite();
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div>
          <h2 style="font-size:16px">${readOnly ? 'Ver vaga' : 'Editar vaga'} ${U.escapeHtml(vaga.id)}</h2>
          <p class="sub" style="color:var(--muted);font-size:12px;margin-top:2px">${U.escapeHtml(vaga.cargo || '')} — ${U.escapeHtml(vaga.marca || '')}</p>
        </div>
        <button class="btn btn-outline btn-sm" id="ev-voltar">‹ Voltar para a lista</button>
      </div>
      <div class="card full">
        ${formVagaFieldsHTML(vaga, { readOnly })}
        ${!readOnly ? `<div style="display:flex;gap:10px;margin-top:16px">
          <button class="btn btn-primary" id="ev-salvar" style="width:auto">Salvar alterações</button>
        </div>
        <div class="msg err" id="ev-msg"></div>` : ''}
      </div>
      <div class="card full" style="margin-top:16px">
        <h3>&#128203;&nbsp;Histórico desta vaga</h3>
        <div id="ev-historico">${editHistorico === null ? '<p class="sub" style="color:var(--muted)">Carregando...</p>' : renderHistoricoList(editHistorico)}</div>
      </div>`;
    wireEditEvents(el, vaga, readOnly);
  }

  function renderHistoricoList(list) {
    if (!list.length) return '<p class="sub" style="color:var(--muted)">Nenhuma alteração registrada para esta vaga ainda.</p>';
    return `<div class="table-wrap"><table class="dt"><thead><tr><th>Data/Hora</th><th>Ação</th><th>Campo</th><th>De</th><th>Para</th><th>Detalhes</th><th>Usuário</th></tr></thead><tbody>
      ${list.map(l => `<tr>
        <td>${l.timestamp ? new Date(l.timestamp).toLocaleString('pt-BR') : '—'}</td>
        <td>${U.escapeHtml(l.acao || '')}</td>
        <td>${U.escapeHtml(l.campo || '—')}</td>
        <td>${U.escapeHtml(l.valorAnterior || '—')}</td>
        <td>${U.escapeHtml(l.valorNovo || '—')}</td>
        <td style="max-width:220px;white-space:normal">${U.escapeHtml(l.detalhes || '—')}</td>
        <td>${U.escapeHtml(l.usuario || '—')}</td>
      </tr>`).join('')}
    </tbody></table></div>`;
  }

  function coletarFormVaga(el, prefix) {
    const get = id => { const e = el.querySelector('#' + prefix + id); return e ? e.value : ''; };
    const portaisSel = Array.from(el.querySelectorAll(`[data-portal]:checked`)).map(c => c.dataset.portal);
    return {
      dataAbertura: get('dataAbertura'), marca: get('marca'), departamento: get('departamento'), unidade: get('unidade'),
      nivelVaga: get('nivelVaga'), solicitante: get('solicitante'), cargo: get('cargo'), sigilosa: get('sigilosa'),
      tipoVaga: get('tipoVaga'), responsavel: get('responsavel'), status: get('status'), tipoMovimentacao: get('tipoMovimentacao'),
      motivoAumento: get('motivoAumento'), pessoaSubstituida: get('pessoaSubstituida'), tipoRecrutamento: get('tipoRecrutamento'),
      etapa: get('etapa'), motivoSLA: get('motivoSLA'), dataCongelamento: get('dataCongelamento'), dataRetorno: get('dataRetorno'),
      dataCancelamento: get('dataCancelamento'), dataFechamento: get('dataFechamento'), dataInicio: get('dataInicio'),
      dataPrevistaAdmissao: get('dataPrevistaAdmissao'), ultimaDivulgacao: get('ultimaDivulgacao'),
      dataUltimaDivulgacao: get('dataUltimaDivulgacao'), numInscricoes: parseInt(get('numInscricoes')) || 0,
      motivoSLAText: get('motivoSLAText'), fitPct: parseInt(get('fitPct')) || 0, fonte: get('fonte'), quemIndicou: get('quemIndicou'),
      finalistas: finalistasSelecionados.join(', '), contratado: contratadosSelecionados.join(', '),
      observacoes: get('observacoes'), portaisAtivos: portaisSel
    };
  }

  function wireEditEvents(el, vaga, readOnly) {
    el.querySelector('#ev-voltar').addEventListener('click', () => { view = 'list'; render(); });
    if (readOnly) return;
    const marcaSel = el.querySelector('#ev_marca');
    marcaSel && marcaSel.addEventListener('change', () => {
      const deptoSel = el.querySelector('#ev_departamento');
      if (deptoSel) deptoSel.innerHTML = selOpts(departamentosPorMarca(marcaSel.value), '');
    });
    const tipoMovSel = el.querySelector('#ev_tipoMovimentacao');
    tipoMovSel && tipoMovSel.addEventListener('change', () => {
      el.querySelector('#ev_wrap_motivoAumento').style.display = tipoMovSel.value === 'Aumento de Quadro' ? '' : 'none';
      el.querySelector('#ev_wrap_pessoaSubstituida').style.display = tipoMovSel.value === 'Substituição' ? '' : 'none';
    });
    el.addEventListener('change', e => {
      if (e.target.id === 'vg-finalista-add' && e.target.value) {
        if (!finalistasSelecionados.includes(e.target.value)) finalistasSelecionados.push(e.target.value);
        el.querySelector('#ev_finalistasList').innerHTML = finalistasListHTML(vaga.id);
      } else if (e.target.id === 'vg-contratado-add' && e.target.value) {
        if (!contratadosSelecionados.includes(e.target.value)) contratadosSelecionados.push(e.target.value);
        el.querySelector('#ev_contratadoList').innerHTML = contratadoListHTML(vaga.id);
      }
    });
    el.addEventListener('click', e => {
      if (e.target.dataset.rmFinalista) {
        finalistasSelecionados = finalistasSelecionados.filter(n => n !== e.target.dataset.rmFinalista);
        el.querySelector('#ev_finalistasList').innerHTML = finalistasListHTML(vaga.id);
      } else if (e.target.dataset.rmContratado) {
        contratadosSelecionados = contratadosSelecionados.filter(n => n !== e.target.dataset.rmContratado);
        el.querySelector('#ev_contratadoList').innerHTML = contratadoListHTML(vaga.id);
      }
    });
    el.querySelector('#ev-salvar').addEventListener('click', () => salvarEdicao(el, vaga));
  }

  const CAMPOS_LABEL_VAGA = {
    dataAbertura: 'Data de Abertura', marca: 'Marca', departamento: 'Departamento', solicitante: 'Solicitante',
    cargo: 'Cargo', sigilosa: 'Sigilosa', tipoVaga: 'Tipo da Vaga', responsavel: 'Responsável',
    status: 'Status', tipoMovimentacao: 'Tipo de Movimentação', motivoAumento: 'Motivo Aumento',
    pessoaSubstituida: 'Pessoa Substituída', tipoRecrutamento: 'Tipo de Recrutamento', etapa: 'Etapa',
    motivoSLA: 'Motivo SLA', motivoSLAText: 'Motivo SLA (texto)', dataCongelamento: 'Data Congelamento',
    dataRetorno: 'Data Retorno', dataCancelamento: 'Data Cancelamento', dataFechamento: 'Data Fechamento',
    dataInicio: 'Data Início', ultimaDivulgacao: 'Última Divulgação', fitPct: '% FIT', fonte: 'Fonte',
    quemIndicou: 'Quem Indicou', finalistas: 'Finalistas', contratado: 'Contratado', observacoes: 'Observações',
    portaisAtivos: 'Portais', unidade: 'Unidade', nivelVaga: 'Nível da Vaga',
    dataPrevistaAdmissao: 'Data Prevista de Admissão', dataUltimaDivulgacao: 'Data Última Divulgação', numInscricoes: 'Nº Inscrições'
  };

  async function salvarEdicao(el, vaga) {
    const msg = el.querySelector('#ev-msg');
    msg.style.display = 'none';
    const dados = coletarFormVaga(el, 'ev_');
    if (!dados.dataAbertura || !dados.marca || !dados.cargo || !dados.responsavel || !dados.status) {
      msg.textContent = 'Preencha os campos obrigatórios marcados com *.'; msg.style.display = 'block'; return;
    }
    const btn = el.querySelector('#ev-salvar');
    btn.disabled = true; btn.textContent = 'Salvando...';
    try {
      // Congelar/Cancelar por quem não pode aprovar exige solicitação — mesma
      // regra do app original (recrutador comum vs. administrador), agora via
      // a permissão recrutamento.aprovacoes.
      const statusPedido = dados.status, statusAtual = vaga.status;
      const statusSensivel = (statusPedido === 'Congelado' || statusPedido === 'Cancelada') && statusAtual !== statusPedido;
      let solicitacaoCriada = false;
      if (statusSensivel && !canApprove()) {
        const tipo = statusPedido === 'Congelado' ? 'congelar-vaga' : 'cancelar-vaga';
        const motivo = prompt(`Alterar o status da vaga ${vaga.id} para "${statusPedido}" exige aprovação.\n\nInforme o motivo:`);
        if (motivo === null) { btn.disabled = false; btn.textContent = 'Salvar alterações'; return; }
        await R.criarSolicitacao({
          tipo, payload: { vagaId: vaga.id, cargo: vaga.cargo, marca: vaga.marca, novoStatus: statusPedido },
          descricao: `Alterar status da vaga ${vaga.id} — ${vaga.cargo} (${vaga.marca}) de "${statusAtual}" para "${statusPedido}". Motivo: ${motivo || 'não informado'}`
        });
        dados.status = statusAtual;
        solicitacaoCriada = true;
      }

      const logs = [];
      for (const k of Object.keys(dados)) {
        const antes = Array.isArray(vaga[k]) ? (vaga[k] || []).join(', ') : String(vaga[k] || '');
        const depois = Array.isArray(dados[k]) ? dados[k].join(', ') : String(dados[k] || '');
        if (antes !== depois) {
          logs.push(R.logAcao({ acao: 'Edição de Vaga', vagaId: vaga.id, campo: CAMPOS_LABEL_VAGA[k] || k, valorAnterior: antes || '—', valorNovo: depois || '—' }));
        }
      }
      await R.updateRow('vagas', vaga.id, dados);
      await Promise.all(logs);

      // Data Prevista de Admissão mudou: propaga para os registros de
      // Onboarding já abertos para esta vaga (Treinamento e Desenvolvimento
      // → Onboarding) — portado de renderVagas/salvarEdicao ~5905-5929.
      if (dados.dataPrevistaAdmissao !== undefined && dados.dataPrevistaAdmissao !== vaga.dataPrevistaAdmissao) {
        const registrosOnboarding = (D().onboarding || []).filter(o => o.vagaId === vaga.id);
        if (registrosOnboarding.length) {
          await Promise.all(registrosOnboarding.map(o => R.updateRow('onboarding', o.id, { dataPrevistaAdmissao: dados.dataPrevistaAdmissao })
            .catch(err => console.error('Erro ao sincronizar data prevista de admissão do onboarding:', err))));
          await R.logAcao({ acao: 'Sincronização Data Admissão', vagaId: vaga.id, detalhes: `Nova data prevista de admissão (${dados.dataPrevistaAdmissao || '—'}) propagada para ${registrosOnboarding.length} registro(s) de onboarding.` });
        }
      }

      view = 'list';
      await reloadAndRender();
      if (solicitacaoCriada) alert('Alterações salvas. A mudança de status foi enviada para aprovação.');
    } catch (err) {
      msg.textContent = 'Erro ao salvar: ' + err.message; msg.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Salvar alterações';
    }
  }

  // ================================================================
  // NOVA VAGA (wizard de 3 passos — portado de renderNovaVaga/renderStep)
  // ================================================================
  function openNovaVaga() {
    novaVagaStep = 1;
    finalistasSelecionados = [];
    contratadosSelecionados = [];
    novaVagaDados = {
      dataAbertura: U.todayISO(), status: 'Aberto', etapa: 'Divulgação', sigilosa: 'Não',
      tipoVaga: 'Operacional', tipoMovimentacao: 'Aumento de Quadro', tipoRecrutamento: 'Externo',
      portaisAtivos: [], fitPct: 0
    };
    view = 'nova';
    render();
  }

  function renderNovaVagaView(el) {
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div><h2 style="font-size:16px">Nova Vaga</h2><p class="sub" style="color:var(--muted);font-size:12px;margin-top:2px">Preencha os dados em 3 etapas para abrir uma nova vaga</p></div>
        <button class="btn btn-outline btn-sm" id="nv-cancelar">Cancelar</button>
      </div>
      <div class="card full">
        <div class="stepper" id="nv-stepper"></div>
        <div id="nv-step-container"></div>
        <div style="display:flex;justify-content:space-between;margin-top:20px">
          <button class="btn btn-outline" id="nv-rascunho" style="width:auto">Salvar como rascunho</button>
          <div style="display:flex;gap:10px">
            <button class="btn btn-outline" id="nv-voltar" style="width:auto;display:none">Voltar</button>
            <button class="btn btn-primary" id="nv-avancar" style="width:auto">Avançar</button>
          </div>
        </div>
        <div class="msg err" id="nv-msg"></div>
      </div>`;
    renderStepperUI(el);
    renderStep(el);
    el.querySelector('#nv-cancelar').addEventListener('click', () => { view = 'list'; render(); });
    el.querySelector('#nv-avancar').addEventListener('click', () => avancarStep(el));
    el.querySelector('#nv-voltar').addEventListener('click', () => voltarStep(el));
    el.querySelector('#nv-rascunho').addEventListener('click', () => salvarRascunho(el));
  }

  function renderStepperUI(el) {
    const steps = [{ n: 1, label: 'Dados básicos' }, { n: 2, label: 'Configurações' }, { n: 3, label: 'Datas & observações' }];
    el.querySelector('#nv-stepper').innerHTML = steps.map((s, i) => {
      let cls = '';
      if (s.n < novaVagaStep) cls = 'done'; if (s.n === novaVagaStep) cls = 'active';
      return `<div class="step ${cls}"><div class="dot">${s.n < novaVagaStep ? '✓' : s.n}</div><div class="lbl">${s.label}</div></div>${i < steps.length - 1 ? '<div class="line"></div>' : ''}`;
    }).join('');
  }

  function renderStep(el) {
    const container = el.querySelector('#nv-step-container');
    const d = novaVagaDados;
    if (novaVagaStep === 1) {
      container.innerHTML = `
        <div class="form-grid">
          <div class="field"><label>Marca <span class="req">*</span></label><select id="nv_marca">${selOpts(marcasAtivas(), d.marca)}</select></div>
          <div class="field"><label>Unidade</label><select id="nv_unidade">${selOpts(unidadesAtivas(), d.unidade)}</select></div>
          <div class="field"><label>Departamento <span class="req">*</span></label><select id="nv_departamento">${selOpts(departamentosPorMarca(d.marca), d.departamento)}</select></div>
          <div class="field"><label>Nível da Vaga <span class="req">*</span></label><select id="nv_nivelVaga">${selOpts(niveisAtivos(), d.nivelVaga)}</select></div>
          <div class="field"><label>Cargo <span class="req">*</span></label><select id="nv_cargo">${selOpts(cargosAtivos(), d.cargo)}</select></div>
          <div class="field"><label>Solicitante <span class="req">*</span></label><input id="nv_solicitante" value="${U.escapeHtml(d.solicitante || '')}"></div>
          <div class="field"><label>Tipo da Vaga <span class="req">*</span></label><select id="nv_tipoVaga">${selOpts(TIPOS_VAGA, d.tipoVaga)}</select></div>
          <div class="field"><label>Responsável (Recrutador) <span class="req">*</span></label><select id="nv_responsavel">${selOpts(recrutadoresAtivos(), d.responsavel)}</select></div>
          <div class="field"><label>Vaga Sigilosa? <span class="req">*</span></label><select id="nv_sigilosa">${selOpts(SIGILO, d.sigilosa)}</select></div>
          <div class="field"><label>Tipo de Movimentação <span class="req">*</span></label><select id="nv_tipoMovimentacao">${selOpts(TIPOS_MOV, d.tipoMovimentacao)}</select></div>
          ${d.tipoMovimentacao === 'Aumento de Quadro' ? `<div class="field"><label>Motivo Aumento de Quadro <span class="req">*</span></label><select id="nv_motivoAumento">${selOpts(MOTIVOS_AUMENTO, d.motivoAumento)}</select></div>` : ''}
          ${d.tipoMovimentacao === 'Substituição' ? `<div class="field"><label>Pessoa Substituída <span class="req">*</span></label><input id="nv_pessoaSubstituida" value="${U.escapeHtml(d.pessoaSubstituida || '')}"></div>` : ''}
        </div>`;
      const marcaSel = container.querySelector('#nv_marca');
      marcaSel.addEventListener('change', () => { coletarStep(container); renderStep(el); });
      container.querySelector('#nv_tipoMovimentacao').addEventListener('change', () => { coletarStep(container); renderStep(el); });
    } else if (novaVagaStep === 2) {
      container.innerHTML = `
        <div class="form-grid">
          <div class="field"><label>Status da Vaga <span class="req">*</span></label><select id="nv_status">${selOpts(STATUS_VAGA, d.status)}</select></div>
          <div class="field"><label>Motivo SLA <span class="hint">(só quando SLA expirar)</span></label><select id="nv_motivoSLA" disabled>${selOpts(MOTIVOS_SLA, d.motivoSLA)}</select></div>
          <div class="field"><label>Tipo de Recrutamento <span class="req">*</span></label><select id="nv_tipoRecrutamento">${selOpts(TIPOS_RECRUT, d.tipoRecrutamento)}</select></div>
          <div class="field"><label>Etapa da Vaga <span class="req">*</span></label><select id="nv_etapa">${selOpts(etapasAtivas(), d.etapa)}</select></div>
          <div class="field"><label>Fonte <span class="req">*</span></label><select id="nv_fonte">${selOpts(fontesAtivas(), d.fonte)}</select></div>
          <div class="field"><label>Quem Indicou <span class="req">*</span></label><input id="nv_quemIndicou" value="${U.escapeHtml(d.quemIndicou || '')}"></div>
          <div class="field"><label>Nº de Inscrições Recebidas <span class="req">*</span></label><input type="number" min="0" id="nv_numInscricoes" value="${d.numInscricoes || 0}"></div>
          <div class="field"><label>Última Divulgação <span class="req">*</span></label><input type="date" id="nv_dataUltimaDivulgacao" value="${d.dataUltimaDivulgacao || ''}"></div>
          <div class="field full">
            <label>Portais ativos <span class="req">*</span> <span class="hint">(selecione ao menos um)</span></label>
            <div class="checks">${portaisAtivosLista().map(p => `<label class="chk"><input type="checkbox" data-portal="${U.escapeHtml(p)}" ${(d.portaisAtivos || []).includes(p) ? 'checked' : ''}>${U.escapeHtml(p)}</label>`).join('')}</div>
          </div>
        </div>`;
    } else if (novaVagaStep === 3) {
      container.innerHTML = `
        <div class="form-grid">
          <div class="field"><label>Data de Abertura <span class="req">*</span></label><input type="date" id="nv_dataAbertura" value="${d.dataAbertura || U.todayISO()}"></div>
          <div class="field"><label>Data de Início prevista <span class="req">*</span></label><input type="date" id="nv_dataInicio" value="${d.dataInicio || ''}"></div>
          <div class="field"><label>Data Prevista de Admissão <span class="req">*</span></label><input type="date" id="nv_dataPrevistaAdmissao" value="${d.dataPrevistaAdmissao || ''}"></div>
          <div class="field"><label>Última Divulgação <span class="req">*</span></label><input type="date" id="nv_ultimaDivulgacao" value="${d.ultimaDivulgacao || ''}"></div>
          <div class="field"><label>% FIT <span class="req">*</span></label><input type="number" min="0" max="100" id="nv_fitPct" value="${d.fitPct || 0}"></div>
          <div class="field full"><label>Observações <span class="req">*</span></label><textarea id="nv_observacoes" rows="4" placeholder="Observações sobre a vaga...">${U.escapeHtml(d.observacoes || '')}</textarea></div>
        </div>`;
    }
    const btnAv = el.querySelector('#nv-avancar');
    btnAv.textContent = novaVagaStep === 3 ? 'Abrir vaga' : 'Avançar';
    el.querySelector('#nv-voltar').style.display = novaVagaStep > 1 ? '' : 'none';
  }

  function coletarStep(container) {
    const get = id => { const e = container.querySelector('#' + id); return e ? e.value : ''; };
    if (novaVagaStep === 1) {
      Object.assign(novaVagaDados, {
        marca: get('nv_marca'), departamento: get('nv_departamento'), unidade: get('nv_unidade'), nivelVaga: get('nv_nivelVaga'),
        cargo: get('nv_cargo'), solicitante: get('nv_solicitante'), tipoVaga: get('nv_tipoVaga'), responsavel: get('nv_responsavel'),
        sigilosa: get('nv_sigilosa'), tipoMovimentacao: get('nv_tipoMovimentacao'), motivoAumento: get('nv_motivoAumento'),
        pessoaSubstituida: get('nv_pessoaSubstituida')
      });
    } else if (novaVagaStep === 2) {
      Object.assign(novaVagaDados, {
        status: get('nv_status'), motivoSLA: get('nv_motivoSLA'), tipoRecrutamento: get('nv_tipoRecrutamento'), etapa: get('nv_etapa'),
        fonte: get('nv_fonte'), quemIndicou: get('nv_quemIndicou'), numInscricoes: parseInt(get('nv_numInscricoes')) || 0,
        dataUltimaDivulgacao: get('nv_dataUltimaDivulgacao'),
        portaisAtivos: Array.from(container.querySelectorAll('[data-portal]:checked')).map(c => c.dataset.portal)
      });
    } else if (novaVagaStep === 3) {
      Object.assign(novaVagaDados, {
        dataAbertura: get('nv_dataAbertura'), dataInicio: get('nv_dataInicio'), dataPrevistaAdmissao: get('nv_dataPrevistaAdmissao'),
        ultimaDivulgacao: get('nv_ultimaDivulgacao'), fitPct: parseInt(get('nv_fitPct')) || 0,
        finalistas: finalistasSelecionados.join(', '), contratado: contratadosSelecionados.join(', '), observacoes: get('nv_observacoes')
      });
    }
  }

  function showNvMsg(el, text) {
    const msg = el.querySelector('#nv-msg');
    msg.textContent = text; msg.style.display = 'block';
  }

  function validarStep(el) {
    const container = el.querySelector('#nv-step-container');
    coletarStep(container);
    const d = novaVagaDados;
    const msg = el.querySelector('#nv-msg');
    msg.style.display = 'none';
    if (novaVagaStep === 1) {
      const obrig = [['marca', 'Marca'], ['unidade', 'Unidade'], ['departamento', 'Departamento'], ['nivelVaga', 'Nível da Vaga'],
        ['cargo', 'Cargo'], ['solicitante', 'Solicitante'], ['tipoVaga', 'Tipo da Vaga'], ['responsavel', 'Responsável'],
        ['sigilosa', 'Vaga Sigilosa?'], ['tipoMovimentacao', 'Tipo de Movimentação']];
      for (const [c, l] of obrig) if (!d[c]) { showNvMsg(el, `Preencha o campo "${l}".`); return false; }
      if (d.tipoMovimentacao === 'Aumento de Quadro' && !d.motivoAumento) { showNvMsg(el, 'Preencha o campo "Motivo Aumento de Quadro".'); return false; }
      if (d.tipoMovimentacao === 'Substituição' && !d.pessoaSubstituida) { showNvMsg(el, 'Preencha o campo "Pessoa Substituída".'); return false; }
    } else if (novaVagaStep === 2) {
      const obrig = [['status', 'Status da Vaga'], ['tipoRecrutamento', 'Tipo de Recrutamento'], ['etapa', 'Etapa da Vaga'],
        ['fonte', 'Fonte'], ['quemIndicou', 'Quem Indicou'], ['dataUltimaDivulgacao', 'Última Divulgação']];
      for (const [c, l] of obrig) if (!d[c]) { showNvMsg(el, `Preencha o campo "${l}".`); return false; }
      if (!d.portaisAtivos || !d.portaisAtivos.length) { showNvMsg(el, 'Selecione ao menos um Portal ativo.'); return false; }
    } else if (novaVagaStep === 3) {
      const obrig = [['dataAbertura', 'Data de Abertura'], ['dataInicio', 'Data de Início prevista'],
        ['dataPrevistaAdmissao', 'Data Prevista de Admissão'], ['ultimaDivulgacao', 'Última Divulgação'], ['observacoes', 'Observações']];
      for (const [c, l] of obrig) if (!d[c]) { showNvMsg(el, `Preencha o campo "${l}".`); return false; }
    }
    return true;
  }

  function avancarStep(el) {
    if (!validarStep(el)) return;
    if (novaVagaStep < 3) { novaVagaStep++; renderStepperUI(el); renderStep(el); }
    else finalizarNovaVaga(el);
  }
  function voltarStep(el) {
    coletarStep(el.querySelector('#nv-step-container'));
    if (novaVagaStep > 1) { novaVagaStep--; renderStepperUI(el); renderStep(el); }
  }
  async function salvarRascunho(el) {
    coletarStep(el.querySelector('#nv-step-container'));
    if (!novaVagaDados.marca || !novaVagaDados.cargo) { showNvMsg(el, 'Preencha ao menos Marca e Cargo para salvar como rascunho.'); return; }
    await criarVaga(el, Object.assign({}, novaVagaDados, { status: 'Aberto', etapa: novaVagaDados.etapa || 'Divulgação' }));
  }
  async function finalizarNovaVaga(el) { await criarVaga(el, novaVagaDados); }

  async function criarVaga(el, dados) {
    const btn = el.querySelector('#nv-avancar');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
    try {
      const id = U.nextCode('VAG', (D().vagas || []).map(v => v.id));
      const vaga = {
        id, dataAbertura: dados.dataAbertura || U.todayISO(), motivoSLA: dados.motivoSLA || '',
        marca: dados.marca || '', departamento: dados.departamento || '', unidade: dados.unidade || '',
        nivelVaga: dados.nivelVaga || '', solicitante: dados.solicitante || '', cargo: dados.cargo || '',
        sigilosa: dados.sigilosa || 'Não', tipoVaga: dados.tipoVaga || 'Operacional', responsavel: dados.responsavel || '',
        status: dados.status || 'Aberto', tipoMovimentacao: dados.tipoMovimentacao || '', motivoAumento: dados.motivoAumento || '',
        pessoaSubstituida: dados.pessoaSubstituida || '', tipoRecrutamento: dados.tipoRecrutamento || 'Externo',
        etapa: dados.etapa || 'Divulgação', dataCongelamento: '', dataRetorno: '', dataCancelamento: '',
        finalistas: dados.finalistas || '', contratado: dados.contratado || '', fitPct: dados.fitPct || 0,
        dataFechamento: '', dataInicio: dados.dataInicio || '', dataPrevistaAdmissao: dados.dataPrevistaAdmissao || '',
        ultimaDivulgacao: dados.ultimaDivulgacao || '', dataUltimaDivulgacao: dados.dataUltimaDivulgacao || dados.ultimaDivulgacao || '',
        numInscricoes: parseInt(dados.numInscricoes) || 0, fontesDivulgadas: dados.portaisAtivos || [],
        motivoSLAText: dados.motivoSLAText || '', fonte: dados.fonte || '', quemIndicou: dados.quemIndicou || '',
        observacoes: dados.observacoes || '', portaisAtivos: dados.portaisAtivos || []
      };
      await R.insertRow('vagas', vaga);
      await R.logAcao({ acao: 'Criação de Vaga', vagaId: vaga.id, detalhes: `Vaga criada: ${vaga.cargo} (${vaga.marca})` });
      view = 'list';
      await reloadAndRender();
    } catch (err) {
      showNvMsg(el, 'Erro ao salvar: ' + err.message);
      if (btn) { btn.disabled = false; btn.textContent = novaVagaStep === 3 ? 'Abrir vaga' : 'Avançar'; }
    }
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderVagas = renderVagas;
})();
