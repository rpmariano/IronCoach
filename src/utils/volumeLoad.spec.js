import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeGymVolumeLoad } from '@formulas/volumeLoad.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/volumeLoad.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeGymVolumeLoad — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      expect(computeGymVolumeLoad(input.sessions, input.todayISO, input.range)).toEqual(exp);
    });
  }
});
