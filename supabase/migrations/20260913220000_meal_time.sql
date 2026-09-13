-- ============================================================================
-- Hora da refeição (pedido 2026-09-13) — a par de start_time em race_events,
-- runs e workout_sessions (20260912212930_start_times.sql).
--
-- Porquê: as refeições só tinham o tipo ("almoço"), e a Carol só conseguia
-- falar de "comer 2-3 horas antes" em abstrato. Com a hora, a véspera e a
-- manhã da prova ganham horas reais, e o Calendário ordena o dia pela hora
-- em vez de pelo tipo. `time` sem fuso, hora local do atleta, opcional: os
-- registos antigos não a têm e nada os obriga a ter.
-- ============================================================================

alter table public.meals
  add column if not exists meal_time time;
comment on column public.meals.meal_time is
  'Hora local a que a refeição foi tomada (opcional). Ordena o dia e entra na análise da Carol.';
