// Orquestração geral: login, navegação (agrupada por módulo, filtrada por
// permissão), barra de filtros e carregamento de dados. O conteúdo de cada
// tela é montado em sections/*.js / admin/*.js — este arquivo só decide
// QUANDO chamar cada um e QUAIS itens de menu um usuário específico enxerga.
(function () {
  const U = HUB_UTILS;
  const P = HUB_PERMISSIONS;
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  window.HUB_USER = null;
  window.HUB_FILTERS = {};

  const NAV_TITLES = {
    dashboard: 'Dashboard',
    'ind-headcount': 'Headcount', 'ind-recrutamento': 'Recrutamento', 'ind-rotatividade': 'Rotatividade',
    'ind-desligamento': 'Entrevista de Desligamento', 'ind-feedbacks': 'Feedbacks', 'ind-oneonone': '1:1',
    'ind-treinamentos': 'Treinamentos', 'ind-celebracoes': 'Celebrações',
    'rec-dashboard': 'Dashboard — Recrutamento', 'rec-vagas': 'Controle de Vagas', 'rec-candidatos': 'Candidatos',
    'rec-agenda': 'Agenda de Entrevistas', 'rec-banco-talentos': 'Banco de Talentos', 'rec-aprovacoes': 'Aprovações',
    'rec-historico': 'Histórico', 'rec-transferencia': 'Transferência de Vaga', 'rec-parecer-gestor': 'Parecer do Gestor',
    'tre-onboarding': 'Onboarding', 'tre-visita-loja': 'Visita em Loja',
    'adm-upload': 'Upload de Planilhas', 'adm-cadastros': 'Cadastros do Recrutamento', 'adm-usuarios': 'Cadastro de Acessos'
  };

  // Cada item de menu (exceto "dashboard", sempre visível) exige a permissão
  // correspondente do catálogo (js/permissions.js) para aparecer na barra
  // lateral e para o conteúdo ser renderizado.
  const NAV_PERMISSIONS = {
    'ind-headcount': 'indicadores.headcount', 'ind-recrutamento': 'indicadores.recrutamento',
    'ind-rotatividade': 'indicadores.rotatividade', 'ind-desligamento': 'indicadores.desligamento',
    'ind-feedbacks': 'indicadores.feedbacks', 'ind-oneonone': 'indicadores.oneonone',
    'ind-treinamentos': 'indicadores.treinamentos', 'ind-celebracoes': 'indicadores.celebracoes',
    'rec-dashboard': 'recrutamento.dashboard', 'rec-vagas': 'recrutamento.vagas', 'rec-candidatos': 'recrutamento.candidatos',
    'rec-agenda': 'recrutamento.agenda', 'rec-banco-talentos': 'recrutamento.banco_talentos',
    'rec-aprovacoes': 'recrutamento.aprovacoes', 'rec-historico': 'recrutamento.historico',
    'rec-transferencia': 'recrutamento.transferencia', 'rec-parecer-gestor': 'recrutamento.parecer_gestor',
    'tre-onboarding': 'treinamento_dev.onboarding', 'tre-visita-loja': 'treinamento_dev.visita_loja',
    'adm-upload': 'admin.upload', 'adm-cadastros': 'admin.cadastros_recrutamento', 'adm-usuarios': 'admin.usuarios'
  };

  // Seções do módulo Recrutamento (e Treinamento e Desenvolvimento, que
  // compartilha as mesmas tabelas — ver dal-recrutamento.js) recarregam
  // vagas/candidatos/entrevistas/onboarding toda vez que são abertas — é
  // isso que faz os dados aparecerem "em tempo real, de forma automática"
  // sem upload.
  const RECRUIT_SECTIONS = new Set(['ind-recrutamento', 'rec-dashboard', 'rec-vagas', 'rec-candidatos', 'rec-agenda', 'rec-banco-talentos', 'rec-aprovacoes', 'rec-historico', 'rec-transferencia', 'rec-parecer-gestor', 'tre-onboarding', 'tre-visita-loja']);

  function sectionRenderer(name) {
    const f = getFilters();
    const el = $('#sec-' + name);
    switch (name) {
      case 'dashboard': return HUB_SECTIONS.renderDashboard(el, f);
      case 'ind-headcount': return HUB_SECTIONS.renderHeadcount(el, f);
      case 'ind-recrutamento': return HUB_SECTIONS.renderRecrutamentoDashboard(el, f);
      case 'ind-rotatividade': return HUB_SECTIONS.renderRotatividade(el, f);
      case 'ind-desligamento': return HUB_SECTIONS.renderDesligamento(el, f);
      case 'ind-feedbacks': return HUB_SECTIONS.renderFeedbacks(el, f);
      case 'ind-oneonone': return HUB_SECTIONS.renderOneOnOne(el, f);
      case 'ind-treinamentos': return HUB_SECTIONS.renderTreinamentos(el, f);
      case 'ind-celebracoes': return HUB_SECTIONS.renderCelebracoes(el, f);
      case 'rec-dashboard': return HUB_SECTIONS.renderRecrutamentoDashboard(el, f);
      case 'rec-vagas': return HUB_SECTIONS.renderVagas(el, f);
      case 'rec-candidatos': return HUB_SECTIONS.renderCandidatos(el, f);
      case 'rec-agenda': return HUB_SECTIONS.renderAgenda(el, f);
      case 'rec-banco-talentos': return HUB_SECTIONS.renderBancoTalentos(el, f);
      case 'rec-aprovacoes': return HUB_SECTIONS.renderAprovacoes(el, f);
      case 'rec-historico': return HUB_SECTIONS.renderHistorico(el, f);
      case 'rec-transferencia': return HUB_SECTIONS.renderTransferencia(el, f);
      case 'rec-parecer-gestor': return HUB_SECTIONS.renderParecerGestor(el, f);
      case 'tre-onboarding': return HUB_SECTIONS.renderOnboarding(el, f);
      case 'tre-visita-loja': return HUB_SECTIONS.renderVisitaLoja(el, f);
      case 'adm-upload': return HUB_ADMIN_UPLOAD.render(el);
      case 'adm-cadastros': return HUB_ADMIN_CADASTROS.render(el);
      case 'adm-usuarios': return HUB_ADMIN_USUARIOS.render(el);
    }
  }

  let currentSection = 'dashboard';
  let unidadeMS, departamentoMS;

  function getFilters() {
    return {
      start: $('#f-start').value || '',
      end: $('#f-end').value || '',
      unidade: unidadeMS ? unidadeMS.getSelected() : [],
      departamento: departamentoMS ? departamentoMS.getSelected() : [],
      gestor: $('#f-gestor').value || '',
      colaborador: $('#f-colaborador').value || '',
      trilha: $('#f-trilha').value || '',
      conteudo: $('#f-conteudo').value || ''
    };
  }

  async function renderCurrentSection() {
    $('#page-title').textContent = NAV_TITLES[currentSection] || currentSection;
    if (RECRUIT_SECTIONS.has(currentSection)) {
      const statusEl = $('#data-status');
      const prev = statusEl.textContent;
      statusEl.textContent = 'Atualizando dados de Recrutamento...';
      try { await HUB_RECRUIT.reload(); } catch (err) { statusEl.textContent = 'Atenção: ' + err.message; statusEl.style.color = 'var(--critical)'; }
      finally { if (statusEl.textContent === 'Atualizando dados de Recrutamento...') statusEl.textContent = prev; }
    }
    sectionRenderer(currentSection);
  }
  window.HUB_RENDER_CURRENT = renderCurrentSection;

  function canSee(name) {
    const perm = NAV_PERMISSIONS[name];
    return !perm || P.hasPerm(HUB_USER, perm);
  }

  function goToSection(name) {
    if (!canSee(name)) return;
    currentSection = name;
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.section === name));
    $$('.section').forEach(s => s.classList.remove('active'));
    $('#sec-' + name).classList.add('active');
    const showTwygo = name === 'ind-treinamentos';
    $('#fg-trilha').style.display = showTwygo ? 'flex' : 'none';
    $('#fg-conteudo').style.display = showTwygo ? 'flex' : 'none';
    renderCurrentSection();
  }
  // Exposto pra navegação entre módulos a partir de uma seção (ex.: botão
  // "Abrir no Treinamento e Desenvolvimento" em Recrutamento → Candidatos).
  window.HUB_GOTO_SECTION = goToSection;

  function populateDatalist(inputId, values) {
    const dl = document.getElementById('dl-' + inputId.replace(/^f-/, ''));
    dl.innerHTML = values.map(v => `<option value="${U.escapeHtml(v)}"></option>`).join('');
  }

  function createMultiSelect(key, placeholder) {
    const root = document.getElementById('msel-' + key);
    const btn = document.getElementById('msel-' + key + '-btn');
    const panel = document.getElementById('msel-' + key + '-panel');
    const search = document.getElementById('msel-' + key + '-search');
    const optionsEl = document.getElementById('msel-' + key + '-options');
    let allValues = [];
    const selected = new Set();
    let changeCb = () => {};

    function renderOptions() {
      const q = U.normalizeText(search.value);
      const filtered = allValues.filter(v => !q || U.normalizeText(v).includes(q));
      optionsEl.innerHTML = filtered.length
        ? filtered.map(v => `<label class="msel-opt"><input type="checkbox" value="${U.escapeHtml(v)}"${selected.has(v) ? ' checked' : ''}><span>${U.escapeHtml(v)}</span></label>`).join('')
        : '<div class="msel-empty">Nenhuma opção encontrada.</div>';
    }

    function updateButton() {
      if (!selected.size) { btn.textContent = placeholder; btn.classList.add('placeholder'); }
      else {
        btn.textContent = selected.size === 1 ? Array.from(selected)[0] : `${selected.size} selecionadas`;
        btn.classList.remove('placeholder');
      }
    }

    function open() {
      panel.hidden = false;
      btn.classList.add('active');
      search.value = '';
      renderOptions();
      search.focus();
    }
    function close() {
      panel.hidden = true;
      btn.classList.remove('active');
    }

    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (panel.hidden) open(); else close();
    });
    search.addEventListener('input', renderOptions);
    optionsEl.addEventListener('change', e => {
      if (e.target.type !== 'checkbox') return;
      if (e.target.checked) selected.add(e.target.value); else selected.delete(e.target.value);
      updateButton();
      changeCb();
    });
    root.querySelector('[data-act="all"]').addEventListener('click', () => {
      const q = U.normalizeText(search.value);
      allValues.filter(v => !q || U.normalizeText(v).includes(q)).forEach(v => selected.add(v));
      renderOptions();
      updateButton();
      changeCb();
    });
    root.querySelector('[data-act="clear"]').addEventListener('click', () => {
      selected.clear();
      renderOptions();
      updateButton();
      changeCb();
    });
    document.addEventListener('click', e => { if (!panel.hidden && !root.contains(e.target)) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close(); });

    return {
      setOptions(values) {
        allValues = values;
        for (const s of Array.from(selected)) if (!values.includes(s)) selected.delete(s);
        renderOptions();
        updateButton();
      },
      getSelected() { return Array.from(selected); },
      clear() { selected.clear(); renderOptions(); updateButton(); },
      onChange(cb) { changeCb = cb; }
    };
  }

  // Cada tabela usa nomes de campo diferentes pra unidade/departamento/pessoa
  // (ou nem tem o campo) — este mapa é a base tanto pra montar as opções de
  // filtro quanto pra fazer Departamento/Colaborador reagirem ao que já está
  // selecionado em Unidade (e Departamento, no caso de Colaborador). Só
  // cobre as tabelas de Indicadores — o filtro de unidade/departamento das
  // telas de Recrutamento é resolvido dentro do próprio módulo (vaga.marca).
  function filterSources() {
    return [
      { rows: HUB_DATA.colaboradores || [], u: 'unidade', d: 'departamento', n: 'nome_completo' },
      { rows: HUB_DATA.feedbacks || [], u: 'unidade', d: 'departamento', n: null },
      { rows: HUB_DATA.celebracoes || [], u: 'unidade', d: 'departamento', n: 'colaborador_enviou' },
      { rows: HUB_DATA.one_on_one || [], u: null, d: 'departamento', n: 'liderado' },
      { rows: HUB_DATA.entrevista_pesquisa || [], u: 'unidade', d: 'departamento', n: 'nome' },
      { rows: HUB_DATA.entrevista_solicitacao || [], u: 'unidade', d: 'departamento', n: 'nome' },
      { rows: HUB_DATA.twygo_participantes || [], u: 'unidade', d: 'departamento', n: 'nome_completo' },
      { rows: HUB_DATA.twygo_usuarios || [], u: 'unidade', d: 'departamento', n: 'nome_completo' }
    ];
  }

  // Só quem está Ativo ou Desativado na planilha de Colaboradores — Desligado
  // nunca entra, mesmo que o nome/unidade/departamento apareça em
  // Feedbacks/Twygo/Entrevista de Desligamento etc.
  function activeColaboradores() {
    return (HUB_DATA.colaboradores || []).filter(r => {
      const st = U.normalizeText(r.situacao);
      return st === 'ativo' || st === 'desativado';
    });
  }

  function activeColaboradorNamesSet() {
    const s = new Set();
    for (const r of activeColaboradores()) if (r.nome_completo) s.add(U.normalizeText(r.nome_completo));
    return s;
  }

  function populateFilterOptions() {
    const ativos = activeColaboradores();
    const nomesAtivos = activeColaboradorNamesSet();
    const unidades = U.uniqueSortedNormalized(ativos.map(r => r.unidade));
    const gestores = U.uniqueSortedNormalized(ativos.map(r => r.gestor_direto).filter(n => n && nomesAtivos.has(U.normalizeText(n))));
    const tipos = U.uniqueSortedNormalized((HUB_DATA.twygo_participantes || []).map(r => r.content_type)
      .concat((HUB_DATA.twygo_conteudos || []).map(r => r.tipo)));
    const conteudos = U.uniqueSortedNormalized((HUB_DATA.twygo_participantes || []).map(r => r.content_title)
      .concat((HUB_DATA.twygo_conteudos || []).map(r => r.nome)));

    unidadeMS.setOptions(unidades);
    populateDatalist('f-gestor', gestores);
    populateDatalist('f-trilha', tipos);
    populateDatalist('f-conteudo', conteudos);
    updateDependentFilters();
  }

  function updateDependentFilters() {
    const ativos = activeColaboradores();
    const selUnidades = unidadeMS.getSelected();
    const selDepartamentos = departamentoMS.getSelected();
    const nomesAtivos = activeColaboradorNamesSet();

    const deptosBase = selUnidades.length ? ativos.filter(r => U.matchesAny(r.unidade, selUnidades)) : ativos;
    const deptos = U.uniqueSortedNormalized(deptosBase.map(r => r.departamento));

    const pessoas = [];
    for (const src of filterSources()) {
      for (const r of src.rows) {
        if (selUnidades.length) {
          if (!src.u || !U.matchesAny(r[src.u], selUnidades)) continue;
        }
        if (selDepartamentos.length) {
          if (!src.d || !U.matchesAny(r[src.d], selDepartamentos)) continue;
        }
        if (src.n && r[src.n] && nomesAtivos.has(U.normalizeText(r[src.n]))) pessoas.push(r[src.n]);
      }
    }
    departamentoMS.setOptions(deptos);
    populateDatalist('f-colaborador', U.uniqueSortedNormalized(pessoas));
  }

  function setDefaultDates() {
    $('#f-start').value = '2026-01-01';
    $('#f-end').value = U.todayISO();
  }

  function wireFilterBar() {
    unidadeMS = createMultiSelect('unidade', 'Todas');
    departamentoMS = createMultiSelect('departamento', 'Todos');
    unidadeMS.onChange(() => { updateDependentFilters(); renderCurrentSection(); });
    departamentoMS.onChange(() => { updateDependentFilters(); renderCurrentSection(); });

    ['f-start', 'f-end', 'f-gestor', 'f-colaborador', 'f-trilha', 'f-conteudo']
      .forEach(id => document.getElementById(id).addEventListener('change', renderCurrentSection));
    $('#btn-clear-filters').addEventListener('click', () => {
      ['f-gestor', 'f-colaborador', 'f-trilha', 'f-conteudo'].forEach(id => $('#' + id).value = '');
      unidadeMS.clear();
      departamentoMS.clear();
      setDefaultDates();
      updateDependentFilters();
      renderCurrentSection();
    });
  }

  function wireNav() {
    $$('.nav-item').forEach(item => item.addEventListener('click', () => goToSection(item.dataset.section)));
    wireModuleToggle();
  }

  // Clique no título do módulo (Indicadores/Recrutamento/Treinamento e
  // Desenvolvimento/Administração) oculta/mostra os itens daquele grupo —
  // usa uma classe própria (.sb-collapsed) em vez de mexer no style.display
  // que applyPermissionsToNav() já usa para ocultar por permissão, então os
  // dois controles não se atropelam.
  function wireModuleToggle() {
    $$('.sb-mod-title').forEach(title => {
      title.addEventListener('click', () => {
        const collapsed = title.classList.toggle('collapsed');
        let el = title.nextElementSibling;
        while (el && el.classList.contains('nav-item')) {
          el.classList.toggle('sb-collapsed', collapsed);
          el = el.nextElementSibling;
        }
      });
    });
  }

  // Esconde cada item de menu sem permissão, e o título do módulo inteiro se
  // nenhum item dele sobrou visível — assim o cadastro de acessos granular
  // realmente controla o que cada pessoa enxerga na barra lateral.
  function applyPermissionsToNav() {
    $$('.nav-item[data-section]').forEach(item => {
      item.style.display = canSee(item.dataset.section) ? 'flex' : 'none';
    });
    $$('.sb-mod-title').forEach(title => {
      let el = title.nextElementSibling;
      let anyVisible = false;
      while (el && el.classList.contains('nav-item')) {
        if (el.style.display !== 'none') anyVisible = true;
        el = el.nextElementSibling;
      }
      title.style.display = anyVisible ? 'block' : 'none';
    });
  }

  function firstVisibleSection() {
    const order = ['dashboard'].concat(Object.keys(NAV_PERMISSIONS));
    return order.find(canSee) || 'dashboard';
  }

  async function reloadData(showStatus) {
    const statusEl = $('#data-status');
    statusEl.style.color = '';
    try {
      await HUB_DAL.loadAll((table, i, total, rowsSoFar) => {
        if (showStatus !== false) statusEl.textContent = `Carregando dados... (${i + 1}/${total}: ${table}, ${U.fmtInt(rowsSoFar)} linhas)`;
      });
      const n = Object.values(HUB_DATA).reduce((s, arr) => s + (arr ? arr.length : 0), 0);
      statusEl.textContent = n ? `${U.fmtInt(n)} registros carregados` : 'Nenhum dado carregado ainda';
    } catch (err) {
      statusEl.textContent = 'Atenção: ' + err.message;
      statusEl.style.color = 'var(--critical)';
      statusEl.title = err.message;
    }
    try { await HUB_RECRUIT.reloadMasterLists(); } catch (err) { /* listas mestre do Recrutamento são opcionais no primeiro carregamento */ }
    populateFilterOptions();
    renderCurrentSection();
  }
  window.HUB_RELOAD_DATA = reloadData;

  async function enterApp(profile) {
    window.HUB_USER = profile;
    $('#login-screen').hidden = true;
    $('#app-shell').hidden = false;
    $('#user-name').textContent = profile.nome || profile.email;
    $('#user-avatar').textContent = (profile.nome || profile.email || 'U').charAt(0).toUpperCase();
    $('#user-role').textContent = P.PERFIL_LABELS[profile.perfil] || profile.perfil;
    applyPermissionsToNav();
    setDefaultDates();
    wireFilterBar();
    wireNav();
    goToSection(firstVisibleSection());
    await reloadData();
  }

  async function loadProfileOrFail(authUser) {
    const { data, error } = await sb.from('profiles').select('*').eq('id', authUser.id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('NO_PROFILE');
    return { id: data.id, email: data.email, nome: data.nome, perfil: data.perfil, unidades: data.unidades || [], departamentos: data.departamentos || [], permissoes: data.permissoes || {} };
  }

  function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function doLogin(e) {
    e.preventDefault();
    const btn = $('#login-btn');
    const msg = $('#login-msg');
    msg.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Entrando...';
    const slowHint = setTimeout(() => {
      btn.textContent = 'Ainda entrando... (pode demorar se o projeto Supabase ficou inativo)';
    }, 6000);
    try {
      const email = $('#login-email').value.trim();
      const password = $('#login-pass').value;
      const TIMEOUT_MSG = 'A conexão com o Supabase demorou demais para responder. Se o projeto ficou muito tempo sem uso ele pode estar "acordando" — aguarde meio minuto e tente de novo.';
      const { data, error } = await withTimeout(sb.auth.signInWithPassword({ email, password }), 25000, TIMEOUT_MSG);
      if (error) throw error;
      const profile = await withTimeout(loadProfileOrFail(data.user), 20000, TIMEOUT_MSG);
      await enterApp(profile);
    } catch (err) {
      if (err.message === 'NO_PROFILE') {
        msg.textContent = 'Este login existe no Supabase mas não tem um perfil de acesso cadastrado. Peça para um administrador cadastrá-lo em Administração → Cadastro de Acessos.';
      } else if (/invalid login credentials/i.test(err.message || '')) {
        msg.textContent = 'E-mail ou senha incorretos.';
      } else {
        msg.textContent = err.message || 'Não foi possível entrar. Tente novamente.';
      }
      msg.style.display = 'block';
      await sb.auth.signOut().catch(() => {});
    } finally {
      clearTimeout(slowHint);
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  }

  async function doLogout() {
    await sb.auth.signOut();
    window.location.reload();
  }

  async function bootstrap() {
    if (!window.HUB_SUPABASE_READY) {
      $('#login-btn').disabled = true;
      $('#setup-hint').textContent = 'Supabase ainda não configurado — preencha js/config.js com a URL e a chave anon do seu projeto (veja SETUP.md).';
      return;
    }
    $('#login-form').addEventListener('submit', doLogin);
    $('#btn-logout').addEventListener('click', doLogout);

    const { data } = await sb.auth.getSession();
    if (data && data.session) {
      try {
        const profile = await loadProfileOrFail(data.session.user);
        await enterApp(profile);
      } catch (err) {
        await sb.auth.signOut();
      }
    }
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();
