import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeEnergyAvailability } from '@formulas/energyAvailability.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/energyAvailability.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeEnergyAvailability — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      const result = computeEnergyAvailability(input.intake, input.exercise, input.leanMass);
      if (exp === null) {
        expect(result).toBeNull();
      } else {
        expect(result.ea).toBeCloseTo(exp.ea, 6);
        expect(result.status).toBe(exp.status);
      }
    });
  }
});
