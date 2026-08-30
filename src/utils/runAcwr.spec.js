import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeRunAcwr } from '@formulas/runAcwr.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/runAcwr.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeRunAcwr — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      expect(computeRunAcwr(input.runs, input.todayISO)).toEqual(exp);
    });
  }
});
