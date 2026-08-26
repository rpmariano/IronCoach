import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeTrainingDistribution } from '@formulas/trainingDistribution.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/trainingDistribution.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeTrainingDistribution — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      expect(computeTrainingDistribution(input.runs, input.level)).toEqual(exp);
    });
  }
});
