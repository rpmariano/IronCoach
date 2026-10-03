-- ============================================================================
-- A data-alvo dos objetivos corporais (bug #46, 2026-10-01)
-- APLICADA EM PRODUÇÃO a 2026-10-03 22:34 UTC (version 20261003223438), antes
-- do push a dev que a usa (o coach-chat lê a coluna no select do perfil).
-- Verificada: coluna date, UPDATE para authenticated.
-- ============================================================================
--
-- «A Carol tem de indicar qual o intervalo temporal para os objetivos, pois
-- isso influencia o plano a apresentar, tendo em conta as provas.» Até aqui
-- o peso-alvo, a gordura, o músculo e a massa magra eram só números — sem
-- data, "74 kg" tanto podia ser daqui a 4 semanas como a 6 meses, e nem a
-- Carol nem o servidor conseguiam dizer se o ritmo era seguro.
--
-- Uma só data para os quatro objetivos corporais. Escreve-a:
--   · a Carol, numa proposta (update_goals → coach_goal_proposals.goals
--     traz "goals_target_date"; aceitar copia o jsonb para o perfil, como já
--     fazia com os outros objetivos — store/index.js, respondToGoalProposal);
--   · o atleta, no Perfil → Metas.
-- O ritmo que ela implica verifica-se em _shared/formulas/goalHorizon.ts.
--
-- Coluna nova sob a política "own profile" de sempre; a guarda de
-- privilégios (20260926072714) só trava is_admin/bug_reviewer.
-- ============================================================================

alter table public.profiles add column if not exists goals_target_date date;

comment on column public.profiles.goals_target_date is
  'Data-alvo dos objetivos corporais (goal_weight_kg, goal_body_fat_pct, goal_muscle_mass_kg, goal_lean_body_mass_kg). Bug #46.';
