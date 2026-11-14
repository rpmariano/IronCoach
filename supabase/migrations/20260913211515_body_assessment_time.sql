-- Hora da avaliação corporal (pedido 2026-09-13): a hora a que a pesagem
-- foi feita, não a de introdução na app — a par de start_time (corrida,
-- ginásio, prova) e meal_time (refeição). Hora local, opcional.

alter table public.body_assessments
  add column if not exists assessment_time time;
comment on column public.body_assessments.assessment_time is
  'Hora local a que a avaliação foi feita (opcional). Ordena o dia no Calendário e entra na análise da Carol.';
