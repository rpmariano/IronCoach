-- ============================================================================
-- coach_messages.plan_continuation: a parte seguinte de um plano partido fica
-- na mensagem da Carol (2026-10-25).
--
-- Um plano longo propõe-se em partes de 7 dias (coach-chat, MAX_PLAN_SPAN_DAYS),
-- e a resposta do turno traz plan_continuation { from, to, part, of, until }
-- para o cliente pedir a parte seguinte. Mas o turno da primeira semana passa
-- muitas vezes dos 45 s e chega ao cliente por SONDAGEM — lê a mensagem em
-- coach_messages, sem a resposta HTTP —, e o plan_continuation perdia-se.
-- Agora o coach-chat grava-o também na linha da mensagem do modelo.
--
-- Sem RLS nova: a política "own rows" (for all, auth.uid() = user_id) já cobre
-- a leitura e os grants da tabela são por tabela (verificado em produção a
-- 2026-10-25).
--
-- ORDEM DE DEPLOY: antes do coach-chat. Sem ela nada rebenta: a mensagem
-- grava-se sem a coluna (fica um aviso no log) e o plan_continuation só vai
-- na resposta HTTP, como antes.
--
-- ROLLBACK: alter table public.coach_messages drop column if exists plan_continuation;
-- ============================================================================

alter table public.coach_messages
  add column if not exists plan_continuation jsonb
  check (plan_continuation is null or jsonb_typeof(plan_continuation) = 'object');

comment on column public.coach_messages.plan_continuation is
  'A parte seguinte de um plano partido em semanas ({ from, to, part, of, until }), quando esta mensagem propôs uma parte e falta outra. null nas restantes.';
