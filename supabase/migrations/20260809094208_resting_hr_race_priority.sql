-- ============================================================================
-- Dois campos exigidos pela investigação de doutrina dos coaches
-- (specs/coach-investigacao.md, decisões A1 e A2 dos Blocos 0/1/2)
--
-- Idempotente: pode correr mais que uma vez sem efeito adverso.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A1. profiles.resting_hr_bpm — frequência cardíaca em repouso
-- ---------------------------------------------------------------------------
-- Pedida de forma independente por DOIS usos não relacionados, o que foi o
-- argumento decisivo para a acrescentar:
--   1. Fórmula de Karvonen (FC de reserva), a mais defensável para calcular
--      zonas de treino: FCalvo = FCrep + % × (FCmáx − FCrep), com FCmáx por
--      Tanaka (208 − 0,7 × idade). Ver Corrida 2.2 #4.
--   2. Sinal #1 de sobreuso: subida de ≥5-7 bpm acima da média móvel de 7-14
--      dias, mantida ≥2-3 dias, precede lesão. Ver Corrida 2.4 #2.
--
-- Nullable por decisão: sem este valor as zonas caem para %FCmáx simples (sem
-- reserva), que é menos preciso mas continua a funcionar.
--
-- Limites do check: 25 bpm é território de atleta de elite muito treinado,
-- 120 é patológico — fora disto é erro de introdução, não um valor real.
alter table profiles
  add column if not exists resting_hr_bpm integer
    check (resting_hr_bpm is null or (resting_hr_bpm between 25 and 120));

comment on column profiles.resting_hr_bpm is
  'Frequência cardíaca em repouso (bpm), medida idealmente ao acordar. '
  'Usada em duas coisas distintas: (1) fórmula de Karvonen para zonas de FC, '
  'mais precisa que %FCmáx simples; (2) linha de base do sinal de sobreuso — '
  'uma subida sustentada de 5-7 bpm precede lesão. Nullable: sem ela, as '
  'zonas caem para %FCmáx. Ver specs/coach-investigacao.md, Corrida 2.2 #4 '
  'e 2.4 #2.';

-- ---------------------------------------------------------------------------
-- A2. race_events.race_priority — prova principal vs. secundária
-- ---------------------------------------------------------------------------
-- O taper depende disto de forma decisiva: 10-21 dias de polimento para uma
-- prova principal (A-race) vs. apenas 2-4 dias para uma prova secundária ou
-- de treino (B/C-race). Sem o campo, o coach aplicaria taper longo a todas as
-- provas, prejudicando quem usa provas como treino. Ver Corrida 2.3 #1.
--
-- Omissão 'a': é o caso mais comum e o mais seguro — quem não pensar no
-- assunto recebe o taper completo, que erra por excesso de cautela e não por
-- defeito.
alter table race_events
  add column if not exists race_priority text not null default 'a'
    check (race_priority in ('a', 'b', 'c'));

comment on column race_events.race_priority is
  'Prioridade da prova: a = principal (objetivo da época, taper completo de '
  '10-21 dias), b = secundária, c = prova de treino (taper de só 2-4 dias). '
  'Omissão ''a'' porque errar por excesso de taper é mais seguro que por '
  'defeito. Ver specs/coach-investigacao.md, Corrida 2.3 #1.';
