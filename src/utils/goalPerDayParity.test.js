import { describe, it, expect, beforeEach } from 'vitest';
import { partialMealDays, resetPartialMealDaysMemo } from './partialMealDays';
import { goalsResolver } from './goalHistory';
import { calculateReadinessIndex } from './biEngine';
import { todayISO, addDaysISO } from '../lib/utils';
import { calorieGoalResolver } from '@formulas/goalHistory.ts';
import { daysCompleteness, mealLoggingProfile } from '@formulas/dayCompleteness.ts';
import { computeReadinessIndex } from '@formulas/readinessIndex.ts';

/* 2026-11-02 (dev-back 197683ee): o servidor julga cada dia com o objetivo calórico DESSE dia
   (calorieGoalResolver). O cliente tem de dar o mesmo — no perfil de registo, nos dias parciais e
   na prontidão — quando o objetivo mudou a meio da janela. */

const TODAY = todayISO();
const ago = (n) => addDaysISO(TODAY, -n);
let k = 0;
const meal = (date, meal_type, calories) => ({ id: `p${k++}`, date, meal_type, meal_items: [{ calories, protein: calories * 0.05, carbs: calories * 0.12, fat: calories * 0.03 }] });
// Almoço e jantar com 1 100 kcal: completo contra 2 000 (≥ 50%), parcial contra 3 000 (< 50%).
const twoMains = (date) => [meal(date, 'almoco', 600), meal(date, 'jantar', 500)];

const PROFILE = { id: 'u1', calorie_goal: 3000, protein_goal: 150, carbs_goal: 300, fat_goal: 80 };
// O objetivo subiu de 2 000 para 3 000 há 5 dias.
const HISTORY = [
  { valid_from: `${ago(60)}T00:00:00Z`, source: 'manual', calorie_goal: 2000, protein_goal: 150, carbs_goal: 300, fat_goal: 80, water_goal_ml: 2500 },
  { valid_from: `${ago(5)}T00:00:00Z`, source: 'manual', calorie_goal: 3000, protein_goal: 150, carbs_goal: 300, fat_goal: 80, water_goal_ml: 2500 },
];
const MEALS = [ago(10), ago(8), ago(3), ago(2)].flatMap(twoMains);
const DAYS = [ago(10), ago(8), ago(3), ago(2)];

describe('o objetivo de cada dia — cliente igual ao servidor', () => {
  beforeEach(() => resetPartialMealDaysMemo());

  it('dias parciais e perfil: partialMealDays dá o mesmo que daysCompleteness com calorieGoalResolver', () => {
    const server = calorieGoalResolver(HISTORY, PROFILE, TODAY);
    const serverProfile = mealLoggingProfile(MEALS, TODAY, server);
    const serverStates = daysCompleteness(MEALS, DAYS, { calorieTarget: server, profile: serverProfile, todayISO: TODAY });

    const client = partialMealDays(MEALS, goalsResolver(HISTORY, PROFILE, TODAY), TODAY);
    expect(client.profile).toEqual(serverProfile);
    for (const d of DAYS) expect(client.isPartial(d)).toBe(serverStates.get(d) === 'parcial');
    // E o objetivo mudou mesmo a meio: antes da mudança completo, depois parcial.
    expect(DAYS.map((d) => client.isPartial(d))).toEqual([false, false, true, true]);
  });

  it('prontidão: calculateReadinessIndex com o histórico dá o mesmo que o servidor com calorieGoalResolver', () => {
    const client = calculateReadinessIndex([], MEALS, [], [], PROFILE, null, [], undefined, HISTORY);
    const server = computeReadinessIndex([], MEALS, [], [], PROFILE, TODAY, null, null, undefined, calorieGoalResolver(HISTORY, PROFILE, TODAY));
    expect(client).toEqual(server);
  });
});
