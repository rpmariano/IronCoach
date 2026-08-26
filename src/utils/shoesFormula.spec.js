import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { weightFactor, wearStatus } from '@formulas/shoes.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/shoes.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('weightFactor — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden.weightFactor) {
    it(name, () => {
      expect(weightFactor(input)).toBeCloseTo(exp, 6);
    });
  }
});

describe('wearStatus — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden.wearStatus) {
    it(name, () => {
      expect(wearStatus(input.shoe, input.runs, input.weightKg)).toEqual(exp);
    });
  }
});
