import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getTaperDays, getTaperWeeks } from '@formulas/taper.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/taper.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('getTaperDays / getTaperWeeks — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      const { distanceKm, racePriority, experienceLevel, raceType } = input;
      expect(getTaperDays(distanceKm, racePriority, experienceLevel, raceType)).toBe(exp.days);
      expect(getTaperWeeks(distanceKm, racePriority, experienceLevel, raceType)).toBe(exp.weeks);
    });
  }
});
