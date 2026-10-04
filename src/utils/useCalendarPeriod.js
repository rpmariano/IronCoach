import { useMemo, useCallback } from 'react';
import { usePeriodStore, selectTabPeriod, DEFAULT_KINDS } from '../store/periodStore';
import { useTodayISO } from './useTodayISO';
import {
  calendarPeriod,
  previousPeriod,
  periodLabel,
  periodEarlyState,
} from '@formulas/calendarPeriod.ts';

/**
 * Período de calendário de um separador (2026-10-04): junta o store pequeno,
 * o "hoje" reativo e o motor partilhado com a Carol.
 * `opts` (opcional) { daysWithData, dataStartISO, minClosed } alimenta o rótulo e o estado "cedo".
 */
export function useCalendarPeriod(tab, opts = {}) {
  const sel = useMemo(() => selectTabPeriod(tab), [tab]);
  const { kind, offset } = usePeriodStore(sel);
  const today = useTodayISO();
  const setKindRaw = usePeriodStore((s) => s.setKind);
  const shift = usePeriodStore((s) => s.shift);

  const { daysWithData, dataStartISO, minClosed } = opts;
  const period = useMemo(() => calendarPeriod(kind, today, offset), [kind, today, offset]);
  const previous = useMemo(() => previousPeriod(period, today), [period, today]);
  const label = useMemo(
    () => periodLabel(period, today, { daysWithData, dataStartISO }),
    [period, today, daysWithData, dataStartISO],
  );
  const earlyState = useMemo(
    () => periodEarlyState(period, today, minClosed),
    [period, today, minClosed],
  );

  const setKind = useCallback((k) => setKindRaw(tab, k), [setKindRaw, tab]);
  const prev = useCallback(() => shift(tab, -1), [shift, tab]);
  const next = useCallback(() => shift(tab, 1), [shift, tab]);

  return { kind: kind || DEFAULT_KINDS[tab], offset, period, previous, label, earlyState, canGoNext: offset < 0, setKind, prev, next };
}

export default useCalendarPeriod;
