import { describe, it, expect } from 'vitest';
import { nextPlanContinuation } from './planContinuation';

/* Espelha nextPlanContinuation do coach-chat: a semana a seguir a `to`, de 7
   dias, sem passar o `until` (o dia da prova). */
describe('nextPlanContinuation', () => {
  it('a semana seguinte, com a parte e o total', () => {
    expect(nextPlanContinuation({ from: '2026-11-02', to: '2026-11-08', part: 2, of: 4, until: '2026-12-20' }))
      .toEqual({ from: '2026-11-09', to: '2026-11-15', part: 3, of: 4, until: '2026-12-20' });
  });

  it('a última parte acaba no until, mesmo que fique curta', () => {
    expect(nextPlanContinuation({ from: '2026-11-09', to: '2026-11-15', part: 3, of: 4, until: '2026-11-18' }))
      .toEqual({ from: '2026-11-16', to: '2026-11-18', part: 4, of: 4, until: '2026-11-18' });
  });

  it('já chegou ao until (ou passou): acabou', () => {
    expect(nextPlanContinuation({ from: '2026-11-16', to: '2026-11-18', part: 4, of: 4, until: '2026-11-18' })).toBeNull();
    expect(nextPlanContinuation({ from: '2026-11-16', to: '2026-11-22', part: 4, of: 4, until: '2026-11-18' })).toBeNull();
  });

  it('atravessa o fim do mês e do ano', () => {
    expect(nextPlanContinuation({ from: '2026-12-22', to: '2026-12-28', part: 1, of: 3, until: '2027-01-20' }))
      .toEqual({ from: '2026-12-29', to: '2027-01-04', part: 2, of: 3, until: '2027-01-20' });
  });

  it('sem until ou com lixo: null; o total nunca fica abaixo da parte', () => {
    expect(nextPlanContinuation(null)).toBeNull();
    expect(nextPlanContinuation({ from: '2026-11-02', to: '2026-11-08', part: 2, of: 3 })).toBeNull();
    expect(nextPlanContinuation({ from: '2026-11-02', to: '2026-11-08', part: 3, of: 3, until: '2026-12-20' }).of).toBe(4);
  });
});
