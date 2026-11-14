-- ============================================================================
-- Despensa: alimento genérico com variantes (bug #87, 2026-10-25).
-- Contrato: specs/despensa-variantes-contrato.md.
--
-- A despensa guardou «coxa de frango com pele»; quando o atleta come a coxa
-- sem pele, nada lhe perguntava e os valores ficavam os da coxa com pele.
-- Agora guarda-se o GENÉRICO («Coxa de frango») e as VARIANTES como linhas
-- filhas («Coxa de frango com pele», «Coxa de frango sem pele»), cada uma
-- com os seus valores por 100 g. A analyze-meal pergunta sempre qual foi.
--
-- · parent_id: preenchido nas variantes; null no genérico e nos alimentos
--   normais. on delete cascade: apagar o genérico apaga as variantes.
-- · variant_label: «com pele», «sem pele»; obrigatório quando há parent_id.
-- · name / name_key da variante = genérico + rótulo, únicos por user_id como
--   sempre (o unique (user_id, name_key) não muda).
-- · O genérico guarda também valores por 100 g (os de uma variante, por
--   omissão), para os ecrãs que não sabem de variantes.
-- · Um nível só: uma variante não tem variantes. E a variante é do mesmo
--   atleta do pai — o trigger garante as duas, venha a escrita do servidor
--   ou da app (a RLS "own foods" já obriga a linha a ser do próprio, mas não
--   olha para o pai).
--
-- A RLS existente ("own foods", for all to authenticated) cobre as colunas
-- novas; os grants da tabela também (são por tabela, não por coluna).
--
-- ORDEM DE DEPLOY: esta migration ANTES das Edge Functions (analyze-meal
-- passa a ler e a escrever parent_id/variant_label). Sem ela, a leitura da
-- despensa falha (coluna inexistente) e a análise segue sem despensa.
--
-- ROLLBACK (só depois de reverter o código; as variantes ficam como
-- alimentos soltos, com o nome completo):
--   drop trigger if exists athlete_foods_variant_guard on public.athlete_foods;
--   drop function if exists public.athlete_foods_variant_guard();
--   alter table public.athlete_foods drop constraint if exists athlete_foods_variant_pair;
--   alter table public.athlete_foods drop column if exists variant_label;
--   alter table public.athlete_foods drop column if exists parent_id;
-- ============================================================================

begin;

alter table public.athlete_foods
  add column if not exists parent_id uuid references public.athlete_foods(id) on delete cascade,
  add column if not exists variant_label text check (variant_label is null or char_length(variant_label) between 1 and 40);

alter table public.athlete_foods drop constraint if exists athlete_foods_variant_pair;
alter table public.athlete_foods add constraint athlete_foods_variant_pair
  check ((parent_id is null) = (variant_label is null));

-- As variantes de um genérico (o servidor lê-as todas de uma vez).
create index if not exists athlete_foods_parent_idx
  on public.athlete_foods (parent_id) where parent_id is not null;

create or replace function public.athlete_foods_variant_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_parent_user uuid;
  v_parent_parent uuid;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'variant_self_parent';
  end if;
  select user_id, parent_id into v_parent_user, v_parent_parent
  from public.athlete_foods where id = new.parent_id;
  if not found or v_parent_user <> new.user_id then
    raise exception 'variant_parent_not_found';
  end if;
  if v_parent_parent is not null then
    raise exception 'variant_nested';
  end if;
  -- Quem já é genérico de alguém não pode passar a variante.
  if exists (select 1 from public.athlete_foods where parent_id = new.id) then
    raise exception 'variant_nested';
  end if;
  return new;
end;
$$;

drop trigger if exists athlete_foods_variant_guard on public.athlete_foods;
create trigger athlete_foods_variant_guard
  before insert or update of parent_id, user_id on public.athlete_foods
  for each row execute function public.athlete_foods_variant_guard();

comment on column public.athlete_foods.parent_id is
  'Bug #87: o genérico desta variante (null no genérico e nos alimentos normais). Um nível só, mesmo user_id (trigger athlete_foods_variant_guard).';
comment on column public.athlete_foods.variant_label is
  'Bug #87: o rótulo da variante («com pele», «sem pele»), 1-40 caracteres; obrigatório quando há parent_id.';

commit;
