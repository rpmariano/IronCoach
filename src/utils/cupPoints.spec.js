import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pointsBand } from '@formulas/cupPoints.ts';
import { attendanceCount } from '@formulas/cup.ts';

// Paridade com supabase/functions/_shared/formulas/cupPoints.test.ts: a faixa
// de pontos e o contador das personas (specs/trofeu.md §5 "Pontos", Fase 2),
// sobre o mesmo golden da arbitragem.
const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/seriesPersonas.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('pointsBand / attendanceCount — vetor dourado (personas)', () => {
  for (const p of golden.personas.filter((x) => x.expect)) {
    it(`${p.id} — ${p.desc}`, () => {
      const edition = golden.editions[p.edition];
      expect(pointsBand(edition, p.kind, p.results)).toEqual(p.expect.band);
      const attendance = p.seasonGoal === 'premio' ? attendanceCount(edition, p.rounds, p.attendanceRaces, p.today) : null;
      expect(attendance).toEqual(p.expect.attendance);
    });
  }
});
