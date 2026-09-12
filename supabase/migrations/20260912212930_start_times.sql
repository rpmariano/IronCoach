-- ============================================================================
-- Hora de início — na prova, na corrida e na sessão de ginásio
-- (specs/plano-de-prova.md, "A véspera e a hora").
--
-- Porquê: a Carol só conseguia planear a véspera e a manhã da prova em
-- abstrato ("acorda cedo, toma o pequeno-almoço 2-3 horas antes"). Com a
-- hora de partida, os conselhos passam a ter horas: a que horas acordar, a
-- que horas comer, a que horas estar na partida, quantas horas de sono
-- cabem. E a hora a que o atleta treina (corrida e ginásio) deixa de ser
-- invisível: treinos tarde a roubar sono, ou treinar à hora da prova na
-- última semana para habituar o corpo.
--
-- `time` sem fuso, em hora local do atleta, como os lembretes de água (ver
-- profiles.water_reminder_*): é a hora que ele vê no relógio. Tudo nullable:
-- os registos antigos não a têm e nada os obriga a ter.
-- ============================================================================

alter table public.race_events
  add column if not exists start_time time;
comment on column public.race_events.start_time is
  'Hora de partida da prova, em hora local (a que o atleta vê). Opcional.';

alter table public.runs
  add column if not exists start_time time;
comment on column public.runs.start_time is
  'Hora de início da corrida, em hora local. Opcional.';

alter table public.workout_sessions
  add column if not exists start_time time;
comment on column public.workout_sessions.start_time is
  'Hora de início da sessão de ginásio, em hora local. Opcional.';
