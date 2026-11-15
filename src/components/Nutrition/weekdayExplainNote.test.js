import { describe, it, expect } from 'vitest';
import { weekdayExplainNote } from './NutritionQuarterCharts';

/* Revisão de 2026-11-02: o pedido à Carol do cartão por dia da semana só leva as médias dos dias
   que o cartão usa (os fortes); os de poucos dados vão à parte, marcados. */
describe('weekdayExplainNote', () => {
  it('médias só dos fortes; os fracos como pouco fiáveis, sem média', () => {
    const days = [
      { avg: 2310, n: 8, thin: false }, { avg: 2250, n: 7, thin: false }, null,
      { avg: 2400, n: 6, thin: false }, { avg: 2100, n: 5, thin: false },
      { avg: 1500, n: 2, thin: true }, { avg: 1800, n: 1, thin: true },
    ];
    const t = weekdayExplainNote(days, 'kcal');
    expect(t).toMatch(/^Média por dia da semana: /);
    expect(t).toContain('(8 dias)');
    expect(t).not.toMatch(/1\s?500/);
    expect(t).toMatch(/Com poucos dados: .*2 dias, pouco fiável; .*1 dia, pouco fiável\./);
  });
  it('sem dias, nada', () => {
    expect(weekdayExplainNote([], 'kcal')).toBeNull();
  });
});
