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
