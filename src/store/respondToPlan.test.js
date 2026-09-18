import { describe, it, expect, vi, beforeEach } from 'vitest';

/* respondToPlan — aceitar uma proposta que se sobrepõe a um plano ativo
   (specs/plano-vinculado-a-prova.md §4.6). Foi aqui que a mudança de objetivo
   falhou duas vezes: primeiro nunca acontecia (tudo se fundia), depois
   acontecia mas deixava o bloco antigo vinculado e aceitava mesmo com o fecho
   falhado. O Supabase falso regista cada escrita para os testes verem a ordem
   e o conteúdo, e responde às leituras a partir de `db`. */

const db = { plans: {}, active: [] };
const writes = [];
let failOn = null;

function builder(table) {
  const q = { table, op: 'select', data: null, filters: [] };
  const run = () => {
    if (q.op === 'update') {
      writes.push({ table, data: q.data, filters: q.filters });
      const failed = failOn && failOn(table, q.data);
      return { data: null, error: failed ? { message: 'falhou' } : null };
    }
    const byId = q.filters.find(([c]) => c === 'id');
    if (byId) return { data: db.plans[byId[1]] ?? null, error: null };
    return { data: db.active, error: null };
  };
  const chain = {
    select: () => chain,
    update: (data) => { q.op = 'update'; q.data = data; return chain; },
    delete: () => { q.op = 'delete'; return chain; },
    eq: (c, v) => { q.filters.push([c, v]); return chain; },
    neq: () => chain,
    gte: (c, v) => { q.filters.push([c, v]); return chain; },
    lte: () => chain,
    single: () => Promise.resolve(run()),
    then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
  };
  return chain;
}

vi.mock('../lib/supabase', () => ({
  supabase: { from: (t) => builder(t) },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const { useAppStore } = await import('./index');

const treino = [{ kind: 'corrida' }];
const plano = (over) => ({ period_start: '2026-09-01', period_end: '2026-10-04', summary: null, supersedes_plan_id: null, race_id: null, coach_plan_items: treino, ...over });

beforeEach(() => {
  writes.length = 0;
  failOn = null;
  db.plans = {};
  db.active = [];
  useAppStore.setState({
    session: { user: { id: 'u1' } },
    profile: { id: 'u1' },
    reloadCoachPlans: vi.fn().mockResolvedValue([]),
    loadDailySummary: vi.fn().mockResolvedValue(null),
  });
});

const updatesTo = (table) => writes.filter((w) => w.table === table);

describe('respondToPlan — objetivo novo abre um bloco de raiz', () => {
  beforeEach(() => {
    // O plano ativo prepara a prova distante; a proposta muda o objetivo para
    // a intermédia — a segunda saída do conflito de principais.
    db.plans['p-antigo'] = plano({ id: 'p-antigo', race_id: 'r-longe' });
    db.plans['p-novo'] = plano({ id: 'p-novo', period_start: '2026-09-18', period_end: '2026-09-27', race_id: 'r-perto', supersedes_plan_id: 'p-antigo' });
  });

  it('fecha o bloco antigo na véspera E desvincula-o, cancela o resto, e aceita o novo', async () => {
    expect(await useAppStore.getState().respondToPlan('p-novo', true)).toBe(true);
    const planos = updatesTo('coach_plans');
    // B-B: com o race_id lá, o trigger da data da prova voltava a esticá-lo.
    expect(planos[0]).toMatchObject({ data: { period_end: '2026-09-17', race_id: null }, filters: [['id', 'p-antigo']] });
    expect(updatesTo('coach_plan_items')[0]).toMatchObject({
      data: { status: 'cancelado' },
      filters: [['plan_id', 'p-antigo'], ['status', 'pendente'], ['planned_date', '2026-09-18']],
    });
    expect(planos.at(-1)).toMatchObject({ data: { status: 'aceite' }, filters: [['id', 'p-novo']] });
  });

  it('se o fecho falhar, NÃO aceita o novo — senão ficavam dois planos ativos', async () => {
    failOn = (table, data) => table === 'coach_plans' && 'period_end' in data;
    expect(await useAppStore.getState().respondToPlan('p-novo', true)).toBe(false);
    expect(writes.some((w) => w.data?.status === 'aceite')).toBe(false);
    expect(updatesTo('coach_plan_items')).toHaveLength(0);
  });

  it('se o cancelamento falhar, também não aceita', async () => {
    failOn = (table) => table === 'coach_plan_items';
    expect(await useAppStore.getState().respondToPlan('p-novo', true)).toBe(false);
    expect(writes.some((w) => w.data?.status === 'aceite')).toBe(false);
  });
});

describe('respondToPlan — o mesmo objetivo é um ajuste', () => {
  it('funde no original, mantém-lhe o vínculo, e limpa os avisos a que o ajuste responde', async () => {
    db.plans['p-antigo'] = plano({ id: 'p-antigo', race_id: 'r1' });
    db.plans['p-novo'] = plano({ id: 'p-novo', period_start: '2026-09-18', race_id: 'r1', supersedes_plan_id: 'p-antigo' });
    expect(await useAppStore.getState().respondToPlan('p-novo', true)).toBe(true);
    const doOriginal = updatesTo('coach_plans').find((w) => w.filters.some(([c, v]) => c === 'id' && v === 'p-antigo'));
    // M-2: race_lost_at também se limpa, não só trimmed_at.
    expect(doOriginal.data).toMatchObject({ trimmed_at: null, race_lost_at: null });
    expect('race_id' in doOriginal.data).toBe(false);
    expect(writes.some((w) => w.data?.status === 'aceite')).toBe(false);
  });
});

describe('respondToPlan — sem supersedes, o plano de treino sobreposto é que conta', () => {
  it('um plano só de refeições que venha primeiro na lista não rouba a proposta', async () => {
    db.active = [
      { id: 'p-refeicoes', period_start: '2026-09-01', period_end: '2026-10-04', coach_plan_items: [{ kind: 'descanso' }] },
      { id: 'p-treino', period_start: '2026-09-01', period_end: '2026-10-04', coach_plan_items: treino },
    ];
    db.plans['p-treino'] = plano({ id: 'p-treino', race_id: 'r-longe' });
    db.plans['p-novo'] = plano({ id: 'p-novo', period_start: '2026-09-18', period_end: '2026-09-27', race_id: 'r-perto' });
    expect(await useAppStore.getState().respondToPlan('p-novo', true)).toBe(true);
    // Fechou o de treino (o que tem objetivo), não o de refeições.
    expect(updatesTo('coach_plans')[0].filters).toEqual([['id', 'p-treino']]);
  });
});

describe('respondToPlan — o plano sobreposto é o do mesmo tipo da proposta', () => {
  it('uma proposta só de descanso não se funde no plano de treino', async () => {
    db.active = [
      { id: 'p-treino', period_start: '2026-09-01', period_end: '2026-10-04', coach_plan_items: treino },
      { id: 'p-refeicoes', period_start: '2026-09-01', period_end: '2026-10-04', coach_plan_items: [{ kind: 'descanso' }] },
    ];
    db.plans['p-refeicoes'] = plano({ id: 'p-refeicoes', coach_plan_items: [{ kind: 'descanso' }] });
    db.plans['p-novo'] = plano({ id: 'p-novo', period_start: '2026-09-18', period_end: '2026-09-24', coach_plan_items: [{ kind: 'descanso' }] });
    expect(await useAppStore.getState().respondToPlan('p-novo', true)).toBe(true);
    const tocados = new Set(writes.flatMap((w) => w.filters.filter(([c]) => c === 'id' || c === 'plan_id').map(([, v]) => v)));
    expect(tocados.has('p-treino')).toBe(false);
  });
});
