import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeReadinessIndex } from '@formulas/readinessIndex.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/readinessIndex.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeReadinessIndex — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      const result = computeReadinessIndex(
        input.runs,
        input.meals,
        input.bodyAssessments,
        input.gymSessions,
        input.profile,
        input.todayISO,
        input.nextRace,
      );
      expect(result).toEqual(exp);
    });
  }
});
