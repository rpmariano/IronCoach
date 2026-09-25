-- ============================================================================
-- As recomendações soltas da Carol
-- (specs/carol-omnisciencia-omnipresenca.md, ação 5.5, push 2)
-- APLICADA EM PRODUÇÃO a 2026-09-24 23:47 UTC (version 20260924234725).
-- Testada lá numa transação revertida: o upsert do mesmo dia e tipo fica com
-- uma linha só, com o valor corrigido.
-- ============================================================================
--
-- O que ela recomenda na conversa, fora do plano — "amanhã descansa", "hoje
-- 30 min leves", "hoje chega aos 140 g de proteína" — perdia-se no texto. O
-- chat passa a devolvê-lo num campo à parte da resposta (recommendations),
-- que o coach-chat valida (_shared/formulas/recommendations.ts) e grava aqui
-- depois da mensagem, com o JWT do atleta: a RLS só deixa inserir e ler as
-- próprias linhas. Depois, o bloco de adesão cruza cada uma com o registo do
-- dia (e o descanso com o check-in do dia seguinte).
--
-- Uma por dia e tipo: a Carol que corrige "40 min" para "30 min" no mesmo dia
-- substitui a anterior (upsert em user_id, date, kind).
-- ============================================================================

create table if not exists public.coach_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid references public.coach_messages(id) on delete set null,
  date date not null,
  kind text not null check (kind in ('descanso', 'corrida', 'ginasio', 'proteina')),
  distance_km numeric check (distance_km is null or (distance_km > 0 and distance_km <= 60)),
  duration_min integer check (duration_min is null or (duration_min > 0 and duration_min <= 360)),
  protein_g integer check (protein_g is null or (protein_g > 0 and protein_g <= 400)),
  created_at timestamptz not null default now(),
  unique (user_id, date, kind)
);

comment on table public.coach_recommendations is
  'O que a Carol recomendou na conversa, fora do plano (descanso, corrida, ginásio, proteína), por dia. '
  'Gravado pelo coach-chat com o JWT do atleta; lido no bloco de adesão.';

alter table public.coach_recommendations enable row level security;

drop policy if exists "own recommendations select" on public.coach_recommendations;
create policy "own recommendations select" on public.coach_recommendations
  for select using (auth.uid() = user_id);

drop policy if exists "own recommendations insert" on public.coach_recommendations;
create policy "own recommendations insert" on public.coach_recommendations
  for insert with check (auth.uid() = user_id);

-- O upsert (a mesma recomendação corrigida no mesmo dia) precisa de UPDATE.
drop policy if exists "own recommendations update" on public.coach_recommendations;
create policy "own recommendations update" on public.coach_recommendations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "admin read all recommendations" on public.coach_recommendations;
create policy "admin read all recommendations" on public.coach_recommendations
  for select using (public.is_admin());
