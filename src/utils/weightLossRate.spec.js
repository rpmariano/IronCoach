import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { assessWeightLossRate } from '@formulas/weightLossRate.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/weightLossRate.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('assessWeightLossRate — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      const result = assessWeightLossRate(input.weeklyRateKg, input.currentWeightKg, input.experienceLevel);
      if (exp === null) {
        expect(result).toBeNull();
      } else {
        expect(result.lossPct).toBeCloseTo(exp.lossPct, 6);
        expect(result.maxPct).toBe(exp.maxPct);
        expect(result.isTooFast).toBe(exp.isTooFast);
      }
    });
  }
});
