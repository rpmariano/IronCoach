import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppStore } from '../index';
import { usePeriodStore } from '../periodStore';
import { useEvolutionView } from './useEvolutionView';
import { registerEvolutionView, resetEvolutionRegistry } from './registry';
import { getEvolutionView, resetEvolutionCache, evolutionCacheStats, primeFingerprints } from './cache';

/* useEvolutionView (2026-10-04, F6): lê a vista da cache e, se a preparação
   ainda não lá chegou, calcula no render — nunca spinner. A vista de exemplo
   só existe neste teste. */
let build;

describe('useEvolutionView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 12, 0, 0));
    resetEvolutionCache();
    resetEvolutionRegistry();
    usePeriodStore.getState().reset();
    useAppStore.setState({ meals: [{ id: 'm1', date: '2026-10-01', calories: 600 }], runs: [] });
    build = vi.fn(([meals], period, todayISO) => ({ count: meals.length, period, todayISO }));
    registerEvolutionView('nutricao', { deps: (s) => [s.meals], build });
  });
  afterEach(() => vi.useRealTimers());

  it('sem cache calcula no render (sem esperar) com o período do store e o dia de hoje', () => {
    const { result } = renderHook(() => useEvolutionView('nutricao'));
    expect(result.current).toEqual({ count: 1, period: { kind: 'semana', offset: 0 }, todayISO: '2026-10-04' });
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('com a vista já preparada devolve o mesmo objeto, sem recalcular', () => {
    const prepared = getEvolutionView('nutricao', { kind: 'semana', offset: 0 }, [useAppStore.getState().meals], '2026-10-04');
    const { result } = renderHook(() => useEvolutionView('nutricao'));
    expect(result.current).toBe(prepared);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('não recalcula com mudanças do store que não são deps', () => {
    const { result } = renderHook(() => useEvolutionView('nutricao'));
    const first = result.current;
    act(() => { useAppStore.setState({ runs: [{ id: 'x' }], lastDashboardTab: 'hub' }); });
    expect(result.current).toBe(first);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('segue as setas e os dados; voltar a um período já visto vem da cache', () => {
    const { result } = renderHook(() => useEvolutionView('nutricao'));
    const atual = result.current;
    act(() => { usePeriodStore.getState().shift('nutricao', -1); });
    expect(result.current.period).toEqual({ kind: 'semana', offset: -1 });
    act(() => { usePeriodStore.getState().shift('nutricao', 1); });
    expect(result.current).toBe(atual);
    expect(build).toHaveBeenCalledTimes(2);
    act(() => { useAppStore.setState({ meals: [...useAppStore.getState().meals, { id: 'm2', date: '2026-10-02', calories: 700 }] }); });
    expect(result.current.count).toBe(2);
  });

  /* Revisão 2026-10-04: o render nunca calcula impressões digitais. Um
     recarregamento com lista nova refaz a vista no render (como hoje); o
     acerto por impressão só acontece com impressões primadas em tempo morto. */
  it('recarregamento com lista nova: no render recalcula sem calcular impressões', () => {
    const { result } = renderHook(() => useEvolutionView('nutricao'));
    const first = result.current;
    act(() => { useAppStore.setState({ meals: [{ id: 'm1', date: '2026-10-01', calories: 600 }] }); });
    expect(result.current).not.toBe(first);
    expect(result.current).toEqual(first);
    expect(build).toHaveBeenCalledTimes(2);
    expect(evolutionCacheStats().hashed).toBe(0);
  });

  it('recarregamento com impressões já primadas (tempo morto): acerta por impressão digital', () => {
    const { result } = renderHook(() => useEvolutionView('nutricao'));
    const first = result.current;
    const reloaded = [{ id: 'm1', date: '2026-10-01', calories: 600 }];
    primeFingerprints([useAppStore.getState().meals, reloaded]); // o que prepare.js faz
    const hashed = evolutionCacheStats().hashed;
    act(() => { useAppStore.setState({ meals: reloaded }); });
    expect(result.current).toBe(first);
    expect(evolutionCacheStats().fingerprintHits).toBe(1);
    expect(evolutionCacheStats().hashed).toBe(hashed);
  });

  it('muda à meia-noite (hoje entra na chave)', () => {
    const { result } = renderHook(() => useEvolutionView('nutricao'));
    act(() => { vi.advanceTimersByTime(12 * 3600 * 1000 + 1000); });
    expect(result.current.todayISO).toBe('2026-10-05');
  });

  it('período à mão e separador sem vista', () => {
    const { result } = renderHook(() => useEvolutionView('nutricao', { period: { kind: 'mes', offset: -2 } }));
    expect(result.current.period).toEqual({ kind: 'mes', offset: -2 });
    const none = renderHook(() => useEvolutionView('corpo'));
    expect(none.result.current).toBeNull();
  });
});
