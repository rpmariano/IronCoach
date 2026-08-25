import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeClassAnalytics } from '@formulas/classAnalytics.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/classAnalytics.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeClassAnalytics — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      expect(computeClassAnalytics(input.sessions, input.todayISO, input.range)).toEqual(exp);
    });
  }
});
