-- ============================================================================
-- O sítio onde o atleta treina
-- (specs/carol-omnisciencia-omnipresenca.md, ação 5.6, push B)
-- APLICADA EM PRODUÇÃO a 2026-09-25 00:52 UTC (version 20260925005244).
-- Testada lá numa transação revertida: os checks recusam cidade vazia,
-- coordenadas e altitude fora do intervalo; o dono grava e limpa as quatro
-- colunas pela RLS de sempre (não há grants por coluna em profiles).
-- ============================================================================
--
-- A Carol só sabia o tempo da prova. Com a cidade de treino, passa a saber o
-- tempo à hora a que ele costuma treinar, hoje e amanhã, quando há treino no
-- plano (_shared/trainingWeatherFetch.ts, no chat e no cartão diário).
--
-- A cidade é geocodificada UMA vez, no Perfil, e o atleta confirma
-- ("Encontrei: Lisboa, Portugal"): ficam o nome, as coordenadas e a altitude,
-- para o servidor ir direto à previsão sem procurar nada a cada pedido. As
-- quatro colunas andam juntas — o Perfil grava-as ou limpa-as de uma vez.
-- ============================================================================

alter table public.profiles
  add column if not exists training_city text
    check (training_city is null or char_length(training_city) between 1 and 120),
  add column if not exists training_lat double precision
    check (training_lat is null or training_lat between -90 and 90),
  add column if not exists training_lon double precision
    check (training_lon is null or training_lon between -180 and 180),
  add column if not exists training_altitude_m integer
    check (training_altitude_m is null or training_altitude_m between -500 and 9000);

comment on column public.profiles.training_city is 'Onde o atleta treina, como o Perfil o confirmou ("Lisboa, Portugal").';
comment on column public.profiles.training_lat is 'Latitude da cidade de treino (geocodificada no Perfil).';
comment on column public.profiles.training_lon is 'Longitude da cidade de treino (geocodificada no Perfil).';
comment on column public.profiles.training_altitude_m is 'Altitude da cidade de treino, em metros.';
