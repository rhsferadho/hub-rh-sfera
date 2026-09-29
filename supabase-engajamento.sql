-- Pesquisa de Engajamento (índice de participação por pulso) — rode UMA vez no
-- SQL Editor do Supabase, depois do supabase-migration.sql principal. Alimenta
-- Indicadores → Pesquisa de Engajamento. Idempotente.
--
-- Este módulo acompanha SÓ a participação (convidados × responderam), por
-- unidade e departamento. NÃO guarda respostas, notas, comentários nem nomes:
-- a pesquisa é anônima e aqui só entram contagens.
--
-- Carga dos dados (Administração → Upload de Planilhas):
--   33.  histórico dos pulsos (planilha "33. Pesquisa de Engajamento 2026.xlsx")
--        — uma vez; substitui só os pulsos de origem "historico".
--   33.1 export "Participação" do Feedz — a cada atualização do pulso em
--        andamento; substitui apenas aquele pulso (mesma data de início).
-- Toda gravação passa pelas funções abaixo (uma transação só, exige a
-- permissão admin.upload) — as tabelas não têm policy de escrita direta.

create table if not exists public.engajamento_pulso (
  id bigserial primary key,
  inicio date not null unique,
  fim date not null,
  numero int,                    -- 26 = "26º pulso"; null se ainda não há histórico
  convidados int not null,
  respondentes int not null,
  parcial boolean not null default false,
  ultima_resposta timestamp,     -- "última resposta registrada" informada pelo Feedz
  fonte text not null default 'feedz' check (fonte in ('feedz', 'historico')),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.engajamento_participacao (
  id bigserial primary key,
  pulso_inicio date not null references public.engajamento_pulso (inicio) on delete cascade,
  unidade text,
  departamento text,
  gestor text,                   -- gestor direto mais frequente entre os convidados do departamento
  convidados int,                -- null nos pulsos do histórico (a planilha antiga não guarda a base por unidade)
  respondentes int not null default 0
);
create index if not exists engajamento_participacao_pulso_idx on public.engajamento_participacao (pulso_inicio);
create index if not exists engajamento_participacao_unidade_idx on public.engajamento_participacao (unidade);

alter table public.engajamento_pulso enable row level security;
alter table public.engajamento_participacao enable row level security;

-- Totais por pulso (sem unidade/departamento): quem tem a permissão vê.
drop policy if exists engajamento_pulso_select on public.engajamento_pulso;
create policy engajamento_pulso_select on public.engajamento_pulso for select
  using (public.has_permission('indicadores.engajamento'));

-- Participação por unidade/departamento: respeita o recorte do usuário.
drop policy if exists engajamento_participacao_select on public.engajamento_participacao;
create policy engajamento_participacao_select on public.engajamento_participacao for select
  using (public.has_permission('indicadores.engajamento') and public.can_see(unidade, departamento));

-- ----------------------------------------------------------------------------
-- Grava (ou regrava) UM pulso do Feedz com as linhas por departamento.
-- Mesmo início = substitui. Se o período cobrir um pulso do histórico, o pulso
-- do Feedz o substitui e herda o número (o dado do Feedz tem a base exata).
-- ----------------------------------------------------------------------------
create or replace function public.engajamento_salvar_pulso(p_pulso jsonb, p_linhas jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_inicio date := (p_pulso ->> 'inicio')::date;
  v_fim date := (p_pulso ->> 'fim')::date;
  v_numero int;
  v_achou boolean;
  v_linhas int;
begin
  if not public.has_permission('admin.upload') then
    raise exception 'Você não tem permissão para importar planilhas.';
  end if;
  if v_inicio is null or v_fim is null or v_fim < v_inicio then
    raise exception 'Período do pulso inválido.';
  end if;

  select numero, true into v_numero, v_achou from public.engajamento_pulso where inicio = v_inicio;
  if not coalesce(v_achou, false) then
    select numero into v_numero from public.engajamento_pulso
      where fonte = 'historico' and daterange(inicio, fim, '[]') && daterange(v_inicio, v_fim, '[]')
      order by inicio limit 1;
    if v_numero is null then
      select case when count(*) = 0 then null else coalesce(max(numero), 0) + 1 end into v_numero
        from public.engajamento_pulso;
    end if;
  end if;

  delete from public.engajamento_pulso
    where inicio = v_inicio
       or (fonte = 'historico' and daterange(inicio, fim, '[]') && daterange(v_inicio, v_fim, '[]'));

  insert into public.engajamento_pulso (inicio, fim, numero, convidados, respondentes, parcial, ultima_resposta, fonte, atualizado_em)
  values (v_inicio, v_fim, v_numero, (p_pulso ->> 'convidados')::int, (p_pulso ->> 'respondentes')::int,
          coalesce((p_pulso ->> 'parcial')::boolean, false), nullif(p_pulso ->> 'ultima_resposta', '')::timestamp, 'feedz', now());

  insert into public.engajamento_participacao (pulso_inicio, unidade, departamento, gestor, convidados, respondentes)
  select v_inicio, x.unidade, x.departamento, x.gestor, x.convidados, coalesce(x.respondentes, 0)
  from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as x(unidade text, departamento text, gestor text, convidados int, respondentes int);
  get diagnostics v_linhas = row_count;

  return jsonb_build_object('numero', v_numero, 'linhas', v_linhas);
end;
$$;

-- ----------------------------------------------------------------------------
-- Grava o histórico (planilha 33): substitui todos os pulsos de origem
-- "historico". Pulsos que já têm dado exato do Feedz (mesmo período) ficam como
-- estão — o histórico não sobrescreve o Feedz.
-- ----------------------------------------------------------------------------
create or replace function public.engajamento_salvar_historico(p_pulsos jsonb, p_linhas jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pulsos int;
  v_linhas int;
begin
  if not public.has_permission('admin.upload') then
    raise exception 'Você não tem permissão para importar planilhas.';
  end if;

  delete from public.engajamento_pulso where fonte = 'historico';

  insert into public.engajamento_pulso (inicio, fim, numero, convidados, respondentes, parcial, fonte, atualizado_em)
  select x.inicio, x.fim, x.numero, x.convidados, x.respondentes, false, 'historico', now()
  from jsonb_to_recordset(coalesce(p_pulsos, '[]'::jsonb)) as x(inicio date, fim date, numero int, convidados int, respondentes int)
  where not exists (
    select 1 from public.engajamento_pulso f
    where f.fonte = 'feedz' and daterange(f.inicio, f.fim, '[]') && daterange(x.inicio, x.fim, '[]')
  );
  get diagnostics v_pulsos = row_count;

  insert into public.engajamento_participacao (pulso_inicio, unidade, departamento, gestor, convidados, respondentes)
  select x.pulso_inicio, x.unidade, x.departamento, null, null, coalesce(x.respondentes, 0)
  from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb)) as x(pulso_inicio date, unidade text, departamento text, respondentes int)
  where exists (select 1 from public.engajamento_pulso p where p.inicio = x.pulso_inicio and p.fonte = 'historico');
  get diagnostics v_linhas = row_count;

  return jsonb_build_object('pulsos', v_pulsos, 'linhas', v_linhas);
end;
$$;

revoke all on function public.engajamento_salvar_pulso(jsonb, jsonb) from public, anon;
revoke all on function public.engajamento_salvar_historico(jsonb, jsonb) from public, anon;
grant execute on function public.engajamento_salvar_pulso(jsonb, jsonb) to authenticated;
grant execute on function public.engajamento_salvar_historico(jsonb, jsonb) to authenticated;

-- Permissão indicadores.engajamento: só o perfil Administrador enxerga o módulo
-- (has_permission() já libera o admin). Ninguém mais recebe automaticamente — RH e
-- Gestor ficam fora dos presets; se um dia for preciso liberar alguém, marque a
-- permissão no Cadastro de Acessos.
