import { describe, it, expect, beforeEach } from 'vitest';
import { partialMealDays, resetPartialMealDaysMemo } from './partialMealDays';

/* Opção B (2026-11-01): a regra real (@formulas/dayCompleteness.ts), vista do lado da app. */
const TODAY = '2026-11-01';
let n = 0;
const meal = (date, meal_type, calories) => ({ id: `m${n++}`, date, meal_type, meal_items: [{ calories, protein: 0, carbs: 0, fat: 0 }] });
const fullDay = (date, kcal = 1800) => [meal(date, 'pequeno-almoco', kcal * 0.25), meal(date, 'almoco', kcal * 0.4), meal(date, 'jantar', kcal * 0.35)];
const goalsFor = () => ({ goals: { calorie_goal: 2000 } });

describe('partialMealDays', () => {
  beforeEach(() => resetPartialMealDaysMemo());

  it('as 3 principais contam sempre como completo, por pouco que seja; um dia só com o pequeno-almoço é parcial', () => {
    const meals = [...fullDay('2026-10-28', 600), meal('2026-10-29', 'pequeno-almoco', 400), ...fullDay('2026-10-30')];
    const { isPartial } = partialMealDays(meals, goalsFor, TODAY);
    expect(isPartial('2026-10-28')).toBe(false);
    expect(isPartial('2026-10-29')).toBe(true);
    expect(isPartial('2026-10-30')).toBe(false);
  });

  it('um dia sem refeições não é parcial (é sem registo); hoje nunca é parcial', () => {
    const meals = [meal(TODAY, 'pequeno-almoco', 300)];
    const { isPartial } = partialMealDays(meals, goalsFor, TODAY);
    expect(isPartial('2026-10-20')).toBe(false);
    expect(isPartial(TODAY)).toBe(false);
  });

  it('o perfil: quem regista quase todos os dias completos é «completo»; poucos dias completos, «ocasional»', () => {
    const days = Array.from({ length: 27 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 9, 5 + i));
      return d.toISOString().slice(0, 10);
    });
    const regular = days.flatMap((d) => fullDay(d));
    expect(partialMealDays(regular, goalsFor, TODAY).profile.kind).toBe('completo');
    const ocasional = days.filter((_, i) => i % 5 === 0).flatMap((d) => fullDay(d));
    expect(partialMealDays(ocasional, goalsFor, TODAY).profile.kind).toBe('ocasional');
  });
});
