import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { classifyCalorieCompliance } from '@formulas/nutritionCompliance.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/nutritionCompliance.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('classifyCalorieCompliance — vetor dourado', () => {
  for (const { input, expect: exp } of golden) {
    it(`pct=${input} → ${exp}`, () => {
      expect(classifyCalorieCompliance(input)).toBe(exp);
    });
  }
});
