-- ============================================================================
-- coach_proactive_log.payload: o que acompanha uma entrega (2026-10-25).
--
-- A revisão dos objetivos das provas (coach-chat/targetsReview.ts) guarda aqui
-- a proposta que a Carol fez — { proposals: [{ race_id, proposed_s }] } —
-- para o «Atualiza os objetivos» gravar EXATAMENTE isso, e não umas contas
-- refeitas mais tarde (revisão do d609f9ad, ponto 4).
--
-- Sem RLS nova: a leitura e a inserção do próprio já existem; a coluna é
-- coberta pelos grants da tabela.
--
-- ORDEM DE DEPLOY: antes do coach-chat. Sem ela nada rebenta: o registo grava-
-- se sem payload (fica um aviso no log), e o «Atualiza» não encontra proposta
-- e não aplica nada.
--
-- ROLLBACK: alter table public.coach_proactive_log drop column if exists payload;
-- ============================================================================

alter table public.coach_proactive_log
  add column if not exists payload jsonb
  check (payload is null or jsonb_typeof(payload) = 'object');

comment on column public.coach_proactive_log.payload is
  'O que acompanha a entrega. Na revisão dos objetivos (trigger targets_review): { proposals: [{ race_id, proposed_s }] }, o que se propôs.';
