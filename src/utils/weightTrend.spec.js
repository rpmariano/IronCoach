import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeWeightTrend } from '@formulas/weightTrend.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/weightTrend.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeWeightTrend — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      const result = computeWeightTrend(input.rawPoints);
      expect(result).toEqual(exp);
    });
  }
});
