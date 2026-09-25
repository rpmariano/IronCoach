import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computePhaseEvaluation } from '@formulas/racePhaseEvaluation.ts';
import { expectCarolVoice } from '../test/carolVoice';

const goldenPath = path.resolve(__dirname, '../../supabase/functions/_shared/formulas/racePhaseEvaluation.golden.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

describe('computePhaseEvaluation — vetor dourado', () => {
  for (const { name, input, expect: exp } of golden) {
    it(name, () => {
      expect(computePhaseEvaluation(input)).toEqual(exp);
    });
  }
});

// Ação P.12: o mesmo texto que RaceCard.jsx:213 mostra sob o avatar dela —
// sem "!", sem elogio automático que o vetor dourado não tenha já.
describe('computePhaseEvaluation — vetor dourado, na voz dela', () => {
  for (const { name, expect: exp } of golden) {
    it(name, () => expectCarolVoice(exp.summary));
  }
});
