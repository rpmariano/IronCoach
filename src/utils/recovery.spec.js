import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getRecoveryDaysAfterRace } from '@formulas/recovery.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/recovery.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('getRecoveryDaysAfterRace — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      expect(getRecoveryDaysAfterRace(input.distanceKm, input.experienceLevel)).toBe(exp);
    });
  }
});
