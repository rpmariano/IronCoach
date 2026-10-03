-- ============================================================================
-- A despensa do atleta e como ele cozinha (bugs #48 e #52, fase A, 2026-10-04)
-- APLICADA EM PRODUÇÃO a 2026-10-03 23:36 UTC (version 20261003233613), antes
-- do push a dev da analyze-meal que as usa. Verificada: RLS ligado nas duas,
-- uma política own rows em cada, as chaves únicas do upsert.
-- ============================================================================
--
-- #48: «Deverá ser possível escolher alimentos habituais (...) registados
-- quando se colocam 1 vez numa refeição, ou ter um local onde se faz a gestão
-- da despensa.» #52: «Em vez de a Carol estar a adivinhar (...) pode
-- perguntar. O objetivo é ir criando uma base de dados personalizada e com o
-- tempo vai ajustando e deixando de fazer perguntas.»
--
-- Decidido com o Rui (mockup "Despensa e perguntas da Carol"):
--   · um alimento entra na despensa à SEGUNDA vez que aparece numa refeição;
--     um rótulo lido numa foto entra logo; o que ele adiciona à mão também
--     (fase C). Tudo o que entra é confirmado pela Carol e pode ser ajustado
--     à mão — e, na despensa, não volta a ser analisado: ela já o conhece;
--   · como cozinha (fritos → azeite) confirma-se à segunda vez igual; uma
--     regra confirmada que muda passa a "varia" e ela volta a perguntar.
--
-- Quem escreve: a analyze-meal (com o JWT do atleta — RLS "own rows") e, na
-- fase C, o Armário no Perfil. O que se faz com isto: analyze-meal/pantry.ts.
-- ============================================================================

create table if not exists public.athlete_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  -- _shared/formulas/foodKey.ts: sem acentos, minúsculas, um espaço.
  name_key text not null,
  portion_grams numeric,
  -- "1 fatia", "1 barra" — o nome da porção, quando há.
  portion_label text,
  calories_per_100g numeric not null default 0,
  protein_per_100g numeric not null default 0,
  carbs_per_100g numeric not null default 0,
  fat_per_100g numeric not null default 0,
  fiber_per_100g numeric not null default 0,
  sugar_per_100g numeric not null default 0,
  sodium_per_100g numeric not null default 0,
  iron_mg_per_100g numeric not null default 0,
  calcium_mg_per_100g numeric not null default 0,
  vitamin_c_mg_per_100g numeric not null default 0,
  potassium_mg_per_100g numeric not null default 0,
  -- Em quantas refeições apareceu (uma vez por refeição).
  times_seen integer not null default 0,
  -- Já está na despensa: à 2.ª vez, ou logo por rótulo / à mão.
  in_pantry boolean not null default false,
  source text not null default 'refeicao' check (source in ('refeicao', 'rotulo', 'manual')),
  -- Ajustado à mão: a Carol não lhe reescreve os valores, nem com um rótulo.
  edited_by_athlete boolean not null default false,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name_key)
);

create index if not exists athlete_foods_pantry_idx on public.athlete_foods (user_id, in_pantry, times_seen desc);

create table if not exists public.athlete_food_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- "fritos", "salada", "frango"…
  topic text not null,
  topic_key text not null,
  -- "azeite", "azeite e vinagre", "peito sem pele"…
  value text not null,
  value_key text not null,
  -- Vezes seguidas com o mesmo valor.
  confirmations integer not null default 1,
  status text not null default 'por_confirmar' check (status in ('por_confirmar', 'confirmado', 'varia')),
  -- 'resposta' vem na fase B (as perguntas); 'manual' na fase C (o Armário).
  source text not null default 'observacao' check (source in ('observacao', 'resposta', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, topic_key)
);

alter table public.athlete_foods enable row level security;
alter table public.athlete_food_rules enable row level security;

drop policy if exists "own foods" on public.athlete_foods;
create policy "own foods" on public.athlete_foods
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own food rules" on public.athlete_food_rules;
create policy "own food rules" on public.athlete_food_rules
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
