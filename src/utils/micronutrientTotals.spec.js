import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeNutrientRangeTotals } from '@formulas/micronutrientTotals.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/micronutrientTotals.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeNutrientRangeTotals — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      expect(computeNutrientRangeTotals(input.meals, input.todayISO, input.range)).toEqual(exp);
    });
  }
});
