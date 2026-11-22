-- O assunto da carga no chat (bug #123, pedido do Rui: «não seria melhor ser
-- um alerta da Carol e ir ao chat falar com ela?»). O coach-chat regista cada
-- conversa da carga no coach_proactive_log (trigger «load_topic», chave
-- load_topic:<assinatura>) para não a repetir enquanto a situação for a mesma.
-- O CHECK do trigger só aceitava a lista de antes: junta-se «load_topic».
--
-- Sem esta migration o coach-chat novo funciona na mesma — só não regista a
-- conversa (a gravação falha e fica no log) e a deduplicação fica do lado da
-- app (a assinatura).

alter table public.coach_proactive_log drop constraint if exists coach_proactive_log_trigger_check;
alter table public.coach_proactive_log add constraint coach_proactive_log_trigger_check check (
  trigger = any (array[
    'intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence',
    'missed_workout', 'week_review', 'leaderboard', 'percentile_ready', 'cup_calendar', 'cup_date_change',
    'cup_entry_deadline', 'cup_results', 'cup_map', 'targets_review', 'plan_resume', 'load_topic'
  ]::text[])
);
