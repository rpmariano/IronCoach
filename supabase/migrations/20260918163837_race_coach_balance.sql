-- APLICADA EM PRODUÇÃO a 2026-09-18 16:38 UTC (version 20260918163837).
-- Foi escrita a 2026-09-13 (commit 3fef886) mas nunca aplicada: até aqui o
-- coach-chat tentava gravar o balanço e falhava em silêncio, e o hub só via
-- a cópia local. Apanhado na revisão pré-deploy da P.3.
-- O balanço da Carol depois da prova fica guardado NA PROVA (pedido
-- 2026-09-13: o hub mostrava só uma linha de números; o balanço completo,
-- com a explicação pelos parciais e o momento de motivar, só existia no chat
-- e só se o atleta o abrisse). O coach-chat escreve-o aqui no turno
-- `race_after`, e o hub lê-o daqui — em qualquer dispositivo.
alter table public.race_events
  add column if not exists coach_balance text,
  add column if not exists coach_balance_at timestamptz;

comment on column public.race_events.coach_balance is
  'O balanço da Carol depois da prova (texto do turno race_after do coach-chat). Mostrado no hub.';
