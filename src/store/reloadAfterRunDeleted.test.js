import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Depois de apagar uma corrida, o trigger da BD pôs a prova dela de volta a
   agendada e soltou os treinos do plano (2026-09-28): o store relê os dois. */
const net = { races: { data: [], error: null } };
function builder(table) {
  const b = {};
  for (const m of ['select', 'eq', 'order']) b[m] = () => b;
  b.then = (res, rej) => Promise.resolve(table === 'race_events' ? net.races : { data: [], error: null }).then(res, rej);
  return b;
}
vi.mock('../lib/supabase', () => ({
  supabase: { from: (t) => builder(t) },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const { useAppStore } = await import('./index');

describe('reloadAfterRunDeleted', () => {
  let reloadCoachPlans;
  beforeEach(() => {
    reloadCoachPlans = vi.fn(() => Promise.resolve([]));
    useAppStore.setState({
      session: { user: { id: 'u1' } },
      raceEvents: [{ id: 'r1', status: 'concluida' }],
      reloadCoachPlans,
    });
  });

  it('relê as provas (a prova volta a agendada) e os planos', async () => {
    net.races = { data: [{ id: 'r1', status: 'agendada' }], error: null };
    await useAppStore.getState().reloadAfterRunDeleted();
    expect(useAppStore.getState().raceEvents).toEqual([{ id: 'r1', status: 'agendada' }]);
    expect(reloadCoachPlans).toHaveBeenCalledTimes(1);
  });

  it('um pedido que falha deixa as provas que lá estavam', async () => {
    net.races = { data: null, error: { message: 'rede' } };
    await useAppStore.getState().reloadAfterRunDeleted();
    expect(useAppStore.getState().raceEvents).toEqual([{ id: 'r1', status: 'concluida' }]);
  });
});
