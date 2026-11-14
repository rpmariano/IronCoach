-- O perfil do percurso a partir de um GPX que o atleta carrega (pedido do
-- Rui, 2026-11-14: «permite fazer upload do arquivo gpx nas provas, para a
-- carol conhecer o percurso»; e «as coordenadas podem ser guardadas»).
--
-- O ficheiro GPX não se guarda: a app lê-o no telemóvel e grava aqui só o que
-- _shared/formulas/courseProfile.ts devolve — números: distância, D+/D−,
-- altitudes, por km, subidas, o traçado reamostrado (≤ 1000 pontos [lat, lon,
-- km, altitude]) e a partida e a chegada. Nomes, descrições e waypoints do
-- GPX nem se leem. À Carol só vão os números do perfil, nunca as coordenadas.
-- O servidor trata o jsonb como dado não confiável (sanitizeCourseProfile).
--
-- A escrita é a da própria prova (as políticas de race_events do dono): sem
-- política nova. O CHECK só trava o tamanho e a forma; o conteúdo valida-o a
-- fórmula. Um perfil real anda pelos 40–60 KB com o traçado inteiro; 150 KB
-- é o teto.

alter table public.race_events
  add column if not exists course_profile jsonb,
  add column if not exists course_profile_at timestamptz;

alter table public.race_events drop constraint if exists race_events_course_profile_shape;
alter table public.race_events add constraint race_events_course_profile_shape check (
  course_profile is null
  or (jsonb_typeof(course_profile) = 'object' and octet_length(course_profile::text) <= 153600)
);

comment on column public.race_events.course_profile is
  'Perfil do percurso tirado de um GPX no telemóvel (_shared/formulas/courseProfile.ts, v1): só números, com o traçado reamostrado e a partida/chegada. Dado do cliente — o servidor passa-o por sanitizeCourseProfile antes de o usar; à Carol não vão coordenadas.';
comment on column public.race_events.course_profile_at is
  'Quando o atleta carregou o GPX que deu o course_profile.';
