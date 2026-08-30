import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computePhaseEvaluation } from '@formulas/racePhaseEvaluation.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/racePhaseEvaluation.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computePhaseEvaluation — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      expect(computePhaseEvaluation(input)).toEqual(exp);
    });
  }
});
