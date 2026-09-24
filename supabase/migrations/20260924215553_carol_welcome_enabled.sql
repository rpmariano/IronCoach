-- ============================================================================
-- O interruptor das boas-vindas da Carol
-- (specs/carol-omnisciencia-omnipresenca.md, ação P.11)
-- APLICADA EM PRODUÇÃO a 2026-09-24 21:55 UTC (version 20260924215553).
-- Testada lá numa transação revertida: os perfis existentes ficam ligados.
-- ============================================================================
--
-- As boas-vindas (src/utils/carolWelcome.js) aparecem antes do Início na
-- primeira abertura de cada faixa do dia. Até aqui não havia forma de as
-- desligar. O Perfil ganha "Boas-vindas ao abrir a app", sempre visível, e o
-- App respeita-o com `=== false`: um perfil que ainda não tenha a coluna (ou
-- a app antiga, que não a lê) continua a ver as boas-vindas.
--
-- Ligado por omissão: é o comportamento de sempre, e quem não mexer no
-- interruptor não dá pela diferença.
-- ============================================================================

alter table public.profiles
  add column if not exists carol_welcome_enabled boolean not null default true;

comment on column public.profiles.carol_welcome_enabled is
  'O atleta quer as boas-vindas da Carol ao abrir a app (uma por faixa do dia). Ligado por omissão.';
