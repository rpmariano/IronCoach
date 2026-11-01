import { describe, it, expect } from 'vitest';
import { dayCompleteness, daysCompleteness, mealLoggingProfile, mealsOfCompleteDays } from '@formulas/dayCompleteness.ts';

// Opção B do Rui (2026-11-01): o dia completo ou parcial infere-se, sem
// botão. A mesma fórmula da Carol (dayCompleteness.test.ts, do lado do servidor).

const meal = (date, meal_type, calories) => ({ date, meal_type, calories, protein_g: 0, carbs_g: 0, fat_g: 0 });
const cheio = (date, kcal) => [meal(date, 'pequeno-almoco', kcal / 3), meal(date, 'almoco', kcal / 3), meal(date, 'jantar', kcal / 3)];
const TODAY = '2026-11-01';

describe('dayCompleteness', () => {
  it('com a mediana dos dias cheios: só o pequeno-almoço é parcial; almoço e jantar a ≥ 50% é completo', () => {
    const prof = { fullDayMedianKcal: 1700 };
    expect(dayCompleteness([meal('2026-10-31', 'pequeno-almoco', 900)], null, prof)).toBe('parcial');
    expect(dayCompleteness([meal('2026-10-31', 'almoco', 500), meal('2026-10-31', 'jantar', 400)], null, prof)).toBe('completo');
  });

  it('sem histórico, a regra fixa: uma só refeição ou < 50% do objetivo é parcial', () => {
    expect(dayCompleteness([meal('2026-10-31', 'jantar', 1500)], 2000, null)).toBe('parcial');
    expect(dayCompleteness([meal('2026-10-31', 'almoco', 600), meal('2026-10-31', 'jantar', 400)], 2000, null)).toBe('completo');
  });

  it('hoje é sempre em curso', () => {
    expect(dayCompleteness(cheio(TODAY, 2000), 2000, null, { dayISO: TODAY, todayISO: TODAY })).toBe('em_curso');
  });
});

describe('mealLoggingProfile + daysCompleteness', () => {
  it('quem regista todos os dias é completo; os dias parciais ficam fora das médias', () => {
    const dias = Array.from({ length: 10 }, (_, i) => `2026-10-${String(22 + i).padStart(2, '0')}`);
    const meals = [...dias.slice(0, 9).flatMap((d) => cheio(d, 2000)), meal('2026-10-31', 'pequeno-almoco', 400)];
    const p = mealLoggingProfile(meals, TODAY, 2000);
    expect(p.kind).toBe('completo');
    expect(p.fullDayMedianKcal).toBe(2000);
    const st = daysCompleteness(meals, dias, { calorieTarget: 2000, profile: p, todayISO: TODAY });
    expect(st.get('2026-10-31')).toBe('parcial');
    expect(mealsOfCompleteDays(meals, st).some((m) => m.date === '2026-10-31')).toBe(false);
  });

  it('quem regista de vez em quando é ocasional', () => {
    const p = mealLoggingProfile([...cheio('2026-10-12', 2000), ...cheio('2026-10-25', 2000)], TODAY, 2000);
    expect(p.kind).toBe('ocasional');
  });
});
