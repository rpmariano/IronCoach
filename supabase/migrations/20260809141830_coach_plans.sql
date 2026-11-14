-- ============================================================================
-- Plano de treino acordado com o Coach
--
-- Ver specs/plano-de-treino.md para o desenho completo. Duas tabelas:
-- coach_plans (o acordo, com estado de aceitação) e coach_plan_items (cada
-- treino proposto). Os objetivos de nutrição do dia NÃO são gravados aqui —
-- calculam-se a partir destes itens sempre que preciso (ver src/utils/
-- nutrition.js), para uma mudança de data corrigir os dois dias sozinha.
--
-- Idempotente: pode correr mais que uma vez sem efeito adverso.
-- ============================================================================

create table if not exists coach_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'proposto' check (status in ('proposto', 'aceite', 'recusado')),
  period_start date not null,
  period_end date not null,
  -- Resumo do coach em texto, para apresentação — "4 treinos, foco em base aeróbica".
  summary text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create index if not exists coach_plans_user_idx on coach_plans(user_id, period_start desc);
alter table coach_plans enable row level security;
drop policy if exists "own rows" on coach_plans;
create policy "own rows" on coach_plans for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "admin read all" on coach_plans;
create policy "admin read all" on coach_plans for select using (public.is_admin());

create table if not exists coach_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references coach_plans(id) on delete cascade,
  -- Desnormalizado do plano, para a política RLS não precisar de join.
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_date date not null,
  kind text not null check (kind in ('corrida', 'ginasio')),
  -- Só relevante quando kind='corrida' — mesmo enum de runs.training_type.
  training_type text,
  -- Só relevante quando kind='ginasio' — mesmo vocabulário de
  -- workout_sessions.categories.
  categories text[] not null default '{}',
  target_distance_km numeric check (target_distance_km is null or target_distance_km > 0),
  target_duration_min integer check (target_duration_min is null or target_duration_min > 0),
  notes text,
  -- Nunca expira sozinho — fica 'pendente' até o atleta confirmar ou
  -- cancelar. Sem lógica de "falhou" nem limpeza automática.
  status text not null default 'pendente' check (status in ('pendente', 'concluido', 'cancelado')),
  -- Preenchido ao concluir; pode divergir de planned_date — é essa
  -- divergência que corrige os objetivos de nutrição dos dois dias.
  actual_date date,
  completed_run_id uuid references runs(id) on delete set null,
  completed_session_id uuid references workout_sessions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists coach_plan_items_plan_idx on coach_plan_items(plan_id);
create index if not exists coach_plan_items_user_date_idx on coach_plan_items(user_id, planned_date);
alter table coach_plan_items enable row level security;
drop policy if exists "own rows" on coach_plan_items;
create policy "own rows" on coach_plan_items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "admin read all" on coach_plan_items;
create policy "admin read all" on coach_plan_items for select using (public.is_admin());
