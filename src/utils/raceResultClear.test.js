import { describe, it, expect, beforeEach, vi } from 'vitest';

/* A ordem de clearRaceResult (revisão pré-deploy, 2026-11-15): a prova primeiro, as corridas depois.
   Se o update à prova falha, nada se perde — nem a corrida, nem a prova concluída. */

const mocks = vi.hoisted(() => ({ ops: [], raceUpdateError: null, runError: null }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      const op = { table, kind: null, patch: null, filters: {} };
      const result = () => {
        if (table === 'race_events' && op.kind === 'update' && mocks.raceUpdateError && op.patch?.status === 'agendada') return { data: null, error: mocks.raceUpdateError };
        if (table === 'runs' && mocks.runError) return { data: null, error: mocks.runError };
        return { data: { id: op.filters.id }, error: null };
      };
      const q = {
        delete: () => { op.kind = 'delete'; return q; },
        update: (patch) => { op.kind = 'update'; op.patch = patch; return q; },
        eq: (col, val) => { op.filters[col] = val; return q; },
        select: () => q,
        maybeSingle: () => { mocks.ops.push(op); return Promise.resolve(result()); },
        then: (res, rej) => { mocks.ops.push(op); return Promise.resolve(result()).then(res, rej); },
      };
      return q;
    },
  },
}));

const { useAppStore } = await import('../store');
const { clearRaceResult } = await import('./raceResultClear');

const RACE = { id: 'race-1', date: '2026-11-14', status: 'concluida', coach_balance: 'Boa.', coach_balance_at: '2026-11-14T20:00:00Z', distance_km: 10 };
const RUN = { id: 'run-1', date: '2026-11-14', race_id: 'race-1', distance_km: 10, duration_seconds: 3400, details: { official_time_seconds: 3390, position: 10, avg_hr: 160 } };

describe('clearRaceResult — a ordem dos pedidos', () => {
  beforeEach(() => {
    mocks.ops.length = 0;
    mocks.raceUpdateError = null;
    mocks.runError = null;
    useAppStore.setState({ raceEvents: [RACE], runs: [RUN], reloadAfterRunDeleted: vi.fn() });
  });

  it('a prova é atualizada ANTES de se apagar a corrida', async () => {
    const res = await clearRaceResult({ race: RACE, userId: 'user-1', deleteRuns: true });
    expect(res.ok).toBe(true);
    expect(mocks.ops.map((o) => `${o.table}:${o.kind}`)).toEqual(['race_events:update', 'runs:delete']);
    expect(useAppStore.getState().runs).toEqual([]);
    expect(useAppStore.getState().raceEvents[0].status).toBe('agendada');
  });

  it('se o update à prova falha, a corrida não se apaga e nada muda', async () => {
    mocks.raceUpdateError = { code: '42501', message: 'negado' };
    const res = await clearRaceResult({ race: RACE, userId: 'user-1', deleteRuns: true });
    expect(res).toEqual({ ok: false, message: 'Não consegui apagar o resultado. Tenta outra vez.' });
    expect(mocks.ops.map((o) => `${o.table}:${o.kind}`)).toEqual(['race_events:update']);
    expect(useAppStore.getState().runs).toEqual([RUN]);
    expect(useAppStore.getState().raceEvents[0]).toEqual(RACE);
  });

  it('se a corrida falha depois, a prova volta ao que era', async () => {
    mocks.runError = { code: '500', message: 'rede' };
    const res = await clearRaceResult({ race: RACE, userId: 'user-1', deleteRuns: false });
    expect(res.ok).toBe(false);
    const raceUpdates = mocks.ops.filter((o) => o.table === 'race_events');
    expect(raceUpdates.map((o) => o.patch)).toEqual([
      { status: 'agendada', coach_balance: null, coach_balance_at: null },
      { status: 'concluida', coach_balance: 'Boa.', coach_balance_at: '2026-11-14T20:00:00Z' },
    ]);
    expect(raceUpdates.every((o) => o.filters.user_id === 'user-1')).toBe(true);
    expect(useAppStore.getState().raceEvents[0]).toEqual(RACE);
    expect(useAppStore.getState().runs).toEqual([RUN]);
  });
});
