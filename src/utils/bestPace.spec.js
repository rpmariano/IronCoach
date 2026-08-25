import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeBestPace } from '@formulas/bestPace.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/bestPace.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeBestPace — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      expect(computeBestPace(input.runs, input.targetKm)).toEqual(exp);
    });
  }
});
