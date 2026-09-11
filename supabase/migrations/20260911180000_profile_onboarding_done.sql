-- ============================================================================
-- Onboarding — marca de "arranque concluído" no perfil (ponto 8 do redesenho
-- 2026-09, direção 6c).
--
-- Porquê: os seis passos conduzidos pela Carol correm no PRIMEIRO acesso e
-- nunca mais, a não ser que o atleta os reabra de propósito em Perfil · Coach
-- ("Rever o arranque com a Carol"). Sem uma marca persistida, o onboarding
-- voltaria a aparecer em cada login e em cada dispositivo novo.
--
-- `default false` é o valor certo para quem se regista a partir de agora — o
-- perfil nasce por trigger (public.handle_new_user) sem passar por lado
-- nenhum que pudesse pôr `true`. Os perfis JÁ EXISTENTES também ficam a
-- `false`, e é de propósito: o cliente NÃO usa esta coluna sozinha para
-- decidir. A regra de arranque (src/utils/onboarding.js) é
--
--     mostra o onboarding só se onboarding_done === false
--     E o atleta não tem registo nenhum (corridas, refeições, treinos,
--     avaliações) nem prova marcada
--
-- para que ninguém que já usa a app seja obrigado a repetir o arranque por
-- causa desta migração. Nesse caso o cliente grava `true` em silêncio.
--
-- O cliente tolera a coluna não existir (o UPDATE falha, fica um aviso na
-- consola e há um fallback em localStorage por utilizador) — ver
-- src/components/Onboarding/Onboarding.jsx. Isto existe porque a migração
-- pode ainda não estar aplicada quando o código novo chega ao browser.
-- ============================================================================

alter table public.profiles
  add column if not exists onboarding_done boolean not null default false;

comment on column public.profiles.onboarding_done is
  'Os seis passos do arranque conduzidos pela Carol já foram concluídos (ou dispensados por o atleta já ter dados). Ver src/utils/onboarding.js.';
