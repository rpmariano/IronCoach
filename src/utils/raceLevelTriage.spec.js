// Contrapartida Vite de supabase/functions/_shared/formulas/
// raceLevelTriage.test.ts — mesmo vetor dourado, mesmo ficheiro fonte
// (raceLevelTriage.ts), runtime diferente. Mesmo padrão de
// src/utils/raceViability.spec.js.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  bandTimeOnFeet,
  bandElevation,
  assessRaceLevelTriage,
  minLevel,
} from '@formulas/raceLevelTriage.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/raceLevelTriage.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('raceLevelTriage — vetor dourado', () => {
  for (const { fn, name, input, expect: exp } of golden) {
    it(`${fn} — ${name}`, () => {
      let result;
      if (fn === 'bandTimeOnFeet') {
        result = bandTimeOnFeet(input.weeklySeconds, input.raceTimeSecondsPrevisto);
      } else if (fn === 'bandElevation') {
        result = bandElevation(input.weeklyElevationM, input.raceElevationM);
      } else if (fn === 'assessRaceLevelTriage') {
        result = assessRaceLevelTriage(input);
      } else {
        throw new Error(`fn desconhecida no vetor dourado: ${fn}`);
      }
      expect(result).toEqual(exp);
    });
  }
});

describe('minLevel', () => {
  it('devolve sempre o mais baixo dos dois, em qualquer ordem', () => {
    expect(minLevel('avancado', 'sub_iniciante')).toBe('sub_iniciante');
    expect(minLevel('sub_iniciante', 'avancado')).toBe('sub_iniciante');
    expect(minLevel('medio', 'basico')).toBe('basico');
    expect(minLevel('iniciante', 'iniciante')).toBe('iniciante');
  });
});

describe('assessRaceLevelTriage — limiar exato de "semanas com dados"', () => {
  // A golden cobre 4 (avalia) e 1 (não avalia); falta o corte em si, 2 vs. 3.
  it('exatamente 2 semanas com dados ainda não é avaliável', () => {
    const r = assessRaceLevelTriage({
      todayISO: '2026-08-27',
      raceTimeSecondsPrevisto: 4000,
      raceElevationM: 500,
      runs: [
        { date: '2026-08-25', duration_seconds: 5000, elevation_gain_m: 500 },
        { date: '2026-08-18', duration_seconds: 4800, elevation_gain_m: 480 },
      ],
    });
    expect(r.weeksWithData).toBe(2);
    expect(r.level).toBeNull();
  });

  it('exatamente 3 semanas com dados já é avaliável', () => {
    const r = assessRaceLevelTriage({
      todayISO: '2026-08-27',
      raceTimeSecondsPrevisto: 4000,
      raceElevationM: 500,
      runs: [
        { date: '2026-08-25', duration_seconds: 5000, elevation_gain_m: 500 },
        { date: '2026-08-18', duration_seconds: 4800, elevation_gain_m: 480 },
        { date: '2026-08-11', duration_seconds: 4700, elevation_gain_m: 470 },
      ],
    });
    expect(r.weeksWithData).toBe(3);
    expect(r.level).not.toBeNull();
  });
});
