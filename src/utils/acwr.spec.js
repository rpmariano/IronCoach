// Vetor dourado de supabase/functions/_shared/formulas/acwr.golden.json,
// percorrido a partir do Vitest. A contrapartida Deno-nativa vive em
// supabase/functions/_shared/formulas/acwr.test.ts, com o MESMO JSON —
// é a garantia barata de que Vite e Deno concordam sobre o ACWR (ver
// specs/formulas-centralizacao.md §3.6, specs/formulas-checklist.md Fase C).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeAcwr, classifyAcwrZone, ACWR_DANGER, ACWR_SAFE_MAX, ACWR_UNDER_TRAINING } from '@formulas/acwr.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/acwr.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeAcwr — vetor dourado', () => {
  for (const { input, expect: exp } of golden) {
    it(`acuteKm=${input.acuteKm} chronicWeeklyKm=${input.chronicWeeklyKm} → ratio=${exp.ratio} zone=${exp.zone}`, () => {
      const { ratio, zone } = computeAcwr(input.acuteKm, input.chronicWeeklyKm);
      if (exp.ratio === null) {
        expect(ratio).toBeNull();
      } else {
        expect(ratio).toBeCloseTo(exp.ratio, 6);
      }
      expect(zone).toBe(exp.zone);
    });
  }
});

describe('classifyAcwrZone — fronteiras exatas', () => {
  it('respeita os intervalos semi-abertos da doutrina (P0-2)', () => {
    expect(classifyAcwrZone(ACWR_UNDER_TRAINING)).toBe('safe'); // 0.80 é safe
    expect(classifyAcwrZone(ACWR_UNDER_TRAINING - 0.01)).toBe('undertrained');
    expect(classifyAcwrZone(ACWR_SAFE_MAX)).toBe('safe'); // 1.30 é safe
    expect(classifyAcwrZone(ACWR_SAFE_MAX + 0.01)).toBe('caution');
    expect(classifyAcwrZone(ACWR_DANGER)).toBe('caution'); // 1.50 é caution
    expect(classifyAcwrZone(ACWR_DANGER + 0.01)).toBe('danger');
  });
});
