import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { estimate1RM } from '@formulas/epley.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/epley.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('estimate1RM (Epley) — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      expect(estimate1RM(input.weight, input.reps)).toBeCloseTo(exp, 6);
    });
  }
});
