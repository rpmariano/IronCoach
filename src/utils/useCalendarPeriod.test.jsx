import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// O motor real vive em _shared/formulas/calendarPeriod.ts (testado lá); aqui
// só se verifica a ligação store + hoje + motor, por isso vai simulado.
vi.mock('@formulas/calendarPeriod.ts', () => ({
  calendarPeriod: vi.fn((kind, today, offset) => ({ kind, offset, start: today, end: today })),
  previousPeriod: vi.fn((p) => ({ ...p, offset: p.offset - 1 })),
  periodLabel: vi.fn((p) => ({ title: `${p.kind}:${p.offset}`, range: '' })),
  periodEarlyState: vi.fn(() => 'ok'),
}));
vi.mock('./useTodayISO', () => ({ useTodayISO: () => '2026-10-04' }));

import { useCalendarPeriod } from './useCalendarPeriod';
import { usePeriodStore } from '../store/periodStore';

describe('useCalendarPeriod', () => {
  beforeEach(() => usePeriodStore.getState().reset());

  it('usa a omissão do separador e não deixa avançar do presente', () => {
    const { result } = renderHook(() => useCalendarPeriod('corpo'));
    expect(result.current.kind).toBe('trimestre');
    expect(result.current.canGoNext).toBe(false);
    act(() => result.current.next());
    expect(result.current.offset).toBe(0);
  });

  it('prev/next/setKind mexem só neste separador', () => {
    const { result } = renderHook(() => useCalendarPeriod('nutricao'));
    act(() => result.current.prev());
    expect(result.current.offset).toBe(-1);
    expect(result.current.canGoNext).toBe(true);
    expect(result.current.label.title).toBe('semana:-1');
    expect(result.current.previous.offset).toBe(-2);
    act(() => result.current.next());
    expect(result.current.offset).toBe(0);
    act(() => result.current.prev());
    act(() => result.current.setKind('mes'));
    expect(result.current.kind).toBe('mes');
    expect(result.current.offset).toBe(0);
    expect(usePeriodStore.getState().tabs.corrida.offset).toBe(0);
  });
});
