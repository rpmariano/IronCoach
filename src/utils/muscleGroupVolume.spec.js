import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeMuscleGroupVolume, computeMuscleGroupVolumeDetailed } from '@formulas/muscleGroupVolume.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/muscleGroupVolume.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeMuscleGroupVolume — vetor dourado', () => {
  for (const { name, input, expect: exp, expectMultiGroupSessions } of golden) {
    it(name, () => {
      expect(computeMuscleGroupVolume(input.sessions, input.todayISO, input.range)).toEqual(exp);
      // G1: a variante detalhada diz quantas sessões com vários grupos ficaram de fora.
      const detailed = computeMuscleGroupVolumeDetailed(input.sessions, input.todayISO, input.range);
      expect(detailed.groups).toEqual(exp);
      expect(detailed.multiGroupSessions).toBe(expectMultiGroupSessions);
    });
  }
});
