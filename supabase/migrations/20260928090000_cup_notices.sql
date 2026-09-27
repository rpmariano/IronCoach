-- ============================================================================
-- M3 — Os avisos do Troféu (specs/trofeu.md §8, §9.3, §10 Fase 5)
-- POR APLICAR — precisa de autorização (pedido fresco do dono do produto).
-- Ensaiada numa transação revertida (scratchpad ensaio_m3.sql).
-- Ao aplicar, renomear o ficheiro para a version com que ficou registada.
-- ============================================================================
--
-- Alarga SÓ as duas restrições de tipo do registo da Carol — a conversa
-- entregue (coach_proactive_log) e a notificação enviada
-- (coach_proactive_pushes) — com os quatro tipos do Troféu:
--
--   cup_calendar       — saiu o calendário da edição (edição passa a ter
--                        jornadas confirmadas);
--   cup_date_change    — mudou a data de uma jornada "Vou";
--   cup_entry_deadline — a inscrição numa jornada "Vou" fecha dentro de 48 h;
--   cup_results        — saiu a classificação de uma jornada que ele correu
--                        (o toque abre o chat, que o regista no log).
--
-- A manhã de uma jornada é uma manhã de prova: `race_morning` já existe.
--
-- NÃO toca em profiles_carol_push_types_check, no valor por omissão nem no
-- comentário de profiles.carol_push_types: as preferências do Troféu vivem na
-- inscrição (cup_enrollments.notify_*, M1), e a BD continua a recusar cup_*
-- em carol_push_types — é assim que se garante que esse array nunca os liga.
--
-- Parte das definições REAIS de produção (pg_get_constraintdef, projeto
-- roxfzsiciizkevopgpnl, lidas a 2026-09-27): os 11 tipos de
-- 20260925200100_proactive_vitrina.sql, nas duas tabelas.
--
-- Tem de ser aplicada ANTES do deploy (push a `dev`) do coach-proactive-tick
-- e do coach-chat que conhecem os tipos cup_*. O código tolera a M3 em falta
-- (uma notificação cup_* recusada pelo CHECK, 23514, cai e passa-se ao
-- momento seguinte), mas sem ela nenhum aviso do Troféu sai.
--
-- Reverter: apagar as linhas cup_* das duas tabelas e repor as duas
-- restrições com os 11 tipos (o texto de 20260925200100).
-- ============================================================================

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.coach_proactive_log drop constraint if exists coach_proactive_log_trigger_check;
alter table public.coach_proactive_log add constraint coach_proactive_log_trigger_check
  check (trigger in ('intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence', 'missed_workout', 'week_review', 'leaderboard', 'percentile_ready',
                     'cup_calendar', 'cup_date_change', 'cup_entry_deadline', 'cup_results'));

alter table public.coach_proactive_pushes drop constraint if exists coach_proactive_pushes_trigger_check;
alter table public.coach_proactive_pushes add constraint coach_proactive_pushes_trigger_check
  check (trigger in ('intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence', 'missed_workout', 'week_review', 'leaderboard', 'percentile_ready',
                     'cup_calendar', 'cup_date_change', 'cup_entry_deadline', 'cup_results'));

commit;
