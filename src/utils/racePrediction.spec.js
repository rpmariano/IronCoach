import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { predictRaceTime, calculateVDOT, calculateEquivalentFlatKm } from '@formulas/racePrediction.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/racePrediction.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('predictRaceTime (Riegel) — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden.riegel) {
    it(name, () => {
      const result = predictRaceTime(input.runs, input.targetDistanceKm, input.experienceLevel);
      expect(result.predictedSeconds).toBeCloseTo(exp.predictedSeconds, 6);
      expect(result.predictedPace).toBeCloseTo(exp.predictedPace, 6);
      expect(result.confidence).toBe(exp.confidence);
      expect(result.basedOn).toEqual(exp.basedOn);
    });
  }
});

describe('calculateVDOT — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden.vdot) {
    it(name, () => {
      expect(calculateVDOT(input.distanceKm, input.timeSeconds)).toBe(exp);
    });
  }
});

describe('calculateEquivalentFlatKm (ITRA) — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden.equivalentFlatKm) {
    it(name, () => {
      expect(calculateEquivalentFlatKm(input.distanceKm, input.elevationGainM, input.raceType)).toBe(exp);
    });
  }
});
