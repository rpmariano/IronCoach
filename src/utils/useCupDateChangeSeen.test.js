import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* A mudança de data vista na app (specs/trofeu.md §8, Fase 5): uma jornada
   "Vou" com mudança grava uma impressão 'moment' com a chave do contrato; sem
   "Vou" ou sem mudança, nada. */
vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(() => { throw new Error('sem rede nos testes'); }), rpc: vi.fn() },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));
vi.mock('../lib/utils', async (importOriginal) => ({ ...(await importOriginal()), lisbonTodayISO: () => '2027-01-20' }));

const { useAppStore } = await import('../store');
const { useCupDateChangeSeen, cupDateChangeSeenKeys, __resetCupDateChangeSeen } = await import('./useCupDateChangeSeen');

const MUDOU = { from: '2027-01-17', to: '2027-01-24', label: 'mudou de 17 para 24 jan' };
const r3 = (over = {}) => ({ id: 'rd-3', date: '2027-01-24', dateChange: MUDOU, participation: { decision: 'vou' }, ...over });

let logImpression;
beforeEach(() => {
  __resetCupDateChangeSeen();
  logImpression = vi.fn();
  useAppStore.setState({ session: { user: { id: 'u-1' } }, profile: { id: 'u-1' }, logImpression });
});

describe('cupDateChangeSeenKeys', () => {
  it('só as jornadas com mudança e "Vou"', () => {
    expect(cupDateChangeSeenKeys([
      r3(),
      r3({ id: 'rd-4', participation: { decision: 'nao_vou' } }),
      r3({ id: 'rd-5', participation: null }),
      r3({ id: 'rd-6', dateChange: null }),
      r3({ id: 'rd-7', participation: { decision: 'nao_sei' } }),
    ])).toEqual(['cup_date_change:rd-3:2027-01-24']);
    expect(cupDateChangeSeenKeys(null)).toEqual([]);
  });
});

describe('useCupDateChangeSeen', () => {
  it('jornada "Vou" com mudança → 1 impressão moment, sem título, com a chave do contrato', () => {
    const { rerender } = renderHook(({ rounds }) => useCupDateChangeSeen(rounds), { initialProps: { rounds: [r3()] } });
    expect(logImpression).toHaveBeenCalledTimes(1);
    expect(logImpression).toHaveBeenCalledWith({ kind: 'moment', key: 'cup_date_change:rd-3:2027-01-24', title: null });
    // Outro render (lista nova, mesmas jornadas) e outra montagem no mesmo dia: não repete.
    rerender({ rounds: [r3()] });
    renderHook(() => useCupDateChangeSeen([r3()]));
    expect(logImpression).toHaveBeenCalledTimes(1);
  });

  it('uma 2.ª mudança (nova data) é outra chave', () => {
    const { rerender } = renderHook(({ rounds }) => useCupDateChangeSeen(rounds), { initialProps: { rounds: [r3()] } });
    rerender({ rounds: [r3({ date: '2027-01-31', dateChange: { from: '2027-01-24', to: '2027-01-31', label: 'mudou de 24 para 31 jan' } })] });
    expect(logImpression.mock.calls.map(([a]) => a.key)).toEqual(['cup_date_change:rd-3:2027-01-24', 'cup_date_change:rd-3:2027-01-31']);
  });

  it('"Não vou", sem decisão ou sem mudança → nenhuma', () => {
    renderHook(() => useCupDateChangeSeen([
      r3({ participation: { decision: 'nao_vou' } }),
      r3({ id: 'rd-4', participation: null }),
      r3({ id: 'rd-5', dateChange: null }),
    ]));
    renderHook(() => useCupDateChangeSeen([]));
    expect(logImpression).not.toHaveBeenCalled();
  });

  it('sem sessão, nada', () => {
    useAppStore.setState({ session: null, profile: null });
    renderHook(() => useCupDateChangeSeen([r3()]));
    expect(logImpression).not.toHaveBeenCalled();
  });
});
