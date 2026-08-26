import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeEnergyAvailabilityWindow } from '@formulas/energyAvailabilityWindow.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/energyAvailabilityWindow.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeEnergyAvailabilityWindow — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      const result = computeEnergyAvailabilityWindow(
        input.meals,
        input.bodyAssessments,
        input.runs,
        input.gymSessions,
        input.todayISO,
        input.range,
      );
      expect(result).toEqual(exp);
    });
  }
});
