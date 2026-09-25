-- ============================================================================
-- A Vitrina chega à Carol: dois momentos novos em que ela chama pelo atleta
-- (pedido de 2026-09-25)
-- ============================================================================
--
--   percentile_ready — passou a haver números no "Onde estás". Dois momentos,
--                      uma vez cada por segmento: primeiro "há números de
--                      grupos ao lado do teu escalão" (perto), depois "o teu
--                      escalão já tem números" (meu). Só a quem entrou na média.
--   leaderboard      — entrou ou saiu das tabelas com nomes (o top 10 do
--                      escalão na quinzena). Só a quem aceitou aparecer nelas.
--
-- As duas notificações são frases FIXAS (coach-proactive-tick/pushText.ts):
-- no ecrã bloqueado não vão posições nem percentis. O número diz-se no chat.
--
-- As listas de momentos aceites alargam-se aos onze. Como no balanço da
-- semana e no treino por registar, TODOS os atletas que já existem passam a
-- ter os dois momentos ligados, mesmo os que personalizaram a lista: não
-- escolheram excluí-los, eles simplesmente não existiam. Desligam-se no
-- Perfil ("Entrar e sair das tabelas", "Números do Onde estás").
--
-- Tem de ser aplicada ANTES do deploy do coach-chat e do coach-proactive-tick
-- que os conhecem: sem isto, o registo da conversa (coach_proactive_log) e da
-- notificação (coach_proactive_pushes) batem nas restrições de tipo.
-- ============================================================================

alter table public.coach_proactive_log drop constraint if exists coach_proactive_log_trigger_check;
alter table public.coach_proactive_log add constraint coach_proactive_log_trigger_check
  check (trigger in ('intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence', 'missed_workout', 'week_review', 'leaderboard', 'percentile_ready'));

alter table public.coach_proactive_pushes drop constraint if exists coach_proactive_pushes_trigger_check;
alter table public.coach_proactive_pushes add constraint coach_proactive_pushes_trigger_check
  check (trigger in ('intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence', 'missed_workout', 'week_review', 'leaderboard', 'percentile_ready'));

alter table public.profiles drop constraint if exists profiles_carol_push_types_check;
alter table public.profiles add constraint profiles_carol_push_types_check
  check (carol_push_types <@ array['intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence', 'missed_workout', 'week_review', 'leaderboard', 'percentile_ready']);

alter table public.profiles alter column carol_push_types
  set default array['intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence', 'missed_workout', 'week_review', 'leaderboard', 'percentile_ready'];

update public.profiles
  set carol_push_types = carol_push_types || array['leaderboard']
  where not ('leaderboard' = any(carol_push_types));

update public.profiles
  set carol_push_types = carol_push_types || array['percentile_ready']
  where not ('percentile_ready' = any(carol_push_types));

comment on column public.profiles.carol_push_types is
  'Os momentos em que o atleta aceita ser notificado pela Carol: intervention, race_morning, race_eve, race_conflict, race_after, block_end, silence, missed_workout, week_review, leaderboard, percentile_ready.';
