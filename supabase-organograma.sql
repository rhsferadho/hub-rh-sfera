-- ============================================================================
-- Organograma e Headcount por galho (Indicadores → Organograma / Headcount)
-- ----------------------------------------------------------------------------
-- Quem tem a permissão indicadores.organograma_completo vê a estrutura inteira
-- (lida de colaboradores, com a RLS de sempre). Os demais usuários com
-- indicadores.organograma veem só o próprio galho: a linha de liderança acima
-- (gestor, gestor do gestor, ... até o topo) e toda a equipe abaixo, direta e
-- indireta. Esse recorte é feito aqui no banco, por organograma_meu_galho(),
-- para que os outros galhos nem cheguem ao navegador.
--
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem problema.
-- ============================================================================

-- Vínculo login → colaborador do Feedz. Vazio = o vínculo é feito pelo e-mail
-- do login (profiles.email = colaboradores.email). Preenchido pelo campo
-- "Colaborador no Feedz" em Administração → Cadastro de Acessos, com o ID da
-- Feedz (colaboradores.external_id), que não muda em recontratação.
alter table public.profiles add column if not exists colaborador_external_id text;
comment on column public.profiles.colaborador_external_id is 'ID da Feedz (colaboradores.external_id) da pessoa deste login. Vazio = vínculo pelo e-mail. Usado pelo organograma por galho.';

create or replace function public.organograma_meu_galho()
returns table (
  external_id text, nome text, nome_completo text, cargo text,
  departamento text, unidade text, gestor_direto text, situacao text,
  grupos text, data_admissao date, relacao text
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_ext text;
  v_email text;
  v_me bigint;
begin
  -- Qualquer usuário do Hub (com profile) pode pedir o PRÓPRIO galho: além do
  -- Organograma, ele define o recorte do Headcount e dos números de headcount
  -- do Dashboard (que todo usuário vê) para quem não tem a visão completa.
  if not exists (select 1 from public.profiles p where p.id = auth.uid()) then
    raise exception 'Usuário sem cadastro no Hub.';
  end if;

  select nullif(trim(p.colaborador_external_id), ''), lower(trim(p.email))
    into v_ext, v_email
  from public.profiles p where p.id = auth.uid();

  if v_ext is not null then
    select c.id into v_me from public.colaboradores c
    where c.external_id = v_ext
    order by (lower(c.situacao) = 'ativo') desc, c.id limit 1;
  end if;
  if v_me is null and v_email is not null and v_email <> '' then
    select c.id into v_me from public.colaboradores c
    where lower(trim(c.email)) = v_email
    order by (lower(c.situacao) = 'ativo') desc, c.id limit 1;
  end if;
  if v_me is null then
    return; -- login sem colaborador vinculado: a tela explica o que fazer
  end if;

  return query
  with recursive
  -- "Gestor Direto" do Feedz guarda o NOME do gestor: liga pelo nome (ou nome completo).
  abaixo(cid, nivel) as (
    select v_me, 0
    union
    select f.id, a.nivel + 1
    from abaixo a
    join public.colaboradores g on g.id = a.cid
    join public.colaboradores f
      on f.id <> g.id
     and nullif(trim(f.gestor_direto), '') is not null
     and lower(trim(f.gestor_direto)) in (lower(trim(g.nome)), lower(trim(g.nome_completo)))
    where a.nivel < 30
  ),
  acima(cid, nivel) as (
    select v_me, 0
    union
    select (
      select g.id from public.colaboradores g
      where lower(trim(g.nome)) = lower(trim(c.gestor_direto))
         or lower(trim(g.nome_completo)) = lower(trim(c.gestor_direto))
      order by (lower(g.situacao) = 'ativo') desc,
               (lower(trim(g.nome)) = lower(trim(c.gestor_direto))) desc,
               g.id
      limit 1
    ), a.nivel + 1
    from acima a
    join public.colaboradores c on c.id = a.cid
    where a.nivel < 30 and nullif(trim(c.gestor_direto), '') is not null
  ),
  sel as (
    select distinct on (x.cid) x.cid, x.rel
    from (
      select v_me as cid, 'eu' as rel, 0 as ord
      union all select b.cid, 'abaixo', 1 from abaixo b where b.nivel > 0
      union all select s.cid, 'acima', 2 from acima s where s.nivel > 0 and s.cid is not null
    ) x
    order by x.cid, x.ord
  )
  -- Da liderança acima só sai o necessário para desenhar o caminho: nada de
  -- cotas, afastamentos ou datas.
  select c.external_id, c.nome, c.nome_completo, c.cargo,
         c.departamento, c.unidade, c.gestor_direto, c.situacao,
         case when s.rel = 'acima' then null else c.grupos end,
         case when s.rel = 'acima' then null else c.data_admissao end,
         s.rel
  from sel s
  join public.colaboradores c on c.id = s.cid;
end;
$$;

revoke all on function public.organograma_meu_galho() from public, anon;
grant execute on function public.organograma_meu_galho() to authenticated;

-- Quem já é RH continua vendo a empresa inteira no Headcount e no Organograma
-- (as duas permissões "completo" são novas e não existiam nos cadastros
-- antigos). Só preenche quando a chave ainda não existe, para não desfazer
-- uma escolha feita depois no Cadastro de Acessos. Administrador não precisa:
-- perfil admin sempre vê tudo.
update public.profiles
set permissoes = permissoes
  || case when permissoes ? 'indicadores.headcount_completo' then '{}'::jsonb else '{"indicadores.headcount_completo": true}'::jsonb end
  || case when permissoes ? 'indicadores.organograma_completo' then '{}'::jsonb else '{"indicadores.organograma_completo": true}'::jsonb end
where perfil = 'rh';
