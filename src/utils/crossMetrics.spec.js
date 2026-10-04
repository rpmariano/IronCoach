import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeCrossMetrics } from '@formulas/crossMetrics.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/crossMetrics.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeCrossMetrics — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      const result = computeCrossMetrics(input.runs, input.gymSessions, input.bodyAssessments, input.todayISO, input.range);
      expect(result).toEqual(exp);
    });
  }
});

// O6 (2026-10-04): o RPE só existe quando foi registado — nunca 5 por
// omissão nem 0 numa semana sem corridas (espelho do teste Deno).
describe('computeCrossMetrics — O6 sem RPE inventado', () => {
  it('nenhuma semana tem RPE (5 ou 0) sem RPE registado', () => {
    const r = computeCrossMetrics(
      [{ date: '2026-08-12', distance_km: 8, duration_seconds: 2400 }],
      [
        { date: '2026-08-12', workout_session_sets: [{ reps: 10, weight: 50 }] },
        { date: '2026-08-19', workout_session_sets: [{ reps: 10, weight: 50 }] },
      ],
      [],
      '2026-08-25',
      'mes',
    );
    expect(r.gymLoadVsRunRPE.map((p) => p.runRPE)).toEqual([null, null]);
  });
});
