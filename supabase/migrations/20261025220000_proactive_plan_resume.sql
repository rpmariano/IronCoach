-- ============================================================================
-- plan_resume: a Carol retoma um plano partido que ficou a meio (2026-10-25).
--
-- Um plano longo propõe-se em partes de 7 dias e a mensagem que propõe uma
-- parte guarda a seguinte (coach_messages.plan_continuation). Quando a cadeia
-- morre — a parte aceite como plano normal e a seguinte nunca pedida —, o
-- coach-proactive-tick deteta-a (_shared/formulas/planResume.ts) e a Carol
-- retoma-a pelo canal proativo de sempre, uma vez por parte prometida (chave
-- 'plan_resume:<id da mensagem>').
--
-- O que muda: os dois checks de trigger aceitam 'plan_resume':
--   · coach_proactive_pushes (o tick regista a notificação antes de a enviar);
--   · coach_proactive_log (o coach-chat regista a conversa quando a grava).
-- As listas incluem tudo o que as migrações anteriores acrescentaram
-- ('cup_map', 'targets_review' no log): estes checks substituem os delas, e
-- têm de se aplicar por ordem.
-- carol_push_types NÃO muda: plan_resume, como os avisos do Troféu, não é um
-- tipo que o atleta desliga no Perfil (a cadeia é dele).
--
-- ORDEM DE DEPLOY: antes do coach-proactive-tick e do coach-chat. Sem ela,
-- nada rebenta: o tick vê o 23514, passa a vez ao momento seguinte (claim.ts)
-- e o plano a meio não é retomado.
--
-- ROLLBACK: delete das linhas com trigger 'plan_resume' nas duas tabelas e
-- repor os checks das migrações 20261025200000 (log) e anterior (pushes).
-- ============================================================================

begin;

alter table public.coach_proactive_pushes drop constraint if exists coach_proactive_pushes_trigger_check;
alter table public.coach_proactive_pushes add constraint coach_proactive_pushes_trigger_check check (
  trigger in (
    'intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence',
    'missed_workout', 'week_review', 'leaderboard', 'percentile_ready', 'cup_calendar', 'cup_date_change',
    'cup_entry_deadline', 'cup_results', 'plan_resume'
  )
);

alter table public.coach_proactive_log drop constraint if exists coach_proactive_log_trigger_check;
alter table public.coach_proactive_log add constraint coach_proactive_log_trigger_check check (
  trigger in (
    'intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence',
    'missed_workout', 'week_review', 'leaderboard', 'percentile_ready', 'cup_calendar', 'cup_date_change',
    'cup_entry_deadline', 'cup_results', 'cup_map', 'targets_review', 'plan_resume'
  )
);

commit;
