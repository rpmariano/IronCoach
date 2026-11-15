/* As corridas e o plano reais da Patty a 9 nov 2026 (os mesmos do loadProfile.test.ts do Backend):
   a carga pede cautela (ACWR 1,31) e o volume fica abaixo do que a meia pede — o conflito. */
export const TODAY = '2026-11-09';
const R = (date, km, training_type, kind = 'treino', rpe = 5) =>
  ({ date, distance_km: km, training_type, kind, effort_rpe: rpe, duration_seconds: Math.round(km * 340) });
export const PATTY_RUNS = [
  R('2026-10-13', 5.01, 'continuo'), R('2026-10-16', 6.04, 'continuo'), R('2026-10-17', 18.38, 'caminhada', 'treino', 6),
  R('2026-10-20', 5.02, 'continuo'), R('2026-10-23', 4, 'recuperacao'), R('2026-10-25', 10.12, null, 'competicao', 8),
  R('2026-10-27', 4.03, 'recuperacao', 'treino', null), R('2026-10-30', 5.04, 'continuo'), R('2026-11-01', 8.01, 'longo'),
  R('2026-11-03', 8.01, 'longo'), R('2026-11-05', 5.18, 'continuo', 'treino', 6), R('2026-11-08', 9.95, null, 'competicao', 7),
];
const I = (planned_date, km, training_type, kind = 'corrida', status = 'pendente') =>
  ({ plan_id: 'p2', planned_date, kind, training_type, status, target_distance_km: km });
export const PATTY_PLAN_ITEMS = [
  I('2026-11-03', 8, 'longo', 'corrida', 'concluido'), I('2026-11-05', 5, 'continuo', 'corrida', 'concluido'), I('2026-11-08', 10, 'prova', 'corrida', 'concluido'),
  I('2026-11-10', 6, 'continuo'), I('2026-11-11', null, null, 'ginasio'), I('2026-11-12', 6, 'continuo'), I('2026-11-13', 4, 'ativacao'),
  I('2026-11-15', 10, 'prova'), I('2026-11-22', 3, 'prova'), I('2026-11-29', 21.0975, 'prova'),
];
export const PATTY_PLANS = [{ id: 'p2', status: 'aceite', period_end: '2026-11-29' }];
export const TRAIL = { id: 'trail', name: 'Atlantic Cliff Adventure', date: '2026-11-15', distance_km: 10, race_priority: 'b', status: 'agendada', experience_level: 'basico' };
export const MEIA = { id: 'meia', name: 'Meia dos Descobrimentos', date: '2026-11-29', distance_km: 21.0975, race_priority: 'a', status: 'agendada', experience_level: 'basico' };

