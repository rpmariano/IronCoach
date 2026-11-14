-- ============================================================================
-- coach_proactive_log: o mapa da época passa a ficar registado (2026-10-25).
--
-- A Carol mandou o mapa do Troféu duas vezes com 30 s de diferença: o turno
-- passou dos 45 s, chegou por sondagem e o cliente não marcou o aviso. O
-- coach-chat passa a registar a entrega do mapa quando grava a mensagem
-- (key = 'cup_map:<assinatura>', trigger = 'cup_map') e a recusar a mesma
-- assinatura nas 24 h seguintes (coach-chat/index.ts, CUP_MAP_RESEND_MS).
--
-- O que muda: o check de trigger aceita 'cup_map'. A lista antiga fica toda.
--
-- ORDEM DE DEPLOY: esta migration ANTES do coach-chat. Sem ela, a gravação
-- do registo falha (fica só um aviso no log) e a idempotência não existe —
-- nada rebenta, o mapa só pode voltar a repetir-se como antes.
--
-- ROLLBACK (depois de reverter o código):
--   delete from public.coach_proactive_log where trigger = 'cup_map';
--   e repor o check sem 'cup_map'.
-- ============================================================================

begin;

alter table public.coach_proactive_log drop constraint if exists coach_proactive_log_trigger_check;
alter table public.coach_proactive_log add constraint coach_proactive_log_trigger_check check (
  trigger in (
    'intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence',
    'missed_workout', 'week_review', 'leaderboard', 'percentile_ready', 'cup_calendar', 'cup_date_change',
    'cup_entry_deadline', 'cup_results', 'cup_map'
  )
);

commit;
