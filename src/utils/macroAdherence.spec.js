import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeMacroAdherence } from '@formulas/macroAdherence.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/macroAdherence.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeMacroAdherence — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      expect(computeMacroAdherence(input.meals, input.profile, input.bodyAssessments, input.todayISO, input.range)).toEqual(exp);
    });
  }
});
