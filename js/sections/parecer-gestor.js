// Recrutamento → Parecer do Gestor.
//
// Fluxo: o(a) recrutador(a), na Etapa Entrevista Gestor da tela Candidatos
// (renderGestorBlock em candidatos.js), escolhe qual dos 6 modelos
// (js/pareceres/modelo-*.js) o(a) gestor(a) deve usar — isso cria aqui um
// registro em `pareceres_gestor` com status "Pendente". Esta tela mostra
// essas pendências com uma tarja amarela pro(a) gestor(a); ao clicar, abre
// as Observações já cadastradas do candidato + o formulário do modelo
// escolhido. Ao salvar com um parecer final, atualiza automaticamente
// candidatos.resultadoGestor/etapaGestorStatus/dataEntrevistaGestor (ver
// aplicarResultadoNoCandidato).
//
// O motor de renderização (renderMatrizPositivoAtencao/renderMatrizSimNao/
// wireCampos/validarBlocos) é genérico e dirigido pelos objetos "modelo" —
// mesma filosofia declarativa usada em visita-loja.js, só que aqui em uma
// única página rolável com blocos condicionais (<details class="blk">),
// no molde de candidatos.js, em vez de um wizard por etapas — o formulário
// tem blocos demais e ramificações demais pra um stepper de poucos passos.
(function () {
  const U = HUB_UTILS;
  const R = HUB_RECRUIT;
  const C = HUB_PARECER_COMUM;

  function D() { return window.HUB_RECRUIT_DATA || {}; }
  function canFill() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'recrutamento.parecer_gestor'); }
  function canManage() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'recrutamento.candidatos'); }

  let rootEl = null;
  let view = 'list'; // 'list' | 'preencher' | 'ver'
  let editingId = null;
  let formDados = null;

  function pareceres() { return D()['pareceres_gestor'] || []; }
  function candidatoDe(parecer) { return (D().candidatos || []).find(c => c.id === parecer.candidatoId); }
  function modeloDe(parecer) { return (window.HUB_PARECER_MODELOS || {})[parecer.modelo]; }

  function renderParecerGestor(el, f) {
    rootEl = el;
    render();
  }
  function render() {
    if (view === 'preencher') return renderPreencherView(rootEl);
    if (view === 'ver') return renderVerView(rootEl);
    return renderListView(rootEl);
  }

  // ---------------------------------------------------------------- Lista
  function renderListView(el) {
    const todos = pareceres();
    const pendentes = todos.filter(p => p.status === 'Pendente');
    const preenchidos = todos.filter(p => p.status === 'Preenchido').sort((a, b) => (b.dataFinalizacao || '').localeCompare(a.dataFinalizacao || ''));

    el.innerHTML = `
      <div class="kpi-grid">
        ${HUB_UI.kpi('Pendentes de preenchimento', U.fmtInt(pendentes.length), '', pendentes.length > 0 ? 'var(--warning)' : '#1baf7a')}
        ${HUB_UI.kpi('Pareceres preenchidos', U.fmtInt(preenchidos.length), '', 'var(--p1)')}
      </div>

      <h3 style="font-size:13px;margin:6px 0 12px">Pendentes${canFill() ? '' : ' (visão do(a) recrutador(a))'}</h3>
      ${pendentes.length === 0 ? HUB_UI.empty('Nenhum parecer pendente no momento.', 'Quando um(a) recrutador(a) agendar uma entrevista com gestor e escolher um modelo de parecer, ele aparece aqui.') : `
        <div id="pg-pendentes">${pendentes.map(p => renderCardPendente(p)).join('')}</div>
      `}

      <h3 style="font-size:13px;margin:22px 0 12px">Preenchidos</h3>
      ${preenchidos.length === 0 ? HUB_UI.empty('Nenhum parecer preenchido ainda.', '') : `
        <div class="card full" style="overflow-x:auto">
          <table class="tbl">
            <thead><tr><th>Candidato</th><th>Modelo</th><th>Nível</th><th>Parecer Final</th><th>Preenchido por</th><th>Data</th><th></th></tr></thead>
            <tbody>
              ${preenchidos.map(p => {
                const modelo = modeloDe(p);
                const nivel = (C.NIVEIS_RECOMENDACAO.find(n => n.valor === p.nivelRecomendacao) || {}).estrelas || '—';
                return `<tr>
                  <td>${U.escapeHtml(p.candidatoNome || '—')}</td>
                  <td>${U.escapeHtml(modelo ? modelo.nome : p.modelo)}</td>
                  <td>${nivel}</td>
                  <td>${U.escapeHtml(p.parecerFinal || '—')}</td>
                  <td>${U.escapeHtml(p.preenchidoPor || '—')}</td>
                  <td>${p.dataFinalizacao ? U.fmtDateBR(p.dataFinalizacao) : '—'}</td>
                  <td><button type="button" class="btn btn-outline btn-sm" data-ver="${p.id}">Ver</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    `;
    el.querySelectorAll('[data-preencher]').forEach(btn => btn.addEventListener('click', () => abrirPreencher(btn.dataset.preencher)));
    el.querySelectorAll('[data-ver]').forEach(btn => btn.addEventListener('click', () => abrirVer(btn.dataset.ver)));
  }

  function renderCardPendente(p) {
    const modelo = modeloDe(p);
    const cand = candidatoDe(p);
    const dataAgendada = cand && cand.dataAgendadaGestor ? U.fmtDateBR(cand.dataAgendadaGestor) : null;
    return `<div style="background:#fff8e1;border-left:4px solid var(--warning);border-radius:8px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap">
      <div>
        <div style="font-weight:700">${U.escapeHtml(p.candidatoNome || '—')}</div>
        <div style="font-size:12.5px;color:var(--muted)">${U.escapeHtml(p.cargo || '')} · Modelo: ${U.escapeHtml(modelo ? modelo.nome : p.modelo)}${dataAgendada ? ` · Entrevista agendada: ${dataAgendada}${cand.horarioGestor ? ' às ' + U.escapeHtml(cand.horarioGestor) : ''}` : ''}</div>
      </div>
      ${canFill() ? `<button type="button" class="btn btn-primary btn-sm" style="width:auto" data-preencher="${p.id}">Preencher Parecer</button>` : `<span class="hint">Aguardando o(a) gestor(a)</span>`}
    </div>`;
  }

  function abrirPreencher(id) {
    const p = pareceres().find(x => x.id === id);
    if (!p) return;
    editingId = id;
    formDados = Object.assign({}, p.dados || {});
    const modelo = modeloDe(p);
    if (modelo) {
      if (!formDados.dataEntrevista) formDados.dataEntrevista = U.todayISO();
      if (!formDados.cargo) formDados.cargo = p.cargo;
      if (!formDados.candidatoNome) formDados.candidatoNome = p.candidatoNome;
      if (!formDados.gestorNome) formDados.gestorNome = (HUB_USER && (HUB_USER.nome || HUB_USER.email)) || '';
      if (!formDados.recrutadorNome) formDados.recrutadorNome = p.recrutador;
      if (!formDados.grupoCargo && modelo.cargoParaGrupoDefault) formDados.grupoCargo = modelo.cargoParaGrupoDefault(p.cargo) || '';
    }
    view = 'preencher';
    render();
  }
  function abrirVer(id) {
    const p = pareceres().find(x => x.id === id);
    if (!p) return;
    editingId = id;
    formDados = Object.assign({}, p.dados || {});
    view = 'ver';
    render();
  }
  function voltarLista() { view = 'list'; editingId = null; formDados = null; render(); }

  // ------------------------------------------------------- Motor genérico
  function renderMatrizPositivoAtencao(bloco, valores, dis) {
    return `<div class="field full"><label>${U.escapeHtml(bloco.titulo)} <span class="req">*</span></label>
      <table class="tbl" style="margin-top:6px"><thead><tr><th style="width:60%">&nbsp;</th><th>Positivo</th><th>Atenção</th></tr></thead><tbody>
        ${bloco.itens.map(item => {
          const v = (valores && valores[item.key]) || '';
          return `<tr><td style="font-size:12.5px">${U.escapeHtml(item.label)}</td>
            ${['Positivo', 'Atenção'].map(opt => `<td style="text-align:center"><input type="radio" name="av_${bloco.key}_${item.key}" value="${opt}" data-avaliacao="${bloco.key}" data-item="${item.key}" ${v === opt ? 'checked' : ''} ${dis}></td>`).join('')}
          </tr>`;
        }).join('')}
      </tbody></table>
    </div>`;
  }
  function renderMatrizSimNao(bloco, valores, dis) {
    return `<div class="field full"><label>${U.escapeHtml(bloco.titulo)} <span class="req">*</span></label>
      <table class="tbl" style="margin-top:6px"><thead><tr><th style="width:60%">&nbsp;</th><th>Sim</th><th>Não</th></tr></thead><tbody>
        ${bloco.itens.map(item => {
          const v = (valores && valores[item.key]) || '';
          return `<tr><td style="font-size:12.5px">${U.escapeHtml(item.label)}${item.hint ? `<div class="hint" style="font-style:italic;margin-top:2px">${U.escapeHtml(item.hint)}</div>` : ''}</td>
            ${['Sim', 'Não'].map(opt => `<td style="text-align:center"><input type="radio" name="tp_${bloco.key}_${item.key}" value="${opt}" data-topico="${bloco.key}" data-item="${item.key}" ${v === opt ? 'checked' : ''} ${dis}></td>`).join('')}
          </tr>`;
        }).join('')}
      </tbody></table>
    </div>`;
  }

  function renderLocalizacao(modelo, d, dis) {
    const loc = modelo.localizacao;
    if (loc.tipo === 'loja_simples') {
      return `<div class="field"><label>${U.escapeHtml(loc.labelLocal)} <span class="req">*</span></label>
        <select id="pg-local" ${dis}><option value="">Selecione...</option>${loc.lojas.map(l => `<option value="${U.escapeHtml(l)}" ${d.local === l ? 'selected' : ''}>${U.escapeHtml(l)}</option>`).join('')}</select></div>`;
    }
    const regionais = Object.keys(loc.regionais);
    const listaLocal = d.regional && loc.regionais[d.regional] ? loc.regionais[d.regional] : [];
    return `<div class="field"><label>${U.escapeHtml(loc.labelRegional)} <span class="req">*</span></label>
        <select id="pg-regional" ${dis}><option value="">Selecione...</option>${regionais.map(r => `<option value="${U.escapeHtml(r)}" ${d.regional === r ? 'selected' : ''}>${U.escapeHtml(r)}</option>`).join('')}</select></div>
      <div class="field"><label>${U.escapeHtml(loc.labelLocal)} <span class="req">*</span></label>
        <select id="pg-local" ${dis} ${!d.regional ? 'disabled' : ''}><option value="">${d.regional ? 'Selecione...' : 'Escolha a regional primeiro'}</option>${listaLocal.map(l => `<option value="${U.escapeHtml(l)}" ${d.local === l ? 'selected' : ''}>${U.escapeHtml(l)}</option>`).join('')}</select></div>`;
  }

  function renderFormBody(modelo, d, dis) {
    const compareceu = d.candidatoCompareceu;
    const perfilOk = d.perfilFezSentido;
    const grupo = d.grupoCargo;
    const topicos = grupo && modelo.topicosPorGrupo[grupo] ? modelo.topicosPorGrupo[grupo] : null;

    let html = `<details class="blk" open><summary>Informações Básicas</summary><div class="blk-body"><div class="form-grid">
      <div class="field"><label>Nome do(a) Gestor(a)</label><input value="${U.escapeHtml(d.gestorNome || '')}" disabled></div>
      <div class="field"><label>Nome do(a) Recrutador(a)</label><input value="${U.escapeHtml(d.recrutadorNome || '')}" disabled></div>
      <div class="field"><label>Nome Completo do(a) Candidato(a)</label><input value="${U.escapeHtml(d.candidatoNome || '')}" disabled></div>
      <div class="field"><label>Data da entrevista <span class="req">*</span></label><input type="date" id="pg-dataEntrevista" value="${d.dataEntrevista || ''}" ${dis}></div>
      <div class="field"><label>Cargo</label><input value="${U.escapeHtml(d.cargo || '')}" disabled></div>
      ${renderLocalizacao(modelo, d, dis)}
      <div class="field"><label>Candidato(a) compareceu? <span class="req">*</span></label>
        <select id="pg-compareceu" ${dis}><option value="">Selecione...</option><option value="Sim" ${compareceu === 'Sim' ? 'selected' : ''}>Sim</option><option value="Não" ${compareceu === 'Não' ? 'selected' : ''}>Não</option></select></div>
    </div></div></details>`;

    if (compareceu === 'Sim') {
      html += `<details class="blk" open><summary>Avaliação Comportamental</summary><div class="blk-body">
        <p class="hint" style="margin-bottom:10px">Verifique se o perfil do candidato está alinhado às exigências práticas do cargo. <strong>Positivo</strong> = atende plenamente. <strong>Atenção</strong> = precisa desenvolver, merece acompanhamento após a contratação.</p>
        <div class="form-grid">
          ${modelo.avaliacaoComportamental.map(bloco => renderMatrizPositivoAtencao(bloco, d.avaliacao && d.avaliacao[bloco.key], dis)).join('')}
        </div>
      </div></details>`;

      html += `<details class="blk" open><summary>Continuidade do Processo</summary><div class="blk-body"><div class="form-grid">
        <div class="field"><label>O perfil fez sentido para continuidade da entrevista para este cargo? <span class="req">*</span></label>
          <select id="pg-perfilOk" ${dis}><option value="">Selecione...</option><option value="Sim" ${perfilOk === 'Sim' ? 'selected' : ''}>Sim</option><option value="Não" ${perfilOk === 'Não' ? 'selected' : ''}>Não</option></select></div>
        ${perfilOk === 'Sim' ? `<div class="field"><label>Qual é o grupo do cargo avaliado neste processo? <span class="req">*</span></label>
          <select id="pg-grupo" ${dis}><option value="">Selecione...</option>${modelo.grupos.map(g => `<option value="${U.escapeHtml(g)}" ${grupo === g ? 'selected' : ''}>${U.escapeHtml(g)}</option>`).join('')}</select></div>` : ''}
      </div></div></details>`;

      if (perfilOk === 'Sim' && topicos) {
        html += topicos.map(bloco => `<details class="blk" open><summary>${U.escapeHtml(bloco.titulo)}</summary><div class="blk-body"><div class="form-grid">
          ${renderMatrizSimNao(bloco, d.topicos && d.topicos[bloco.key], dis)}
        </div></div></details>`).join('');
      }
    }

    // Recomendação do gestor: sempre visível (mesmo quando não compareceu ou
    // perfil não fez sentido — o PDF original também pula direto pra cá).
    html += `<details class="blk" open><summary>Recomendação do Gestor</summary><div class="blk-body">
      <div class="field full"><label>Considerando os requisitos técnicos, comportamentais e o potencial de sucesso na função, qual é o seu nível de recomendação para a contratação deste(a) candidato(a)? <span class="req">*</span></label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
          ${C.NIVEIS_RECOMENDACAO.map(n => `<label style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;cursor:pointer;${d.nivelRecomendacao === n.valor ? 'background:var(--p1);color:#fff;border-color:var(--p1)' : ''}">
            <input type="radio" name="pg-nivel" value="${n.valor}" data-nivel ${d.nivelRecomendacao === n.valor ? 'checked' : ''} style="display:none" ${dis}>
            <div style="font-weight:700">${n.estrelas}</div><div style="font-size:11.5px;max-width:190px">${U.escapeHtml(n.label)}</div>
          </label>`).join('')}
        </div>
      </div>
      <div class="form-grid" style="margin-top:14px">
        <div class="field full"><label>Parecer final da Gestão: <span class="req">*</span></label>
          <select id="pg-parecerFinal" ${dis}><option value="">Selecione...</option>${C.PARECER_FINAL_OPCOES.map(o => `<option value="${U.escapeHtml(o)}" ${d.parecerFinal === o ? 'selected' : ''}>${U.escapeHtml(o)}</option>`).join('')}</select></div>
        <div class="field full"><label>Justificativa do parecer. <span class="req">*</span></label>
          <textarea id="pg-justificativa" rows="4" ${dis}>${U.escapeHtml(d.justificativa || '')}</textarea></div>
      </div>
    </div></details>`;

    return html;
  }

  // -------------------------------------------------------- Preencher/Ver
  function renderPreencherView(el) {
    const p = pareceres().find(x => x.id === editingId);
    const modelo = p && modeloDe(p);
    if (!p || !modelo) { voltarLista(); return; }
    const cand = candidatoDe(p);
    el.innerHTML = `
      <button type="button" class="btn btn-outline btn-sm" id="pg-voltar" style="width:auto;margin-bottom:14px">&larr; Voltar</button>
      <h2 style="margin-bottom:4px">Parecer do Gestor — ${U.escapeHtml(p.candidatoNome || '')}</h2>
      <p class="hint" style="margin-bottom:16px">Modelo: ${U.escapeHtml(modelo.nome)}</p>
      <details class="blk" open><summary>Observações do Candidato</summary><div class="blk-body">
        <p style="white-space:pre-wrap;font-size:13px">${cand && cand.observacoes ? U.escapeHtml(cand.observacoes) : '<span class="hint">Nenhuma observação registrada pelo time de R&amp;S.</span>'}</p>
      </div></details>
      <div id="pg-form">${renderFormBody(modelo, formDados, '')}</div>
      <div id="pg-msg"></div>
      <div class="field full" style="margin-top:10px"><button type="button" class="btn btn-primary" id="pg-salvar" style="width:auto">Salvar Parecer</button></div>
    `;
    el.querySelector('#pg-voltar').addEventListener('click', voltarLista);
    el.querySelector('#pg-salvar').addEventListener('click', () => salvarParecer(el, p, modelo));
    wirePreencherEvents(el, modelo);
  }

  function renderVerView(el) {
    const p = pareceres().find(x => x.id === editingId);
    const modelo = p && modeloDe(p);
    if (!p || !modelo) { voltarLista(); return; }
    const cand = candidatoDe(p);
    el.innerHTML = `
      <button type="button" class="btn btn-outline btn-sm" id="pg-voltar" style="width:auto;margin-bottom:14px">&larr; Voltar</button>
      <h2 style="margin-bottom:4px">Parecer do Gestor — ${U.escapeHtml(p.candidatoNome || '')}</h2>
      <p class="hint" style="margin-bottom:16px">Modelo: ${U.escapeHtml(modelo.nome)} · Preenchido por ${U.escapeHtml(p.preenchidoPor || '—')} em ${p.dataFinalizacao ? U.fmtDateBR(p.dataFinalizacao) : '—'}</p>
      <details class="blk" open><summary>Observações do Candidato</summary><div class="blk-body">
        <p style="white-space:pre-wrap;font-size:13px">${cand && cand.observacoes ? U.escapeHtml(cand.observacoes) : '<span class="hint">Nenhuma observação registrada pelo time de R&amp;S.</span>'}</p>
      </div></details>
      <div>${renderFormBody(modelo, formDados, 'disabled')}</div>
    `;
    el.querySelector('#pg-voltar').addEventListener('click', voltarLista);
  }

  function wirePreencherEvents(el, modelo) {
    const d = formDados;
    // Campos que disparam re-render (mudam a estrutura visível do formulário).
    const rerenderIds = ['pg-regional', 'pg-local', 'pg-compareceu', 'pg-perfilOk', 'pg-grupo'];
    rerenderIds.forEach(id => {
      const inp = el.querySelector('#' + id);
      if (!inp) return;
      inp.addEventListener('change', () => {
        if (id === 'pg-regional') { d.regional = inp.value; d.local = ''; }
        else if (id === 'pg-local') d.local = inp.value;
        else if (id === 'pg-compareceu') d.candidatoCompareceu = inp.value;
        else if (id === 'pg-perfilOk') d.perfilFezSentido = inp.value;
        else if (id === 'pg-grupo') d.grupoCargo = inp.value;
        el.querySelector('#pg-form').innerHTML = renderFormBody(modelo, d, '');
        wirePreencherEvents(el, modelo);
      });
    });
    // Campos simples: atualizam sem re-renderizar.
    const dataInp = el.querySelector('#pg-dataEntrevista');
    dataInp && dataInp.addEventListener('input', () => { d.dataEntrevista = dataInp.value; });
    const parecerSel = el.querySelector('#pg-parecerFinal');
    parecerSel && parecerSel.addEventListener('change', () => { d.parecerFinal = parecerSel.value; });
    const justTa = el.querySelector('#pg-justificativa');
    justTa && justTa.addEventListener('input', () => { d.justificativa = justTa.value; });
    // Matrizes Positivo/Atenção e Sim/Não.
    el.querySelectorAll('[data-avaliacao]').forEach(inp => inp.addEventListener('change', () => {
      d.avaliacao = d.avaliacao || {};
      d.avaliacao[inp.dataset.avaliacao] = d.avaliacao[inp.dataset.avaliacao] || {};
      d.avaliacao[inp.dataset.avaliacao][inp.dataset.item] = inp.value;
    }));
    el.querySelectorAll('[data-topico]').forEach(inp => inp.addEventListener('change', () => {
      d.topicos = d.topicos || {};
      d.topicos[inp.dataset.topico] = d.topicos[inp.dataset.topico] || {};
      d.topicos[inp.dataset.topico][inp.dataset.item] = inp.value;
    }));
    // Nível de recomendação (estrelas).
    el.querySelectorAll('[data-nivel]').forEach(inp => inp.addEventListener('change', () => {
      d.nivelRecomendacao = Number(inp.value);
      el.querySelector('#pg-form').innerHTML = renderFormBody(modelo, d, '');
      wirePreencherEvents(el, modelo);
    }));
  }

  // ----------------------------------------------------------- Validação
  function validar(modelo, d) {
    if (!d.dataEntrevista) return 'Informe a Data da entrevista.';
    const loc = modelo.localizacao;
    if (loc.tipo !== 'loja_simples' && !d.regional) return `Selecione: ${loc.labelRegional}`;
    if (!d.local) return `Selecione: ${loc.labelLocal}`;
    if (!d.candidatoCompareceu) return 'Informe se o(a) candidato(a) compareceu.';
    if (d.candidatoCompareceu === 'Sim') {
      for (const bloco of modelo.avaliacaoComportamental) {
        for (const item of bloco.itens) {
          if (!(d.avaliacao && d.avaliacao[bloco.key] && d.avaliacao[bloco.key][item.key])) return `Responda: ${item.label}`;
        }
      }
      if (!d.perfilFezSentido) return 'Informe se o perfil fez sentido para continuidade da entrevista.';
      if (d.perfilFezSentido === 'Sim') {
        if (!d.grupoCargo) return 'Selecione o grupo do cargo avaliado neste processo.';
        const topicos = modelo.topicosPorGrupo[d.grupoCargo] || [];
        for (const bloco of topicos) {
          for (const item of bloco.itens) {
            if (!(d.topicos && d.topicos[bloco.key] && d.topicos[bloco.key][item.key])) return `Responda: ${item.label}`;
          }
        }
      }
    }
    if (!d.nivelRecomendacao) return 'Selecione o nível de recomendação para a contratação.';
    if (!d.parecerFinal) return 'Selecione o Parecer final da Gestão.';
    if (!d.justificativa) return 'Preencha a Justificativa do parecer.';
    return null;
  }

  // ----------------------------------------------------------- Salvar
  // Espelha o "Parecer final" no resultado da Etapa Gestor do candidato —
  // não existe 1:1 exato para "Indicação para outra filial" no enum de
  // resultado da etapa (RESULTADO_ETAPA_DETALHE, em candidatos.js), então
  // essa opção também aprova a etapa; o detalhe completo continua salvo em
  // pareceres_gestor.parecer_final.
  function resultadoGestorDoParecer(parecerFinal) {
    if (parecerFinal === 'Aprovado(a) - Banco de Talentos') return 'Banco de Talentos';
    if (parecerFinal === 'Reprovado(a) - Não avançar no processo') return 'Reprovado';
    return 'Aprovado'; // 'Aprovado(a) - Avançar no processo' | 'Aprovado(a) - Indicação para outra filial'
  }

  async function salvarParecer(el, p, modelo) {
    const erro = validar(modelo, formDados);
    const msgEl = el.querySelector('#pg-msg');
    if (erro) { msgEl.innerHTML = `<div class="msg erro" style="margin-top:10px">${U.escapeHtml(erro)}</div>`; return; }
    const btn = el.querySelector('#pg-salvar');
    btn.disabled = true; btn.textContent = 'Salvando...';
    try {
      const agora = new Date().toISOString();
      await R.updateRow('pareceres_gestor', p.id, {
        status: 'Preenchido',
        dados: formDados,
        nivelRecomendacao: formDados.nivelRecomendacao,
        parecerFinal: formDados.parecerFinal,
        justificativa: formDados.justificativa,
        preenchidoPor: (HUB_USER && (HUB_USER.nome || HUB_USER.email)) || 'Desconhecido',
        dataFinalizacao: agora
      });
      if (p.candidatoId) {
        await R.updateRow('candidatos', p.candidatoId, {
          resultadoGestor: resultadoGestorDoParecer(formDados.parecerFinal),
          etapaGestorStatus: 'Concluída',
          dataEntrevistaGestor: agora.slice(0, 10)
        });
      }
      await R.reload();
      voltarLista();
    } catch (err) {
      msgEl.innerHTML = `<div class="msg erro" style="margin-top:10px">Erro ao salvar: ${U.escapeHtml(err.message)}</div>`;
      btn.disabled = false; btn.textContent = 'Salvar Parecer';
    }
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderParecerGestor = renderParecerGestor;
})();
