-- ============================================================================
-- Tabela coach_goal_proposals — Propostas de alteração de objetivos de nutrição
-- e biometria enviadas pelo Coach para aprovação na persiana (Modal Bottom Sheet).
-- ============================================================================

create table if not exists coach_goal_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'proposto' check (status in ('proposto', 'aceite', 'recusado')),
  goals jsonb not null,
  rationale text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create index if not exists coach_goal_proposals_user_idx on coach_goal_proposals(user_id, created_at desc);

alter table coach_goal_proposals enable row level security;

drop policy if exists "own rows" on coach_goal_proposals;
create policy "own rows" on coach_goal_proposals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "admin read all" on coach_goal_proposals;
create policy "admin read all" on coach_goal_proposals for select using (public.is_admin());
