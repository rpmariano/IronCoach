import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeCalendarWeeklyVolume } from '@formulas/weeklyVolume.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/weeklyVolume.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeCalendarWeeklyVolume — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      expect(computeCalendarWeeklyVolume(input.runs, input.todayISO)).toEqual(exp);
    });
  }
});
