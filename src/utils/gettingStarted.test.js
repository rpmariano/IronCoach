import { describe, it, expect } from 'vitest';
import { buildGettingStarted, isGettingStartedComplete } from './gettingStarted';

const hoje = '2026-10-04';
const base = { profile: {}, raceEvents: [], runs: [], meals: [], todayISO: hoje };
const get = (items, k) => items.find((i) => i.key === k);

describe('buildGettingStarted', () => {
  it('perfil sem nível de experiência não está feito', () => {
    expect(get(buildGettingStarted({ ...base, profile: { weight_kg: 70 } }), 'perfil').done).toBe(false);
    expect(get(buildGettingStarted({ ...base, profile: { experience_level: 'x', height_cm: 170 } }), 'perfil').done).toBe(true);
  });
  it('prova: basta uma', () => {
    expect(get(buildGettingStarted({ ...base, raceEvents: [{ id: 1 }] }), 'prova').done).toBe(true);
  });
  it('3 corridas: feito, "3 de 3"; 2 dão "2 de 3"', () => {
    const c = get(buildGettingStarted({ ...base, runs: [{}, {}, {}, {}] }), 'corridas');
    expect(c).toMatchObject({ done: true, progress: '3 de 3' });
    expect(get(buildGettingStarted({ ...base, runs: [{}, {}] }), 'corridas')).toMatchObject({ done: false, progress: '2 de 3' });
  });
  it('7 refeições no mesmo dia são 1 de 7', () => {
    const meals = Array.from({ length: 7 }, () => ({ date: '2026-10-03' }));
    expect(get(buildGettingStarted({ ...base, meals }), 'refeicoes')).toMatchObject({ done: false, progress: '1 de 7' });
  });
  it('hoje não conta; 7 dias fechados contam', () => {
    const so = [{ date: hoje }];
    expect(get(buildGettingStarted({ ...base, meals: so }), 'refeicoes').progress).toBe('0 de 7');
    const sete = ['27', '28', '29', '30'].map((d) => ({ date: `2026-09-${d}` }))
      .concat(['01', '02', '03'].map((d) => ({ date: `2026-10-${d}` })));
    expect(get(buildGettingStarted({ ...base, meals: sete }), 'refeicoes')).toMatchObject({ done: true, progress: '7 de 7' });
    // 26 de setembro já está fora dos 7 dias fechados
    expect(get(buildGettingStarted({ ...base, meals: [{ date: '2026-09-26' }] }), 'refeicoes').progress).toBe('0 de 7');
  });
});

describe('isGettingStartedComplete', () => {
  it('só com os 4 feitos', () => {
    expect(isGettingStartedComplete([{ done: true }, { done: false }])).toBe(false);
    expect(isGettingStartedComplete([{ done: true }, { done: true }])).toBe(true);
    expect(isGettingStartedComplete([])).toBe(false);
  });
});
