// Recrutamento → Candidatos (+ "Novo Candidato"). Portado de
// renderCandidatos/renderCandTable/renderNovoCandidato/renderCandForm do
// Sfera Recruiter original (index.html antigo, ~7153-8436), adaptado às
// convenções do hub: sem Lucide (botões de texto), sem drawer (o cadastro
// troca o conteúdo da seção por um formulário de página inteira, com botão
// "Voltar", igual ao padrão adotado em vagas.js), blocos do formulário
// usam <details class="blk"> nativo em vez do toggleSection() customizado
// do app original.
//
// Campo legado `etapaRH`: no app original ele é herdado do v1/v2 e não tem
// mais nenhum <select> editável no formulário novo (v3) — fica sempre
// 'Agendado(a)' (valor padrão) e é só carregado para a coluna existir no
// banco (candidatoParaSupabase/candidatoDoSupabase). Por isso o filtro
// "Todas etapas (RH)" da lista original (que filtrava por esse campo morto)
// foi removido aqui — o mesmo dado, só que vivo, já existe no filtro
// "Result. RH" (sobre resultadoRH).
(function () {
  const U = HUB_UTILS;
  const R = HUB_RECRUIT;

  function D() { return window.HUB_RECRUIT_DATA || {}; }
  function canWrite() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'recrutamento.candidatos'); }
  function canApprove() { return HUB_PERMISSIONS.hasPerm(HUB_USER, 'recrutamento.aprovacoes'); }

  // ---- Enums fixos do domínio (fonte: index.html original ~2152-2193) ----
  const STATUS_ETAPA = ['Pendente', 'Em andamento', 'Concluída'];
  const RESULTADO_ETAPA_DETALHE = ['Em andamento', 'Aprovado', 'Reprovado', 'Banco de Talentos'];
  const RESULTADO_FINAL_V2 = ['Aprovado', 'Reprovado', 'Desistente', 'Banco de Talentos'];
  const MOTIVOS_ANALISE = ['Aprovado sem pendências', 'Processo Trabalhista', 'Processo Criminal', 'Restrição Cadastral', 'Documentação Incompleta'];
  const MOTIVOS_CHECAGEM = ['Aprovado sem pendências', 'Aprovado com pendências', 'Reprovado', 'Referências Negativas', 'Referências Positivas'];
  const MOTIVOS_REPROVACAO_FINAL = ['Escala de trabalho', 'Competências técnicas', 'Competências comportamentais', 'Pretensão salarial superior', 'Modalidade de trabalho', 'Falta de identificação com a cultura', 'Aderência ao FIT', 'Processo trabalhista', 'Referências profissionais'];
  const SEGMENTOS_EMPRESA = ['Comércio Varejista', 'Varejo de Beleza', 'Varejo de Moda', 'Tecnologia', 'Alimentação / Food Service', 'Saúde', 'Educação', 'Financeiro / Bancário', 'Indústria', 'Logística / Transporte', 'Telecomunicações', 'Construção Civil', 'Agronegócio', 'Turismo / Hotelaria', 'Serviços Gerais', 'Outro'];
  const GENERO_OPCOES = ['Feminino', 'Masculino', 'Não-binário', 'Prefiro não informar'];
  const FAIXAS_ETARIAS = ['Até 18 anos', '18 a 24 anos', '25 a 34 anos', '35 a 44 anos', '45 a 54 anos', '55 a 64 anos', '65 anos ou mais'];
  const ESCOLARIDADE_OPCOES = ['Ensino Fundamental Incompleto', 'Ensino Fundamental Completo', 'Ensino Médio Incompleto', 'Ensino Médio Completo', 'Ensino Técnico', 'Ensino Superior Incompleto', 'Ensino Superior Completo', 'Pós-graduação', 'Mestrado', 'Doutorado'];
  const TURNOS_ESTUDO = ['Manhã', 'Tarde', 'Noite', 'Integral'];
  const ESTADO_CIVIL_OPCOES = ['Solteiro(a)', 'Casado(a)', 'União Estável', 'Divorciado(a)', 'Viúvo(a)', 'Separado(a)'];
  const QUANTIDADE_FILHOS_OPCOES = Array.from({ length: 10 }, (_, i) => String(i + 1));

  function recrutadoresAtivos() { return R.activeNames('recrutadores'); }
  function fontesAtivas() { return R.activeNames('fontes_captacao'); }
  function cargosAtivos() { return R.activeNames('cargos'); }

  // ---- Telefone/WhatsApp (portado de formatTelefoneWhats/linkWhatsApp/mascararTelefone, ~2987-3007) ----
  function formatTelefoneWhats(tel) {
    if (!tel) return '';
    const limpo = String(tel).replace(/\D/g, '');
    if (limpo.length < 10) return '';
    return limpo.length <= 11 ? '55' + limpo : limpo;
  }
  function linkWhatsApp(tel) { const n = formatTelefoneWhats(tel); return n ? `https://wa.me/${n}` : ''; }
  function mascararTelefone(valor) {
    const n = String(valor || '').replace(/\D/g, '').slice(0, 11);
    if (n.length === 0) return '';
    if (n.length <= 2) return `(${n}`;
    if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
    if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
    return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  }

  // ---- SLA entre datas (mesma observação de vagas.js: metrics-recrutamento.js
  // não exporta slaEntreDatas, então é reimplementado aqui) ----
  function slaEntreDatas(dContato, dAgendada) {
    if (!dContato || !dAgendada) return null;
    const c = new Date(dContato), a = new Date(dAgendada);
    if (isNaN(c) || isNaN(a)) return null;
    return Math.max(0, Math.round((a - c) / 86400000));
  }
  function frasSLAEtapa(dContato, dAgendada) {
    if (!dContato && !dAgendada) return 'Preencha data de contato e data agendada para calcular o SLA da etapa.';
    if (!dContato) return `Data agendada: ${U.fmtDateBR(dAgendada)} — aguardando data de contato.`;
    if (!dAgendada) return `Contato em ${U.fmtDateBR(dContato)} — aguardando data agendada.`;
    const sla = slaEntreDatas(dContato, dAgendada);
    const cor = sla > 7 ? 'var(--critical)' : (sla > 3 ? 'var(--warning)' : 'var(--good)');
    return `Contato em <strong>${U.fmtDateBR(dContato)}</strong> para agendar em <strong>${U.fmtDateBR(dAgendada)}</strong> · <span style="color:${cor};font-weight:700">SLA: ${sla} dia${sla === 1 ? '' : 's'}</span>`;
  }

  // ---- Badges (portados de badgeEtapaCandidato/badgeResultadoFinal, ~3164-3195) ----
  function badgeEtapaCandidato(resultado, resultadosAnteriores) {
    const reprovouAntes = (resultadosAnteriores || []).some(r => r === 'Reprovado' || r === 'Banco de Talentos');
    if (reprovouAntes) return '<span style="color:var(--muted)">—</span>';
    if (!resultado || resultado === 'Em andamento') return '<span class="badge b4">Em andamento</span>';
    if (resultado === 'Aprovado') return '<span class="badge b2">Aprovado</span>';
    if (resultado === 'Reprovado') return '<span class="badge b3">Reprovado</span>';
    if (resultado === 'Banco de Talentos') return '<span class="badge b1">Banco Talentos</span>';
    return `<span class="badge b5">${U.escapeHtml(resultado)}</span>`;
  }
  function badgeResultadoFinal(r) {
    if (!r) return '<span class="badge b1">Em andamento</span>';
    if (r === 'Aprovado') return '<span class="badge b2">Aprovado</span>';
    if (r === 'Reprovado') return '<span class="badge b3">Reprovado</span>';
    if (r === 'Desistente') return '<span class="badge b4">Desistente</span>';
    return `<span class="badge b5">${U.escapeHtml(r)}</span>`;
  }
  function fitBarHTML(fit) {
    const v = Math.max(0, Math.min(100, fit || 0));
    let color = 'var(--critical)';
    if (v >= 80) color = 'var(--good)'; else if (v >= 60) color = 'var(--warning)';
    return `<div style="display:flex;align-items:center;gap:8px;min-width:120px">
      <div class="fit-bar-track"><div class="fit-bar-fill" style="width:${v}%;background:${color}"></div></div>
      <span style="font-weight:700;color:${color};font-size:11.5px">${v}%</span>
    </div>`;
  }
  function fitDotColor(fit) { return fit >= 80 ? 'var(--good)' : (fit >= 60 ? 'var(--warning)' : 'var(--critical)'); }

  function selOpts(arr, val, emptyLabel) {
    return `<option value="">${emptyLabel || '—'}</option>` + arr.map(o => `<option value="${U.escapeHtml(o)}" ${val === o ? 'selected' : ''}>${U.escapeHtml(o)}</option>`).join('');
  }

  // ================================================================
  // Estado do módulo
  // ================================================================
  let listState = {
    search: '', filterVaga: 'todas', filterRecrut: 'todos', filterResultado: 'todos',
    filterResultadoRH: 'todos', filterResultadoAnalise: 'todos', filterResultadoChecagem: 'todos', filterResultadoGestor: 'todos',
    filterDataIni: '', filterDataFim: '', page: 1, pageSize: 10
  };
  let view = 'list'; // 'list' | 'form'
  let rootEl = null;
  let editingCandId = null;
  let candForm = {};

  // `f` (filtro compartilhado da barra superior) é ignorado de propósito —
  // esta é uma tela operacional com seu próprio painel de filtros. Parâmetro
  // mantido só para bater com a assinatura padrão function renderX(el, f).
  function renderCandidatos(el, f) {
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

  // ================================================================
  // LISTA
  // ================================================================
  function filtrarCandidatos() {
    let res = (D().candidatos || []).slice();
    const s = listState.search.toLowerCase().trim();
    if (s) res = res.filter(c => Object.values(c).some(v => Array.isArray(v) ? v.join(' ').toLowerCase().includes(s) : String(v || '').toLowerCase().includes(s)));
    if (listState.filterVaga !== 'todas') res = res.filter(c => c.vagaId === listState.filterVaga);
    if (listState.filterRecrut !== 'todos') res = res.filter(c => c.entrevistadoPor === listState.filterRecrut);
    if (listState.filterResultado !== 'todos') {
      res = listState.filterResultado === '__em_andamento__' ? res.filter(c => !c.resultadoFinal) : res.filter(c => c.resultadoFinal === listState.filterResultado);
    }
    if (listState.filterResultadoRH !== 'todos') res = res.filter(c => c.resultadoRH === listState.filterResultadoRH);
    if (listState.filterResultadoAnalise !== 'todos') res = res.filter(c => c.resultadoAnalise === listState.filterResultadoAnalise);
    if (listState.filterResultadoChecagem !== 'todos') res = res.filter(c => c.resultadoChecagem === listState.filterResultadoChecagem);
    if (listState.filterResultadoGestor !== 'todos') res = res.filter(c => c.resultadoGestor === listState.filterResultadoGestor);
    if (listState.filterDataIni) res = res.filter(c => (c.criadoEm || '').slice(0, 10) >= listState.filterDataIni);
    if (listState.filterDataFim) res = res.filter(c => (c.criadoEm || '').slice(0, 10) <= listState.filterDataFim);
    return res;
  }

  function renderListView(el) {
    const all = filtrarCandidatos();
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / listState.pageSize));
    if (listState.page > totalPages) listState.page = totalPages;
    const start = (listState.page - 1) * listState.pageSize;
    const page = all.slice(start, start + listState.pageSize);
    const vagas = D().vagas || [];

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div>
          <h2 style="font-size:16px">Candidatos</h2>
          <p class="sub" style="color:var(--muted);font-size:12px;margin-top:2px">Todos os candidatos cadastrados no processo seletivo</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline btn-sm" id="cd-export">Exportar CSV</button>
          ${canWrite() ? '<button class="btn btn-primary btn-sm" id="cd-novo">+ Novo candidato</button>' : ''}
        </div>
      </div>
      <div class="card full">
        <div class="toolbar">
          <input type="text" id="cd-search" placeholder="Buscar candidato, e-mail, vaga..." value="${U.escapeHtml(listState.search)}">
          <select id="cd-f-vaga"><option value="todas">Todas vagas</option>${vagas.map(v => `<option value="${v.id}" ${listState.filterVaga === v.id ? 'selected' : ''}>${v.id} — ${U.escapeHtml(v.cargo || '')}</option>`).join('')}</select>
          <select id="cd-f-recrut"><option value="todos">Todos recrutadores</option>${recrutadoresAtivos().map(r => `<option value="${U.escapeHtml(r)}" ${listState.filterRecrut === r ? 'selected' : ''}>${U.escapeHtml(r)}</option>`).join('')}</select>
          <select id="cd-f-resultado">
            <option value="todos">Todos resultados finais</option>
            <option value="__em_andamento__" ${listState.filterResultado === '__em_andamento__' ? 'selected' : ''}>Em andamento</option>
            ${RESULTADO_FINAL_V2.map(r => `<option value="${r}" ${listState.filterResultado === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
          <select id="cd-f-rh"><option value="todos">Result. RH: todos</option>${RESULTADO_ETAPA_DETALHE.map(r => `<option value="${r}" ${listState.filterResultadoRH === r ? 'selected' : ''}>RH: ${r}</option>`).join('')}</select>
          <select id="cd-f-anal"><option value="todos">Result. Análise: todos</option>${RESULTADO_ETAPA_DETALHE.map(r => `<option value="${r}" ${listState.filterResultadoAnalise === r ? 'selected' : ''}>Análise: ${r}</option>`).join('')}</select>
          <select id="cd-f-check"><option value="todos">Result. Checagem: todos</option>${RESULTADO_ETAPA_DETALHE.map(r => `<option value="${r}" ${listState.filterResultadoChecagem === r ? 'selected' : ''}>Checagem: ${r}</option>`).join('')}</select>
          <select id="cd-f-gest"><option value="todos">Result. Gestor: todos</option>${RESULTADO_ETAPA_DETALHE.map(r => `<option value="${r}" ${listState.filterResultadoGestor === r ? 'selected' : ''}>Gestor: ${r}</option>`).join('')}</select>
          <input type="date" id="cd-f-ini" value="${listState.filterDataIni}" title="Cadastro - de">
          <input type="date" id="cd-f-fim" value="${listState.filterDataFim}" title="Cadastro - até">
        </div>
        ${page.length === 0 ? HUB_UI.empty('Nenhum candidato encontrado.', 'Ajuste os filtros ou cadastre um novo candidato.') : `
        <div class="table-wrap"><table class="dt">
          <thead><tr>
            <th>ID</th><th>Candidato</th><th>Vaga</th><th>Cargo</th><th>Marca</th><th>Recrutador</th><th>% FIT</th>
            <th>Etapa RH</th><th>Etapa Análise</th><th>Etapa Checagem</th><th>Etapa Gestor</th><th>Resultado Final</th><th>Contato</th><th></th>
          </tr></thead>
          <tbody>
            ${page.map(c => {
              const rRH = c.resultadoRH || '', rAnal = c.resultadoAnalise || '', rCheck = c.resultadoChecagem || '', rGest = c.resultadoGestor || '';
              const wa = linkWhatsApp(c.contato);
              return `<tr>
                <td>${U.escapeHtml(c.id)}</td>
                <td><span class="fit-dot" style="background:${fitDotColor(c.fitPct)}"></span> ${U.escapeHtml(c.nome || '')}</td>
                <td>${U.escapeHtml(c.vagaId || '')}</td>
                <td>${U.escapeHtml(c.cargo || '')}</td>
                <td>${U.escapeHtml(c.marca || '')}</td>
                <td>${U.escapeHtml(c.entrevistadoPor || '—')}</td>
                <td>${fitBarHTML(c.fitPct)}</td>
                <td>${badgeEtapaCandidato(rRH, [])}</td>
                <td>${badgeEtapaCandidato(rAnal, [rRH])}</td>
                <td>${badgeEtapaCandidato(rCheck, [rRH, rAnal])}</td>
                <td>${badgeEtapaCandidato(rGest, [rRH, rAnal, rCheck])}</td>
                <td>${badgeResultadoFinal(c.resultadoFinal)}</td>
                <td>${U.escapeHtml(c.contato || '—')} ${wa ? `<a class="wa-link" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</td>
                <td class="row-actions">
                  <button class="btn btn-outline btn-sm" data-editar="${c.id}">${canWrite() ? 'Editar' : 'Ver'}</button>
                  ${canWrite() ? `<button class="btn btn-danger btn-sm" data-excluir="${c.id}">${canApprove() ? 'Excluir' : 'Solicitar exclusão'}</button>` : ''}
                  ${canWrite() && podeEnviarParaOnboarding(c) ? `<button class="btn btn-outline btn-sm" data-onboarding="${c.id}" title="Enviar para Onboarding">Onboarding</button>` : ''}
                  ${candidatoJaEmOnboarding(c.id) ? '<span class="badge b2" title="Já está no Onboarding">Onboarding</span>' : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;flex-wrap:wrap;gap:10px">
          <span style="font-size:12px;color:var(--muted)">Mostrando ${page.length} de ${total} candidato(s)</span>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="btn btn-outline btn-sm" id="cd-prev" ${listState.page === 1 ? 'disabled' : ''}>‹ Anterior</button>
            <span style="font-size:12px">Página ${listState.page} de ${totalPages}</span>
            <button class="btn btn-outline btn-sm" id="cd-next" ${listState.page === totalPages ? 'disabled' : ''}>Próxima ›</button>
          </div>
        </div>`}
      </div>`;
    wireListEvents(el, totalPages);
  }

  function wireListEvents(el, totalPages) {
    const $ = sel => el.querySelector(sel);
    $('#cd-search').addEventListener('input', e => { listState.search = e.target.value; listState.page = 1; render(); });
    $('#cd-f-vaga').addEventListener('change', e => { listState.filterVaga = e.target.value; listState.page = 1; render(); });
    $('#cd-f-recrut').addEventListener('change', e => { listState.filterRecrut = e.target.value; listState.page = 1; render(); });
    $('#cd-f-resultado').addEventListener('change', e => { listState.filterResultado = e.target.value; listState.page = 1; render(); });
    $('#cd-f-rh').addEventListener('change', e => { listState.filterResultadoRH = e.target.value; listState.page = 1; render(); });
    $('#cd-f-anal').addEventListener('change', e => { listState.filterResultadoAnalise = e.target.value; listState.page = 1; render(); });
    $('#cd-f-check').addEventListener('change', e => { listState.filterResultadoChecagem = e.target.value; listState.page = 1; render(); });
    $('#cd-f-gest').addEventListener('change', e => { listState.filterResultadoGestor = e.target.value; listState.page = 1; render(); });
    $('#cd-f-ini').addEventListener('change', e => { listState.filterDataIni = e.target.value; listState.page = 1; render(); });
    $('#cd-f-fim').addEventListener('change', e => { listState.filterDataFim = e.target.value; listState.page = 1; render(); });
    el.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => openForm(b.dataset.editar)));
    el.querySelectorAll('[data-excluir]').forEach(b => b.addEventListener('click', () => acaoExcluirCandidato(b.dataset.excluir)));
    el.querySelectorAll('[data-onboarding]').forEach(b => b.addEventListener('click', () => enviarParaOnboarding(b.dataset.onboarding)));
    $('#cd-export') && $('#cd-export').addEventListener('click', exportarCandidatosCSV);
    $('#cd-novo') && $('#cd-novo').addEventListener('click', () => openForm(null));
    $('#cd-prev').addEventListener('click', () => { if (listState.page > 1) { listState.page--; render(); } });
    $('#cd-next').addEventListener('click', () => { if (listState.page < totalPages) { listState.page++; render(); } });
  }

  function exportarCandidatosCSV() {
    const header = ['ID', 'Nome', 'Vaga ID', 'Cargo', 'Marca', 'Departamento', 'Nível', 'Recrutador', 'Data Entrevista', 'Horário', 'Contato', 'E-mail', '% FIT', 'Resultado RH', 'Motivo Reprovação', 'Resultado Análise', 'Resultado Checagem', 'Resultado Gestor', 'Resultado Final', 'Data Fechamento', 'Fonte', 'Data Admissão', 'Observações'];
    const rows = [header].concat((D().candidatos || []).map(c => [
      c.id, c.nome, c.vagaId, c.cargo, c.marca, c.departamento, c.nivelVaga, c.entrevistadoPor, c.dataEntrevista, c.horarioEntrevista,
      c.contato, c.email, c.fitPct, c.resultadoRH, c.motivoReprovacao, c.resultadoAnalise, c.resultadoChecagem, c.resultadoGestor,
      c.resultadoFinal, c.dataFechamento, c.fonteCaptacao, c.dataAdmissao, c.observacoes
    ]));
    baixarCSV(`candidatos_${U.todayISO()}.csv`, rows);
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
  // EXCLUIR (com fila de aprovação — portado de acaoExcluirCandidato)
  // ================================================================
  async function acaoExcluirCandidato(candId) {
    const c = (D().candidatos || []).find(x => x.id === candId);
    if (!c) return;
    if (canApprove()) {
      if (!confirm(`Excluir definitivamente o candidato ${c.nome} (${c.id})?\n\nEsta ação não pode ser desfeita.`)) return;
      try {
        await R.deleteRow('candidatos', candId);
        await R.logAcao({ acao: 'Exclusão de Candidato', vagaId: c.vagaId, detalhes: `Candidato excluído: ${c.nome} (${c.id})` });
      } catch (err) { alert('Erro ao excluir: ' + err.message); return; }
    } else {
      const motivo = prompt(`Solicitar exclusão do candidato ${c.nome} (${c.id}).\n\nInforme o motivo:`);
      if (motivo === null) return;
      try {
        await R.criarSolicitacao({ tipo: 'excluir-candidato', payload: { candidatoId: candId, nome: c.nome, vagaId: c.vagaId }, descricao: `Excluir candidato ${c.nome} (${c.id}). Motivo: ${motivo || 'não informado'}` });
      } catch (err) { alert('Erro ao enviar solicitação: ' + err.message); return; }
      alert('Solicitação de exclusão enviada para aprovação.');
    }
    await reloadAndRender();
  }

  // ================================================================
  // ENVIAR PARA ONBOARDING (portado de candidatoJaEmOnboarding/
  // podeEnviarParaOnboarding/enviarParaOnboarding, ~6840-6897) — só libera
  // quando o candidato foi Aprovado e a vaga dele já foi Finalizada; cria o
  // registro em `onboarding` (lido por Treinamento e Desenvolvimento →
  // Onboarding) e nunca mais aparece disponível pra reenviar depois disso.
  // ================================================================
  function candidatoJaEmOnboarding(candidatoId) {
    return (D().onboarding || []).find(o => o.candidatoId === candidatoId) || null;
  }
  function podeEnviarParaOnboarding(c) {
    if (!c || c.resultadoFinal !== 'Aprovado') return false;
    const vaga = (D().vagas || []).find(v => v.id === c.vagaId);
    if (!vaga || vaga.status !== 'Finalizada') return false;
    return !candidatoJaEmOnboarding(c.id);
  }
  async function enviarParaOnboarding(candidatoId) {
    const c = (D().candidatos || []).find(x => x.id === candidatoId);
    if (!c || !podeEnviarParaOnboarding(c)) { alert('Este candidato não pode ser enviado para onboarding no momento.'); return; }
    if (!confirm(`Enviar ${c.nome} para o Onboarding?`)) return;
    const vaga = (D().vagas || []).find(v => v.id === c.vagaId);
    try {
      await R.insertRow('onboarding', {
        candidatoId: c.id, candidatoNome: c.nome, vagaId: c.vagaId, cargo: c.cargo, marca: c.marca,
        departamento: c.departamento, unidade: vaga ? vaga.unidade : '', nivelVaga: c.nivelVaga,
        dataPrevistaAdmissao: (vaga && vaga.dataPrevistaAdmissao) || c.dataAdmissao || '',
        status: 'Pendente',
        enviadoPor: (HUB_USER && (HUB_USER.nome || HUB_USER.email)) || 'Desconhecido',
        enviadoEm: new Date().toISOString()
      });
      await R.logAcao({ acao: 'Onboarding', vagaId: c.vagaId, detalhes: `${c.nome} enviado(a) para Onboarding` });
    } catch (err) { alert('Erro ao enviar para onboarding: ' + err.message); return; }
    await reloadAndRender();
  }

  // ================================================================
  // NOVO/EDITAR CANDIDATO — formulário em blocos
  // ================================================================
  function defaultCandForm() {
    return {
      vagaId: '', nome: '', contato: '', email: '', linkedin: '', linkPandaPe: '',
      dataEntrevista: U.todayISO(), horarioEntrevista: '', fitPct: 0, etapaRH: 'Agendado(a)', motivoReprovacao: '',
      analise: 'Pendente', motivoAnalise: '', dataAnalise: '', checagem: 'Pendente', dataChecagem: '',
      testePratico: 'Não aplicável', dataTestePratico: '', entrevistaGestor: '', dataEntrevistaGestor: '',
      entrevistaDiretoria: '', dataEntrevistaDiretoria: '',
      etapaRHStatus: 'Pendente', resultadoRH: 'Em andamento', dataContatoRH: '', dataAgendadaRH: '',
      etapaAnaliseStatus: 'Pendente', resultadoAnalise: 'Em andamento', dataContatoAnalise: '', dataAgendadaAnalise: '',
      etapaChecagemStatus: 'Pendente', resultadoChecagem: 'Em andamento', dataContatoChecagem: '', dataAgendadaChecagem: '',
      etapaGestorStatus: 'Pendente', resultadoGestor: 'Em andamento', dataContatoGestor: '', dataAgendadaGestor: '', horarioGestor: '',
      resultadoFinal: '', resultado: 'Em andamento', dataFechamento: '', fonteCaptacao: '', dataAdmissao: '',
      observacoes: '', tags: [], segmentoUltimaEmpresa: '', genero: '', faixaEtaria: '', distanciaKm: 0,
      escolaridade: '', estuda: '', turnoEstudo: '', cargosPossiveis: [], estadoCivil: '', temFilhos: '', quantidadeFilhos: ''
    };
  }

  function openForm(id) {
    editingCandId = id;
    if (id) {
      const c = (D().candidatos || []).find(x => x.id === id);
      candForm = c ? Object.assign({}, c) : defaultCandForm();
    } else {
      candForm = defaultCandForm();
    }
    view = 'form';
    render();
  }

  function computeAutoResultadoFinal(d) {
    const resultados = [d.resultadoRH, d.resultadoAnalise, d.resultadoChecagem, d.resultadoGestor];
    if (resultados.includes('Banco de Talentos')) return 'Banco de Talentos';
    if (resultados.includes('Reprovado')) return 'Reprovado';
    return null;
  }

  function renderFormView(el) {
    const readOnly = !canWrite();
    const titulo = editingCandId ? `${readOnly ? 'Ver' : 'Editar'} candidato ${editingCandId}` : 'Novo Candidato';
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div><h2 style="font-size:16px">${U.escapeHtml(titulo)}</h2><p class="sub" style="color:var(--muted);font-size:12px;margin-top:2px">Cadastre e acompanhe o processo seletivo do candidato</p></div>
        <button class="btn btn-outline btn-sm" id="cf-voltar">‹ Voltar para a lista</button>
      </div>
      <div id="cf-progress"></div>
      <div id="cf-body"></div>
      ${!readOnly ? `<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-outline" id="cf-salvar" style="width:auto">Salvar</button>
        ${!editingCandId ? '<button class="btn btn-outline" id="cf-salvar-novo" style="width:auto">Salvar e novo</button>' : ''}
        <button class="btn btn-primary" id="cf-salvar-voltar" style="width:auto">Salvar e voltar para a lista</button>
      </div>
      <div class="msg err" id="cf-msg"></div>` : ''}
    `;
    el.querySelector('#cf-voltar').addEventListener('click', () => { view = 'list'; render(); });
    renderProgress(el);
    renderBody(el, readOnly);
    if (!readOnly) {
      el.querySelector('#cf-salvar').addEventListener('click', () => salvarCandidato(el, 'continuar'));
      const btnNovo = el.querySelector('#cf-salvar-novo');
      btnNovo && btnNovo.addEventListener('click', () => salvarCandidato(el, 'novo'));
      el.querySelector('#cf-salvar-voltar').addEventListener('click', () => salvarCandidato(el, 'lista'));
    }
  }

  function renderProgress(el) {
    const d = candForm;
    const steps = ['Agendado', 'RH', 'Análise', 'Checagem', 'Gestor', 'Proposta', 'Admissão'];
    let idx = 0;
    if (d.resultadoRH && d.resultadoRH !== 'Em andamento') idx = 1;
    if (d.resultadoAnalise && d.resultadoAnalise !== 'Em andamento') idx = Math.max(idx, 2);
    if (d.resultadoChecagem && d.resultadoChecagem !== 'Em andamento') idx = Math.max(idx, 3);
    if (d.resultadoGestor && d.resultadoGestor !== 'Em andamento') idx = Math.max(idx, 4);
    if (d.resultadoFinal === 'Aprovado' && d.dataFechamento) idx = Math.max(idx, 5);
    if (d.dataAdmissao) idx = 6;
    el.querySelector('#cf-progress').innerHTML = `<div class="card full" style="padding:16px 18px;margin-bottom:14px">
      <h4 style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Progresso do processo seletivo</h4>
      <div class="progress-steps">${steps.map((s, i) => {
        let cls = i < idx ? 'done' : (i === idx ? 'active' : '');
        return `<div class="ps ${cls}"><div class="dot">${i < idx ? '✓' : i + 1}</div><div class="lbl">${s}</div></div>`;
      }).join('')}</div>
    </div>`;
  }

  function renderBody(el, readOnly) {
    const d = candForm;
    const vagasAtivas = (D().vagas || []).filter(v => v.status !== 'Finalizada' && v.status !== 'Cancelada');
    const vaga = (D().vagas || []).find(v => v.id === d.vagaId);
    const wa = linkWhatsApp(d.contato);
    const dis = readOnly ? 'disabled' : '';

    let dup = '';
    if (!readOnly && (d.email || d.contato)) {
      const found = (D().candidatos || []).find(c => c.id !== editingCandId && ((d.email && c.email === d.email) || (d.contato && c.contato === d.contato)));
      if (found) dup = `<div class="msg err" style="display:block;margin-bottom:14px">Possível duplicidade: já existe candidato com este e-mail/telefone — ${U.escapeHtml(found.nome)} (${found.id}).</div>`;
    }

    const rhOk = d.resultadoRH === 'Aprovado';
    const analiseOk = rhOk && d.resultadoAnalise === 'Aprovado';
    const checagemOk = analiseOk && d.resultadoChecagem === 'Aprovado';
    const todasAprovadas = rhOk && analiseOk && checagemOk && d.resultadoGestor === 'Aprovado';
    const auto = computeAutoResultadoFinal(d);
    if (auto && d.resultadoFinal !== auto) d.resultadoFinal = auto;
    const finalBloqueado = !!auto || !todasAprovadas;

    el.querySelector('#cf-body').innerHTML = `
      ${dup}
      <details class="blk" open>
        <summary>Dados da Vaga</summary>
        <div class="blk-body">
          <div class="form-grid">
            <div class="field full"><label>Código da Vaga <span class="req">*</span></label>
              <select id="cf_vagaId" ${dis}><option value="">Selecione uma vaga ativa...</option>${vagasAtivas.map(v => `<option value="${v.id}" ${d.vagaId === v.id ? 'selected' : ''}>${v.id} — ${U.escapeHtml(v.cargo || '')} (${U.escapeHtml(v.marca || '')})</option>`).join('')}</select>
            </div>
            <div class="field"><label>Cargo</label><input value="${vaga ? U.escapeHtml(vaga.cargo || '') : ''}" readonly style="background:var(--bg)"></div>
            <div class="field"><label>Marca</label><input value="${vaga ? U.escapeHtml(vaga.marca || '') : ''}" readonly style="background:var(--bg)"></div>
            <div class="field"><label>Departamento</label><input value="${vaga ? U.escapeHtml(vaga.departamento || '') : ''}" readonly style="background:var(--bg)"></div>
            <div class="field"><label>Nível da Vaga</label><input value="${vaga ? U.escapeHtml(vaga.nivelVaga || '') : ''}" readonly style="background:var(--bg)"></div>
          </div>
        </div>
      </details>

      <details class="blk" open>
        <summary>Dados do Candidato</summary>
        <div class="blk-body">
          <div class="form-grid">
            <div class="field full"><label>Nome completo <span class="req">*</span></label><input data-field="nome" value="${U.escapeHtml(d.nome || '')}" placeholder="Ex: Maria da Silva Santos" ${dis}></div>
            <div class="field"><label>E-mail <span class="req">*</span></label><input type="email" data-field="email" value="${U.escapeHtml(d.email || '')}" placeholder="candidato@email.com" ${dis}></div>
            <div class="field"><label>Telefone / WhatsApp <span class="req">*</span></label>
              <div style="display:flex;gap:8px;align-items:center">
                <input type="tel" id="cf_contato" value="${U.escapeHtml(d.contato || '')}" placeholder="(21) 99999-9999" style="flex:1" ${dis}>
                ${wa ? `<a class="wa-link" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
              </div>
            </div>
            <div class="field"><label>LinkedIn <span class="req">*</span></label><input data-field="linkedin" value="${U.escapeHtml(d.linkedin || '')}" placeholder="linkedin.com/in/..." ${dis}></div>
            <div class="field"><label>Link PandaPé <span class="req">*</span></label><input data-field="linkPandaPe" value="${U.escapeHtml(d.linkPandaPe || '')}" placeholder="pandape.infojobs.com.br/..." ${dis}></div>
            <div class="field"><label>Fonte de Captação <span class="req">*</span></label><select data-field="fonteCaptacao" ${dis}>${selOpts(fontesAtivas(), d.fonteCaptacao)}</select></div>
            <div class="field"><label>Segmento da Última Empresa <span class="req">*</span></label><select data-field="segmentoUltimaEmpresa" ${dis}>${selOpts(SEGMENTOS_EMPRESA, d.segmentoUltimaEmpresa)}</select></div>
            <div class="field"><label>Gênero <span class="req">*</span></label><select data-field="genero" ${dis}>${selOpts(GENERO_OPCOES, d.genero)}</select></div>
            <div class="field"><label>Faixa Etária <span class="req">*</span></label><select data-field="faixaEtaria" ${dis}>${selOpts(FAIXAS_ETARIAS, d.faixaEtaria)}</select></div>
            <div class="field"><label>Escolaridade <span class="req">*</span></label><select data-field="escolaridade" ${dis}>${selOpts(ESCOLARIDADE_OPCOES, d.escolaridade)}</select></div>
            <div class="field"><label>Está estudando atualmente? <span class="req">*</span></label><select id="cf_estuda" ${dis}>${selOpts(['Sim', 'Não'], d.estuda)}</select></div>
            ${d.estuda === 'Sim' ? `<div class="field"><label>Turno em que estuda <span class="req">*</span></label><select data-field="turnoEstudo" ${dis}>${selOpts(TURNOS_ESTUDO, d.turnoEstudo)}</select></div>` : ''}
            <div class="field"><label>Estado Civil <span class="req">*</span></label><select data-field="estadoCivil" ${dis}>${selOpts(ESTADO_CIVIL_OPCOES, d.estadoCivil)}</select></div>
            <div class="field"><label>Tem filhos? <span class="req">*</span></label><select id="cf_temFilhos" ${dis}>${selOpts(['Sim', 'Não'], d.temFilhos)}</select></div>
            ${d.temFilhos === 'Sim' ? `<div class="field"><label>Quantos filhos? <span class="req">*</span></label><select data-field="quantidadeFilhos" ${dis}>${selOpts(QUANTIDADE_FILHOS_OPCOES, d.quantidadeFilhos)}</select></div>` : ''}
            <div class="field full"><label>Distância de casa até o local da vaga: <strong id="cf_distanciaKmLabel">${d.distanciaKm || 0} km</strong></label>
              <input type="range" min="0" max="100" id="cf_distanciaKm" value="${d.distanciaKm || 0}" style="width:100%" ${dis}>
            </div>
            <div class="field full"><label>Tags</label>
              <div class="tag-list" id="cf_tags_list">${(d.tags || []).map(t => `<span class="tag-chip">${U.escapeHtml(t)} <span class="x" data-rm-tag="${U.escapeHtml(t)}">×</span></span>`).join('')}
                ${!readOnly ? `<input id="cf_newTag" placeholder="+ nova tag" style="max-width:160px">` : ''}
              </div>
            </div>
          </div>
        </div>
      </details>

      <details class="blk" open>
        <summary>Entrevista RH</summary>
        <div class="blk-body">
          <div class="form-grid">
            <div class="field"><label>Entrevistado por <span class="req">*</span></label><select data-field="entrevistadoPor" ${dis}>${selOpts(recrutadoresAtivos(), d.entrevistadoPor || (vaga && vaga.responsavel))}</select></div>
            <div class="field"><label>Data do contato do RH <span class="req">*</span></label><input type="date" id="cf_dataContatoRH" value="${d.dataContatoRH || ''}" ${dis}></div>
            <div class="field"><label>Data da entrevista <span class="req">*</span></label><input type="date" id="cf_dataEntrevista" value="${d.dataEntrevista || ''}" ${dis}></div>
            <div class="field"><label>Horário <span class="req">*</span></label><input type="time" data-field="horarioEntrevista" value="${U.escapeHtml(d.horarioEntrevista || '')}" ${dis}></div>
            <div class="field"><label>FIT Cultural (%)</label>
              <div style="display:flex;align-items:center;gap:10px">
                <input type="range" min="0" max="100" id="cf_fit" value="${d.fitPct || 0}" style="flex:1" ${dis}>
                <span id="cf_fitVal" style="font-weight:700;min-width:42px;text-align:right">${d.fitPct || 0}%</span>
              </div>
            </div>
            <div class="field"><label>Status da etapa</label><select data-field="etapaRHStatus" ${dis}>${selOpts(STATUS_ETAPA, d.etapaRHStatus || 'Pendente', 'Pendente')}</select></div>
            <div class="field"><label>Resultado</label><select id="cf_resultadoRH" ${dis}>${selOpts(RESULTADO_ETAPA_DETALHE, d.resultadoRH || 'Em andamento', 'Em andamento')}</select></div>
            <div class="field full"><div class="sla-note">${frasSLAEtapa(d.dataContatoRH, d.dataEntrevista || d.dataAgendadaRH)}</div></div>
          </div>
        </div>
      </details>

      ${!rhOk ? `<div class="lock-note">Aprove o resultado da <strong>Entrevista RH</strong> para liberar a Etapa Análise Documental.</div>` : renderEtapaBlock('Análise Documental', 'analise', d, dis, {
        contato: 'dataContatoAnalise', agendada: 'dataAgendadaAnalise', etapaStatus: 'etapaAnaliseStatus', resultado: 'resultadoAnalise', motivo: 'motivoAnalise', motivos: MOTIVOS_ANALISE
      }) + (!analiseOk ? `<div class="lock-note">Aprove o resultado da <strong>Análise Documental</strong> para liberar a Etapa Checagem.</div>` :
        renderEtapaBlock('Checagem', 'checagem', d, dis, { contato: 'dataContatoChecagem', agendada: 'dataAgendadaChecagem', etapaStatus: 'etapaChecagemStatus', resultado: 'resultadoChecagem', motivo: 'motivoChecagem', motivos: MOTIVOS_CHECAGEM }) +
        (!checagemOk ? `<div class="lock-note">Aprove o resultado da <strong>Checagem</strong> para liberar a Etapa Entrevista Gestor.</div>` : renderGestorBlock(d, dis)))}

      <details class="blk" open>
        <summary>Resultado Final</summary>
        <div class="blk-body">
          <div class="form-grid">
            <div class="field"><label>Resultado Final ${auto ? '<span class="hint">(preenchido automaticamente)</span>' : (finalBloqueado ? '<span class="hint">(libera quando todas as etapas forem aprovadas)</span>' : '')}</label>
              <select id="cf_resultadoFinal" ${finalBloqueado || readOnly ? 'disabled' : ''} style="${finalBloqueado ? 'background:var(--bg)' : ''}">
                <option value="" ${!d.resultadoFinal ? 'selected' : ''}>— Em andamento</option>
                ${RESULTADO_FINAL_V2.map(o => `<option value="${o}" ${d.resultadoFinal === o ? 'selected' : ''}>${o}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>Data de Fechamento</label><input type="date" data-field="dataFechamento" value="${d.dataFechamento || ''}" ${dis}></div>
            ${d.resultadoFinal === 'Reprovado' ? `<div class="field full"><label>Motivo da Reprovação <span class="req">*</span></label><select data-field="motivoReprovacao" ${dis}>${selOpts(MOTIVOS_REPROVACAO_FINAL, d.motivoReprovacao)}</select></div>` : ''}
          </div>
        </div>
      </details>

      ${editingCandId && d.resultadoFinal === 'Aprovado' ? (() => {
        const jaEnviado = candidatoJaEmOnboarding(editingCandId);
        if (jaEnviado) return `<div class="msg ok" style="display:flex;align-items:center;justify-content:space-between;gap:10px"><span>Enviado(a) para Onboarding.</span>${!readOnly ? `<button type="button" class="btn btn-outline btn-sm" id="cf-abrir-onboarding" style="width:auto">Abrir no Treinamento e Desenvolvimento</button>` : ''}</div>`;
        const cAtual = (D().candidatos || []).find(x => x.id === editingCandId) || d;
        if (!readOnly && podeEnviarParaOnboarding(cAtual)) return `<div class="field full"><button type="button" class="btn btn-primary" id="cf-enviar-onboarding" style="width:auto">Enviar para Onboarding</button></div>`;
        return '';
      })() : ''}

      ${d.resultadoFinal === 'Banco de Talentos' ? `<details class="blk" open>
        <summary>Cargos Possíveis</summary>
        <div class="blk-body">
          <div class="field full"><label>Para quais cargos esse candidato é aderente no Banco de Talentos? <span class="hint">(até 5)</span></label>
            <div class="tag-list" id="cf_cargos_list">${(d.cargosPossiveis || []).map(c => `<span class="tag-chip">${U.escapeHtml(c)} <span class="x" data-rm-cargo="${U.escapeHtml(c)}">×</span></span>`).join('')}
              ${!readOnly && (d.cargosPossiveis || []).length < 5 ? `<select id="cf_newCargoPossivel" style="max-width:220px"><option value="">+ selecionar cargo...</option>${cargosAtivos().filter(c => !(d.cargosPossiveis || []).includes(c)).map(c => `<option value="${U.escapeHtml(c)}">${U.escapeHtml(c)}</option>`).join('')}</select>` : ''}
            </div>
          </div>
        </div>
      </details>` : ''}

      <details class="blk" open>
        <summary>Admissão</summary>
        <div class="blk-body"><div class="form-grid"><div class="field"><label>Data de Admissão</label><input type="date" id="cf_dataAdmissao" value="${d.dataAdmissao || ''}" ${dis}></div></div></div>
      </details>

      <details class="blk" open>
        <summary>Observações Internas</summary>
        <div class="blk-body"><div class="field full"><textarea data-field="observacoes" rows="4" placeholder="Observações visíveis apenas para o time de R&amp;S..." ${dis}>${U.escapeHtml(d.observacoes || '')}</textarea></div></div>
      </details>
    `;
    wireBodyEvents(el, readOnly);
  }

  function renderEtapaBlock(titulo, key, d, dis, cfg) {
    return `<details class="blk" open>
      <summary>Etapa ${U.escapeHtml(titulo)} — Agendamento e Resultado</summary>
      <div class="blk-body">
        <div class="form-grid">
          <div class="field"><label>Data de contato <span class="req">*</span></label><input type="date" class="cf-etapa-data" data-etapa="${key}" data-kind="contato" value="${d[cfg.contato] || ''}" ${dis}></div>
          <div class="field"><label>Data agendada <span class="req">*</span></label><input type="date" class="cf-etapa-data" data-etapa="${key}" data-kind="agendada" value="${d[cfg.agendada] || ''}" ${dis}></div>
          <div class="field full"><div class="sla-note" id="cf_sla_${key}">${frasSLAEtapa(d[cfg.contato], d[cfg.agendada])}</div></div>
          <div class="field"><label>Status da etapa</label><select data-field="${cfg.etapaStatus}" ${dis}>${selOpts(STATUS_ETAPA, d[cfg.etapaStatus] || 'Pendente', 'Pendente')}</select></div>
          <div class="field"><label>Resultado <span class="req">*</span></label><select class="cf-etapa-resultado" data-etapa="${key}" data-field="${cfg.resultado}" ${dis}>${selOpts(RESULTADO_ETAPA_DETALHE, d[cfg.resultado] || 'Em andamento', 'Em andamento')}</select></div>
          <div class="field"><label>Detalhamento (opcional)</label><select data-field="${cfg.motivo}" ${dis}>${selOpts(cfg.motivos, d[cfg.motivo])}</select></div>
        </div>
      </div>
    </details>`;
  }

  function renderGestorBlock(d, dis) {
    return `<details class="blk" open>
      <summary>Etapa Entrevista Gestor — Agendamento e Resultado</summary>
      <div class="blk-body">
        <div class="form-grid">
          <div class="field"><label>Data de contato <span class="req">*</span></label><input type="date" class="cf-etapa-data" data-etapa="gestor" data-kind="contato" value="${d.dataContatoGestor || ''}" ${dis}></div>
          <div class="field"><label>Data agendada <span class="req">*</span></label><input type="date" class="cf-etapa-data" data-etapa="gestor" data-kind="agendada" value="${d.dataAgendadaGestor || ''}" ${dis}></div>
          <div class="field"><label>Horário <span class="req">*</span></label><input type="time" data-field="horarioGestor" value="${U.escapeHtml(d.horarioGestor || '')}" ${dis}></div>
          <div class="field full"><div class="sla-note" id="cf_sla_gestor">${frasSLAEtapa(d.dataContatoGestor, d.dataAgendadaGestor)}</div></div>
          <div class="field"><label>Status da etapa</label><select data-field="etapaGestorStatus" ${dis}>${selOpts(STATUS_ETAPA, d.etapaGestorStatus || 'Pendente', 'Pendente')}</select></div>
          <div class="field"><label>Resultado <span class="req">*</span></label><select class="cf-etapa-resultado" data-etapa="gestor" data-field="resultadoGestor" ${dis}>${selOpts(RESULTADO_ETAPA_DETALHE, d.resultadoGestor || 'Em andamento', 'Em andamento')}</select></div>
        </div>
      </div>
    </details>`;
  }

  const ETAPA_FIELD_MAP = {
    analise: { contato: 'dataContatoAnalise', agendada: 'dataAgendadaAnalise' },
    checagem: { contato: 'dataContatoChecagem', agendada: 'dataAgendadaChecagem' },
    gestor: { contato: 'dataContatoGestor', agendada: 'dataAgendadaGestor' }
  };

  function wireBodyEvents(el, readOnly) {
    const d = candForm;
    if (readOnly) return;

    // Campos simples: atualizam candForm sem re-renderizar (preserva foco/cursor).
    // Exclui .cf-etapa-resultado, que já tem um listener próprio mais abaixo
    // (precisa re-renderizar pra liberar/bloquear a etapa seguinte).
    el.querySelectorAll('[data-field]:not(.cf-etapa-resultado)').forEach(inp => {
      const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
      inp.addEventListener(ev, () => { d[inp.dataset.field] = inp.value; });
    });

    // Vaga: recalcula recrutador/fonte padrão e reflete cargo/marca/departamento
    const vagaSel = el.querySelector('#cf_vagaId');
    vagaSel && vagaSel.addEventListener('change', () => {
      d.vagaId = vagaSel.value;
      const v = (D().vagas || []).find(x => x.id === d.vagaId);
      if (v) {
        if (!d.entrevistadoPor) d.entrevistadoPor = v.responsavel;
        if (!d.fonteCaptacao) d.fonteCaptacao = v.fonte;
      }
      renderBody(el, readOnly);
    });

    // Telefone com máscara + botão WhatsApp
    const contatoInp = el.querySelector('#cf_contato');
    contatoInp && contatoInp.addEventListener('input', () => {
      contatoInp.value = mascararTelefone(contatoInp.value);
      d.contato = contatoInp.value;
    });
    contatoInp && contatoInp.addEventListener('change', () => renderBody(el, readOnly));

    // FIT slider: atualiza valor exibido sem re-renderizar
    const fitInp = el.querySelector('#cf_fit');
    fitInp && fitInp.addEventListener('input', () => {
      d.fitPct = parseInt(fitInp.value, 10);
      el.querySelector('#cf_fitVal').textContent = fitInp.value + '%';
    });

    // Distância slider
    const distInp = el.querySelector('#cf_distanciaKm');
    distInp && distInp.addEventListener('input', () => {
      d.distanciaKm = parseInt(distInp.value, 10);
      el.querySelector('#cf_distanciaKmLabel').textContent = distInp.value + ' km';
    });

    // estuda / temFilhos: precisam re-renderizar para mostrar/esconder campo dependente
    const estudaSel = el.querySelector('#cf_estuda');
    estudaSel && estudaSel.addEventListener('change', () => { d.estuda = estudaSel.value; renderBody(el, readOnly); });
    const filhosSel = el.querySelector('#cf_temFilhos');
    filhosSel && filhosSel.addEventListener('change', () => { d.temFilhos = filhosSel.value; renderBody(el, readOnly); });

    // Tags
    const newTag = el.querySelector('#cf_newTag');
    newTag && newTag.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = newTag.value.trim();
      if (v) { d.tags = d.tags || []; if (!d.tags.includes(v)) d.tags.push(v); renderBody(el, readOnly); }
    });
    el.querySelectorAll('[data-rm-tag]').forEach(x => x.addEventListener('click', () => {
      d.tags = (d.tags || []).filter(t => t !== x.dataset.rmTag); renderBody(el, readOnly);
    }));

    // Cargos possíveis (Banco de Talentos)
    const newCargo = el.querySelector('#cf_newCargoPossivel');
    newCargo && newCargo.addEventListener('change', () => {
      if (!newCargo.value) return;
      d.cargosPossiveis = d.cargosPossiveis || [];
      if (d.cargosPossiveis.length < 5 && !d.cargosPossiveis.includes(newCargo.value)) d.cargosPossiveis.push(newCargo.value);
      renderBody(el, readOnly);
    });
    el.querySelectorAll('[data-rm-cargo]').forEach(x => x.addEventListener('click', () => {
      d.cargosPossiveis = (d.cargosPossiveis || []).filter(c => c !== x.dataset.rmCargo); renderBody(el, readOnly);
    }));

    // Datas de contato/agendada por etapa (RH + Análise/Checagem/Gestor): valida
    // ordem, atualiza nota de SLA. RH usa ids próprios (dataContatoRH/dataEntrevista)
    // por herdar o layout do app original; as demais usam a classe genérica.
    const dContatoRH = el.querySelector('#cf_dataContatoRH'), dEntrevista = el.querySelector('#cf_dataEntrevista');
    function syncRHSla() {
      d.dataContatoRH = dContatoRH.value; d.dataEntrevista = dEntrevista.value; d.dataAgendadaRH = dEntrevista.value;
      // Bloco RH é sempre o primeiro .sla-note do formulário (os blocos de
      // Análise/Checagem/Gestor só existem depois que a etapa anterior é
      // aprovada — ver renderBody).
      const slaEls = el.querySelectorAll('.sla-note');
      if (slaEls[0]) slaEls[0].innerHTML = frasSLAEtapa(d.dataContatoRH, d.dataEntrevista);
    }
    dContatoRH && dContatoRH.addEventListener('change', syncRHSla);
    dEntrevista && dEntrevista.addEventListener('change', syncRHSla);

    el.querySelectorAll('.cf-etapa-data').forEach(inp => inp.addEventListener('change', () => {
      const etapa = inp.dataset.etapa, kind = inp.dataset.kind;
      const map = ETAPA_FIELD_MAP[etapa];
      if (!map) return;
      const field = kind === 'contato' ? map.contato : map.agendada;
      d[field] = inp.value;
      const c = d[map.contato], a = d[map.agendada];
      if (c && a && a < c) {
        alert(`Etapa: data agendada não pode ser anterior à data de contato.`);
        d[map.agendada] = ''; inp.value = '';
      }
      const note = el.querySelector('#cf_sla_' + etapa);
      if (note) note.innerHTML = frasSLAEtapa(d[map.contato], d[map.agendada]);
    }));

    // Resultado por etapa: precisa re-renderizar (libera/bloqueia etapa seguinte,
    // recalcula Resultado Final automático)
    el.querySelectorAll('.cf-etapa-resultado').forEach(sel => sel.addEventListener('change', () => {
      d[sel.dataset.field] = sel.value; renderProgress(el); renderBody(el, readOnly);
    }));
    const rhResSel = el.querySelector('#cf_resultadoRH');
    rhResSel && rhResSel.addEventListener('change', () => { d.resultadoRH = rhResSel.value; renderProgress(el); renderBody(el, readOnly); });

    // Resultado Final manual + admissão
    const finalSel = el.querySelector('#cf_resultadoFinal');
    finalSel && finalSel.addEventListener('change', () => { d.resultadoFinal = finalSel.value; renderProgress(el); renderBody(el, readOnly); });
    const admInp = el.querySelector('#cf_dataAdmissao');
    admInp && admInp.addEventListener('change', () => { d.dataAdmissao = admInp.value; renderProgress(el); });

    // Onboarding: enviar (recarrega e re-renderiza o form, que passa a mostrar
    // o aviso "já enviado") ou navegar até o novo módulo Treinamento e
    // Desenvolvimento (o link abre a lista — não há deep-link pro registro
    // específico entre módulos nesta versão).
    const btnEnviarOb = el.querySelector('#cf-enviar-onboarding');
    btnEnviarOb && btnEnviarOb.addEventListener('click', () => editingCandId && enviarParaOnboarding(editingCandId));
    const btnAbrirOb = el.querySelector('#cf-abrir-onboarding');
    btnAbrirOb && btnAbrirOb.addEventListener('click', () => { if (window.HUB_GOTO_SECTION) HUB_GOTO_SECTION('tre-onboarding'); });
  }

  // ================================================================
  // SALVAR (validações + sincronização automática da Agenda de Entrevistas
  // — portado de salvarCandidato, ~8150-8377)
  // ================================================================
  function validar(el) {
    const d = candForm;
    const msg = el.querySelector('#cf-msg');
    function fail(text) { msg.textContent = text; msg.style.display = 'block'; return false; }
    msg.style.display = 'none';

    if (!d.vagaId) return fail('Selecione a vaga associada.');
    if (!d.nome || !d.nome.trim()) return fail('Informe o nome do candidato.');
    if (!d.email || !d.email.trim()) return fail('Informe o e-mail do candidato.');

    const obrig = [['contato', 'Telefone / WhatsApp'], ['linkedin', 'LinkedIn'], ['linkPandaPe', 'Link PandaPé'],
      ['fonteCaptacao', 'Fonte de Captação'], ['segmentoUltimaEmpresa', 'Segmento da Última Empresa'],
      ['genero', 'Gênero'], ['faixaEtaria', 'Faixa Etária'], ['escolaridade', 'Escolaridade'],
      ['estuda', 'Está estudando atualmente?'], ['estadoCivil', 'Estado Civil'], ['temFilhos', 'Tem filhos?']];
    for (const [c, l] of obrig) if (!d[c] || !String(d[c]).trim()) return fail(`Preencha o campo "${l}" em Dados do Candidato.`);
    if (d.estuda === 'Sim' && !d.turnoEstudo) return fail('Informe o turno em que o candidato estuda.');
    if (d.temFilhos === 'Sim' && !d.quantidadeFilhos) return fail('Informe quantos filhos o candidato tem.');

    if (!d.entrevistadoPor) return fail('Informe quem entrevistou o candidato (Entrevista RH).');
    if (!d.dataContatoRH) return fail('Informe a Data do contato do RH.');
    if (!d.dataEntrevista) return fail('Informe a Data da entrevista (RH).');
    if (!d.horarioEntrevista) return fail('Informe o Horário da entrevista (RH).');

    if (d.resultadoRH === 'Aprovado') {
      if (!d.dataContatoAnalise) return fail('Informe a Data de contato da Etapa Análise Documental.');
      if (!d.dataAgendadaAnalise) return fail('Informe a Data agendada da Etapa Análise Documental.');
    }
    if (d.resultadoRH === 'Aprovado' && d.resultadoAnalise === 'Aprovado') {
      if (!d.dataContatoChecagem) return fail('Informe a Data de contato da Etapa Checagem.');
      if (!d.dataAgendadaChecagem) return fail('Informe a Data agendada da Etapa Checagem.');
    }
    if (d.resultadoRH === 'Aprovado' && d.resultadoAnalise === 'Aprovado' && d.resultadoChecagem === 'Aprovado') {
      if (!d.dataContatoGestor) return fail('Informe a Data de contato da Etapa Entrevista Gestor.');
      if (!d.dataAgendadaGestor) return fail('Informe a Data agendada da Etapa Entrevista Gestor.');
      if (!d.horarioGestor) return fail('Informe o Horário da Etapa Entrevista Gestor.');
    }
    if (d.resultadoRH === 'Aprovado' && d.resultadoAnalise === 'Aprovado' && d.resultadoChecagem === 'Aprovado' && d.resultadoGestor === 'Aprovado' && !d.resultadoFinal) {
      return fail('Todas as etapas foram aprovadas — selecione o Resultado Final.');
    }
    const pares = [[d.dataContatoRH, d.dataAgendadaRH, 'RH'], [d.dataContatoAnalise, d.dataAgendadaAnalise, 'Análise'], [d.dataContatoChecagem, d.dataAgendadaChecagem, 'Checagem'], [d.dataContatoGestor, d.dataAgendadaGestor, 'Gestor']];
    for (const [c, a, n] of pares) if (c && a && a < c) return fail(`Etapa ${n}: data agendada anterior à data de contato.`);

    const auto = computeAutoResultadoFinal(d);
    if (auto) d.resultadoFinal = auto;
    if (d.resultadoFinal === 'Reprovado' && !d.motivoReprovacao) return fail('Informe o Motivo da Reprovação para finalizar.');
    return true;
  }

  async function sincronizarEntrevistaRH(vaga) {
    const d = candForm;
    const entrevistas = D().entrevistas || [];
    const existente = entrevistas.find(e => e.candidatoId === editingCandId && e.etapa === 'Entrevista (RH)');
    if (existente) {
      if (existente.data !== d.dataEntrevista || existente.horario !== d.horarioEntrevista || existente.recrutador !== d.entrevistadoPor) {
        await R.updateRow('entrevistas', existente.id, { data: d.dataEntrevista || existente.data, horario: d.horarioEntrevista || existente.horario, recrutador: d.entrevistadoPor || existente.recrutador });
      }
    } else if (d.etapaRHStatus !== 'Concluída' && d.dataEntrevista && d.horarioEntrevista) {
      await R.insertRow('entrevistas', {
        candidatoId: editingCandId, candidatoNome: d.nome, vagaId: d.vagaId, cargo: d.cargo, marca: d.marca,
        recrutador: d.entrevistadoPor, etapa: 'Entrevista (RH)', data: d.dataEntrevista, horario: d.horarioEntrevista,
        duracao: 60, status: 'Agendada', tipoProcesso: vaga ? vaga.tipoRecrutamento : 'Externo', nivelVaga: d.nivelVaga, observacao: ''
      });
    }
  }

  async function salvarCandidato(el, opcao) {
    if (!validar(el)) return;
    const d = candForm;
    const vaga = (D().vagas || []).find(v => v.id === d.vagaId);
    if (vaga) { d.cargo = vaga.cargo; d.marca = vaga.marca; d.departamento = vaga.departamento; d.nivelVaga = vaga.nivelVaga || ''; }
    d.atualizadoPor = (HUB_USER && (HUB_USER.nome || HUB_USER.email)) || 'Desconhecido';

    const btn = el.querySelector('#cf-salvar-voltar');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }
    try {
      if (editingCandId) {
        await R.updateRow('candidatos', editingCandId, d);
        await sincronizarEntrevistaRH(vaga);
        await R.logAcao({ acao: 'Edição de Candidato', vagaId: d.vagaId, detalhes: `Candidato ${editingCandId} atualizado: ${d.nome}` });
      } else {
        const id = U.nextCode('CAND', (D().candidatos || []).map(c => c.id));
        const novo = Object.assign({}, d, { id, criadoEm: new Date().toISOString() });
        await R.insertRow('candidatos', novo);
        editingCandId = id;
        await R.logAcao({ acao: 'Novo Candidato', vagaId: novo.vagaId, detalhes: `Candidato ${id} cadastrado: ${novo.nome}` });
        if (d.dataEntrevista && d.horarioEntrevista) {
          await R.insertRow('entrevistas', {
            candidatoId: id, candidatoNome: novo.nome, vagaId: novo.vagaId, cargo: novo.cargo, marca: novo.marca,
            recrutador: novo.entrevistadoPor, etapa: 'Entrevista (RH)', data: novo.dataEntrevista, horario: novo.horarioEntrevista,
            duracao: 60, status: 'Agendada', tipoProcesso: vaga ? vaga.tipoRecrutamento : 'Externo', nivelVaga: novo.nivelVaga, observacao: ''
          });
        }
      }
      await R.reload();
      if (opcao === 'novo') { openForm(null); }
      else if (opcao === 'continuar') { openForm(editingCandId); }
      else { view = 'list'; render(); }
    } catch (err) {
      const msg = el.querySelector('#cf-msg');
      msg.textContent = 'Erro ao salvar: ' + err.message; msg.style.display = 'block';
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar e voltar para a lista'; }
    }
  }

  window.HUB_SECTIONS = window.HUB_SECTIONS || {};
  window.HUB_SECTIONS.renderCandidatos = renderCandidatos;
})();
