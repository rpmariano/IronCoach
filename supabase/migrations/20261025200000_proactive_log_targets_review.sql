-- ============================================================================
-- coach_proactive_log: a revisão dos objetivos das provas fica registada
-- (2026-10-25).
--
-- A Carol passa a propor objetivos de prova por iniciativa dela, num turno à
-- parte que o cliente pede depois de o atleta aceitar um plano ou depois de
-- chegar o balanço de uma prova — nunca dentro do balanço
-- (coach-chat/targetsReview.ts). Uma revisão por gatilho: a chave
-- 'targets_review:<plan_id>' ou 'targets_review:race:<race_id>' fica em
-- coach_proactive_log com trigger = 'targets_review', quando a mensagem é
-- gravada, com a proposta em payload (migração 20261025210000). É esse
-- registo (nas últimas 24 h) que o «Atualiza os objetivos» aplica.
-- (Comentário corrigido depois de aplicada; o SQL não mudou.)
--
-- O que muda: o check de trigger aceita 'targets_review'. A lista inclui
-- 'cup_map' (migração 20261025160000): este check substitui o dela, e as duas
-- têm de se aplicar por ordem.
--
-- ORDEM DE DEPLOY: antes do coach-chat. Sem ela, o registo falha (fica um
-- aviso no log): a revisão pode repetir-se e o «Atualiza os objetivos» não a
-- encontra (e não aplica nada).
--
-- ROLLBACK: delete from public.coach_proactive_log where trigger = 'targets_review';
--   e repor o check da 20261025160000.
-- ============================================================================

begin;

alter table public.coach_proactive_log drop constraint if exists coach_proactive_log_trigger_check;
alter table public.coach_proactive_log add constraint coach_proactive_log_trigger_check check (
  trigger in (
    'intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence',
    'missed_workout', 'week_review', 'leaderboard', 'percentile_ready', 'cup_calendar', 'cup_date_change',
    'cup_entry_deadline', 'cup_results', 'cup_map', 'targets_review'
  )
);

commit;
