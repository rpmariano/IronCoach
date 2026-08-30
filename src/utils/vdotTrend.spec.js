import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeVdotTrend } from '@formulas/vdotTrend.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/vdotTrend.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeVdotTrend — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      expect(computeVdotTrend(input.runs)).toEqual(exp);
    });
  }
});
