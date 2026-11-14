-- ============================================================================
-- O balanço da semana da Carol (pedido de produto 2026-09-24)
-- Aplicada em produção a 2026-09-24 (via MCP do Supabase), ANTES do deploy do
-- coach-chat e do coach-proactive-tick
-- que o conhecem: sem isto, o registo da conversa (coach_proactive_log) e da
-- notificação (coach_proactive_pushes) batem nas restrições de tipo.
-- ============================================================================
--
-- Um momento novo em que a Carol chama pelo atleta:
--   week_review — à segunda-feira (ou terça), o balanço da semana que acabou
--                 no domingo: o que fez face ao plano e o foco da seguinte.
-- As listas de momentos aceites alargam-se aos oito. TODOS os atletas que
-- já existem passam a ter o balanço ligado, mesmo os que personalizaram a
-- lista: não escolheram excluí-lo, ele simplesmente não existia. (A P.5 foi
-- mais estreita: só mudou quem ainda tinha a lista por omissão.) Podem
-- desligá-lo no Perfil.
-- ============================================================================

alter table public.coach_proactive_log drop constraint if exists coach_proactive_log_trigger_check;
alter table public.coach_proactive_log add constraint coach_proactive_log_trigger_check
  check (trigger in ('intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence', 'week_review'));

alter table public.coach_proactive_pushes drop constraint if exists coach_proactive_pushes_trigger_check;
alter table public.coach_proactive_pushes add constraint coach_proactive_pushes_trigger_check
  check (trigger in ('intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence', 'week_review'));

alter table public.profiles drop constraint if exists profiles_carol_push_types_check;
alter table public.profiles add constraint profiles_carol_push_types_check
  check (carol_push_types <@ array['intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence', 'week_review']);

alter table public.profiles alter column carol_push_types
  set default array['intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence', 'week_review'];

update public.profiles
  set carol_push_types = carol_push_types || array['week_review']
  where not ('week_review' = any(carol_push_types));
