// Treinamento e Desenvolvimento → Onboarding. Portado de renderOnboarding/
// renderOnboardingTable/renderOnboardingDetalhe/salvarOnboarding do Sfera
// Recruiter (versão com onboarding, index.html ~6899-7261), adaptado às
// mesmas convenções de js/sections/candidatos.js e vagas.js: sem drawer (a
// seção troca entre lista e formulário de página inteira), blocos com
// <details class="blk">, dados em window.HUB_RECRUIT_DATA.onboarding
// (recarregada junto com vagas/candidatos/entrevistas — ver
// dal-recrutamento.js). Registros nunca são criados aqui — só existem depois
// que alguém usa "Enviar para Onboarding" na tela Candidatos.
(function () {
  const U = HUB_UTILS;
  const R = HUB_RECRUIT;

  function D() { return window.HUB_RECRUIT_DATA || {}; }
  function canWrite() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'treinamento_dev.onboarding'); }

  // ---- Enums/rubrica (fonte: index.html original ~2181-2216) ----
  const STATUS_ONBOARDING = ['Pendente', 'Agendado', 'Realizado', 'Não realizado'];
  const TIPOS_TRANSPORTE = ['Ônibus', 'Metrô', 'Van/Fretado', 'Aplicativo (Uber/99)', 'Veículo próprio', 'A pé', 'Outro'];
  const NIVEL_APTIDAO = ['Apto sem restrições', 'Apto com ressalvas', 'Não apto'];
  const ESCALA_AVALIACAO = [
    { v: 1, label: 'Muito abaixo do esperado' }, { v: 2, label: 'Abaixo' }, { v: 3, label: 'Dentro do esperado' },
    { v: 4, label: 'Acima' }, { v: 5, label: 'Excelente' }
  ];
  const RUBRICA_ONBOARDING = [
    { grupo: 'Comportamento e Postura', itens: [
      { campo: 'pontualidade', label: 'Pontualidade e assiduidade', desc: 'Chegou no horário e permaneceu durante toda a atividade' },
      { campo: 'posturaProfissional', label: 'Postura profissional', desc: 'Apresentação pessoal, linguagem e comportamento adequados ao ambiente' },
      { campo: 'respeitoInterpessoal', label: 'Respeito e relacionamento interpessoal', desc: 'Convivência com colegas e treinador' },
      { campo: 'controleEmocional', label: 'Controle emocional', desc: 'Reação a críticas, correções e situações de pressão' }
    ]},
    { grupo: 'Aspectos de Atendimento', itens: [
      { campo: 'comunicacaoCliente', label: 'Comunicação com o cliente', desc: 'Clareza, cordialidade e escuta ativa' },
      { campo: 'conhecimentoTecnico', label: 'Conhecimento técnico aplicado', desc: 'Domínio de produto, processo ou sistema treinado' },
      { campo: 'simulacaoAtendimento', label: 'Simulação de atendimento', desc: 'Desempenho em role-play ou prática supervisionada' },
      { campo: 'resolucaoProblemas', label: 'Capacidade de resolver problemas', desc: 'Autonomia diante de dúvidas ou situações inesperadas' }
    ]},
    { grupo: 'Alinhamento com a Cultura Organizacional', itens: [
      { campo: 'identificacaoValores', label: 'Identificação com valores da empresa', desc: 'Aderência aos valores e propósito da marca' },
      { campo: 'aderenciaPoliticas', label: 'Aderência às políticas e normas', desc: 'Compreensão e aceitação das regras e processos internos' },
      { campo: 'posturaTrabalhoEquipe', label: 'Postura frente ao trabalho em equipe', desc: 'Colaboração e senso de pertencimento ao time' }
    ]},
    { grupo: 'Engajamento, Participação e Interesse', itens: [
      { campo: 'participacaoAtiva', label: 'Participação ativa nas atividades', desc: 'Envolvimento em dinâmicas, discussões e exercícios práticos' },
      { campo: 'interesseConteudo', label: 'Interesse pelo conteúdo', desc: 'Atenção, perguntas e curiosidade demonstrada' },
      { campo: 'proatividade', label: 'Proatividade', desc: 'Iniciativa para se antecipar, ajudar colegas ou buscar mais informação' },
      { campo: 'absorcaoConteudo', label: 'Capacidade de absorção do conteúdo', desc: 'Assimilação e aplicação prática do que foi ensinado' },
      { campo: 'receptividadeFeedback', label: 'Receptividade a feedback', desc: 'Abertura para orientações e disposição para melhorar' }
    ]}
  ];
  function camposRubricaFlat() { return RUBRICA_ONBOARDING.flatMap(g => g.itens.map(i => i.campo)); }

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
    const semAvaliacao = all.filter(o => o.status === 'Realizado' && !o.avaliacaoPreenchida).length;
    const lista = filtrarOnboarding();

    el.innerHTML = `
      <div style="margin-bottom:14px">
        <h2 style="font-size:16px">Onboarding</h2>
        <p class="sub" style="color:var(--muted);font-size:12px;margin-top:2px">Candidatos aprovados enviados para onboarding, do agendamento até a avaliação do treinamento</p>
      </div>
      <div class="kpi-grid">
        ${HUB_UI.kpi('Total em onboarding', U.fmtInt(total), '', 'var(--p1)')}
        ${HUB_UI.kpi('Pendentes/Agendados', U.fmtInt(pendentes), '', 'var(--warning)')}
        ${HUB_UI.kpi('Realizados', U.fmtInt(realizados), '', '#1baf7a')}
        ${HUB_UI.kpi('Sem avaliação preenchida', U.fmtInt(semAvaliacao), '', semAvaliacao > 0 ? 'var(--critical)' : '#1baf7a')}
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
            <th>Data Onboarding</th><th>Status</th><th>Avaliação</th><th></th>
          </tr></thead>
          <tbody>
            ${lista.map(o => `<tr>
              <td>${U.escapeHtml(o.candidatoNome || '')}</td>
              <td>${U.escapeHtml(o.vagaId || '')}</td>
              <td>${U.escapeHtml(o.cargo || '')}</td>
              <td>${U.escapeHtml(o.marca || '')}</td>
              <td>${o.dataPrevistaAdmissao ? U.fmtDateBR(o.dataPrevistaAdmissao) : '—'}</td>
              <td>${o.dataOnboarding ? U.fmtDateBR(o.dataOnboarding) : '—'}</td>
              <td>${badgeStatusOnboarding(o.status)}</td>
              <td>${o.avaliacaoPreenchida ? '<span class="badge b2">Preenchida</span>' : '<span class="badge b1">Pendente</span>'}</td>
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
  // FORMULÁRIO (dados + avaliação)
  // ================================================================
  function resumoCandidatoHTML(c) {
    if (!c) return '<p class="sub" style="color:var(--muted)">Candidato não encontrado no cadastro (pode ter sido removido).</p>';
    return `<div class="form-grid">
      <div class="field"><label>Nome</label><input value="${U.escapeHtml(c.nome || '')}" readonly style="background:var(--bg)"></div>
      <div class="field"><label>E-mail</label><input value="${U.escapeHtml(c.email || '')}" readonly style="background:var(--bg)"></div>
      <div class="field"><label>Contato</label><input value="${U.escapeHtml(c.contato || '')}" readonly style="background:var(--bg)"></div>
      <div class="field"><label>% FIT</label><input value="${c.fitPct != null ? c.fitPct + '%' : '—'}" readonly style="background:var(--bg)"></div>
    </div>`;
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
            <div class="field"><label>Tipo de Transporte <span class="req">*</span></label><select data-field="tipoTransporte" ${dis}>${selOpts(TIPOS_TRANSPORTE, o.tipoTransporte)}</select></div>
            <div class="field"><label>Quantidade de Passagens <span class="req">*</span></label><input type="number" min="0" data-field="quantidadePassagens" value="${o.quantidadePassagens || 0}" ${dis}></div>
            <div class="field"><label>Valor Total em Transporte (R$) <span class="req">*</span></label><input type="number" min="0" step="0.01" data-field="valorTotalTransporte" value="${o.valorTotalTransporte || 0}" ${dis}></div>
            <div class="field"><label>Status do Onboarding <span class="req">*</span></label><select id="of_status" ${dis}>${selOpts(STATUS_ONBOARDING, o.status || 'Pendente', 'Pendente')}</select></div>
            ${o.status === 'Não realizado' ? `<div class="field full"><label>Motivo <span class="req">*</span></label><textarea data-field="motivoNaoRealizado" rows="3" ${dis}>${U.escapeHtml(o.motivoNaoRealizado || '')}</textarea></div>` : ''}
          </div>
        </div>
      </details>

      <div class="insight info" style="margin-bottom:14px"><span class="ic">&#8505;&#65039;</span><span>Formulário de avaliação do treinamento — escala: ${ESCALA_AVALIACAO.map(e => `${e.v} = ${e.label}`).join(' · ')}. Obrigatório preencher por completo quando o Status do Onboarding for "Realizado".</span></div>

      ${RUBRICA_ONBOARDING.map(grupo => `
        <details class="blk" open>
          <summary>${U.escapeHtml(grupo.grupo)}</summary>
          <div class="blk-body">
            ${grupo.itens.map(item => `
              <div style="padding:10px 0;border-bottom:1px solid var(--border)">
                <div style="font-weight:600;font-size:13.5px">${U.escapeHtml(item.label)} <span class="req">*</span></div>
                <div class="sub" style="font-size:12px;color:var(--muted);margin:2px 0 8px">${U.escapeHtml(item.desc)}</div>
                <div style="display:flex;gap:14px;flex-wrap:wrap">
                  ${ESCALA_AVALIACAO.map(e => `<label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer">
                    <input type="radio" name="of_${item.campo}" value="${e.v}" ${Number(o[item.campo]) === e.v ? 'checked' : ''} data-rubrica="${item.campo}" ${dis}> ${e.v}
                  </label>`).join('')}
                </div>
              </div>`).join('')}
          </div>
        </details>`).join('')}

      <details class="blk" open>
        <summary>Avaliação Geral</summary>
        <div class="blk-body">
          <div class="form-grid">
            <div class="field"><label>Nível de aptidão para a função <span class="req">*</span></label><select data-field="aptidaoFuncao" ${dis}>${selOpts(NIVEL_APTIDAO, o.aptidaoFuncao)}</select></div>
            <div class="field"><label>Nota geral do treinando (0 a 10) <span class="req">*</span></label><input type="number" min="0" max="10" step="0.1" data-field="notaGeral" value="${o.notaGeral || ''}" placeholder="Ex: 8,5" ${dis}></div>
            <div class="field"><label>Nome do treinador <span class="req">*</span></label><input data-field="nomeTreinador" value="${U.escapeHtml(o.nomeTreinador || (HUB_USER && (HUB_USER.nome || HUB_USER.email)) || '')}" ${dis}></div>
            <div class="field"><label>Data do treinamento <span class="req">*</span></label><input type="date" data-field="dataTreinamento" value="${o.dataTreinamento || U.todayISO()}" ${dis}></div>
            <div class="field full"><label>Pontos fortes observados <span class="req">*</span></label><textarea data-field="pontosFortes" rows="3" placeholder="Descreva os principais destaques positivos do treinando" ${dis}>${U.escapeHtml(o.pontosFortes || '')}</textarea></div>
            <div class="field full"><label>Pontos de desenvolvimento / melhoria <span class="req">*</span></label><textarea data-field="pontosDesenvolvimento" rows="3" placeholder="Descreva o que precisa ser desenvolvido ou reforçado" ${dis}>${U.escapeHtml(o.pontosDesenvolvimento || '')}</textarea></div>
            <div class="field full"><label>Plano de ação recomendado <span class="req">*</span></label><textarea data-field="planoAcao" rows="3" placeholder="Ex: acompanhamento por 30 dias, novo treinamento, mentoria com líder direto, etc." ${dis}>${U.escapeHtml(o.planoAcao || '')}</textarea></div>
            <div class="field full"><label>Observações do treinador</label><textarea data-field="observacoesTreinador" rows="3" ${dis}>${U.escapeHtml(o.observacoesTreinador || '')}</textarea></div>
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
      el.querySelectorAll('[data-rubrica]').forEach(inp => inp.addEventListener('change', () => { obForm[inp.dataset.rubrica] = Number(inp.value); }));
      const statusSel = el.querySelector('#of_status');
      statusSel && statusSel.addEventListener('change', () => { obForm.status = statusSel.value; renderFormView(el); });
    }
  }

  async function salvarOnboarding(el) {
    const o = obForm;
    const msg = el.querySelector('#of-msg');
    function fail(text) { msg.textContent = text; msg.style.display = 'block'; return false; }
    msg.style.display = 'none';

    if (!o.dataOnboarding) return fail('Informe a Data do Onboarding.');
    if (!o.local) return fail('Informe o Local.');
    if (!o.tipoTransporte) return fail('Informe o Tipo de Transporte.');
    if (o.quantidadePassagens === undefined || o.quantidadePassagens === null || o.quantidadePassagens === '') return fail('Informe a Quantidade de Passagens.');
    if (o.valorTotalTransporte === undefined || o.valorTotalTransporte === null || o.valorTotalTransporte === '') return fail('Informe o Valor Total em Transporte.');
    if (!o.status) return fail('Selecione o Status do Onboarding.');
    if (o.status === 'Não realizado' && !o.motivoNaoRealizado) return fail('Informe o motivo do onboarding não realizado.');

    let avaliacaoCompleta = false;
    if (o.status === 'Realizado') {
      for (const campo of camposRubricaFlat()) if (!o[campo]) return fail('Preencha todos os itens do formulário de avaliação de treinamento antes de salvar (Status = Realizado).');
      const obrigatorios = [
        ['aptidaoFuncao', 'Nível de aptidão para a função'], ['notaGeral', 'Nota geral do treinando'],
        ['nomeTreinador', 'Nome do treinador'], ['dataTreinamento', 'Data do treinamento'],
        ['pontosFortes', 'Pontos fortes observados'], ['pontosDesenvolvimento', 'Pontos de desenvolvimento / melhoria'],
        ['planoAcao', 'Plano de ação recomendado']
      ];
      for (const [campo, label] of obrigatorios) if (!o[campo]) return fail(`Preencha o campo "${label}" da avaliação.`);
      avaliacaoCompleta = true;
    }
    o.avaliacaoPreenchida = avaliacaoCompleta;

    const btn = el.querySelector('#of-salvar');
    btn.disabled = true; btn.textContent = 'Salvando...';
    try {
      await R.updateRow('onboarding', o.id, o);
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
