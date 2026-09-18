-- ============================================================================
-- Os momentos novos da Carol (specs/carol-omnisciencia-omnipresenca.md, P.5)
-- APLICADA EM PRODUÇÃO a 2026-09-18 23:44 UTC (version 20260918234452).
-- Testada lá numa transação revertida: os 3 perfis passam aos sete momentos
-- e a tabela das notificações aceita os tipos novos.
-- ============================================================================
--
-- Três momentos novos em que a Carol chama pelo atleta:
--   intervention   — um assunto por resolver (dor no check-in, desvio num
--                    registo que uma análise marcou);
--   race_conflict  — duas provas principais no mesmo bloco;
--   block_end      — o bloco de treino acaba e não há outro a seguir.
-- As listas de momentos aceites nas tabelas alargam-se aos sete. Os atletas
-- que ainda têm a lista por omissão (os quatro de antes) passam a ter os
-- sete: não escolheram excluir os novos, simplesmente não existiam.
-- ============================================================================

alter table public.coach_proactive_log drop constraint if exists coach_proactive_log_trigger_check;
alter table public.coach_proactive_log add constraint coach_proactive_log_trigger_check
  check (trigger in ('intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence'));

alter table public.coach_proactive_pushes drop constraint if exists coach_proactive_pushes_trigger_check;
alter table public.coach_proactive_pushes add constraint coach_proactive_pushes_trigger_check
  check (trigger in ('intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence'));

alter table public.profiles drop constraint if exists profiles_carol_push_types_check;
alter table public.profiles add constraint profiles_carol_push_types_check
  check (carol_push_types <@ array['intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence']);

alter table public.profiles alter column carol_push_types
  set default array['intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence'];

update public.profiles
  set carol_push_types = array['intervention', 'race_morning', 'race_eve', 'race_conflict', 'race_after', 'block_end', 'silence']
  where carol_push_types = array['race_morning', 'race_eve', 'race_after', 'silence'];
