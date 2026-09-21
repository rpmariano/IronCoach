-- ============================================================================
-- A notificação abre a conversa que prometeu (specs/carol-omnisciencia-omnipresenca.md, P.9)
-- Aplicada à mão em produção a 2026-09-21 (testada antes numa transação revertida).
-- O texto enviado fica gravado (escrito depois do envio, por isso é um update,
-- não o insert original) para o coach-chat continuar o assunto em vez de o repetir.
-- ============================================================================

alter table public.coach_proactive_pushes
  add column if not exists body text check (body is null or char_length(body) <= 200),
  add column if not exists generated boolean not null default false;
comment on column public.coach_proactive_pushes.body is
  'O texto enviado no ecrã bloqueado (até 200), escrito depois de a notificação sair; lido pelo coach-chat para continuar a notificação em vez de a repetir.';
comment on column public.coach_proactive_pushes.generated is
  'true se o texto veio do gerador (P.4), false se saiu a frase fixa.';
