import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  getRecommendedPrepWeeks,
  getEffectiveDistanceKm,
  resolveExperienceLevel,
  getRacePrediction,
  computeEffectivePrepStart,
} from '@formulas/racePlanning.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/racePlanning.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('racePlanning — vetor dourado', () => {
  for (const { fn, name, input, expect: exp } of golden) {
    it(`${fn} — ${name}`, () => {
      switch (fn) {
        case 'getRecommendedPrepWeeks':
          expect(getRecommendedPrepWeeks(input.distanceKm, input.experienceLevel)).toEqual(exp);
          break;
        case 'getEffectiveDistanceKm':
          expect(getEffectiveDistanceKm(input.race)).toEqual(exp);
          break;
        case 'resolveExperienceLevel':
          expect(resolveExperienceLevel(input.race, input.profile)).toEqual(exp);
          break;
        case 'getRacePrediction':
          expect(getRacePrediction(input.race, input.profile, input.runs)).toEqual(exp);
          break;
        case 'computeEffectivePrepStart':
          expect(computeEffectivePrepStart(input.raceDateISO, input.totalWeeks, input.raceCreatedAtISO)).toEqual(exp);
          break;
        default:
          throw new Error(`fn desconhecida: ${fn}`);
      }
    });
  }
});
