import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useHeldWhile, holdForLogo, LOGO_DRAW_MS, SKELETON_DELAY_MS } from './logoIntro';

describe('useHeldWhile — o ecrã do logo só sai quando o desenho acaba', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('os dados chegam a meio do desenho: fica até ao fim', () => {
    const { result, rerender } = renderHook(({ a }) => useHeldWhile(a, 2450), { initialProps: { a: true } });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(800); });
    rerender({ a: false });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(1600); });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(60); });
    expect(result.current).toBe(false);
  });

  it('os dados demoram mais do que o desenho: sai quando chegam', () => {
    const { result, rerender } = renderHook(({ a }) => useHeldWhile(a, 2450), { initialProps: { a: true } });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current).toBe(true);
    rerender({ a: false });
    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current).toBe(false);
  });

  it('volta a entrar (login): o desenho recomeça a contar', () => {
    const { result, rerender } = renderHook(({ a }) => useHeldWhile(a, 2450), { initialProps: { a: false } });
    expect(result.current).toBe(false);
    rerender({ a: true });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(100); });
    rerender({ a: false });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(400); });
    expect(result.current).toBe(false);
  });

  it('com movimento reduzido (minMs 0) não retém nada', () => {
    const { result, rerender } = renderHook(({ a }) => useHeldWhile(a, 0), { initialProps: { a: true } });
    rerender({ a: false });
    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current).toBe(false);
  });
});

describe('holdForLogo — o ecrã espera pelo brasão, se ele chegou a aparecer', () => {
  const original = window.matchMedia;
  beforeEach(() => { window.matchMedia = () => ({ matches: false }); });
  afterEach(() => { window.matchMedia = original; });

  function clock(times) {
    let i = 0;
    return () => times[Math.min(i++, times.length - 1)];
  }

  it('ecrã em cache (abaixo do atraso): entra logo, o logo nem apareceu', async () => {
    const wait = vi.fn(() => Promise.resolve());
    const load = holdForLogo(() => Promise.resolve('mod'), { now: clock([0, 100]), wait });
    await expect(load()).resolves.toBe('mod');
    expect(wait).not.toHaveBeenCalled();
  });

  it('ecrã lento: espera até o brasão acabar', async () => {
    const wait = vi.fn(() => Promise.resolve());
    const load = holdForLogo(() => Promise.resolve('mod'), { now: clock([0, 900]), wait });
    await expect(load()).resolves.toBe('mod');
    expect(wait).toHaveBeenCalledWith(SKELETON_DELAY_MS + LOGO_DRAW_MS - 900);
  });

  it('ecrã muito lento (o desenho já acabou): entra quando chega', async () => {
    const wait = vi.fn(() => Promise.resolve());
    const load = holdForLogo(() => Promise.resolve('mod'), { now: clock([0, 5000]), wait });
    await expect(load()).resolves.toBe('mod');
    expect(wait).not.toHaveBeenCalled();
  });
});
