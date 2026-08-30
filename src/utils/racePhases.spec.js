import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computePhaseWindows, resolvePhaseState } from '@formulas/racePhases.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/racePhases.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('racePhases — vetor dourado', () => {
  for (const { fn, name, input, expect: exp } of golden) {
    it(`${fn} — ${name}`, () => {
      const result = fn === 'computePhaseWindows'
        ? computePhaseWindows(input.totalWeeks, input.taperWeeks, input.planStartISO)
        : resolvePhaseState(input.trainingStatus, input.todayISO, input.startDateStr, input.endDateStr, input.effectiveStartISO);
      expect(result).toEqual(exp);
    });
  }
});
