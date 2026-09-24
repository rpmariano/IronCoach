-- ============================================================================
-- A emoção de cada resposta da Carol (CAROL.md §4 — o rosto)
-- POR APLICAR em produção. O coach-chat funciona antes e depois: sem a coluna,
-- grava a mensagem sem a emoção (e o cliente deduz a emoção do texto).
--
-- O modelo escolhe a emoção na mesma resposta em que escreve o texto (campo
-- "mood" do JSON estruturado), e ela fica gravada com a mensagem para o
-- histórico recarregado mostrar a mesma cara que se viu ao vivo. "thinking"
-- não entra: é o que ela faz enquanto escreve, não o tom do que disse.
-- Nula nas mensagens do atleta e nas antigas.
-- ============================================================================

alter table public.coach_messages
  add column if not exists mood text
    check (mood is null or mood in ('neutral', 'happy', 'proud', 'worried', 'caring'));
comment on column public.coach_messages.mood is
  'Emoção da resposta da Carol, escolhida pelo modelo (neutral|happy|proud|worried|caring). Nula nas mensagens do atleta e nas anteriores a 2026-09-24.';
