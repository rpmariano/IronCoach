import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeCrossMetrics } from '@formulas/crossMetrics.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/crossMetrics.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeCrossMetrics — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      const result = computeCrossMetrics(input.runs, input.gymSessions, input.bodyAssessments, input.todayISO, input.range);
      expect(result).toEqual(exp);
    });
  }
});
