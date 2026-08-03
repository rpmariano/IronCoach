import { describe, it, expect } from 'vitest';
import { dayNutrientStatus, dayWaterGoalMet } from './nutrition';

const DAY = '2026-08-03';
const OTHER_DAY = '2026-08-02';

const GOALS = {
  calorie_goal: 2000,
  protein_goal: 150,
  carbs_goal: 250,
  fat_goal: 70,
};

// Refeição única com os macros indicados (mealNutrients cai para os campos
// diretos quando a refeição não tem meal_items).
const meal = (overrides = {}) => ({
  id: 1,
  date: DAY,
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  ...overrides,
});

describe('dayNutrientStatus', () => {
  it('devolve "none" quando o dia não tem refeições', () => {
    expect(dayNutrientStatus([], DAY, GOALS)).toBe('none');
    expect(dayNutrientStatus([meal({ date: OTHER_DAY })], DAY, GOALS)).toBe('none');
  });

  it('devolve "ok" com as três macros dentro da meta e a proteína cumprida', () => {
    const meals = [meal({ calories: 1800, protein: 160, carbs: 200, fat: 60 })];
    expect(dayNutrientStatus(meals, DAY, GOALS)).toBe('ok');
  });

  it('soma várias refeições do mesmo dia', () => {
    const meals = [
      meal({ id: 1, calories: 1000, protein: 80, carbs: 120, fat: 30 }),
      meal({ id: 2, calories: 900, protein: 75, carbs: 120, fat: 35 }),
    ];
    // Total: 1900 kcal, 155 P, 240 H, 65 G — tudo dentro das metas.
    expect(dayNutrientStatus(meals, DAY, GOALS)).toBe('ok');
  });

  it.each([
    ['calorias', { calories: 2100, protein: 160, carbs: 200, fat: 60 }],
    ['hidratos', { calories: 1800, protein: 160, carbs: 260, fat: 60 }],
    ['gordura', { calories: 1800, protein: 160, carbs: 200, fat: 80 }],
  ])('devolve "over" quando excede %s', (_label, macros) => {
    expect(dayNutrientStatus([meal(macros)], DAY, GOALS)).toBe('over');
  });

  it('devolve "over" quando a proteína fica abaixo da meta', () => {
    const meals = [meal({ calories: 1500, protein: 100, carbs: 180, fat: 50 })];
    expect(dayNutrientStatus(meals, DAY, GOALS)).toBe('over');
  });

  it('trata igualar a meta como cumprido, não como excedido', () => {
    const meals = [meal({ calories: 2000, protein: 150, carbs: 250, fat: 70 })];
    expect(dayNutrientStatus(meals, DAY, GOALS)).toBe('ok');
  });

  it('não marca "over" por macros sem meta definida', () => {
    const meals = [meal({ calories: 5000, protein: 10, carbs: 900, fat: 300 })];
    expect(dayNutrientStatus(meals, DAY, {})).toBe('ok');
    expect(dayNutrientStatus(meals, DAY, null)).toBe('ok');
  });

  it('aplica só as metas que estão definidas', () => {
    // Sem meta de calorias, mas com meta de gordura excedida.
    const meals = [meal({ calories: 9000, protein: 0, carbs: 0, fat: 80 })];
    expect(dayNutrientStatus(meals, DAY, { fat_goal: 70 })).toBe('over');
  });
});

describe('dayWaterGoalMet', () => {
  const log = (amount_ml, date = DAY) => ({ date, amount_ml });

  it('é falso quando o dia não tem registos', () => {
    expect(dayWaterGoalMet([], DAY, { water_goal_ml: 2000 })).toBe(false);
    expect(dayWaterGoalMet([log(3000, OTHER_DAY)], DAY, { water_goal_ml: 2000 })).toBe(false);
  });

  it('soma os registos do dia e compara com a meta', () => {
    const logs = [log(500), log(750), log(750)];
    expect(dayWaterGoalMet(logs, DAY, { water_goal_ml: 2000 })).toBe(true);
  });

  it('é falso quando a soma fica abaixo da meta', () => {
    expect(dayWaterGoalMet([log(500), log(750)], DAY, { water_goal_ml: 2000 })).toBe(false);
  });

  it('igualar a meta conta como atingida', () => {
    expect(dayWaterGoalMet([log(2000)], DAY, { water_goal_ml: 2000 })).toBe(true);
  });

  it('usa 2000 ml por omissão quando o perfil não define meta', () => {
    expect(dayWaterGoalMet([log(2000)], DAY, {})).toBe(true);
    expect(dayWaterGoalMet([log(1900)], DAY, null)).toBe(false);
  });

  it('ignora registos de outros dias na soma', () => {
    const logs = [log(1500), log(1500, OTHER_DAY)];
    expect(dayWaterGoalMet(logs, DAY, { water_goal_ml: 2000 })).toBe(false);
  });
});
