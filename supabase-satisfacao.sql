-- Pesquisa de Satisfação com o Suporte do Escritório — módulo próprio
-- (Indicadores → Pesquisa de Satisfação). Rode UMA vez no SQL Editor do
-- Supabase, depois do supabase-boletim.sql. Pode rodar de novo sem problema.
--
-- SIGILO. A pesquisa avalia as áreas do Escritório (Financeiro, DP, TI...). As
-- notas e os comentários de cada área são vistos só por quem cuida daquela área:
--   • indicadores.satisfacao           → abre o módulo; vê SÓ as áreas listadas em
--                                         profiles.satisfacao_areas, e só o total
--                                         da área (sem loja, departamento ou
--                                         operação de quem respondeu).
--   • indicadores.satisfacao_completo  → todas as áreas, com o recorte por
--                                         operação e loja (RH/Diretoria).
-- O perfil Administrador enxerga tudo (has_permission).
--
-- A tabela satisfacao_respostas NÃO tem policy de leitura: ninguém lê direto.
-- A leitura é só pela função satisfacao_dados(), que corta as áreas e esconde
-- unidade/departamento de quem não tem a visão completa. Sem nome, CPF, e-mail
-- nem líder direto: a planilha é agregada no navegador antes de gravar
-- (js/parsers-satisfacao.js).

-- ----------------------------------------------------------------------------
-- Perfil: áreas da pesquisa que a pessoa pode ver
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists satisfacao_areas text[] not null default '{}';
comment on column public.profiles.satisfacao_areas is 'Pesquisa de Satisfação: áreas do Escritório que a pessoa pode ver (ex.: {TI}). Só vale com a permissão indicadores.satisfacao; indicadores.satisfacao_completo libera todas.';

-- ----------------------------------------------------------------------------
-- Tabelas
-- ----------------------------------------------------------------------------
-- Uma linha por resposta × área avaliada.
create table if not exists public.satisfacao_respostas (
  id bigserial primary key,
  pesquisa date not null,          -- mês do ciclo (coluna PESQUISA da planilha 16; avalia o mês anterior)
  unidade text,                    -- de quem respondeu (só aparece na visão completa)
  departamento text,
  area text not null,              -- área avaliada: Financeiro, DP, TI...
  nota numeric,                    -- 0 a 10
  melhorar text[] not null default '{}',  -- "O que melhorar?" (múltipla escolha)
  extra text,                      -- Compras: reuniões que o time fez com a loja no mês
  comentario text
);
create index if not exists satisfacao_respostas_pesquisa_idx on public.satisfacao_respostas (pesquisa);
create index if not exists satisfacao_respostas_area_idx on public.satisfacao_respostas (area);

-- Um registro por ciclo: total de respondentes, gestores aptos (tag
-- pesquisa.satisfação no cadastro, foto do dia do upload) e áreas avaliadas.
create table if not exists public.satisfacao_ciclo (
  pesquisa date primary key,
  respondentes int not null,
  aptos int,
  areas text[] not null default '{}',
  atualizado_em timestamptz not null default now()
);

alter table public.satisfacao_respostas enable row level security;
alter table public.satisfacao_ciclo enable row level security;

-- satisfacao_respostas: sem policy de select de propósito (leitura só pela função).
drop policy if exists satisfacao_ciclo_select on public.satisfacao_ciclo;
create policy satisfacao_ciclo_select on public.satisfacao_ciclo for select
  using (public.has_permission('indicadores.satisfacao') or public.has_permission('admin.usuarios'));

-- ----------------------------------------------------------------------------
-- Leitura
-- ----------------------------------------------------------------------------
-- Áreas que o usuário logado pode ver; null = todas (visão completa).
create or replace function public.satisfacao_minhas_areas()
returns text[]
language sql stable security definer set search_path = public as $$
  select case
    when public.has_permission('indicadores.satisfacao_completo') then null
    else coalesce((select p.satisfacao_areas from public.profiles p where p.id = auth.uid()), '{}')
  end
$$;

-- Respostas das áreas liberadas. unidade/departamento só voltam na visão
-- completa (e respeitam can_see). "ord" serve só para paginar (.range):
-- segue a ordem ciclo → área → nota → comentário, sem relação com a ordem
-- das respostas na planilha.
create or replace function public.satisfacao_dados()
returns table (ord bigint, pesquisa date, area text, nota numeric, melhorar text[], extra text, comentario text, unidade text, departamento text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_areas text[];
  v_completo boolean;
begin
  if not public.has_permission('indicadores.satisfacao') and not public.has_permission('indicadores.satisfacao_completo') then
    raise exception 'Você não tem permissão para ver a Pesquisa de Satisfação.';
  end if;
  v_completo := public.has_permission('indicadores.satisfacao_completo');
  v_areas := public.satisfacao_minhas_areas();
  return query
    select row_number() over (order by r.pesquisa, r.area, r.nota, r.comentario, r.id) as ord,
           r.pesquisa, r.area, r.nota, r.melhorar, r.extra, r.comentario,
           case when v_completo then r.unidade end,
           case when v_completo then r.departamento end
      from public.satisfacao_respostas r
     where (v_areas is null or lower(r.area) in (select lower(a) from unnest(v_areas) as a))
       and (not v_completo or public.can_see(r.unidade, r.departamento));
end;
$$;

-- ----------------------------------------------------------------------------
-- Gravação (upload do card 16, exige admin.upload). O primeiro lote vem com
-- p_limpar = true e apaga os ciclos presentes no arquivo; os seguintes só inserem.
-- ----------------------------------------------------------------------------
create or replace function public.satisfacao_salvar(p_meses date[], p_linhas jsonb, p_limpar boolean)
returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para importar planilhas.'; end if;
  if p_limpar then delete from public.satisfacao_respostas where pesquisa = any(p_meses); end if;
  insert into public.satisfacao_respostas (pesquisa, unidade, departamento, area, nota, melhorar, extra, comentario)
  select x.pesquisa, x.unidade, x.departamento, x.area, x.nota, coalesce(x.melhorar, '{}'), x.extra, x.comentario
  from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb))
    as x(pesquisa date, unidade text, departamento text, area text, nota numeric, melhorar text[], extra text, comentario text);
  get diagnostics v = row_count;
  return v;
end;
$$;

-- p_ciclos = [{"pesquisa": "2026-09-01", "respondentes": 53, "aptos": 81, "areas": [...]}, ...].
-- aptos null mantém o valor já gravado (a foto do headcount só é tirada no ciclo
-- mais recente do arquivo).
create or replace function public.satisfacao_salvar_ciclos(p_ciclos jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.has_permission('admin.upload') then raise exception 'Você não tem permissão para importar planilhas.'; end if;
  insert into public.satisfacao_ciclo (pesquisa, respondentes, aptos, areas, atualizado_em)
  select x.pesquisa, x.respondentes, x.aptos, coalesce(x.areas, '{}'), now()
  from jsonb_to_recordset(coalesce(p_ciclos, '[]'::jsonb)) as x(pesquisa date, respondentes int, aptos int, areas text[])
  on conflict (pesquisa) do update
    set respondentes = excluded.respondentes,
        aptos = coalesce(excluded.aptos, public.satisfacao_ciclo.aptos),
        areas = excluded.areas,
        atualizado_em = now();
  get diagnostics v = row_count;
  return v;
end;
$$;

revoke all on function public.satisfacao_minhas_areas() from public, anon;
revoke all on function public.satisfacao_dados() from public, anon;
revoke all on function public.satisfacao_salvar(date[], jsonb, boolean) from public, anon;
revoke all on function public.satisfacao_salvar_ciclos(jsonb) from public, anon;
grant execute on function public.satisfacao_minhas_areas() to authenticated;
grant execute on function public.satisfacao_dados() to authenticated;
grant execute on function public.satisfacao_salvar(date[], jsonb, boolean) to authenticated;
grant execute on function public.satisfacao_salvar_ciclos(jsonb) to authenticated;

-- Permissões novas ficam FORA dos presets RH e Gestor: são ligadas pessoa a
-- pessoa no Cadastro de Acessos (o Administrador já enxerga tudo).
