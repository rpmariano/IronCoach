import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeWeightTrend } from '@formulas/weightTrend.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/weightTrend.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeWeightTrend — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      const result = computeWeightTrend(input.rawPoints);
      expect(result).toEqual(exp);
    });
  }
});

// C1/C2 (2026-10-04): o ritmo é declive por dia × 7 e só existe com ≥3
// pesagens a abranger ≥10 dias na janela de 14 — os casos do erro, à mão.
describe('computeWeightTrend — ritmo semanal (C1/C2)', () => {
  it('2 pesagens a 3 dias não dão "kg/semana"', () => {
    const r = computeWeightTrend([{ date: '2026-10-01', weight: 80 }, { date: '2026-10-04', weight: 80.6 }]);
    expect(r).toMatchObject({ weeklyRate: null, trend: null, sufficient: false, spanDays: 3, pointsInWindow: 2 });
  });

  it('80,0 a 10/07 e 74,0 a 01/10 não dão "estavel"', () => {
    const r = computeWeightTrend([{ date: '2026-07-10', weight: 80 }, { date: '2026-10-01', weight: 74 }]);
    expect(r.trend).toBeNull();
    expect(r.weeklyRate).toBeNull();
  });

  it('4 pesagens em 14 dias a descer 0,1 kg/dia → −0,7 kg/semana', () => {
    const r = computeWeightTrend([
      { date: '2026-09-17', weight: 80 },
      { date: '2026-09-21', weight: 79.6 },
      { date: '2026-09-26', weight: 79.1 },
      { date: '2026-10-01', weight: 78.6 },
    ]);
    expect(r).toMatchObject({ weeklyRate: -0.7, trend: 'descendo', sufficient: true });
  });

  it('1 só pesagem: média móvel com 1 ponto, sem taxa nem tendência', () => {
    const r = computeWeightTrend([{ date: '2026-10-01', weight: 74 }]);
    expect(r.movingAverage).toHaveLength(1);
    expect(r.trend).toBeNull();
    expect(r.weeklyRate).toBeNull();
  });
});
