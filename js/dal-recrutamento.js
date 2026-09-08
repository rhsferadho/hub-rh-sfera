// Camada de acesso a dados do módulo Recrutamento: vagas/candidatos/
// entrevistas/histórico/solicitações + listas mestre. Diferente de
// dal-indicadores.js (carrega tudo uma vez no login e nunca mais busca),
// aqui os dados mudam com frequência — HUB_RECRUIT.reload() é chamado pelo
// app.js toda vez que o usuário entra em QUALQUER tela do módulo
// Recrutamento (indicador ao vivo ou operacional), o que cobre "tempo real,
// de forma automática" sem precisar de upload nem de um socket persistente.
//
// As linhas em JS usam camelCase (mesmo vocabulário do Sfera Recruiter
// original); o banco usa snake_case. A tradução é genérica (não uma tabela
// de mapeamento por campo) — funciona porque todo nome de coluna aqui segue
// o padrão direto camelCase<->snake_case, sem abreviações especiais.
(function () {
  // `onboarding` entra aqui (não é uma tabela de "listas mestre") porque
  // muda com a mesma frequência que vagas/candidatos/entrevistas e precisa
  // recarregar toda vez que se entra em qualquer tela do módulo Recrutamento
  // OU do módulo Treinamento e Desenvolvimento — ver RECRUIT_SECTIONS em app.js.
  const RECRUIT_TABLES = ['vagas', 'candidatos', 'entrevistas', 'onboarding', 'visitas_loja', 'pareceres_gestor', 'entrevistas_desligamento'];
  const MASTER_TABLES = ['marcas', 'unidades', 'cargos', 'etapas', 'fontes_captacao', 'portais', 'niveis_vaga', 'recrutadores', 'recrutamento_departamentos'];

  window.HUB_RECRUIT_DATA = window.HUB_RECRUIT_DATA || {};
  for (const t of RECRUIT_TABLES.concat(MASTER_TABLES)) window.HUB_RECRUIT_DATA[t] = window.HUB_RECRUIT_DATA[t] || [];

  function camelToSnake(s) { return s.replace(/[A-Z]/g, m => '_' + m.toLowerCase()); }
  function snakeToCamel(s) { return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase()); }

  // Normaliza string vazia para null: os formulários deixam datas/números
  // opcionais como '' quando o campo não foi preenchido (valor padrão de
  // <input>), mas o Postgres rejeita '' como valor de coluna date/numeric/int
  // ("invalid input syntax for type date") — só null é aceito pra "sem
  // valor". Não mexe em arrays (portaisAtivos: [] etc.), só em string vazia.
  function toSnakeRow(obj) {
    const out = {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      out[camelToSnake(k)] = v === '' ? null : v;
    }
    return out;
  }
  function toCamelRow(obj) {
    const out = {};
    for (const k of Object.keys(obj)) out[snakeToCamel(k)] = obj[k];
    return out;
  }

  const QUERY_TIMEOUT_MS = 30000;
  function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function fetchAll(table) {
    const { data, error } = await withTimeout(
      sb.from(table).select('*'),
      QUERY_TIMEOUT_MS,
      `tempo esgotado buscando "${table}" (conexão lenta ou projeto Supabase inativo)`
    );
    if (error) throw error;
    return (data || []).map(toCamelRow);
  }

  // Recarrega as 3 tabelas operacionais (vagas/candidatos/entrevistas) — é
  // isso que faz o indicador de Recrutamento e as telas operacionais
  // refletirem qualquer mudança feita por qualquer pessoa, sem upload.
  async function reload() {
    const errors = [];
    for (const t of RECRUIT_TABLES) {
      try { window.HUB_RECRUIT_DATA[t] = await fetchAll(t); }
      catch (err) { errors.push(`${t}: ${err.message}`); }
    }
    if (errors.length) throw new Error('Não consegui atualizar os dados do Recrutamento — ' + errors.join('; '));
    return window.HUB_RECRUIT_DATA;
  }

  // Listas mestre mudam raramente — carregadas uma vez (como os dados do
  // módulo Indicadores) e recarregadas manualmente depois de editar em
  // Administração → Cadastros do Recrutamento.
  async function reloadMasterLists() {
    for (const t of MASTER_TABLES) {
      const { data, error } = await sb.from(t).select('*').order('nome');
      if (error) throw error;
      window.HUB_RECRUIT_DATA[t] = (data || []).map(toCamelRow);
    }
    return window.HUB_RECRUIT_DATA;
  }

  function activeNames(table) {
    return (window.HUB_RECRUIT_DATA[table] || []).filter(r => r.ativo !== false).map(r => r.nome);
  }

  async function insertRow(table, rowCamel) {
    const { data, error } = await sb.from(table).insert(toSnakeRow(rowCamel)).select().single();
    if (error) throw error;
    return toCamelRow(data);
  }

  async function updateRow(table, id, rowCamel) {
    const { data, error } = await sb.from(table).update(toSnakeRow(rowCamel)).eq('id', id).select().single();
    if (error) throw error;
    return toCamelRow(data);
  }

  async function deleteRow(table, id) {
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) throw error;
  }

  async function upsertMaster(table, rowCamel) {
    const { error } = await sb.from(table).upsert(toSnakeRow(rowCamel));
    if (error) throw error;
  }

  // Log de auditoria (tela Histórico) — chamado pelas telas operacionais a
  // cada ação relevante sobre uma vaga.
  async function logAcao(entry) {
    const { error } = await sb.from('historico').insert(toSnakeRow(Object.assign({ usuario: (HUB_USER && (HUB_USER.nome || HUB_USER.email)) || 'Desconhecido' }, entry)));
    if (error) throw error;
  }

  async function listHistorico() {
    const { data, error } = await sb.from('historico').select('*').order('timestamp', { ascending: false }).limit(1000);
    if (error) throw error;
    return (data || []).map(toCamelRow);
  }

  async function listSolicitacoes() {
    const { data, error } = await sb.from('solicitacoes').select('*').order('data_solicitacao', { ascending: false });
    if (error) throw error;
    return (data || []).map(toCamelRow);
  }

  async function criarSolicitacao(entry) {
    const { error } = await sb.from('solicitacoes').insert(toSnakeRow(Object.assign({
      solicitante: (HUB_USER && (HUB_USER.nome || HUB_USER.email)) || 'Desconhecido',
      perfilSolicitante: HUB_USER && HUB_USER.perfil,
      status: 'Pendente'
    }, entry)));
    if (error) throw error;
  }

  async function decidirSolicitacao(id, status, observacao) {
    const { error } = await sb.from('solicitacoes').update(toSnakeRow({
      status,
      aprovadoPor: (HUB_USER && (HUB_USER.nome || HUB_USER.email)) || 'Desconhecido',
      dataDecisao: new Date().toISOString(),
      observacaoAdmin: observacao || null
    })).eq('id', id);
    if (error) throw error;
  }

  window.HUB_RECRUIT = {
    RECRUIT_TABLES, MASTER_TABLES,
    reload, reloadMasterLists, activeNames,
    insertRow, updateRow, deleteRow, upsertMaster,
    logAcao, listHistorico,
    listSolicitacoes, criarSolicitacao, decidirSolicitacao,
    toSnakeRow, toCamelRow
  };
})();
