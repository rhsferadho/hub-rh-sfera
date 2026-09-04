// Treinamento e Desenvolvimento → Onboarding. Formulário enxuto (revisado a
// pedido: os dados de transporte saíram daqui e foram para o cadastro do
// candidato — preenchidos pelo(a) recrutador(a) ao aprovar, não mais pelo
// treinador — e a rubrica de avaliação de desempenho de 16 itens saiu de
// escopo). O que o treinador preenche aqui é só: Local, Modalidade
// (Presencial/Híbrido/Online), Carga Horária, Status e — se o status for
// "Não realizado" — o Motivo (lista fixa) com um campo de observações que só
// aparece depois de escolher o motivo.
//
// Mesmas convenções de js/sections/candidatos.js e vagas.js: sem drawer (a
// seção troca entre lista e formulário de página inteira), blocos com
// <details class="blk">, dados em window.HUB_RECRUIT_DATA.onboarding
// (recarregada junto com vagas/candidatos/entrevistas — dal-recrutamento.js).
// Registros nunca são criados aqui — só existem depois que alguém usa
// "Enviar para Onboarding" na tela Candidatos.
(function () {
  const U = HUB_UTILS;
  const R = HUB_RECRUIT;

  function D() { return window.HUB_RECRUIT_DATA || {}; }
  function canWrite() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'treinamento_dev.onboarding'); }

  const STATUS_ONBOARDING = ['Pendente', 'Agendado', 'Realizado', 'Não realizado'];
  const MODALIDADES_ONBOARDING = ['Presencial', 'Híbrido', 'Online'];
  const MOTIVOS_NAO_REALIZADO = ['Faltou', 'Desistiu', 'Reagendado'];

  function badgeStatusOnboarding(status) {
    if (status === 'Realizado') return '<span class="badge b2">Realizado</span>';
    if (status === 'Agendado') return '<span class="badge b4">Agendado</span>';
    if (status === 'Não realizado') return '<span class="badge b3">Não realizado</span>';
    return '<span class="badge b1">Pendente</span>';
  }
  function selOpts(arr, val, emptyLabel) {
    return `<option value="">${emptyLabel || '—'}</option>` + arr.map(o => `<option value="${U.escapeHtml(o)}" ${val === o ? 'selected' : ''}>${U.escapeHtml(o)}</option>`).join('');
  }

  // ================================================================
  // Estado do módulo
  // ================================================================
  let listState = { search: '', filterStatus: 'todos' };
  let view = 'list'; // 'list' | 'form'
  let rootEl = null;
  let editingId = null;
  let obForm = {};

  function renderOnboarding(el, f) {
    rootEl = el;
    render();
  }
  function render() {
    if (!rootEl) return;
    if (view === 'form') renderFormView(rootEl);
    else renderListView(rootEl);
  }
  async function reloadAndRender() {
    try { await R.reload(); } catch (err) { /* mantém dados antigos na tela mesmo se o reload falhar */ }
    render();
  }

  // Chamado por js/sections/candidatos.js (botão "Abrir no Treinamento e
  // Desenvolvimento") — não faz deep-link pro registro específico nesta
  // versão, só garante que a tela abre na lista.
  window.HUB_ONBOARDING_OPEN_LIST = function () { view = 'list'; render(); };

  // ================================================================
  // LISTA
  // ================================================================
  function filtrarOnboarding() {
    let res = (D().onboarding || []).slice();
    const s = listState.search.toLowerCase().trim();
    if (s) res = res.filter(o => Object.values(o).some(v => String(v || '').toLowerCase().includes(s)));
    if (listState.filterStatus !== 'todos') res = res.filter(o => o.status === listState.filterStatus);
    return res;
  }

  function renderListView(el) {
    const all = D().onboarding || [];
    const total = all.length;
    const pendentes = all.filter(o => o.status === 'Pendente' || o.status === 'Agendado').length;
    const realizados = all.filter(o => o.status === 'Realizado').length;
    const naoRealizados = all.filter(o => o.status === 'Não realizado').length;
    const lista = filtrarOnboarding();

    el.innerHTML = `
      <div style="margin-bottom:14px">
        <h2 style="font-size:16px">Onboarding</h2>
        <p class="sub" style="color:var(--muted);font-size:12px;margin-top:2px">Candidatos aprovados enviados para onboarding — agendamento do treinamento até o registro do resultado</p>
      </div>
      <div class="kpi-grid">
        ${HUB_UI.kpi('Total em onboarding', U.fmtInt(total), '', 'var(--p1)')}
        ${HUB_UI.kpi('Pendentes/Agendados', U.fmtInt(pendentes), '', 'var(--warning)')}
        ${HUB_UI.kpi('Realizados', U.fmtInt(realizados), '', '#1baf7a')}
        ${HUB_UI.kpi('Não realizados', U.fmtInt(naoRealizados), '', naoRealizados > 0 ? 'var(--critical)' : '#1baf7a')}
      </div>
      <div class="card full">
        <div class="toolbar">
          <input type="text" id="ob-search" placeholder="Buscar candidato, vaga, cargo..." value="${U.escapeHtml(listState.search)}">
          <select id="ob-f-status"><option value="todos">Todos os status</option>${STATUS_ONBOARDING.map(s => `<option value="${s}" ${listState.filterStatus === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>
        ${lista.length === 0 ? HUB_UI.empty('Nenhum registro de onboarding.', 'Candidatos aprovados em vagas finalizadas aparecem aqui depois de enviados para o Onboarding, em Recrutamento → Candidatos.') : `
        <div class="table-wrap"><table class="dt">
          <thead><tr>
            <th>Candidato</th><th>Vaga</th><th>Cargo</th><th>Marca</th><th>Data Prevista Admissão</th>
            <th>Data Onboarding</th><th>Modalidade</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            ${lista.map(o => `<tr>
              <td>${U.escapeHtml(o.candidatoNome || '')}</td>
              <td>${U.escapeHtml(o.vagaId || '')}</td>
              <td>${U.escapeHtml(o.cargo || '')}</td>
              <td>${U.escapeHtml(o.marca || '')}</td>
              <td>${o.dataPrevistaAdmissao ? U.fmtDateBR(o.dataPrevistaAdmissao) : '—'}</td>
              <td>${o.dataOnboarding ? U.fmtDateBR(o.dataOnboarding) : '—'}</td>
              <td>${U.escapeHtml(o.modalidade || '—')}</td>
              <td>${badgeStatusOnboarding(o.status)}</td>
              <td class="row-actions"><button class="btn btn-outline btn-sm" data-abrir="${o.id}">${canWrite() ? 'Editar' : 'Ver'}</button></td>
            </tr>`).join('')}
          </tbody>
        </table></div>`}
      </div>`;

    el.querySelector('#ob-search').addEventListener('input', e => { listState.search = e.target.value; renderListView(el); });
    el.querySelector('#ob-f-status').addEventListener('change', e => { listState.filterStatus = e.target.value; renderListView(el); });
    el.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => openForm(b.dataset.abrir)));
  }

  function openForm(id) {
    const o = (D().onboarding || []).find(x => x.id === id);
    if (!o) return;
    editingId = id;
    obForm = Object.assign({}, o);
    view = 'form';
    render();
  }

  // ================================================================
  // FORMULÁRIO
  // ================================================================
  function resumoCandidatoHTML(c) {
    if (!c) return '<p class="sub" style="color:var(--muted)">Candidato não encontrado no cadastro (pode ter sido removido).</p>';
    return `<div class="form-grid">
      <div class="field"><label>Nome</label><input value="${U.escapeHtml(c.nome || '')}" readonly style="background:var(--bg)"></div>
      <div class="field"><label>E-mail</label><input value="${U.escapeHtml(c.email || '')}" readonly style="background:var(--bg)"></div>
      <div class="field"><label>Contato</label><input value="${U.escapeHtml(c.contato || '')}" readonly style="background:var(--bg)"></div>
      <div class="field"><label>Tipo de Transporte</label><input value="${U.escapeHtml(c.tipoTransporte || '—')}" readonly style="background:var(--bg)"></div>
      <div class="field"><label>Qtd. Passagens</label><input value="${c.quantidadePassagens ?? '—'}" readonly style="background:var(--bg)"></div>
      <div class="field"><label>Valor Total Transporte</label><input value="${c.valorTotalTransporte != null ? 'R$ ' + Number(c.valorTotalTransporte).toFixed(2) : '—'}" readonly style="background:var(--bg)"></div>
    </div>
    <p class="sub" style="color:var(--muted);font-size:11px;margin-top:6px">Dados de transporte preenchidos pelo(a) recrutador(a) no cadastro do candidato — edite lá (Recrutamento → Candidatos) se precisar corrigir.</p>`;
  }

  function renderFormView(el) {
    const readOnly = !canWrite();
    const o = obForm;
    const c = (D().candidatos || []).find(x => x.id === o.candidatoId);
    const dis = readOnly ? 'disabled' : '';

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div><h2 style="font-size:16px">Onboarding — ${U.escapeHtml(o.candidatoNome || '')}</h2><p class="sub" style="color:var(--muted);font-size:12px;margin-top:2px">${U.escapeHtml(o.cargo || '')} — ${U.escapeHtml(o.marca || '')} · Vaga ${U.escapeHtml(o.vagaId || '')}</p></div>
        <button class="btn btn-outline btn-sm" id="of-voltar">‹ Voltar para a lista</button>
      </div>

      <details class="blk" open><summary>Resumo do processo seletivo</summary><div class="blk-body">${resumoCandidatoHTML(c)}</div></details>

      <details class="blk" open>
        <summary>Dados do Onboarding</summary>
        <div class="blk-body">
          <div class="form-grid">
            <div class="field"><label>Data Prevista de Admissão</label><input type="date" value="${o.dataPrevistaAdmissao || ''}" readonly style="background:var(--bg)"></div>
            <div class="field"><label>Data do Onboarding <span class="req">*</span></label><input type="date" data-field="dataOnboarding" value="${o.dataOnboarding || ''}" ${dis}></div>
            <div class="field"><label>Local <span class="req">*</span></label><input data-field="local" value="${U.escapeHtml(o.local || '')}" placeholder="Ex: Escritório - RJ, sala de treinamento" ${dis}></div>
            <div class="field"><label>Modalidade <span class="req">*</span></label><select data-field="modalidade" ${dis}>${selOpts(MODALIDADES_ONBOARDING, o.modalidade)}</select></div>
            <div class="field"><label>Carga Horária do Treinamento (horas) <span class="req">*</span></label><input type="number" min="0" step="0.5" data-field="cargaHoraria" value="${o.cargaHoraria || ''}" placeholder="Ex: 8" ${dis}></div>
            <div class="field"><label>Status do Onboarding <span class="req">*</span></label><select id="of_status" ${dis}>${selOpts(STATUS_ONBOARDING, o.status || 'Pendente', 'Pendente')}</select></div>
            ${o.status === 'Não realizado' ? `
            <div class="field"><label>Motivo <span class="req">*</span></label><select id="of_motivo" ${dis}>${selOpts(MOTIVOS_NAO_REALIZADO, o.motivoNaoRealizado)}</select></div>
            ${o.motivoNaoRealizado ? `<div class="field full"><label>Observações <span class="req">*</span></label><textarea data-field="observacoes" rows="3" placeholder="Detalhe o que aconteceu neste caso..." ${dis}>${U.escapeHtml(o.observacoes || '')}</textarea></div>` : ''}
            ` : ''}
          </div>
        </div>
      </details>

      ${!readOnly ? `<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px">
        <button class="btn btn-outline" id="of-cancelar" style="width:auto">Cancelar</button>
        <button class="btn btn-primary" id="of-salvar" style="width:auto">Salvar</button>
      </div>
      <div class="msg err" id="of-msg"></div>` : ''}
    `;

    el.querySelector('#of-voltar').addEventListener('click', () => { view = 'list'; render(); });
    if (!readOnly) {
      el.querySelector('#of-cancelar').addEventListener('click', () => { view = 'list'; render(); });
      el.querySelector('#of-salvar').addEventListener('click', () => salvarOnboarding(el));
      el.querySelectorAll('[data-field]').forEach(inp => {
        const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
        inp.addEventListener(ev, () => { obForm[inp.dataset.field] = inp.value; });
      });
      const statusSel = el.querySelector('#of_status');
      statusSel && statusSel.addEventListener('change', () => { obForm.status = statusSel.value; if (obForm.status !== 'Não realizado') { obForm.motivoNaoRealizado = ''; obForm.observacoes = ''; } renderFormView(el); });
      const motivoSel = el.querySelector('#of_motivo');
      motivoSel && motivoSel.addEventListener('change', () => { obForm.motivoNaoRealizado = motivoSel.value; renderFormView(el); });
    }
  }

  async function salvarOnboarding(el) {
    const o = obForm;
    const msg = el.querySelector('#of-msg');
    function fail(text) { msg.textContent = text; msg.style.display = 'block'; return false; }
    msg.style.display = 'none';

    if (!o.dataOnboarding) return fail('Informe a Data do Onboarding.');
    if (!o.local) return fail('Informe o Local.');
    if (!o.modalidade) return fail('Informe a Modalidade.');
    if (o.cargaHoraria === undefined || o.cargaHoraria === null || o.cargaHoraria === '') return fail('Informe a Carga Horária do Treinamento.');
    if (!o.status) return fail('Selecione o Status do Onboarding.');
    if (o.status === 'Não realizado') {
      if (!o.motivoNaoRealizado) return fail('Selecione o Motivo.');
      if (!o.observacoes || !o.observacoes.trim()) return fail('Informe as Observações sobre este caso.');
    }

    const btn = el.querySelector('#of-salvar');
    btn.disabled = true; btn.textContent = 'Salvando...';
    try {
      const patch = Object.assign({}, o);
      if (patch.status !== 'Não realizado') { patch.motivoNaoRealizado = ''; patch.observacoes = ''; }
      await R.updateRow('onboarding', o.id, patch);
      await R.logAcao({ acao: 'Onboarding', vagaId: o.vagaId, detalhes: `Onboarding de ${o.candidatoNome} atualizado (status: ${o.status})` });
      view = 'list';
      await reloadAndRender();
    } catch (err) {
      msg.textContent = 'Erro ao salvar: ' + err.message; msg.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Salvar';
    }
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderOnboarding = renderOnboarding;
})();
