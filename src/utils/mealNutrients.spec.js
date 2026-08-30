import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeItemNutrients, computeMealNutrients } from '@formulas/mealNutrients.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/mealNutrients.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('mealNutrients — vetor dourado', () => {
  for (const { name, fn, input, expect: exp } of golden) {
    it(name, () => {
      const result = fn === 'item' ? computeItemNutrients(input.item) : computeMealNutrients(input.meal);
      expect(result).toEqual(exp);
    });
  }
});
