-- ============================================================================
-- O treino de ontem por registar
-- (specs/carol-omnisciencia-omnipresenca.md, ação P.10, entrega 2)
-- APLICADA EM PRODUÇÃO a 2026-09-24 23:08 UTC (version 20260924230832).
-- Testada lá numa transação revertida: os dois perfis ficam com o momento e
-- as linhas que já existiam passam nas restrições novas.
-- ============================================================================
--
-- Um momento novo em que a Carol chama pelo atleta:
--   missed_workout — o treino do plano de ontem (corrida ou ginásio) ficou
--                    pendente e sem registo nesse dia. A notificação é uma
--                    frase fixa ("Não vi o treino de ontem registado.
--                    Aconteceu alguma coisa?") e o chat pergunta e ouve, sem
--                    reagendar. Nunca num dia de prova, nem num dia de
--                    balanço da semana (o balanço fala do treino de domingo).
--
-- As listas de momentos aceites alargam-se aos nove. Como no balanço da
-- semana, TODOS os atletas que já existem passam a ter o momento ligado,
-- mesmo os que personalizaram a lista: não escolheram excluí-lo, ele
-- simplesmente não existia. Podem desligá-lo no Perfil ("Treino por registar").
--
-- Tem de ser aplicada ANTES do deploy do coach-chat e do coach-proactive-tick
-- que o conhecem: sem isto, o registo da conversa (coach_proactive_log) e da
-- notificação (coach_proactive_pushes) batem nas restrições de tipo.
-- ============================================================================

alter table public.coach_proactive_log drop constraint if exists coach_proactive_log_trigger_check;
alter table public.coach_proactive_log add constraint coach_proactive_log_trigger_check
  check (trigger in ('intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence', 'missed_workout', 'week_review'));

alter table public.coach_proactive_pushes drop constraint if exists coach_proactive_pushes_trigger_check;
alter table public.coach_proactive_pushes add constraint coach_proactive_pushes_trigger_check
  check (trigger in ('intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence', 'missed_workout', 'week_review'));

alter table public.profiles drop constraint if exists profiles_carol_push_types_check;
alter table public.profiles add constraint profiles_carol_push_types_check
  check (carol_push_types <@ array['intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence', 'missed_workout', 'week_review']);

alter table public.profiles alter column carol_push_types
  set default array['intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence', 'missed_workout', 'week_review'];

update public.profiles
  set carol_push_types = carol_push_types || array['missed_workout']
  where not ('missed_workout' = any(carol_push_types));

comment on column public.profiles.carol_push_types is
  'Os momentos em que o atleta aceita ser notificado pela Carol: intervention, race_morning, race_eve, race_conflict, race_after, block_end, silence, missed_workout, week_review.';
