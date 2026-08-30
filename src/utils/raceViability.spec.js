import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeRecentWeeklyVolume, assessRaceViability } from '@formulas/raceViability.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/raceViability.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('raceViability — vetor dourado', () => {
  for (const { fn, name, input, expect: exp } of golden) {
    it(`${fn} — ${name}`, () => {
      const result = fn === 'recentWeeklyVolume'
        ? computeRecentWeeklyVolume(input.runs, input.todayISO, input.weeks)
        : assessRaceViability(input);
      expect(result).toEqual(exp);
    });
  }
});
