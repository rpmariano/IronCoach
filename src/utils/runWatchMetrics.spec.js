import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeRunWatchMetrics } from '@formulas/runWatchMetrics.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/runWatchMetrics.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeRunWatchMetrics — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      expect(computeRunWatchMetrics(input.runs)).toEqual(exp);
    });
  }
});
