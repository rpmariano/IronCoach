import { describe, it, expect } from 'vitest';
import { goalsForDay, dayNutritionSummary, planMacrosForDay, DAY_GOAL_DEFAULTS } from './goalHistory';

/* Bug #51: o objetivo de um dia passado vem do histórico, não do perfil de
   hoje — e diz-se se foi atingido. */

const HISTORY = [
  { valid_from: '2026-07-11T16:01:53Z', calorie_goal: 2000, protein_goal: 145, carbs_goal: 210, fat_goal: 65, water_goal_ml: 2500, source: 'inicial' },
  { valid_from: '2026-09-23T20:46:17Z', calorie_goal: 2000, protein_goal: 145, carbs_goal: 185, fat_goal: 75, water_goal_ml: 2500, source: 'proposta' },
  // 23:30 UTC de 30/09 já é 1/10 em Lisboa (UTC+1): vale para o dia 1.
  { valid_from: '2026-09-30T23:30:00Z', calorie_goal: 2000, protein_goal: 145, carbs_goal: 210, fat_goal: 65, water_goal_ml: 2500, source: 'proposta' },
];

describe('goalsForDay', () => {
  it('o objetivo de um dia é o da última mudança até ao fim desse dia, em hora de Lisboa', () => {
    expect(goalsForDay(HISTORY, '2026-09-25', {}).goals.carbs_goal).toBe(185);
    expect(goalsForDay(HISTORY, '2026-09-30', {}).goals.carbs_goal).toBe(185);
    expect(goalsForDay(HISTORY, '2026-10-01', {}).goals.carbs_goal).toBe(210);
    // Mudar a meio do dia vale para o dia inteiro.
    expect(goalsForDay(HISTORY, '2026-09-23', {}).goals.fat_goal).toBe(75);
  });

  it('a linha inicial e os dias antes do histórico são aproximados; o resto não', () => {
    expect(goalsForDay(HISTORY, '2026-08-01', {}).estimated).toBe(true);
    expect(goalsForDay(HISTORY, '2026-07-01', {}).estimated).toBe(true);
    expect(goalsForDay(HISTORY, '2026-09-25', {}).estimated).toBe(false);
  });

  it('sem histórico (a carregar, modo demo) valem os objetivos do perfil; um vazio cai no valor por omissão', () => {
    const { goals, estimated } = goalsForDay([], '2026-09-25', { calorie_goal: 2300, protein_goal: null });
    expect(goals.calorie_goal).toBe(2300);
    expect(goals.protein_goal).toBe(DAY_GOAL_DEFAULTS.protein_goal);
    expect(estimated).toBe(false);
  });
});

describe('dayNutritionSummary', () => {
  const goals = { calorie_goal: 2000, protein_goal: 150, carbs_goal: 200, fat_goal: 70, water_goal_ml: 2500 };
  const meal = (date, kcal, p, c, f) => ({ date, meal_items: [{ quantity_grams: 100, calories_per_100g: kcal, protein_per_100g: p, carbs_per_100g: c, fat_per_100g: f }] });

  it('diz o comido contra o objetivo e se foi atingido', () => {
    const rows = dayNutritionSummary({
      meals: [meal('2026-10-02', 1900, 170, 120, 90), meal('2026-10-03', 500, 10, 10, 10)],
      waterLogs: [{ date: '2026-10-02', amount_ml: 1500 }],
      dayISO: '2026-10-02',
      goals,
    });
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.calories).toMatchObject({ value: 1900, target: 2000, pct: 95, status: 'ok' });
    // Proteína sem teto: passar não é falhar.
    expect(by.protein).toMatchObject({ value: 170, status: 'ok' });
    expect(by.carbs).toMatchObject({ value: 120, pct: 60, status: 'abaixo' });
    expect(by.fat).toMatchObject({ value: 90, pct: 129, status: 'acima' });
    expect(by.water).toMatchObject({ value: 1500, target: 2500, status: 'abaixo' });
  });

  it('um dia sem registos não é "abaixo" — é sem registo', () => {
    const rows = dayNutritionSummary({ meals: [], waterLogs: [], dayISO: '2026-10-02', goals });
    expect(rows.every((r) => r.status === 'sem_registo')).toBe(true);
  });
});

describe('planMacrosForDay', () => {
  it('as macros que o plano aceite sugeria para o dia; a sugestão mais recente ganha', () => {
    const coachPlans = [{ id: 'p1', status: 'aceite' }, { id: 'p2', status: 'proposto' }];
    const coachPlanItems = [
      { plan_id: 'p1', planned_date: '2026-10-02', status: 'pendente', created_at: '2026-09-28', meal_macros: { kcal: 2100, protein_g: 140, carbs_g: 250, fat_g: 60 } },
      { plan_id: 'p1', planned_date: '2026-10-02', status: 'pendente', created_at: '2026-09-30', meal_macros: { kcal: 2250.4, protein_g: 150, carbs_g: 270, fat_g: 62 } },
      { plan_id: 'p2', planned_date: '2026-10-02', status: 'pendente', created_at: '2026-10-01', meal_macros: { kcal: 3000 } },
    ];
    expect(planMacrosForDay({ coachPlans, coachPlanItems, dayISO: '2026-10-02' })).toEqual({ kcal: 2250, protein: 150, carbs: 270, fat: 62 });
    expect(planMacrosForDay({ coachPlans, coachPlanItems, dayISO: '2026-10-05' })).toBe(null);
  });
});
