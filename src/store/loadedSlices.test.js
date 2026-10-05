import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* "Dados prontos" por fatia (2026-10-04): o hook de revelação da Evolução
   espera só pelas fatias do seu separador, não pelo dataPending global (que
   pode durar 45 s por uma fatia sem nada a ver). Mesma rede falsa do
   initialLoad.test.js. Os profiles/single() chegam com { id } para o perfil. */
const net = { plan: {} };
function builder(table) {
  const b = {};
  for (const m of ['select', 'eq', 'order', 'gte', 'lte', 'in', 'neq', 'limit', 'range']) b[m] = () => b;
  const cfg = net.plan[table] || {};
  const result = () => new Promise((resolve, reject) => {
    const r = { data: cfg.data ?? (table === 'profiles' ? { id: 'u1' } : []), error: cfg.error ?? null };
    // `reject` (2026-10-05): a promessa rejeita em vez de devolver { error }.
    const settle = () => (cfg.reject ? reject(new Error(cfg.reject)) : resolve(r));
    if (cfg.delay) setTimeout(settle, cfg.delay);
    else settle();
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

  it('com dataPending, uma fatia que não está na lista não conta', () => {
    const state = { dataPending: true, loadedSlices: { training: true } };
    expect(sliceReady(state, ['runs'])).toBe(true);
    expect(sliceReady(state, ['runs', 'planItems'])).toBe(false);
  });
});

/* Comportamento das listas por separador num arranque a frio (2026-10-05,
   revisão do A2): testa-se o que o Dashboard calcula (sliceReady com
   EVOLUTION_TAB_SLICES), não o conteúdo literal das listas. */
const TABS = Object.keys(EVOLUTION_TAB_SLICES);
const readyTabs = (s) => TABS.filter((t) => sliceReady(s, EVOLUTION_TAB_SLICES[t]));

describe('EVOLUTION_TAB_SLICES num arranque a frio', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    net.plan = {};
  });
  afterEach(() => vi.useRealTimers());

  it('antes do fim do orçamento nenhum separador está pronto (as fatias a tempo entram todas no fim)', async () => {
    net.plan.coach_plan_items = { delay: 37000 };
    const p = useAppStore.getState().loadInitialData('tab1');
    await vi.advanceTimersByTimeAsync(INITIAL_LOAD_BUDGET_MS - 1);
    expect(useAppStore.getState().loadedSlices).toEqual({});
    expect(readyTabs(useAppStore.getState())).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    await vi.runAllTimersAsync();
  });

  it('itens do plano a 37 s não seguram nenhum separador depois do orçamento', async () => {
    net.plan.coach_plan_items = { delay: 37000 };
    const p = useAppStore.getState().loadInitialData('tab2');
    await vi.advanceTimersByTimeAsync(INITIAL_LOAD_BUDGET_MS);
    await p;
    const s = useAppStore.getState();
    expect(s.dataPending).toBe(true);
    expect(s.loadedSlices.coachPlanItems).toBeFalsy();
    expect(readyTabs(s)).toEqual(TABS);
    await vi.runAllTimersAsync();
  });

  it('o histórico de objetivos atrasado segura o Geral e a Nutrição — só esses — até chegar', async () => {
    net.plan.profile_goal_history = { data: [], delay: 20000 };
    const p = useAppStore.getState().loadInitialData('tab3');
    await vi.advanceTimersByTimeAsync(INITIAL_LOAD_BUDGET_MS);
    await p;
    let s = useAppStore.getState();
    expect(readyTabs(s).sort()).toEqual(['corpo', 'corrida', 'ginasio']);
    expect(sliceReady(s, EVOLUTION_TAB_SLICES.hub)).toBe(false);
    await vi.advanceTimersByTimeAsync(10000);
    s = useAppStore.getState();
    expect(s.loadedSlices.goalHistory).toBe(true);
    expect(readyTabs(s)).toEqual(TABS);
  });

  it('corridas atrasadas seguram todos os separadores que as desenham, e o Ginásio (mesmo pedido)', async () => {
    net.plan.runs = { delay: 20000 };
    const p = useAppStore.getState().loadInitialData('tab4');
    await vi.advanceTimersByTimeAsync(INITIAL_LOAD_BUDGET_MS);
    await p;
    // Corridas e ginásio vêm juntos (fatia `training`): o Ginásio também espera.
    expect(readyTabs(useAppStore.getState())).toEqual(['corpo']);
    await vi.advanceTimersByTimeAsync(10000);
    expect(readyTabs(useAppStore.getState())).toEqual(TABS);
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
    // A presa ainda não chegou: quem a desenha continua à espera dela.
    expect(s.loadedSlices.meals).toBeFalsy();
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
    expect(s.loadedSlices.bodyAssessments).toBe(true);
    expect(s.loadedSlices.coachPlanItems).toBeFalsy();
    console.warn.mockRestore?.();
  });

  it('antes de tudo chegar, nada entra em loadedSlices (um só set no fim)', async () => {
    net.plan.meals = { data: [], delay: 5000 };
    const p = useAppStore.getState().loadInitialData('ls7');
    await vi.advanceTimersByTimeAsync(2000);
    // As que já responderam ainda não entraram no store: nem elas contam.
    let s = useAppStore.getState();
    expect(s.loadedSlices).toEqual({});
    expect(sliceReady(s, ['runs'])).toBe(false);
    expect(sliceReady(s, ['meals'])).toBe(false);
    await vi.advanceTimersByTimeAsync(INITIAL_LOAD_BUDGET_MS);
    await p;
    s = useAppStore.getState();
    expect(s.loadedSlices.meals).toBe(true);
    expect(s.dataPending).toBe(false);
  });

  it('uma fatia cuja promessa rejeita também conta como chegada (2026-10-05)', async () => {
    net.plan.body_assessments = { reject: 'socket' };
    net.plan.coach_plan_items = { delay: 37000 };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = useAppStore.getState().loadInitialData('ls8');
    await vi.advanceTimersByTimeAsync(INITIAL_LOAD_BUDGET_MS);
    await p;
    const s = useAppStore.getState();
    expect(s.loadedSlices.bodyAssessments).toBe(true);
    expect(s.loadedSlices.coachPlanItems).toBeFalsy();
    console.warn.mockRestore?.();
    await vi.runAllTimersAsync();
  });

  it('uma rejeição depois do orçamento também marca a fatia', async () => {
    net.plan.body_assessments = { reject: 'socket', delay: 20000 };
    net.plan.coach_plan_items = { delay: 37000 };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = useAppStore.getState().loadInitialData('ls9');
    await vi.advanceTimersByTimeAsync(INITIAL_LOAD_BUDGET_MS);
    await p;
    expect(useAppStore.getState().loadedSlices.bodyAssessments).toBeFalsy();
    await vi.advanceTimersByTimeAsync(15000);
    expect(useAppStore.getState().loadedSlices.bodyAssessments).toBe(true);
    console.warn.mockRestore?.();
    await vi.runAllTimersAsync();
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
    expect(s.loadedSlices.training).toBeFalsy();
    expect(s.loadedSlices.meals).toBe(true);
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
