import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Depois de apagar uma corrida, o trigger da BD pôs a prova dela de volta a
   agendada e soltou os treinos do plano (2026-09-28): o store relê os dois. */
const net = { races: { data: [], error: null }, plans: { data: [], error: null } };
function builder(table) {
  const b = {};
  for (const m of ['select', 'eq', 'order']) b[m] = () => b;
  const answer = table === 'race_events' ? net.races : table === 'coach_plans' ? net.plans : { data: [], error: null };
  b.then = (res, rej) => Promise.resolve(answer).then(res, rej);
  return b;
}
vi.mock('../lib/supabase', () => ({
  supabase: { from: (t) => builder(t) },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const { useAppStore } = await import('./index');
// A ação verdadeira, antes de os testes de cima a trocarem por um mock.
const realReloadCoachPlans = useAppStore.getState().reloadCoachPlans;

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

  it('a prova que voltou a agendada perde a cópia local do balanço', async () => {
    localStorage.setItem('ironcoach:balanco:r1', JSON.stringify({ text: 'Velho', at: 'x' }));
    localStorage.setItem('ironcoach:balanco:r2', JSON.stringify({ text: 'Outra', at: 'x' }));
    useAppStore.setState({ raceEvents: [{ id: 'r1', status: 'concluida' }, { id: 'r2', status: 'concluida' }] });
    net.races = { data: [{ id: 'r1', status: 'agendada' }, { id: 'r2', status: 'concluida' }], error: null };
    await useAppStore.getState().reloadAfterRunDeleted();
    expect(localStorage.getItem('ironcoach:balanco:r1')).toBeNull();
    expect(localStorage.getItem('ironcoach:balanco:r2')).not.toBeNull();
  });

  it('a resposta de uma conta que entretanto saiu não se escreve', async () => {
    net.races = { data: [{ id: 'r1', status: 'agendada' }], error: null };
    const p = useAppStore.getState().reloadAfterRunDeleted();
    useAppStore.setState({ session: { user: { id: 'u2' } } });
    await p;
    expect(useAppStore.getState().raceEvents).toEqual([{ id: 'r1', status: 'concluida' }]);
  });

  it('um pedido que falha deixa as provas que lá estavam', async () => {
    net.races = { data: null, error: { message: 'rede' } };
    await useAppStore.getState().reloadAfterRunDeleted();
    expect(useAppStore.getState().raceEvents).toEqual([{ id: 'r1', status: 'concluida' }]);
  });
});


/* reloadCoachPlans em erro ou com a conta trocada devolve null, não o que
   está no store: o Coach abre a proposta pendente do que recebe, e a do
   store pode ser a que o coach-chat acabou de recusar (revisão de fdd212f). */
describe('reloadCoachPlans', () => {
  beforeEach(() => {
    useAppStore.setState({
      reloadCoachPlans: realReloadCoachPlans,
      session: { user: { id: 'u1' } },
      coachPlans: [{ id: 'velho', status: 'proposto' }],
      coachPlanItems: [],
    });
  });

  it('um pedido que falha devolve null e deixa o plano que lá estava', async () => {
    net.plans = { data: null, error: { message: 'rede' } };
    expect(await useAppStore.getState().reloadCoachPlans()).toBeNull();
    expect(useAppStore.getState().coachPlans).toEqual([{ id: 'velho', status: 'proposto' }]);
  });

  it('com a conta trocada a meio, devolve null e não escreve', async () => {
    net.plans = { data: [{ id: 'da-outra', status: 'proposto' }], error: null };
    const p = useAppStore.getState().reloadCoachPlans();
    useAppStore.setState({ session: { user: { id: 'u2' } } });
    expect(await p).toBeNull();
    expect(useAppStore.getState().coachPlans).toEqual([{ id: 'velho', status: 'proposto' }]);
  });

  it('com sucesso, devolve e escreve os planos novos', async () => {
    net.plans = { data: [{ id: 'novo', status: 'proposto' }], error: null };
    expect(await useAppStore.getState().reloadCoachPlans()).toEqual([{ id: 'novo', status: 'proposto' }]);
    expect(useAppStore.getState().coachPlans).toEqual([{ id: 'novo', status: 'proposto' }]);
  });
});
