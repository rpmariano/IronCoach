import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeMaxHR, computeKarvonenZones, computePctMaxZones, resolveMaxHR, resolveHrZones, zoneOf } from '@formulas/heartRateZones.ts';

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

describe('resolveMaxHR — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden.resolveMaxHR) {
    it(name, () => {
      expect(resolveMaxHR(input.age, input.observed)).toEqual(exp);
    });
  }
});

describe('zoneOf — vetor dourado (zonas Karvonen do vetor "karvonen" acima)', () => {
  for (const { name, input, expect: exp } of golden.zoneOf) {
    it(name, () => {
      expect(zoneOf(input.bpm, golden.karvonen[0].expect)).toBe(exp);
    });
  }
});

describe('resolveHrZones — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden.resolveHrZones) {
    it(name, () => {
      expect(resolveHrZones(input.maxHRBpm, input.restingHrBpm).method).toBe(exp.method);
    });
  }
});
