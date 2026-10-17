-- ============================================================================
-- Refeições predefinidas do atleta (bug #63, fase D de
-- specs/carol-quantidades-habitos-refeicoes.md §5).
--
-- «É possível criar uma categoria onde juntamos ingredientes para criar
-- refeições pré-definidas?» — no Armário (Despensa → Refeições) o atleta junta
-- alimentos da despensa com as gramas; no registo da refeição, tocar numa
-- preenche a lista de alimentos. Os itens guardam-se pelo NOME (e as gramas):
-- é pelo nome que a analyze-meal reconhece um alimento da despensa e o regista
-- sem o Gemini (pantry.ts, splitKnownWritten). food_id fica como referência,
-- sem FK — apagar um alimento da despensa não estraga a refeição.
--
-- Quem escreve: só a app, com o JWT do atleta (RLS "own rows").
-- Aplicada à mão em produção a 2026-10-17 (versão 20261017212201).
-- ============================================================================

create table if not exists public.athlete_meal_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  -- _shared/formulas/foodKey.ts: sem acentos, minúsculas, um espaço.
  name_key text not null,
  -- O tipo de refeição sugerido ao usar (pequeno-almoco, almoco, …); null = qualquer.
  default_meal_type text,
  -- [{ "food_id": uuid|null, "name": text, "grams": number|null }]
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  times_used integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name_key)
);

create index if not exists athlete_meal_templates_user_idx
  on public.athlete_meal_templates (user_id, times_used desc);

alter table public.athlete_meal_templates enable row level security;

drop policy if exists "own meal templates" on public.athlete_meal_templates;
create policy "own meal templates" on public.athlete_meal_templates
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
