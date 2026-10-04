import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTodayISO } from './useTodayISO';

describe('useTodayISO', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 23, 59, 30)); // 4 out 2026, hora local
  });
  afterEach(() => vi.useRealTimers());

  it('devolve a data local de hoje', () => {
    const { result } = renderHook(() => useTodayISO());
    expect(result.current).toBe('2026-10-04');
  });

  it('muda sozinho quando passa a meia-noite', () => {
    const { result } = renderHook(() => useTodayISO());
    act(() => { vi.advanceTimersByTime(31_000); });
    expect(result.current).toBe('2026-10-05');
  });

  it('reavalia no regresso à app (visibilitychange)', () => {
    const { result } = renderHook(() => useTodayISO());
    // simula o telemóvel suspenso: o relógio salta sem disparar o temporizador
    vi.setSystemTime(new Date(2026, 9, 6, 8, 0, 0));
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(result.current).toBe('2026-10-06');
  });

  it('usa um só temporizador para vários componentes e limpa-o ao sair', () => {
    const a = renderHook(() => useTodayISO());
    const b = renderHook(() => useTodayISO());
    expect(vi.getTimerCount()).toBe(1);
    a.unmount();
    expect(vi.getTimerCount()).toBe(1);
    b.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
