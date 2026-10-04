import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCalendarPeriod } from './useCalendarPeriod';
import { usePeriodStore } from '../store/periodStore';

// 2026-10-04: integração com o motor REAL (sem vi.mock de calendarPeriod), hoje fixo em 4 out 2026.
describe('useCalendarPeriod (motor real)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date(2026, 9, 4, 12, 0, 0));
    usePeriodStore.getState().reset();
  });
  afterEach(() => vi.useRealTimers());

  it('semana atual e navegação para a anterior', () => {
    const { result } = renderHook(() => useCalendarPeriod('nutricao'));
    expect(result.current.kind).toBe('semana');
    expect(result.current.label.title).toBe('Esta semana');
    expect(result.current.canGoNext).toBe(false);
    act(() => result.current.prev());
    expect(result.current.offset).toBe(-1);
    expect(result.current.canGoNext).toBe(true);
    expect(result.current.label.title).not.toBe('Esta semana');
  });

  it('separador desconhecido não entra em ciclo infinito', () => {
    const { result } = renderHook(() => useCalendarPeriod('geral'));
    expect(result.current.kind).toBe('semana');
    expect(result.current.offset).toBe(0);
  });
});
