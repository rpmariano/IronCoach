import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeBMR, computeTDEE } from '@formulas/tdee.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/tdee.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeBMR (Mifflin-St Jeor) — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden.bmr) {
    it(name, () => {
      expect(computeBMR(input.weightKg, input.heightCm, input.age, input.isFemale)).toBeCloseTo(exp, 6);
    });
  }
});

describe('computeTDEE (GETD) — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden.tdee) {
    it(name, () => {
      expect(computeTDEE(input.bmr, input.weeklyVolumeKm, input.weightKg)).toBe(exp);
    });
  }
});
