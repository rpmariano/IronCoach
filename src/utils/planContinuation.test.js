import { describe, it, expect } from 'vitest';
import { nextPlanContinuation, rebuildPlanChain } from './planContinuation';

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


describe('rebuildPlanChain — recarregar com partes pendentes', () => {
  const P = (id, start, end, over = {}) => ({ id, status: 'proposto', period_start: start, period_end: end, race_id: 'r1', ...over });
  const p1 = P('p1', '2026-10-26', '2026-11-01');
  const p2 = P('p2', '2026-11-02', '2026-11-08');
  const p3 = P('p3', '2026-11-09', '2026-11-15');
  const msg = (cont) => ({ role: 'model', content: 'x', plan_continuation: cont });
  const C3 = { from: '2026-11-09', to: '2026-11-15', part: 3, of: 3, until: '2026-11-15' };

  it('duas pendentes seguidas, sem promessa: parte 1 e 2 de 2, por ordem de period_start', () => {
    const r = rebuildPlanChain([p2, p1], []);
    expect(r).toMatchObject({ of: 2, latestPlanId: 'p2', continuation: null });
    expect(r.parts).toEqual([{ planId: 'p1', part: 1 }, { planId: 'p2', part: 2 }]);
  });

  it('uma só pendente: proposta normal (sem cadeia)', () => {
    expect(rebuildPlanChain([p1], [])).toBeNull();
    expect(rebuildPlanChain([], [])).toBeNull();
  });

  it('a última mensagem ainda promete a parte 3: o total é 3 e fica a continuação por pedir, atada à parte 2', () => {
    const r = rebuildPlanChain([p1, p2], [msg(C3)]);
    expect(r).toMatchObject({ of: 3, latestPlanId: 'p2' });
    expect(r.continuation).toMatchObject({ from: '2026-11-09', to: '2026-11-15', part: 3, of: 3, until: '2026-11-15', planId: 'p2', armed: false });
  });

  it('uma promessa já cumprida (part <= pendentes) não pede nada: a última parte é a última', () => {
    const r = rebuildPlanChain([p1, p2, p3], [msg({ ...C3, part: 2, of: 3, from: '2026-11-02', to: '2026-11-08' })]);
    expect(r).toMatchObject({ of: 3, latestPlanId: 'p3', continuation: null });
  });

  it('períodos não seguidos, ou provas diferentes: não são uma cadeia', () => {
    expect(rebuildPlanChain([p1, P('p9', '2026-11-10', '2026-11-16')], [])).toBeNull();
    expect(rebuildPlanChain([p1, P('p8', '2026-11-02', '2026-11-08', { race_id: 'r2' })], [])).toBeNull();
  });

  it('sem prova (race_id null) também forma cadeia; só contam as pendentes', () => {
    const a = P('a', '2026-10-26', '2026-11-01', { race_id: null });
    const b = P('b', '2026-11-02', '2026-11-08', { race_id: null });
    expect(rebuildPlanChain([a, b], [])?.parts).toHaveLength(2);
    expect(rebuildPlanChain([a, { ...b, status: 'aceite' }], [])).toBeNull();
  });
});
