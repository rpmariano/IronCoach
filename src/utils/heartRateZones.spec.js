import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeMaxHR, computeKarvonenZones, computePctMaxZones } from '@formulas/heartRateZones.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/heartRateZones.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeMaxHR (Tanaka) — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden.maxHR) {
    it(name, () => {
      expect(computeMaxHR(input.age)).toBe(exp);
    });
  }
});

describe('computeKarvonenZones — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden.karvonen) {
    it(name, () => {
      expect(computeKarvonenZones(input.maxHR, input.restingHR)).toEqual(exp);
    });
  }
});

describe('computePctMaxZones — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden.pctMax) {
    it(name, () => {
      expect(computePctMaxZones(input.maxHR)).toEqual(exp);
    });
  }
});
