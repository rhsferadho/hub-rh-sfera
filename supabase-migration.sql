-- ============================================================================
-- HUB SFERA — schema completo (Indicadores + Recrutamento, base única)
-- Execute este script inteiro, uma vez, no SQL Editor do seu projeto Supabase
-- (https://supabase.com/dashboard/project/_/sql/new)
--
-- Depois de rodar este script, siga o SETUP.md para criar o primeiro usuário
-- administrador (passo obrigatório — sem ele ninguém consegue entrar no app).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PERFIS DE ACESSO (perfil/rótulo + unidades/departamentos liberados +
--    permissões granulares por checkbox — ver js/permissions.js)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nome text not null,
  perfil text not null check (perfil in ('admin','gestor','rh')),
  unidades text[] not null default '{}',
  departamentos text[] not null default '{}',
  permissoes jsonb not null default '{}',
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Um registro por usuário do hub. unidades/departamentos vazios = acesso a todas as linhas (dentro do que "permissoes" já libera). "perfil" é só rótulo/preset usado ao cadastrar — quem manda de verdade é "permissoes".';
comment on column public.profiles.permissoes is 'Mapa {"indicadores.headcount": true, "recrutamento.vagas": true, ...} — chaves definidas em js/permissions.js (HUB_PERMISSIONS.CATALOG). Lido por has_permission(perm) nas policies abaixo.';

-- ----------------------------------------------------------------------------
-- 2. FUNÇÕES AUXILIARES DE VISIBILIDADE (usadas pelas policies de RLS)
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER aqui é necessário, não opcional: a policy profiles_select
-- (mais abaixo) chama is_admin(), que chama current_role_v(), que lê a
-- própria tabela profiles — sem SECURITY DEFINER essa leitura fica sujeita
-- de novo à policy profiles_select, que chama is_admin() de novo, que lê
-- profiles de novo... recursão infinita ("stack depth limit exceeded",
-- login trava). SECURITY DEFINER faz essa leitura interna rodar sem
-- reavaliar RLS, quebrando o ciclo.
create or replace function public.current_role_v()
returns text
language sql stable security definer set search_path = public as $$
  select perfil from public.profiles where id = auth.uid()
$$;

create or replace function public.current_unidades()
returns text[]
language sql stable security definer set search_path = public as $$
  select unidades from public.profiles where id = auth.uid()
$$;

create or replace function public.current_departamentos()
returns text[]
language sql stable security definer set search_path = public as $$
  select departamentos from public.profiles where id = auth.uid()
$$;

-- Checagem de uma permissão granular do catálogo (ex.: 'recrutamento.vagas').
-- perfil='admin' sempre passa, mesmo que "permissoes" esteja incompleto —
-- rede de segurança para nunca travar o próprio administrador fora do hub.
create or replace function public.has_permission(perm text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select perfil = 'admin' or coalesce((permissoes ->> perm)::boolean, false)
     from public.profiles where id = auth.uid()),
    false
  )
$$;

-- Regra de visibilidade por linha: admin e rh veem tudo. Gestor só vê linhas
-- cuja unidade/departamento estejam na lista liberada para ele (lista vazia =
-- sem restrição naquele eixo). Reaproveitada tanto pelas tabelas de
-- Indicadores (row_unidade = colaboradores.unidade, etc.) quanto pelas de
-- Recrutamento (row_unidade = vagas.marca — ver nota na seção 4 sobre por
-- que "marca" foi escolhida como campo de escopo ali, e não a coluna
-- "unidade" do Recrutamento nem necessariamente o mesmo domínio de valores
-- do "unidade" usado no módulo Indicadores).
--
-- unidade nula é sempre visível porque algumas tabelas (ex.: 1 on 1) nunca
-- têm esse campo por natureza da planilha de origem — não tem o que restringir.
-- departamento nulo, ao contrário, é tratado como NÃO visível quando o gestor
-- tem departamentos específicos liberados — melhor esconder do que vazar.
create or replace function public.can_see(row_unidade text, row_departamento text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p.perfil in ('admin','rh') then true
    when p.perfil = 'gestor' then
      (
        coalesce(array_length(p.unidades, 1), 0) = 0
        or row_unidade is null
        or lower(trim(row_unidade)) in (select lower(trim(u)) from unnest(p.unidades) as u)
      )
      and
      (
        coalesce(array_length(p.departamentos, 1), 0) = 0
        or (row_departamento is not null and lower(trim(row_departamento)) in (select lower(trim(d)) from unnest(p.departamentos) as d))
      )
    else false
  end
  from (select perfil, unidades, departamentos from public.profiles where id = auth.uid()) p
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_role_v() = 'admin'
$$;

-- ----------------------------------------------------------------------------
-- 3. TABELAS DO MÓDULO INDICADORES (uma por planilha/menu — alimentadas por
--    upload, sem mudança de schema em relação ao Hub de Indicadores original)
-- ----------------------------------------------------------------------------

-- 1. Colaboradores.xlsx (aba "Headcount")
create table if not exists public.colaboradores (
  id bigserial primary key,
  external_id text unique,
  nome text,
  nome_completo text,
  matricula text,
  email text,
  cpf text,
  cargo text,
  cargo_visivel text,
  unidade text,
  departamento text,
  grupos text,
  papel text,
  gestor_direto text,
  gestor_email text,
  etnia text,
  sexo text,
  genero text,
  data_nascimento date,
  data_admissao date,
  data_cadastro date,
  situacao text,
  ultimo_acesso date,
  origem_cadastro text,
  participa_gamificacao text,
  desligamento_tipo text,
  desligamento_motivo text,
  ultimo_dia_trabalhado date,
  idioma text,
  updated_at timestamptz not null default now()
);
create index if not exists colaboradores_unidade_idx on public.colaboradores (unidade);
create index if not exists colaboradores_departamento_idx on public.colaboradores (departamento);
create index if not exists colaboradores_situacao_idx on public.colaboradores (situacao);
create index if not exists colaboradores_nome_completo_idx on public.colaboradores (nome_completo);

-- 4. Feedbacks.xlsx (aba "Feedbacks")
create table if not exists public.feedbacks (
  id bigserial primary key,
  de text,
  para text,
  unidade text,
  departamento text,
  cargo text,
  anonimo text,
  template text,
  feedback text,
  avaliacao text,
  data date,
  data_visualizacao date,
  respostas jsonb not null default '{}'::jsonb
);
create index if not exists feedbacks_unidade_idx on public.feedbacks (unidade);
create index if not exists feedbacks_departamento_idx on public.feedbacks (departamento);
create index if not exists feedbacks_data_idx on public.feedbacks (data);

-- 5. 1 on 1.xlsx (aba "Worksheet")
create table if not exists public.one_on_one (
  id bigserial primary key,
  lider text,
  lider_email text,
  lider_departamento text,
  lider_papel text,
  liderado text,
  liderado_email text,
  liderado_matricula text,
  unidade text,
  departamento text,
  liderado_papel text,
  relacao text,
  categoria text,
  data_agendada date,
  data_realizada date,
  status text,
  topicos_lider text,
  topicos_liderado text,
  anotacoes_lider text,
  anotacoes_liderado text,
  acoes_ativas_lider text,
  acoes_concluidas_lider text,
  acoes_ativas_liderado text,
  acoes_concluidas_liderado text
);
create index if not exists one_on_one_departamento_idx on public.one_on_one (departamento);
create index if not exists one_on_one_data_realizada_idx on public.one_on_one (data_realizada);
create index if not exists one_on_one_lider_idx on public.one_on_one (lider);

-- 20. Celebrações.xlsx (aba "Worksheet")
create table if not exists public.celebracoes (
  id bigserial primary key,
  codigo text,
  colaborador_enviou text,
  unidade text,
  departamento text,
  papel text,
  cargo_enviou text,
  colaboradores_receberam text,
  cargo_recebeu text,
  mensagem text,
  curtidas int,
  comentarios int,
  data date
);
create index if not exists celebracoes_unidade_idx on public.celebracoes (unidade);
create index if not exists celebracoes_departamento_idx on public.celebracoes (departamento);
create index if not exists celebracoes_data_idx on public.celebracoes (data);

-- 34. Nova Entrevista de Desligamento.xlsx (aba "Pesquisa de Desligamento")
create table if not exists public.entrevista_pesquisa (
  id bigserial primary key,
  planilha_id text,
  data_inicio date,
  data_conclusao date,
  nome text,
  email text,
  telefone text,
  unidade text,
  departamento text,
  motivo_desligamento text,
  submotivo_desligamento text,
  data_desligamento date,
  trabalharia_novamente text,
  nps int,
  respostas jsonb not null default '{}'::jsonb
);
create index if not exists entrevista_pesquisa_unidade_idx on public.entrevista_pesquisa (unidade);
create index if not exists entrevista_pesquisa_departamento_idx on public.entrevista_pesquisa (departamento);
create index if not exists entrevista_pesquisa_data_idx on public.entrevista_pesquisa (data_desligamento);

-- 34. Nova Entrevista de Desligamento.xlsx (aba "Solicitação de Desligamento")
create table if not exists public.entrevista_solicitacao (
  id bigserial primary key,
  planilha_id text,
  data_solicitacao date,
  nome_solicitante text,
  nome text,
  cargo text,
  unidade text,
  departamento text,
  data_admissao date,
  data_demissao date,
  tempo_trabalho int,
  tipo text,
  tipo_desligamento text,
  motivo_desligamento text,
  status_feedz text,
  status_entrevista text,
  observacoes text
);
create index if not exists entrevista_solicitacao_unidade_idx on public.entrevista_solicitacao (unidade);
create index if not exists entrevista_solicitacao_departamento_idx on public.entrevista_solicitacao (departamento);
create index if not exists entrevista_solicitacao_data_idx on public.entrevista_solicitacao (data_demissao);

-- 27. Twygo.xlsx (participantes/matrículas — nível inscrição, um por curso por pessoa)
create table if not exists public.twygo_participantes (
  id bigserial primary key,
  content_id text,
  content_title text,
  content_type text,
  nome_completo text,
  email text,
  unidade text,
  departamento text,
  cargo text,
  data_inscricao date,
  ultimo_acesso date,
  situacao_inscricao text,
  situacao text,
  situacao_ambiente text,
  progresso numeric,
  nota numeric,
  frequencia numeric,
  pontuacao numeric,
  carga_horaria numeric,
  emitido_em date
);
create index if not exists twygo_participantes_unidade_idx on public.twygo_participantes (unidade);
create index if not exists twygo_participantes_departamento_idx on public.twygo_participantes (departamento);
create index if not exists twygo_participantes_nome_idx on public.twygo_participantes (nome_completo);
create index if not exists twygo_participantes_content_idx on public.twygo_participantes (content_title);

-- 27.1. Twygo usuários.xlsx (nível pessoa — pontuação e progresso geral)
create table if not exists public.twygo_usuarios (
  id bigserial primary key,
  twygo_id text,
  nome_completo text,
  email text,
  cpf text,
  ultimo_acesso date,
  perfil text,
  pontuacao numeric,
  progresso numeric,
  situacao text,
  registrado_em date,
  cargo text,
  unidade text,
  departamento text
);
create index if not exists twygo_usuarios_unidade_idx on public.twygo_usuarios (unidade);
create index if not exists twygo_usuarios_departamento_idx on public.twygo_usuarios (departamento);
create index if not exists twygo_usuarios_nome_idx on public.twygo_usuarios (nome_completo);

-- 27.1. Twygo conteúdos.xlsx (nível curso/trilha — inscrições e progresso médio)
create table if not exists public.twygo_conteudos (
  id bigserial primary key,
  codigo_conteudo text,
  tipo text,
  nome text,
  situacao text,
  inscricoes int,
  carga_horaria numeric,
  progresso numeric,
  categorias text,
  data_inicio date,
  data_termino date,
  criado_em date,
  publicado_em date
);
create index if not exists twygo_conteudos_nome_idx on public.twygo_conteudos (nome);

-- ----------------------------------------------------------------------------
-- 4. TABELAS DO MÓDULO RECRUTAMENTO (operacionais — escritas pelas telas do
--    hub, não por upload; são a MESMA fonte usada pelo indicador ao vivo
--    "Indicadores → Recrutamento")
--
-- NOTA IMPORTANTE sobre unidade/departamento: o Recrutamento tem DOIS campos
-- de escopo geográfico/organizacional que NÃO são a mesma coisa — "marca"
-- (a franquia/bandeira, ex.: "O Boticário", "Hering" — só 6 valores) e
-- "unidade" (um recorte mais granular usado só dentro do Recrutamento, ex.
-- "Boticário - Interior de MG" — 14 valores). Nenhum dos dois é
-- necessariamente igual, valor a valor, ao "unidade" já usado pelo módulo
-- Indicadores (colaboradores.unidade etc.) — não tive como confirmar isso
-- com os dados reais das duas planilhas/sistemas.
--
-- Escolha feita aqui: can_see() usa "marca" (presente nas 3 tabelas —
-- vagas/candidatos/entrevistas — sem precisar de nenhuma coluna nova) como o
-- eixo de restrição por unidade/departamento de um gestor dentro do
-- Recrutamento. Isso é INDEPENDENTE do escopo de "unidade" usado no módulo
-- Indicadores — um gestor restrito precisa ter os nomes de MARCA (ex.
-- "Hering", "O Boticário") na lista `profiles.unidades` para enxergar dados
-- de Recrutamento, além de (se usar Indicadores também) os nomes de
-- "unidade" que aparecem nas planilhas de RH. Vale revisar com o time depois
-- de ver dados reais dos dois sistemas lado a lado — se fizer mais sentido
-- trocar para a coluna "unidade" do Recrutamento (ou reconciliar as duas
-- listas), é só trocar `marca` por `unidade` nas 3 policies "_select" abaixo.
-- ----------------------------------------------------------------------------

create table if not exists public.vagas (
  id text primary key,
  data_abertura date,
  marca text,
  unidade text,
  departamento text,
  nivel_vaga text,
  solicitante text,
  cargo text,
  sigilosa text,
  tipo_vaga text,
  responsavel text,
  status text,
  tipo_movimentacao text,
  motivo_aumento text,
  pessoa_substituida text,
  tipo_recrutamento text,
  etapa text,
  motivo_sla text,
  motivo_sla_text text,
  data_congelamento date,
  data_retorno date,
  data_cancelamento date,
  finalistas text,
  contratado text,
  fit_pct numeric,
  data_fechamento date,
  data_inicio date,
  data_prevista_admissao date,
  ultima_divulgacao text,
  data_ultima_divulgacao date,
  fonte text,
  quem_indicou text,
  observacoes text,
  portais_ativos text[] not null default '{}',
  fontes_divulgadas text[] not null default '{}',
  num_inscricoes int,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists vagas_marca_idx on public.vagas (marca);
create index if not exists vagas_departamento_idx on public.vagas (departamento);
create index if not exists vagas_status_idx on public.vagas (status);
create index if not exists vagas_responsavel_idx on public.vagas (responsavel);
create index if not exists vagas_data_abertura_idx on public.vagas (data_abertura);

create table if not exists public.candidatos (
  id text primary key,
  vaga_id text references public.vagas(id) on delete set null,
  nome text,
  email text,
  contato text,
  linkedin text,
  cargo text,
  marca text,
  departamento text,
  nivel_vaga text,
  entrevistado_por text,
  data_entrevista date,
  horario_entrevista text,
  fit_pct numeric,
  etapa_rh_status text,
  resultado_rh text,
  data_contato_rh date,
  data_agendada_rh date,
  motivo_reprovacao text,
  etapa_analise_status text,
  resultado_analise text,
  data_contato_analise date,
  data_agendada_analise date,
  motivo_analise text,
  data_analise date,
  etapa_checagem_status text,
  resultado_checagem text,
  data_contato_checagem date,
  data_agendada_checagem date,
  motivo_checagem text,
  data_checagem date,
  teste_pratico text,
  data_teste_pratico date,
  etapa_gestor_status text,
  resultado_gestor text,
  data_contato_gestor date,
  data_agendada_gestor date,
  entrevista_gestor text,
  data_entrevista_gestor date,
  horario_gestor text,
  entrevista_diretoria text,
  data_entrevista_diretoria date,
  resultado_final text,
  resultado text,
  data_fechamento date,
  fonte_captacao text,
  data_admissao date,
  observacoes text,
  tags text[] not null default '{}',
  atualizado_por text,
  segmento_ultima_empresa text,
  genero text,
  faixa_etaria text,
  distancia_km numeric,
  escolaridade text,
  estuda text,
  turno_estudo text,
  cargos_possiveis text[] not null default '{}',
  link_pandape text,
  estado_civil text,
  tem_filhos text,
  quantidade_filhos int,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists candidatos_vaga_id_idx on public.candidatos (vaga_id);
create index if not exists candidatos_marca_idx on public.candidatos (marca);
create index if not exists candidatos_departamento_idx on public.candidatos (departamento);
create index if not exists candidatos_resultado_idx on public.candidatos (resultado);
create index if not exists candidatos_nome_idx on public.candidatos (nome);

create table if not exists public.entrevistas (
  id uuid primary key default gen_random_uuid(),
  candidato_id text references public.candidatos(id) on delete cascade,
  candidato_nome text,
  vaga_id text references public.vagas(id) on delete set null,
  cargo text,
  marca text,
  recrutador text,
  etapa text,
  tipo_entrevista text,
  data date,
  horario text,
  duracao text,
  status text,
  tipo_processo text,
  nivel_vaga text,
  observacao text,
  criado_em timestamptz not null default now()
);
create index if not exists entrevistas_candidato_id_idx on public.entrevistas (candidato_id);
create index if not exists entrevistas_vaga_id_idx on public.entrevistas (vaga_id);
create index if not exists entrevistas_marca_idx on public.entrevistas (marca);
create index if not exists entrevistas_data_idx on public.entrevistas (data);

-- Módulo Treinamento e Desenvolvimento → Onboarding. Um registro é criado
-- automaticamente (nunca à mão) quando alguém envia, na tela Candidatos, um
-- candidato com resultado_final='Aprovado' cuja vaga já está 'Finalizada' —
-- ver js/sections/candidatos.js (enviarParaOnboarding). Do agendamento até a
-- avaliação de treinamento (rubrica de 16 itens, escala 1-5).
create table if not exists public.onboarding (
  id uuid primary key default gen_random_uuid(),
  candidato_id text references public.candidatos(id) on delete set null,
  candidato_nome text,
  vaga_id text references public.vagas(id) on delete set null,
  cargo text,
  marca text,
  departamento text,
  unidade text,
  nivel_vaga text,
  data_prevista_admissao date,
  status text not null default 'Pendente',
  motivo_nao_realizado text,
  data_onboarding date,
  local text,
  quantidade_passagens int,
  tipo_transporte text,
  valor_total_transporte numeric,
  -- Rubrica de avaliação do treinamento (escala 1-5) — grupos: Comportamento
  -- e Postura, Aspectos de Atendimento, Alinhamento com a Cultura
  -- Organizacional, Engajamento/Participação/Interesse.
  pontualidade int,
  postura_profissional int,
  respeito_interpessoal int,
  controle_emocional int,
  comunicacao_cliente int,
  conhecimento_tecnico int,
  simulacao_atendimento int,
  resolucao_problemas int,
  identificacao_valores int,
  aderencia_politicas int,
  postura_trabalho_equipe int,
  participacao_ativa int,
  interesse_conteudo int,
  proatividade int,
  absorcao_conteudo int,
  receptividade_feedback int,
  aptidao_funcao text,
  nota_geral numeric,
  pontos_fortes text,
  pontos_desenvolvimento text,
  plano_acao text,
  observacoes_treinador text,
  nome_treinador text,
  data_treinamento date,
  avaliacao_preenchida boolean not null default false,
  enviado_por text,
  enviado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists onboarding_candidato_id_idx on public.onboarding (candidato_id);
create index if not exists onboarding_vaga_id_idx on public.onboarding (vaga_id);
create index if not exists onboarding_marca_idx on public.onboarding (marca);
create index if not exists onboarding_status_idx on public.onboarding (status);

create table if not exists public.historico (
  id bigserial primary key,
  "timestamp" timestamptz not null default now(),
  acao text,
  vaga_id text,
  campo text,
  valor_anterior text,
  valor_novo text,
  detalhes text,
  usuario text
);
create index if not exists historico_vaga_id_idx on public.historico (vaga_id);
create index if not exists historico_timestamp_idx on public.historico ("timestamp");

create table if not exists public.solicitacoes (
  id uuid primary key default gen_random_uuid(),
  tipo text,
  payload jsonb not null default '{}'::jsonb,
  descricao text,
  solicitante text,
  perfil_solicitante text,
  data_solicitacao timestamptz not null default now(),
  status text not null default 'Pendente',
  aprovado_por text,
  data_decisao timestamptz,
  observacao_admin text
);
create index if not exists solicitacoes_status_idx on public.solicitacoes (status);

-- Listas mestre do Recrutamento (dropdowns) — CRUD em Administração →
-- Cadastros do Recrutamento.
create table if not exists public.marcas (id bigserial primary key, nome text not null, ativo boolean not null default true);
create table if not exists public.unidades (id bigserial primary key, nome text not null, ativo boolean not null default true);
create table if not exists public.cargos (id bigserial primary key, nome text not null, ativo boolean not null default true);
create table if not exists public.etapas (id bigserial primary key, nome text not null, ativo boolean not null default true);
create table if not exists public.fontes_captacao (id bigserial primary key, nome text not null, ativo boolean not null default true);
create table if not exists public.portais (id bigserial primary key, nome text not null, ativo boolean not null default true);
create table if not exists public.niveis_vaga (id bigserial primary key, nome text not null, ativo boolean not null default true);
create table if not exists public.recrutadores (id bigserial primary key, nome text not null, ativo boolean not null default true);
create table if not exists public.recrutamento_departamentos (id bigserial primary key, nome text not null, marca text, ativo boolean not null default true);

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.colaboradores enable row level security;
alter table public.feedbacks enable row level security;
alter table public.one_on_one enable row level security;
alter table public.celebracoes enable row level security;
alter table public.entrevista_pesquisa enable row level security;
alter table public.entrevista_solicitacao enable row level security;
alter table public.twygo_participantes enable row level security;
alter table public.twygo_usuarios enable row level security;
alter table public.twygo_conteudos enable row level security;
alter table public.vagas enable row level security;
alter table public.candidatos enable row level security;
alter table public.entrevistas enable row level security;
alter table public.onboarding enable row level security;
alter table public.historico enable row level security;
alter table public.solicitacoes enable row level security;
alter table public.marcas enable row level security;
alter table public.unidades enable row level security;
alter table public.cargos enable row level security;
alter table public.etapas enable row level security;
alter table public.fontes_captacao enable row level security;
alter table public.portais enable row level security;
alter table public.niveis_vaga enable row level security;
alter table public.recrutadores enable row level security;
alter table public.recrutamento_departamentos enable row level security;

-- profiles: cada usuário lê o próprio registro; admin.usuarios lê/escreve todos.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.has_permission('admin.usuarios'));

drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for all
  using (public.has_permission('admin.usuarios')) with check (public.has_permission('admin.usuarios'));

-- tabelas de Indicadores com unidade/departamento: leitura conforme
-- can_see(); escrita (upload) só quem tem admin.upload.
do $$
declare
  t text;
begin
  foreach t in array array[
    'colaboradores','feedbacks','one_on_one','celebracoes',
    'entrevista_pesquisa','entrevista_solicitacao',
    'twygo_participantes','twygo_usuarios'
  ]
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select using (public.can_see(unidade, departamento))',
      t, t
    );
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all using (public.has_permission(''admin.upload'')) with check (public.has_permission(''admin.upload''))',
      t, t
    );
  end loop;
end $$;

-- twygo_conteudos: catálogo de cursos, não tem unidade/departamento (não é
-- ligado a uma pessoa) — visível para qualquer usuário logado; escrita via admin.upload.
drop policy if exists twygo_conteudos_select on public.twygo_conteudos;
create policy twygo_conteudos_select on public.twygo_conteudos for select
  using (auth.uid() is not null);

drop policy if exists twygo_conteudos_write on public.twygo_conteudos;
create policy twygo_conteudos_write on public.twygo_conteudos for all
  using (public.has_permission('admin.upload')) with check (public.has_permission('admin.upload'));

-- vagas/candidatos/entrevistas: leitura exige (a) alguma permissão
-- relacionada ao Recrutamento E (b) escopo de unidade/departamento
-- (can_see, usando a coluna "marca" como eixo de escopo — ver nota na seção 4).
-- Escrita: cada tabela pede a permissão específica da tela que a edita.
drop policy if exists vagas_select on public.vagas;
create policy vagas_select on public.vagas for select
  using (
    public.can_see(marca, departamento)
    and (
      public.has_permission('recrutamento.dashboard') or public.has_permission('indicadores.recrutamento')
      or public.has_permission('recrutamento.vagas') or public.has_permission('recrutamento.candidatos')
      or public.has_permission('recrutamento.agenda') or public.has_permission('recrutamento.banco_talentos')
      or public.has_permission('recrutamento.aprovacoes') or public.has_permission('recrutamento.historico')
    )
  );
drop policy if exists vagas_write on public.vagas;
create policy vagas_write on public.vagas for all
  using (public.has_permission('recrutamento.vagas')) with check (public.has_permission('recrutamento.vagas'));

drop policy if exists candidatos_select on public.candidatos;
create policy candidatos_select on public.candidatos for select
  using (
    public.can_see(marca, departamento)
    and (
      public.has_permission('recrutamento.dashboard') or public.has_permission('indicadores.recrutamento')
      or public.has_permission('recrutamento.vagas') or public.has_permission('recrutamento.candidatos')
      or public.has_permission('recrutamento.agenda') or public.has_permission('recrutamento.banco_talentos')
      or public.has_permission('recrutamento.aprovacoes') or public.has_permission('recrutamento.historico')
    )
  );
drop policy if exists candidatos_write on public.candidatos;
create policy candidatos_write on public.candidatos for all
  using (public.has_permission('recrutamento.candidatos')) with check (public.has_permission('recrutamento.candidatos'));

drop policy if exists entrevistas_select on public.entrevistas;
create policy entrevistas_select on public.entrevistas for select
  using (
    public.can_see(marca, null)
    and (
      public.has_permission('recrutamento.dashboard') or public.has_permission('indicadores.recrutamento')
      or public.has_permission('recrutamento.agenda') or public.has_permission('recrutamento.candidatos')
    )
  );
drop policy if exists entrevistas_write on public.entrevistas;
create policy entrevistas_write on public.entrevistas for all
  using (public.has_permission('recrutamento.agenda') or public.has_permission('recrutamento.candidatos'))
  with check (public.has_permission('recrutamento.agenda') or public.has_permission('recrutamento.candidatos'));

-- onboarding: leitura para quem administra o módulo (treinamento_dev.onboarding)
-- OU para quem mexe em candidatos/vagas (precisam ver o badge "já enviado" /
-- propagar a data prevista de admissão). Criação (insert) só acontece a
-- partir da tela Candidatos — por isso pede recrutamento.candidatos OU
-- treinamento_dev.onboarding. Edição do registro em si (status, avaliação)
-- é do time de treinamento; a única escrita que vem de Recrutamento depois
-- da criação é a sincronização de data_prevista_admissao a partir da vaga,
-- por isso recrutamento.vagas também entra no update.
drop policy if exists onboarding_select on public.onboarding;
create policy onboarding_select on public.onboarding for select
  using (
    public.can_see(marca, departamento)
    and (
      public.has_permission('treinamento_dev.onboarding')
      or public.has_permission('recrutamento.candidatos')
      or public.has_permission('recrutamento.vagas')
    )
  );
drop policy if exists onboarding_insert on public.onboarding;
create policy onboarding_insert on public.onboarding for insert
  with check (public.has_permission('recrutamento.candidatos') or public.has_permission('treinamento_dev.onboarding'));
drop policy if exists onboarding_update on public.onboarding;
create policy onboarding_update on public.onboarding for update
  using (public.has_permission('treinamento_dev.onboarding') or public.has_permission('recrutamento.vagas'))
  with check (public.has_permission('treinamento_dev.onboarding') or public.has_permission('recrutamento.vagas'));

-- historico: leitura via recrutamento.historico; escrita (log automático de
-- auditoria) liberada a qualquer usuário com alguma permissão de Recrutamento.
drop policy if exists historico_select on public.historico;
create policy historico_select on public.historico for select
  using (public.has_permission('recrutamento.historico'));
drop policy if exists historico_write on public.historico;
create policy historico_write on public.historico for insert
  with check (
    public.has_permission('recrutamento.vagas') or public.has_permission('recrutamento.candidatos')
    or public.has_permission('recrutamento.agenda') or public.has_permission('recrutamento.aprovacoes')
  );

-- solicitacoes: aprovar/rejeitar (update) e ver tudo (select) exige
-- recrutamento.aprovacoes; qualquer usuário de Recrutamento pode criar
-- (insert) uma solicitação da própria ação.
drop policy if exists solicitacoes_select on public.solicitacoes;
create policy solicitacoes_select on public.solicitacoes for select
  using (public.has_permission('recrutamento.aprovacoes'));
drop policy if exists solicitacoes_insert on public.solicitacoes;
create policy solicitacoes_insert on public.solicitacoes for insert
  with check (
    public.has_permission('recrutamento.vagas') or public.has_permission('recrutamento.candidatos')
    or public.has_permission('recrutamento.agenda')
  );
drop policy if exists solicitacoes_update on public.solicitacoes;
create policy solicitacoes_update on public.solicitacoes for update
  using (public.has_permission('recrutamento.aprovacoes')) with check (public.has_permission('recrutamento.aprovacoes'));

-- Listas mestre do Recrutamento: leitura livre para qualquer usuário
-- autenticado (são só dados de dropdown); escrita via admin.cadastros_recrutamento.
do $$
declare
  t text;
begin
  foreach t in array array[
    'marcas','unidades','cargos','etapas','fontes_captacao','portais',
    'niveis_vaga','recrutadores','recrutamento_departamentos'
  ]
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select using (auth.uid() is not null)', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all using (public.has_permission(''admin.cadastros_recrutamento'')) with check (public.has_permission(''admin.cadastros_recrutamento''))',
      t, t
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 5.1 REDE DE SEGURANÇA: tempo limite de instrução um pouco mais folgado
-- ----------------------------------------------------------------------------
-- O padrão do Supabase pro papel "authenticated" costuma ser baixo (na casa
-- de poucos segundos). Mesmo com can_see() otimizado, tabelas muito grandes
-- (twygo_participantes) podem ficar perto do limite pra gestores restritos
-- (que passam pela checagem completa, diferente de admin/rh). Isso não
-- resolve a causa, só dá mais margem enquanto a consulta ainda está dentro
-- do razoável.
alter role authenticated set statement_timeout = '30s';

-- ----------------------------------------------------------------------------
-- 6. LIMPEZA RÁPIDA PARA REUPLOAD (TRUNCATE em vez de DELETE linha a linha)
-- ----------------------------------------------------------------------------
-- Um DELETE sem filtro numa tabela com dezenas de milhares de linhas (ex.:
-- twygo_participantes) pode estourar o tempo limite de instrução do Postgres.
-- TRUNCATE é instantâneo independente do tamanho da tabela. Só usada pelas
-- tabelas de Indicadores (upload) — as tabelas de Recrutamento nunca são
-- substituídas por completo, só editadas linha a linha pelas telas.
create or replace function public.admin_truncate(target text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('admin.upload') then
    raise exception 'Você não tem permissão para limpar dados de planilha.';
  end if;
  if target not in (
    'colaboradores','feedbacks','one_on_one','celebracoes',
    'entrevista_pesquisa','entrevista_solicitacao',
    'twygo_participantes','twygo_usuarios','twygo_conteudos'
  ) then
    raise exception 'Tabela inválida: %', target;
  end if;
  execute format('truncate table public.%I restart identity', target);
end;
$$;

grant execute on function public.admin_truncate(text) to authenticated;

-- ============================================================================
-- BOOTSTRAP DO PRIMEIRO ADMINISTRADOR (faça isto depois de rodar o script acima)
-- ============================================================================
-- 1. No painel do Supabase: Authentication → Users → Add user
--    Marque "Auto Confirm User". Anote o e-mail e a senha que você definir.
-- 2. Volte aqui no SQL Editor e rode o comando abaixo, trocando o e-mail
--    (o bloco de permissões marca TODAS as chaves do catálogo como true —
--    mantenha igual à lista de js/permissions.js):
--
--    insert into public.profiles (id, email, nome, perfil, permissoes)
--    select id, email, 'Administrador', 'admin', '{
--      "indicadores.headcount": true, "indicadores.recrutamento": true,
--      "indicadores.rotatividade": true, "indicadores.desligamento": true,
--      "indicadores.feedbacks": true, "indicadores.oneonone": true,
--      "indicadores.treinamentos": true, "indicadores.celebracoes": true,
--      "recrutamento.dashboard": true, "recrutamento.vagas": true,
--      "recrutamento.candidatos": true, "recrutamento.agenda": true,
--      "recrutamento.banco_talentos": true, "recrutamento.aprovacoes": true,
--      "recrutamento.historico": true, "treinamento_dev.onboarding": true,
--      "admin.upload": true,
--      "admin.cadastros_recrutamento": true, "admin.usuarios": true
--    }'::jsonb
--    from auth.users
--    where email = 'coloque-o-email-que-voce-cadastrou@sferamultifranquias.com';
--
-- Depois disso esse usuário já consegue logar no Hub Sfera como administrador
-- e cadastrar os demais acessos pela própria tela do app (Administração →
-- Cadastro de Acessos), com o formulário de checkboxes já preenchendo esse
-- mesmo mapa automaticamente.
-- ============================================================================
