import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* O carregamento inicial com prazo (arranque preso no logo, 2026-09-24):
   uma rede falsa em que cada tabela responde com o atraso que o teste pedir. */
const net = { plan: {}, calls: [] };
function builder(table) {
  const b = {};
  for (const m of ['select', 'eq', 'order', 'gte', 'lte', 'in', 'neq', 'limit']) b[m] = () => b;
  // A resposta fica decidida quando o pedido sai, como na rede a sério.
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
  supabase: { from: (t) => { net.calls.push(t); return builder(t); } },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const { useAppStore, INITIAL_LOAD_BUDGET_MS, DATA_PENDING_MAX_MS, whenDataReady } = await import('./index');
const { startDailySummaryRefresh } = await import('../utils/dailySummaryRefresh');

const today = new Date().toISOString().slice(0, 10);
const run = (id) => ({ id, date: today, distance_km: 5 });

describe('loadInitialData com prazo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    net.plan = {};
    net.calls = [];
  });
  afterEach(() => vi.useRealTimers());

  it('tudo a tempo: entra tudo e o dataPending desce', async () => {
    net.plan.runs = { data: [run('a')] };
    net.plan.coach_plan_items = { data: [{ id: 'i1' }] };
    const p = useAppStore.getState().loadInitialData('u1');
    await vi.runAllTimersAsync();
    await p;
    const s = useAppStore.getState();
    expect(s.runs).toHaveLength(1);
    expect(s.coachPlanItems).toHaveLength(1);
    expect(s.profile).toMatchObject({ id: 'u1' });
    expect(s.dataPending).toBe(false);
  });

  it('um pedido preso na rede não segura o arranque: entra depois, em segundo plano', async () => {
    // O caso real: coach_plan_items 37 s preso, o resto em milissegundos.
    net.plan.coach_plan_items = { data: [{ id: 'i1' }], delay: 37000 };
    net.plan.runs = { data: [run('a'), run('b')] };
    let resolved = false;
    const p = useAppStore.getState().loadInitialData('u2').then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(INITIAL_LOAD_BUDGET_MS);
    await p;
    expect(resolved).toBe(true);
    let s = useAppStore.getState();
    expect(s.runs).toHaveLength(2);
    expect(s.coachPlanItems).toEqual([]);
    expect(s.dataPending).toBe(true);
    await vi.advanceTimersByTimeAsync(37000);
    s = useAppStore.getState();
    expect(s.coachPlanItems).toHaveLength(1);
    expect(s.dataPending).toBe(false);
  });

  it('com join, uma segunda chamada para a mesma conta junta-se à que está a correr', async () => {
    const a = useAppStore.getState().loadInitialData('u3', { join: true });
    const b = useAppStore.getState().loadInitialData('u3', { join: true });
    expect(b).toBe(a);
    await vi.runAllTimersAsync();
    await a;
    expect(net.calls.filter((t) => t === 'runs')).toHaveLength(1);
  });

  it('sem join (depois de gravar um registo) é sempre um carregamento novo, e o mais recente ganha', async () => {
    // Um regresso à app a correr, com as corridas lentas e ainda sem o registo novo…
    net.plan.runs = { data: [run('a')], delay: 3000 };
    const a = useAppStore.getState().loadInitialData('u7', { join: true });
    // …e o registo gravado entretanto: o pedido novo já o traz.
    net.plan.runs = { data: [run('a'), run('novo')] };
    const b = useAppStore.getState().loadInitialData('u7');
    expect(b).not.toBe(a);
    await vi.runAllTimersAsync();
    await Promise.all([a, b]);
    expect(useAppStore.getState().runs.map((r) => r.id)).toEqual(['a', 'novo']);
  });

  it('recarga da mesma conta: um pedido que falha mantém o que lá estava, sem mexer no dataPending', async () => {
    net.plan.runs = { data: [run('a')] };
    let p = useAppStore.getState().loadInitialData('u4');
    await vi.runAllTimersAsync();
    await p;
    net.plan.runs = { data: null, error: { message: 'rede' } };
    const seen = [];
    const unsub = useAppStore.subscribe((s) => seen.push(s.dataPending));
    p = useAppStore.getState().loadInitialData('u4');
    await vi.runAllTimersAsync();
    await p;
    unsub();
    expect(useAppStore.getState().runs).toHaveLength(1);
    expect(seen.includes(true)).toBe(false);
  });

  it('outra conta: as listas da anterior saem logo, e uma resposta atrasada dela não volta', async () => {
    net.plan.runs = { data: [run('a')] };
    let p = useAppStore.getState().loadInitialData('u5');
    await vi.runAllTimersAsync();
    await p;
    // Recarga de u5 com as corridas presas; entretanto entra u6.
    net.plan.runs = { data: [run('velha')], delay: 20000 };
    p = useAppStore.getState().loadInitialData('u5');
    await vi.advanceTimersByTimeAsync(INITIAL_LOAD_BUDGET_MS);
    await p;
    net.plan.runs = { data: [] };
    const q = useAppStore.getState().loadInitialData('u6');
    expect(useAppStore.getState().runs).toEqual([]);
    await vi.runAllTimersAsync();
    await q;
    expect(useAppStore.getState().runs).toEqual([]);
  });

  it('um pedido que nunca responde não segura o dataPending para sempre', async () => {
    net.plan.coach_plan_items = { delay: 10 * 60 * 1000 };
    const p = useAppStore.getState().loadInitialData('u8');
    await vi.advanceTimersByTimeAsync(INITIAL_LOAD_BUDGET_MS);
    await p;
    expect(useAppStore.getState().dataPending).toBe(true);
    let ready = false;
    whenDataReady().then(() => { ready = true; });
    await vi.advanceTimersByTimeAsync(DATA_PENDING_MAX_MS);
    expect(useAppStore.getState().dataPending).toBe(false);
    expect(ready).toBe(true);
  });

  it('passado o prazo, um regresso à app com o pedido ainda preso não volta a subir o dataPending', async () => {
    net.plan.coach_plan_items = { delay: 10 * 60 * 1000 };
    const p = useAppStore.getState().loadInitialData('u10');
    await vi.advanceTimersByTimeAsync(INITIAL_LOAD_BUDGET_MS);
    await p;
    await vi.advanceTimersByTimeAsync(DATA_PENDING_MAX_MS);
    expect(useAppStore.getState().dataPending).toBe(false);
    const seen = [];
    const unsub = useAppStore.subscribe((s) => seen.push(s.dataPending));
    const q = useAppStore.getState().loadInitialData('u10', { join: true });
    await vi.advanceTimersByTimeAsync(INITIAL_LOAD_BUDGET_MS);
    await q;
    unsub();
    expect(seen.includes(true)).toBe(false);
  });

  it('depois de um erro no carregamento novo, a resposta atrasada do anterior já não escreve', async () => {
    net.plan.runs = { data: [run('a')] };
    let p = useAppStore.getState().loadInitialData('u9');
    await vi.runAllTimersAsync();
    await p;
    // Um regresso à app com as corridas lentas (pedidas antes de uma gravação)…
    net.plan.runs = { data: [run('velha')], delay: 20000 };
    const a = useAppStore.getState().loadInitialData('u9', { join: true });
    // …e o carregamento de depois da gravação, com as corridas a falhar.
    net.plan.runs = { data: null, error: { message: 'rede' } };
    const b = useAppStore.getState().loadInitialData('u9');
    await vi.runAllTimersAsync();
    await Promise.all([a, b]);
    expect(useAppStore.getState().runs.map((r) => r.id)).toEqual(['a']);
  });
});

/* O store a sério com o dailySummaryRefresh (revisão pré-deploy de 90bfa9b):
   cada arranque a frio pedia um resumo novo ao modelo. */
describe('loadInitialData com o dailySummaryRefresh', () => {
  let stop;
  beforeEach(() => {
    vi.useFakeTimers();
    net.plan = {};
    net.calls = [];
  });
  afterEach(() => { stop?.(); vi.useRealTimers(); });

  it('arranque a frio e troca de conta não pedem resumo nenhum; uma corrida nova pede', async () => {
    const loadDailySummary = vi.fn(() => Promise.resolve(null));
    useAppStore.setState({ loadDailySummary, session: null });
    stop = startDailySummaryRefresh(useAppStore, { delayMs: 100 });
    net.plan.runs = { data: [run('a'), run('b')] };
    useAppStore.setState({ session: { user: { id: 'c1' } } });
    let p = useAppStore.getState().loadInitialData('c1', { join: true });
    await vi.runAllTimersAsync();
    await p;
    expect(loadDailySummary).not.toHaveBeenCalled();

    // Outra conta neste telemóvel.
    net.plan.runs = { data: [run('x')] };
    useAppStore.setState({ session: { user: { id: 'c2' } } });
    p = useAppStore.getState().loadInitialData('c2', { join: true });
    await vi.runAllTimersAsync();
    await p;
    expect(loadDailySummary).not.toHaveBeenCalled();

    // Uma corrida registada agora.
    useAppStore.setState({ runs: [...useAppStore.getState().runs, run('nova')] });
    await vi.advanceTimersByTimeAsync(100);
    expect(loadDailySummary).toHaveBeenCalledWith({ force: true });
  });
});

