import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* "Dados prontos" por fatia (2026-10-04): o hook de revelação da Evolução
   espera só pelas fatias do seu separador, não pelo dataPending global (que
   pode durar 45 s por uma fatia sem nada a ver). Mesma rede falsa do
   initialLoad.test.js. */
const net = { plan: {} };
function builder(table) {
  const b = {};
  for (const m of ['select', 'eq', 'order', 'gte', 'lte', 'in', 'neq', 'limit', 'range']) b[m] = () => b;
  const cfg = net.plan[table] || {};
  const result = () => new Promise((resolve) => {
    const r = { data: cfg.data ?? (table === 'profiles' ? { id: 'u1' } : []), error: cfg.error ?? null };
    if (cfg.delay) setTimeout(() => resolve(r), cfg.delay);
    else resolve(r);
  });
  b.single = result;
  b.maybeSingle = result;
  b.then = (res, rej) => result().then(res, rej);
  return b;
}
vi.mock('../lib/supabase', () => ({
  supabase: { from: (t) => builder(t) },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const { useAppStore, INITIAL_LOAD_BUDGET_MS, DATA_PENDING_MAX_MS, sliceReady, EVOLUTION_TAB_SLICES } = await import('./index');

describe('sliceReady (função pura)', () => {
  it('sem dataPending (demo, dados já carregados) está sempre pronto', () => {
    expect(sliceReady({ dataPending: false, loadedSlices: {} }, ['runs', 'meals'])).toBe(true);
  });

  it('com dataPending só conta o que chegou, e aceita os nomes de ecrã', () => {
    const state = { dataPending: true, loadedSlices: { training: true, meals: true } };
    expect(sliceReady(state, ['runs'])).toBe(true); // runs → training
    expect(sliceReady(state, ['gym', 'meals'])).toBe(true);
    expect(sliceReady(state, ['runs', 'body'])).toBe(false);
    expect(sliceReady(state, [])).toBe(true);
  });

  it('tolera um estado sem loadedSlices', () => {
    expect(sliceReady({ dataPending: true }, ['runs'])).toBe(false);
  });

  it('todos os separadores da Evolução têm fatias conhecidas', () => {
    for (const slices of Object.values(EVOLUTION_TAB_SLICES)) {
      expect(slices.length).toBeGreaterThan(0);
    }
  });
});

describe('loadedSlices em runInitialLoad', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    net.plan = {};
  });
  afterEach(() => vi.useRealTimers());

  it('uma fatia presa não segura as outras: chegam a tempo e ficam prontas, a presa só quando chega', async () => {
    net.plan.meals = { data: [{ id: 'm1' }], delay: 37000 };
    const p = useAppStore.getState().loadInitialData('ls1');
    await vi.advanceTimersByTimeAsync(INITIAL_LOAD_BUDGET_MS);
    await p;
    let s = useAppStore.getState();
    expect(s.dataPending).toBe(true);
    expect(sliceReady(s, ['runs', 'gym', 'body', 'profile'])).toBe(true);
    expect(sliceReady(s, ['meals'])).toBe(false);
    await vi.advanceTimersByTimeAsync(37000);
    s = useAppStore.getState();
    expect(s.meals).toHaveLength(1);
    expect(sliceReady(s, ['meals'])).toBe(true);
    expect(s.loadedSlices.meals).toBe(true);
    expect(s.dataPending).toBe(false);
  });

  it('uma fatia que falha conta como chegada (nada mais a esperar)', async () => {
    net.plan.body_assessments = { data: null, error: { message: 'rede' } };
    net.plan.coach_plan_items = { delay: 37000 };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = useAppStore.getState().loadInitialData('ls2');
    await vi.advanceTimersByTimeAsync(INITIAL_LOAD_BUDGET_MS);
    await p;
    const s = useAppStore.getState();
    expect(s.dataPending).toBe(true);
    expect(sliceReady(s, ['body'])).toBe(true);
    expect(sliceReady(s, ['planItems'])).toBe(false);
    console.warn.mockRestore?.();
  });

  it('uma fatia que responde sem nada para escrever (sem resumo de hoje) também conta', async () => {
    const p = useAppStore.getState().loadInitialData('ls3');
    await vi.runAllTimersAsync();
    await p;
    expect(useAppStore.getState().loadedSlices.dailySummary).toBe(true);
  });

  it('mudar de conta limpa as fatias da anterior', async () => {
    net.plan.meals = { data: [], delay: 0 };
    let p = useAppStore.getState().loadInitialData('ls4');
    await vi.runAllTimersAsync();
    await p;
    expect(useAppStore.getState().loadedSlices.training).toBe(true);
    net.plan.runs = { delay: 60000 };
    p = useAppStore.getState().loadInitialData('ls5');
    expect(useAppStore.getState().loadedSlices).toEqual({});
    await vi.advanceTimersByTimeAsync(INITIAL_LOAD_BUDGET_MS);
    await p;
    const s = useAppStore.getState();
    expect(sliceReady(s, ['runs'])).toBe(false);
    expect(sliceReady(s, ['meals'])).toBe(true);
    await vi.advanceTimersByTimeAsync(DATA_PENDING_MAX_MS);
  });

  it('numa recarga da mesma conta as fatias que já lá estavam mantêm-se', async () => {
    let p = useAppStore.getState().loadInitialData('ls6');
    await vi.runAllTimersAsync();
    await p;
    net.plan.runs = { delay: 30000 };
    p = useAppStore.getState().loadInitialData('ls6');
    await vi.advanceTimersByTimeAsync(INITIAL_LOAD_BUDGET_MS);
    await p;
    const s = useAppStore.getState();
    expect(s.dataPending).toBe(false);
    expect(s.loadedSlices.training).toBe(true);
    await vi.runAllTimersAsync();
  });
});
