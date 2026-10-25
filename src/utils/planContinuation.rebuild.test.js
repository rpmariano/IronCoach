import { describe, it, expect } from 'vitest';
import { rebuildPlanChain, findPromisedContinuation } from './planContinuation';

/* Recarregar a página: a cadeia reconstrói-se das propostas pendentes de TREINO,
   seguidas, do mesmo race_id e ligadas por uma mensagem do modelo com
   plan_continuation. Propostas só de refeições nunca entram. */
describe('rebuildPlanChain — recarregar com partes pendentes', () => {
  const P = (id, start, end, over = {}) => ({ id, status: 'proposto', period_start: start, period_end: end, race_id: 'r1', ...over });
  const p1 = P('p1', '2026-10-26', '2026-11-01');
  const p2 = P('p2', '2026-11-02', '2026-11-08');
  const p3 = P('p3', '2026-11-09', '2026-11-15');
  const treino = (...ids) => ids.map((id) => ({ plan_id: id, kind: 'corrida' }));
  const msg = (cont) => ({ role: 'model', content: 'x', plan_continuation: cont });
  const C2 = { from: '2026-11-02', to: '2026-11-08', part: 2, of: 2, until: '2026-11-08' };
  const C2de3 = { ...C2, of: 3, until: '2026-11-15' };
  const C3 = { from: '2026-11-09', to: '2026-11-15', part: 3, of: 3, until: '2026-11-15' };

  it('duas pendentes de treino, ligadas pela mensagem: partes 1 e 2 de 2, por ordem de period_start', () => {
    const r = rebuildPlanChain([p2, p1], [msg(C2)], treino('p1', 'p2'));
    expect(r).toMatchObject({ of: 2, latestPlanId: 'p2', continuation: null });
    expect(r.parts).toEqual([{ planId: 'p1', part: 1 }, { planId: 'p2', part: 2 }]);
  });

  it('sem mensagem do modelo a ligar as partes, não há cadeia (duas propostas encostadas por acaso)', () => {
    expect(rebuildPlanChain([p1, p2], [], treino('p1', 'p2'))).toBeNull();
    expect(rebuildPlanChain([p1, p2], [msg({ ...C2, from: '2026-12-01' })], treino('p1', 'p2'))).toBeNull();
  });

  it('uma proposta de refeições encostada a uma de treino não forma cadeia', () => {
    // p2 só tem refeições (save_meal_suggestions cria planos 'proposto' sem race_id).
    const refeicoes = P('p2', '2026-11-02', '2026-11-08', { race_id: null });
    const itens = [{ plan_id: 'p1', kind: 'corrida' }, { plan_id: 'p2', kind: 'refeicao' }];
    // A de treino fica sozinha (a mensagem promete a semana seguinte: «Parte 1 de 2»); a de refeições fica fora.
    expect(rebuildPlanChain([p1, refeicoes], [msg(C2)], itens)?.parts).toEqual([{ planId: 'p1', part: 1 }]);
    // Mesmo com o mesmo race_id e a mensagem a ligar: sem itens de treino, fora.
    expect(rebuildPlanChain([p1, { ...refeicoes, race_id: 'r1' }], [msg(C2)], itens)?.parts).toEqual([{ planId: 'p1', part: 1 }]);
    // E duas de refeições encostadas, sem nenhuma de treino: nada.
    expect(rebuildPlanChain([{ ...p1, race_id: null }, refeicoes], [msg(C2)], [{ plan_id: 'p1', kind: 'refeicao' }, { plan_id: 'p2', kind: 'refeicao' }])).toBeNull();
  });

  it('a última mensagem ainda promete a parte 3 (2 pendentes): total 3 e a continuação por pedir, atada à parte 2', () => {
    const r = rebuildPlanChain([p1, p2], [msg(C2de3), msg(C3)], treino('p1', 'p2'));
    expect(r).toMatchObject({ of: 3, latestPlanId: 'p2' });
    expect(r.continuation).toMatchObject({ from: '2026-11-09', to: '2026-11-15', part: 3, of: 3, until: '2026-11-15', planId: 'p2', armed: false });
  });

  it('uma só pendente cuja mensagem promete a semana seguinte: «Parte 1 de N» com a continuação desarmada', () => {
    const r = rebuildPlanChain([p1], [msg({ ...C2, of: 3, until: '2026-11-15' })], treino('p1'));
    expect(r).toMatchObject({ of: 3, latestPlanId: 'p1' });
    expect(r.parts).toEqual([{ planId: 'p1', part: 1 }]);
    expect(r.continuation).toMatchObject({ part: 2, of: 3, planId: 'p1', armed: false });
  });

  it('uma só pendente sem promessa: proposta normal', () => {
    expect(rebuildPlanChain([p1], [], treino('p1'))).toBeNull();
    expect(rebuildPlanChain([p1], [msg(C3)], treino('p1'))).toBeNull(); // a promessa é de outra semana
    expect(rebuildPlanChain([], [msg(C2)], [])).toBeNull();
  });

  it('uma promessa já cumprida (a parte seguinte está pendente) não pede nada', () => {
    const r = rebuildPlanChain([p1, p2, p3], [msg(C2de3), msg(C3)], treino('p1', 'p2', 'p3'));
    expect(r).toMatchObject({ of: 3, latestPlanId: 'p3', continuation: null });
  });

  it('o total só conta as continuações desta cadeia, não as de um plano antigo do histórico («parte 2 de 8»)', () => {
    const antigas = [
      msg({ from: '2026-05-04', to: '2026-05-10', part: 2, of: 8, until: '2026-06-28' }),
      msg({ from: '2026-05-11', to: '2026-05-17', part: 3, of: 8, until: '2026-06-28' }),
    ];
    const r = rebuildPlanChain([p1, p2], [...antigas, msg(C2)], treino('p1', 'p2'));
    expect(r.of).toBe(2);
    // Uma só pendente com promessa, também.
    expect(rebuildPlanChain([p1], [...antigas, msg({ ...C2, of: 3 })], treino('p1')).of).toBe(3);
  });

  it('provas diferentes ou só as pendentes: não são uma cadeia', () => {
    // Outra prova: não se junta (a p1 fica sozinha, parte 1 prometida).
    expect(rebuildPlanChain([p1, P('p8', '2026-11-02', '2026-11-08', { race_id: 'r2' })], [msg(C2)], treino('p1', 'p8'))?.parts).toEqual([{ planId: 'p1', part: 1 }]);
    // Uma já aceite não conta como pendente.
    expect(rebuildPlanChain([p1, { ...p2, status: 'aceite' }], [msg(C2)], treino('p1', 'p2'))?.parts).toEqual([{ planId: 'p1', part: 1 }]);
  });

  it('sem prova (race_id null) também forma cadeia', () => {
    const a = P('a', '2026-10-26', '2026-11-01', { race_id: null });
    const b = P('b', '2026-11-02', '2026-11-08', { race_id: null });
    expect(rebuildPlanChain([a, b], [msg(C2)], treino('a', 'b'))?.parts).toHaveLength(2);
  });
});

describe('findPromisedContinuation', () => {
  const C = { from: '2026-11-02', to: '2026-11-08', part: 2, of: 3 };
  it('a continuação cujo from é o dia a seguir ao fim do plano', () => {
    expect(findPromisedContinuation([{ role: 'model', plan_continuation: C }], { period_end: '2026-11-01' })).toEqual(C);
    expect(findPromisedContinuation([{ role: 'model', plan_continuation: C }], { period_end: '2026-11-08' })).toBeNull();
    expect(findPromisedContinuation([], { period_end: '2026-11-01' })).toBeNull();
    expect(findPromisedContinuation([{ plan_continuation: C }], null)).toBeNull();
  });
});
