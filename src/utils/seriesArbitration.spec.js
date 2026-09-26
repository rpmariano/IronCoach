import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { arbitrateSeries, principalWindow } from '@formulas/seriesArbitration.ts';

// Paridade com supabase/functions/_shared/formulas/seriesArbitration.test.ts:
// o mesmo golden das personas A–K e dos casos X1–X5 (specs/trofeu.md §5,
// Fase 2), corrido pelo Vite — o ecrã do Troféu e a Carol têm de dar o mesmo
// papel a cada jornada.
const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/seriesPersonas.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

const toGolden = (r) => ({
  roundId: r.roundId,
  intent: r.intent,
  reason: r.reason,
  principalId: r.principal?.id ?? null,
  offsetDays: r.offsetDays,
  gapDays: r.gapDays,
  refRoundId: r.refRoundId,
  every: r.every,
});

const inputOf = (p) => ({ rounds: p.rounds, races: p.races, level: p.level, seasonGoal: p.seasonGoal, todayISO: p.today });

describe('arbitrateSeries — vetor dourado (personas)', () => {
  for (const p of golden.personas.filter((x) => x.expect)) {
    it(`${p.id} — ${p.desc}`, () => {
      expect(arbitrateSeries(inputOf(p)).map(toGolden)).toEqual(p.expect.roles);
    });
  }
});

describe('arbitrateSeries — vetor dourado (casos extra)', () => {
  for (const x of golden.extra) {
    it(`${x.id} — ${x.desc}`, () => {
      expect(arbitrateSeries(inputOf(x)).map(toGolden)).toEqual(x.expect.roles);
    });
  }
});

describe('principalWindow — vetor dourado', () => {
  for (const w of golden.windows) {
    it(`${w.level} ${w.distance_km} km ${w.race_type}`, () => {
      expect(principalWindow({ distance_km: w.distance_km, race_type: w.race_type }, w.level)).toEqual(w.expect);
    });
  }
});
