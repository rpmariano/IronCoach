import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { classifyVisceralFat } from '@formulas/bodyComposition.ts';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/bodyComposition.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('classifyVisceralFat — vetor dourado', () => {
  for (const { input, expect: exp } of golden) {
    it(`vf=${input.vf} → ${exp}`, () => {
      expect(classifyVisceralFat(input.vf)).toBe(exp);
    });
  }
});
