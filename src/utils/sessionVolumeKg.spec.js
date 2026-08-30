import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeSessionVolumeKg } from '@formulas/sessionVolumeKg.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/sessionVolumeKg.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computeSessionVolumeKg — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      expect(computeSessionVolumeKg(input.session)).toEqual(exp);
    });
  }
});
