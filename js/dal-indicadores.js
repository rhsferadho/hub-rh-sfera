// Camada de acesso a dados do módulo Indicadores: busca tudo do Supabase uma
// vez (respeitando a RLS de cada usuário) e mantém em memória — os filtros da
// barra superior são só um "recorte" desses dados em JavaScript, então trocar
// filtro é instantâneo e não gera ida e volta ao banco a cada clique.
//
// As tabelas de Recrutamento (vagas/candidatos/entrevistas) NÃO entram aqui —
// elas mudam com frequência e são recarregadas à parte, sob demanda, por
// dal-recrutamento.js (ver app.js).
(function () {
  const TABLES = [
    'colaboradores', 'feedbacks', 'one_on_one', 'celebracoes',
    'entrevista_pesquisa', 'entrevista_solicitacao',
    'twygo_participantes', 'twygo_usuarios', 'twygo_conteudos'
  ];

  // Nunca deixa HUB_DATA como `undefined` — qualquer código que leia
  // HUB_DATA.colaboradores etc. antes do primeiro carregamento terminar (ou
  // depois de uma tabela falhar) deve achar um array vazio, não quebrar.
  window.HUB_DATA = window.HUB_DATA || {};
  for (const t of TABLES) window.HUB_DATA[t] = window.HUB_DATA[t] || [];

  const PAGE = 1000;
  const BATCH_SIZE = 500;
  const QUERY_TIMEOUT_MS = 30000;

  // fetch() do navegador não tem timeout embutido — se uma request travar
  // (rede instável, projeto Supabase gratuito "acordando" após ficar
  // inativo), sem isso a Promise nunca resolve nem rejeita e a página trava
  // fingindo estar carregando pra sempre, sem erro nenhum.
  function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  // Paginação por id (keyset) em vez de OFFSET: OFFSET fica cada vez mais
  // lento conforme avança nas páginas (o banco tem que pular todas as linhas
  // anteriores a cada request) — numa tabela com dezenas de milhares de
  // linhas (Twygo) isso já demorou o suficiente pra parecer travado. Por id
  // crescente, cada página custa o mesmo, não importa a profundidade.
  async function fetchAll(table, onPage) {
    let all = [];
    let lastId = 0;
    for (;;) {
      const { data, error } = await withTimeout(
        sb.from(table).select('*').gt('id', lastId).order('id', { ascending: true }).limit(PAGE),
        QUERY_TIMEOUT_MS,
        `tempo esgotado buscando "${table}" (conexão lenta ou projeto Supabase inativo)`
      );
      if (error) throw error;
      if (!data.length) break;
      all = all.concat(data);
      lastId = data[data.length - 1].id;
      if (onPage) onPage(all.length);
      if (data.length < PAGE) break;
    }
    return all;
  }

  function isAuthGlitch(msg) {
    return /row-level security|jwt|permission denied/i.test(msg || '');
  }

  async function insertBatch(table, batch) {
    let { error } = await sb.from(table).insert(batch);
    if (error && isAuthGlitch(error.message)) {
      // Sessão pode ter expirado/renovado no meio de um upload longo —
      // garante um token válido e tenta essa mesma leva mais uma vez antes
      // de desistir.
      await sb.auth.refreshSession().catch(() => {});
      await new Promise(r => setTimeout(r, 500));
      ({ error } = await sb.from(table).insert(batch));
    }
    return error;
  }

  async function replaceTable(table, rows, onProgress) {
    await sb.auth.refreshSession().catch(() => {});
    // TRUNCATE via função no banco em vez de DELETE linha a linha — evita
    // estourar o tempo limite em tabelas grandes (ex.: Twygo, 60mil+ linhas).
    const { error: delErr } = await sb.rpc('admin_truncate', { target: table });
    if (delErr) throw new Error('Erro ao limpar dados antigos: ' + delErr.message);
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const error = await insertBatch(table, batch);
      if (error) throw new Error('Erro ao gravar dados (linha ' + i + '): ' + error.message);
      if (onProgress) onProgress(Math.min(i + BATCH_SIZE, rows.length), rows.length);
    }
    window.HUB_DATA = window.HUB_DATA || {};
    window.HUB_DATA[table] = rows;
  }

  async function loadAll(onProgress) {
    window.HUB_DATA = window.HUB_DATA || {};
    const errors = [];
    for (let i = 0; i < TABLES.length; i++) {
      const t = TABLES[i];
      try {
        window.HUB_DATA[t] = await fetchAll(t, rowsSoFar => {
          if (onProgress) onProgress(t, i, TABLES.length, rowsSoFar);
        });
      } catch (err) {
        errors.push(`${t}: ${err.message}`);
        window.HUB_DATA[t] = window.HUB_DATA[t] || [];
      }
    }
    if (errors.length) throw new Error('Algumas tabelas não carregaram — ' + errors.join('; '));
    return window.HUB_DATA;
  }

  async function listProfiles() {
    const { data, error } = await sb.from('profiles').select('*').order('nome');
    if (error) throw error;
    return data;
  }

  async function upsertProfile(profile) {
    const { error } = await sb.from('profiles').upsert(profile);
    if (error) throw error;
  }

  async function deleteProfile(id) {
    const { error } = await sb.from('profiles').delete().eq('id', id);
    if (error) throw error;
  }

  window.HUB_DAL = { TABLES, loadAll, replaceTable, listProfiles, upsertProfile, deleteProfile };
})();
