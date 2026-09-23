import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeReadinessIndex, checkinPillar } from '@formulas/readinessIndex.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/readinessIndex.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeReadinessIndex — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      const result = computeReadinessIndex(
        input.runs,
        input.meals,
        input.bodyAssessments,
        input.gymSessions,
        input.profile,
        input.todayISO,
        input.nextRace,
      );
      expect(result).toEqual(exp);
    });
  }
});

// Pilar "Como acordaste" (2026-09-23): o check-in de hoje entra no índice.
describe('computeReadinessIndex — check-in de hoje', () => {
  const base = (checkin) => computeReadinessIndex([], [], [], [], {}, '2026-09-23', null, checkin);

  it('sem check-in não há pilar — o índice fica igual ao de sempre', () => {
    expect(base(null).pillars.map((p) => p.key)).not.toContain('checkin');
    expect(base(null)).toEqual(computeReadinessIndex([], [], [], [], {}, '2026-09-23', null));
  });

  it('dormiu e acordou bem, calmo: pilar a 100', () => {
    const p = checkinPillar({ sleep: 5, energy: 5, stress: 1, pain: 0 });
    expect(p.score).toBe(100);
    expect(base({ sleep: 5, energy: 5, stress: 1, pain: 0 }).pillars.at(-1).key).toBe('checkin');
  });

  it('dormiu mal e sem energia: o índice desce', () => {
    const bem = base({ sleep: 5, energy: 5, stress: 1, pain: 0 }).score;
    const mal = base({ sleep: 1, energy: 2, stress: 4, pain: 0 }).score;
    expect(mal).toBeLessThan(bem);
    expect(checkinPillar({ sleep: 1, energy: 2, stress: 4, pain: 0 }).desc).toMatch(/mais leve/);
  });

  it('dor ≥4 fica no máximo em 20, mesmo com o resto ótimo', () => {
    const p = checkinPillar({ sleep: 5, energy: 5, stress: 1, pain: 4 });
    expect(p.score).toBe(20);
    expect(p.desc).toMatch(/Dor de 4\/10/);
  });

  it('dor ligeira tira 5 pontos por ponto', () => {
    expect(checkinPillar({ sleep: 5, energy: 5, stress: 1, pain: 2 }).score).toBe(90);
  });

  it('check-in incompleto não conta', () => {
    expect(checkinPillar({ sleep: 4, energy: null, stress: 2 })).toBeNull();
  });
});
