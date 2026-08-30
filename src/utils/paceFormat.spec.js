import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { formatPaceMinKm, formatPaceFromDistance } from '@formulas/paceFormat.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/paceFormat.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('paceFormat — vetor dourado', () => {
  for (const { fn, name, input, expect: exp } of golden) {
    it(`${fn} — ${name}`, () => {
      const result = fn === 'formatPaceMinKm'
        ? formatPaceMinKm(input.secondsPerKm)
        : formatPaceFromDistance(input.distanceKm, input.durationSeconds);
      expect(result).toEqual(exp);
    });
  }
});
