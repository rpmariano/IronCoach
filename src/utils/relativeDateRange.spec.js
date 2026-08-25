import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { relativeRangeCutoffISO } from '@formulas/relativeDateRange.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/relativeDateRange.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('relativeRangeCutoffISO — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      expect(relativeRangeCutoffISO(input.todayISO, input.range)).toEqual(exp);
    });
  }
});
