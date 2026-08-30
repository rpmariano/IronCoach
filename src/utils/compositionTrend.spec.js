import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeCompositionTrend } from '@formulas/compositionTrend.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/compositionTrend.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeCompositionTrend — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      expect(computeCompositionTrend(input.bodyAssessments)).toEqual(exp);
    });
  }
});
