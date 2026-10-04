import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Paginação, partilha estrutural e histórico de objetivos no carregamento
   (plano da Evolução, F3/F4, 2026-10-04). O cliente supabase falso corta cada
   resposta em MAX_ROWS como o PostgREST, e só devolve o resto com .range(). */
const MAX_ROWS = 1000;
const net = { tables: {}, calls: [], errors: {}, failPage: null };
function builder(table) {
  const q = { range: null };
  const b = {};
  for (const m of ['select', 'eq', 'gte', 'lte', 'in', 'neq', 'limit', 'order']) b[m] = () => b;
  b.range = (from, to) => { q.range = [from, to]; return b; };
  const result = () => {
    const rows = net.tables[table];
    if (net.errors[table]) return Promise.resolve({ data: null, error: { message: net.errors[table] } });
    if (table === 'profiles') return Promise.resolve({ data: rows ?? { id: 'u1' }, error: null });
    const all = rows || [];
    const [from, to] = q.range || [0, MAX_ROWS - 1];
    net.calls.push({ table, from, to });
    if (net.failPage && net.failPage.table === table && from === net.failPage.from) {
      return Promise.resolve({ data: null, error: { message: 'pagina falhou' } });
    }
    // O servidor corta em MAX_ROWS mesmo que o range peça mais.
    // Clona as linhas como a rede real (cada resposta desserializa objetos
    // novos); sem isto a partilha passava só por identidade (a === b).
    return Promise.resolve({ data: JSON.parse(JSON.stringify(all.slice(from, Math.min(to + 1, from + MAX_ROWS)))), error: null });
  };
  b.single = result;
  b.maybeSingle = result;
  b.then = (res, rej) => result().then(res, rej);
  return b;
}
vi.mock('../lib/supabase', () => ({
  supabase: { from: (t) => builder(t) },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const { useAppStore, fetchAllPaged, shareUnchanged, sameList, sameRow } = await import('./index');

const mkMeals = (n) => Array.from({ length: n }, (_, i) => ({
  id: `m${i}`, date: '2026-09-01', meal_type: 'almoco', meal_items: [{ id: `i${i}`, quantity_grams: 100 }],
}));

describe('fetchAllPaged', () => {
  beforeEach(() => { net.tables = {}; net.calls = []; net.errors = {}; net.failPage = null; });

  it('lê as páginas todas, pela ordem, até vir uma página curta', async () => {
    net.tables.meals = mkMeals(2500);
    const { data, error } = await fetchAllPaged(() => builder('meals'));
    expect(error).toBeNull();
    expect(data).toHaveLength(2500);
    expect(data[0].id).toBe('m0');
    expect(data[2499].id).toBe('m2499');
    expect(net.calls.map((c) => [c.from, c.to])).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('uma lista que cabe numa página faz um só pedido', async () => {
    net.tables.meals = mkMeals(10);
    const { data } = await fetchAllPaged(() => builder('meals'));
    expect(data).toHaveLength(10);
    expect(net.calls).toHaveLength(1);
  });

  it('um múltiplo exato da página pede mais uma, vazia, para ter a certeza', async () => {
    net.tables.meals = mkMeals(1000);
    const { data } = await fetchAllPaged(() => builder('meals'));
    expect(data).toHaveLength(1000);
    expect(net.calls).toHaveLength(2);
  });

  it('um erro numa página devolve o erro e nenhuma lista a meio', async () => {
    net.tables.meals = mkMeals(2500);
    net.failPage = { table: 'meals', from: 1000 };
    const res = await fetchAllPaged(() => builder('meals'));
    expect(res.data).toBeNull();
    expect(res.error.message).toBe('pagina falhou');
  });

  it('deduplica por id uma linha que deslizou entre páginas', async () => {
    const rows = mkMeals(1500);
    let n = 0;
    const factory = () => {
      const b = {};
      b.range = (from) => Promise.resolve({
        // na 2.ª página volta a última linha da 1.ª (entrou outra no topo)
        data: n++ === 0 ? rows.slice(0, 1000) : rows.slice(999, 1500),
        error: null,
      });
      return b;
    };
    const { data } = await fetchAllPaged(factory);
    expect(data).toHaveLength(1500);
    expect(new Set(data.map((r) => r.id)).size).toBe(1500);
  });

  it('respeita um pageSize pedido', async () => {
    net.tables.meals = mkMeals(25);
    const { data } = await fetchAllPaged(() => builder('meals'), 10);
    expect(data).toHaveLength(25);
    expect(net.calls.map((c) => c.from)).toEqual([0, 10, 20]);
  });
});

describe('carregamento inicial paginado', () => {
  beforeEach(() => {
    net.tables = {}; net.calls = []; net.errors = {}; net.failPage = null;
    useAppStore.setState({ session: null });
  });

  it('meals, water_logs, runs, workout_sessions e body_assessments trazem mais de 1000 linhas', async () => {
    net.tables.meals = mkMeals(1200);
    net.tables.water_logs = Array.from({ length: 1100 }, (_, i) => ({ id: i, amount_ml: 250 }));
    net.tables.runs = Array.from({ length: 1005 }, (_, i) => ({ id: `r${i}`, date: '2026-01-01' }));
    net.tables.workout_sessions = Array.from({ length: 1001 }, (_, i) => ({ id: `g${i}`, date: '2026-01-01', workout_session_sets: [] }));
    net.tables.body_assessments = Array.from({ length: 1002 }, (_, i) => ({ id: `b${i}`, date: '2026-01-01' }));
    await useAppStore.getState().loadInitialData('u-page');
    const s = useAppStore.getState();
    expect(s.meals).toHaveLength(1200);
    expect(s.waterLogs).toHaveLength(1100);
    expect(s.runs).toHaveLength(1005);
    expect(s.gymSessions).toHaveLength(1001);
    expect(s.bodyAssessments).toHaveLength(1002);
  });

  it('uma página que falha mantém o que já lá estava (como um pedido simples que falha)', async () => {
    net.tables.meals = mkMeals(1200);
    await useAppStore.getState().loadInitialData('u-err');
    expect(useAppStore.getState().meals).toHaveLength(1200);
    const before = useAppStore.getState().meals;
    net.failPage = { table: 'meals', from: 1000 };
    await useAppStore.getState().loadInitialData('u-err');
    expect(useAppStore.getState().meals).toBe(before);
  });

  it('lê o histórico de objetivos para o store e marca a fatia', async () => {
    net.tables.profile_goal_history = [
      { valid_from: '2026-10-03T10:00:00Z', calorie_goal: 2000, source: 'inicial' },
      { valid_from: '2026-10-10T10:00:00Z', calorie_goal: 2200, source: 'perfil' },
    ];
    await useAppStore.getState().loadInitialData('u-hist');
    const s = useAppStore.getState();
    expect(s.goalHistory).toHaveLength(2);
    expect(s.loadedSlices.goalHistory).toBe(true);
  });

  it('histórico em erro (tabela por migrar) fica vazio, sem partir o resto', async () => {
    net.errors.profile_goal_history = 'relation does not exist';
    net.tables.runs = [{ id: 'r1', date: '2026-01-01' }];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await useAppStore.getState().loadInitialData('u-hist-err');
    const s = useAppStore.getState();
    expect(s.goalHistory).toEqual([]);
    expect(s.runs).toHaveLength(1);
    console.warn.mockRestore();
  });

  it('reloadGoalHistory relê o histórico quando o perfil muda de objetivos', async () => {
    net.tables.profile_goal_history = [{ valid_from: '2026-10-03T10:00:00Z', calorie_goal: 2000, source: 'inicial' }];
    await useAppStore.getState().loadInitialData('u-reload');
    expect(useAppStore.getState().goalHistory).toHaveLength(1);
    net.tables.profile_goal_history = [
      ...net.tables.profile_goal_history,
      { valid_from: '2026-10-10T10:00:00Z', calorie_goal: 2300, source: 'perfil' },
    ];
    // Mesma conta, objetivos diferentes → relê sozinho.
    const profile = useAppStore.getState().profile;
    useAppStore.setState({ profile: { ...profile, calorie_goal: 2000 } });
    useAppStore.setState({ profile: { ...useAppStore.getState().profile, calorie_goal: 2300 } });
    await vi.waitFor(() => expect(useAppStore.getState().goalHistory).toHaveLength(2));
  });
});

describe('partilha estrutural', () => {
  beforeEach(() => { net.tables = {}; net.calls = []; net.errors = {}; net.failPage = null; });

  it('uma recarga igual devolve as mesmas referências em todas as fatias', async () => {
    net.tables.meals = mkMeals(30);
    net.tables.runs = [{ id: 'r1', date: '2026-09-01', distance_km: 5, splits: [{ km: 1, s: 300 }, { km: 2, s: 310 }] }];
    net.tables.workout_sessions = [{ id: 'g1', date: '2026-09-02', workout_session_sets: [{ id: 's1', reps: 8 }, { id: 's2', reps: 8 }] }];
    net.tables.profile_goal_history = [{ valid_from: '2026-10-03T10:00:00Z', calorie_goal: 2000, source: 'inicial' }];
    await useAppStore.getState().loadInitialData('u-share');
    const a = useAppStore.getState();
    await useAppStore.getState().loadInitialData('u-share');
    const b = useAppStore.getState();
    for (const k of ['meals', 'runs', 'gymSessions', 'goalHistory', 'profile', 'waterLogs', 'bodyAssessments']) {
      expect(b[k]).toBe(a[k]);
    }
  });

  it('uma mudança numa linha devolve uma referência nova só nessa fatia', async () => {
    net.tables.meals = mkMeals(30);
    net.tables.runs = [{ id: 'r1', date: '2026-09-01', distance_km: 5 }];
    await useAppStore.getState().loadInitialData('u-share2');
    const a = useAppStore.getState();
    net.tables.meals = mkMeals(30).map((m, i) => (i === 7 ? { ...m, meal_type: 'jantar' } : { ...m }));
    await useAppStore.getState().loadInitialData('u-share2');
    const b = useAppStore.getState();
    expect(b.meals).not.toBe(a.meals);
    expect(b.meals[7].meal_type).toBe('jantar');
    expect(b.runs).toBe(a.runs);
  });

  it('itens embutidos: conta o comprimento, os ids e o updated_at', async () => {
    net.tables.meals = mkMeals(5);
    await useAppStore.getState().loadInitialData('u-share3');
    const a = useAppStore.getState().meals;
    // Item novo (comprimento diferente).
    net.tables.meals = mkMeals(5).map((m, i) => (i === 2 ? { ...m, meal_items: [...m.meal_items, { id: 'x', quantity_grams: 5 }] } : m));
    await useAppStore.getState().loadInitialData('u-share3');
    const b = useAppStore.getState().meals;
    expect(b).not.toBe(a);
    expect(b[2].meal_items).toHaveLength(2);
    // Item substituído (id novo).
    net.tables.meals = mkMeals(5).map((m, i) => (i === 2 ? { ...m, meal_items: [...m.meal_items, { id: 'y', quantity_grams: 5 }] } : { ...m, meal_items: m.meal_items }));
    await useAppStore.getState().loadInitialData('u-share3');
    const c = useAppStore.getState().meals;
    expect(c).not.toBe(b);
    // Item atualizado (updated_at novo).
    net.tables.meals = mkMeals(5).map((m, i) => (i === 2 ? { ...m, meal_items: [{ id: 'y', quantity_grams: 250, updated_at: '2026-10-05T10:00:00Z' }, ...m.meal_items.slice(1)] } : m));
    await useAppStore.getState().loadInitialData('u-share3');
    const d = useAppStore.getState().meals;
    expect(d).not.toBe(c);
    expect(d[2].meal_items[0].quantity_grams).toBe(250);
  });

  it('o profile compara-se campo a campo: igual mantém, diferente troca', async () => {
    net.tables.profiles = { id: 'u-share4', calorie_goal: 2000, weight_kg: 70 };
    await useAppStore.getState().loadInitialData('u-share4');
    const a = useAppStore.getState().profile;
    net.tables.profiles = { id: 'u-share4', calorie_goal: 2000, weight_kg: 70 };
    await useAppStore.getState().loadInitialData('u-share4');
    expect(useAppStore.getState().profile).toBe(a);
    net.tables.profiles = { id: 'u-share4', calorie_goal: 2000, weight_kg: 71 };
    await useAppStore.getState().loadInitialData('u-share4');
    expect(useAppStore.getState().profile).not.toBe(a);
    expect(useAppStore.getState().profile.weight_kg).toBe(71);
  });
});

describe('sameList / sameRow / shareUnchanged', () => {
  it('compara por comprimento, id e valor das colunas', () => {
    expect(sameList([{ id: 1, a: 1 }], [{ id: 1, a: 1 }])).toBe(true);
    expect(sameList([{ id: 1, a: 1 }], [{ id: 1, a: 2 }])).toBe(false);
    expect(sameList([{ id: 1 }], [{ id: 2 }])).toBe(false);
    expect(sameList([{ id: 1 }], [{ id: 1 }, { id: 2 }])).toBe(false);
    expect(sameList([], [])).toBe(true);
  });

  it('uma coluna a mais ou a menos é diferença', () => {
    expect(sameRow({ id: 1, a: 1 }, { id: 1, a: 1, b: null })).toBe(false);
    expect(sameRow({ id: 1, a: 1, b: null }, { id: 1, a: 1 })).toBe(false);
  });

  it('um objeto enorme (orçamento esgotado) conta como diferente, nunca como igual', () => {
    const big = () => ({ id: 1, blob: Array.from({ length: 5000 }, (_, i) => ({ i })) });
    expect(sameRow(big(), big(), { n: 2000 })).toBe(false);
    // Folhas escalares também gastam o orçamento (revisão 2026-10-04): um
    // array de números enorme já não é percorrido todo à borla.
    const nums = () => ({ id: 1, v: Array.from({ length: 200000 }, (_, i) => i) });
    expect(sameRow(nums(), nums())).toBe(false);
  });

  it('o orçamento é da lista inteira: muitas linhas pequenas esgotam-no', () => {
    const rows = () => Array.from({ length: 5000 }, (_, i) => ({ id: i, a: 1, b: 2 }));
    expect(sameList(rows(), rows(), { n: 5000 })).toBe(false);
    expect(sameList(rows(), rows())).toBe(true);
  });

  it('recursos embutidos comparam-se por comprimento, id e updated_at, não por valor', () => {
    const m = (items) => ({ id: 'm', meal_items: items });
    expect(sameRow(m([{ id: 'a', q: 1 }]), m([{ id: 'a', q: 1 }]))).toBe(true);
    expect(sameRow(m([{ id: 'a', q: 1 }]), m([{ id: 'b', q: 1 }]))).toBe(false);
    expect(sameRow(m([{ id: 'a', q: 1 }]), m([{ id: 'a', q: 1 }, { id: 'c' }]))).toBe(false);
    expect(sameRow(m([{ id: 'a', updated_at: 't1' }]), m([{ id: 'a', updated_at: 't2' }]))).toBe(false);
    // Contrato assumido: itens sem updated_at não se editam no sítio.
    expect(sameRow(m([{ id: 'a', q: 1 }]), m([{ id: 'a', q: 2 }]))).toBe(true);
  });

  it('shareUnchanged troca só as fatias iguais e não toca no patch original', () => {
    const current = { runs: [{ id: 1 }], meals: [{ id: 1, x: 1 }] };
    const patch = { runs: [{ id: 1 }], meals: [{ id: 1, x: 2 }], trainingLoadedFor: 'u' };
    const out = shareUnchanged(patch, current);
    expect(out.runs).toBe(current.runs);
    expect(out.meals).toBe(patch.meals);
    expect(out.trainingLoadedFor).toBe('u');
    expect(patch.runs).not.toBe(current.runs);
  });
});
