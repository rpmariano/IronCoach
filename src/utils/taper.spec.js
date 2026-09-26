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

// Jornadas (specs/trofeu.md §5, Fase 2): a afinação por intenção, 5.º
// argumento. O bloco de cima corre sem ele e fica igual ao de antes.
const seriesGoldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/taperSeriesIntent.golden.json');
const seriesGolden = JSON.parse(fs.readFileSync(seriesGoldenPath, 'utf8'));

describe('getTaperDays / getTaperWeeks por intenção — vetor dourado', () => {
  for (const { name, input, expect: exp } of seriesGolden) {
    it(name, () => {
      const { distanceKm, racePriority, experienceLevel, raceType, seriesIntent } = input;
      expect(getTaperDays(distanceKm, racePriority, experienceLevel, raceType, seriesIntent)).toBe(exp.days);
      expect(getTaperWeeks(distanceKm, racePriority, experienceLevel, raceType, seriesIntent)).toBe(exp.weeks);
    });
  }
});
