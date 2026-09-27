import { describe, it, expect } from 'vitest';
import { cupPushRoute, cupDateChangeKey } from './cupPushRoute';

/* O destino do toque numa notificação do Troféu (specs/trofeu.md §8, Fase 5).
   As chaves são os literais do contrato com o servidor (desenho F.3,
   _shared/formulas/cupNotices.test.ts testa os mesmos). */
describe('cupPushRoute', () => {
  it('as quatro chaves do contrato', () => {
    expect(cupPushRoute('cup_calendar:ed-1')).toEqual({ kind: 'trofeu' });
    expect(cupPushRoute('cup_date_change:rd-3:2027-01-24')).toEqual({ kind: 'inicio' });
    expect(cupPushRoute('cup_entry_deadline:rd-3')).toEqual({ kind: 'inicio' });
    expect(cupPushRoute('cup_results:rd-3')).toEqual({ kind: 'chat', roundId: 'rd-3' });
  });

  it('os momentos de sempre (e o race_morning de uma jornada) seguem o caminho de hoje', () => {
    for (const key of [
      'race_morning:race-1:2027-01-24', 'race_eve:race-1:2027-01-23', 'race_after:race-1:run-1',
      'race_conflict:a:b', 'intervention:2027-01-20', 'silence:2027-01-20', 'block_end:plan-1',
      'week_review:2027-01-18', 'leaderboard:x', 'percentile_ready:y', 'missed_workout:z',
    ]) expect(cupPushRoute(key), key).toBeNull();
  });

  it('chaves mal formadas ou desconhecidas: null', () => {
    for (const key of [null, undefined, '', 42, 'cup_', 'cup_results', 'cup_results:', 'cup_calendar:', 'cup_outro:rd-3', 'CUP_RESULTS:rd-3', 'xcup_results:rd-3']) {
      expect(cupPushRoute(key), String(key)).toBeNull();
    }
  });
});

describe('cupDateChangeKey', () => {
  it('a jornada e a nova data (YYYY-MM-DD)', () => {
    expect(cupDateChangeKey('rd-3', '2027-01-24')).toBe('cup_date_change:rd-3:2027-01-24');
    expect(cupDateChangeKey('rd-3', '2027-01-24T00:00:00Z')).toBe('cup_date_change:rd-3:2027-01-24');
  });

  it('sem jornada ou sem data válida: null', () => {
    expect(cupDateChangeKey(null, '2027-01-24')).toBeNull();
    expect(cupDateChangeKey('rd-3', null)).toBeNull();
    expect(cupDateChangeKey('rd-3', '24/01/2027')).toBeNull();
  });
});
