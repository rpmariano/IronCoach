import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Marcar um dia como incompleto na Nutrição (2026-10-06): o ecrã muda logo
   (otimista); se a BD recusar, volta ao que estava e devolve { error }. */

const db = { calls: [], result: { error: null }, gate: null };
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table) => ({
      insert: (row) => {
        db.calls.push({ table, op: 'insert', row });
        return (db.gate || Promise.resolve()).then(() => db.result);
      },
      delete: () => {
        const filters = {};
        const chain = {
          eq: (col, val) => { filters[col] = val; return chain; },
          then: (resolve, reject) => {
            db.calls.push({ table, op: 'delete', filters });
            return (db.gate || Promise.resolve()).then(() => db.result).then(resolve, reject);
          },
        };
        return chain;
      },
    }),
  },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const { useAppStore, incompleteDatesOf, EVOLUTION_TAB_SLICES } = await import('./index');

const D = '2026-10-02';

describe('setNutritionDayIncomplete', () => {
  beforeEach(() => {
    db.calls.length = 0;
    db.result = { error: null };
    db.gate = null;
    useAppStore.setState({ session: { user: { id: 'u1' } }, profile: { id: 'u1' }, nutritionIncompleteDays: ['2026-09-30'] });
  });

  it('marca: muda o store antes de a BD responder e grava a linha do atleta', async () => {
    let open;
    db.gate = new Promise((r) => { open = r; });
    const p = useAppStore.getState().setNutritionDayIncomplete(D, true);
    // Otimista: já lá está antes de a BD responder.
    expect(useAppStore.getState().nutritionIncompleteDays).toEqual(['2026-09-30', D]);
    open();
    await expect(p).resolves.toEqual({ error: null });
    expect(db.calls).toEqual([{ table: 'nutrition_incomplete_days', op: 'insert', row: { user_id: 'u1', date: D } }]);
    expect(useAppStore.getState().nutritionIncompleteDays).toEqual(['2026-09-30', D]);
  });

  it('desmarca: apaga só esse dia desse atleta', async () => {
    const res = await useAppStore.getState().setNutritionDayIncomplete('2026-09-30', false);
    expect(res).toEqual({ error: null });
    expect(db.calls).toEqual([{ table: 'nutrition_incomplete_days', op: 'delete', filters: { user_id: 'u1', date: '2026-09-30' } }]);
    expect(useAppStore.getState().nutritionIncompleteDays).toEqual([]);
  });

  it('a BD recusa ao marcar: volta atrás e devolve o erro', async () => {
    db.result = { error: { code: '42P01', message: 'relation does not exist' } };
    const res = await useAppStore.getState().setNutritionDayIncomplete(D, true);
    expect(res.error).toMatchObject({ code: '42P01' });
    expect(useAppStore.getState().nutritionIncompleteDays).toEqual(['2026-09-30']);
  });

  it('a BD recusa ao desmarcar: o dia volta a estar marcado', async () => {
    db.result = { error: { message: 'rede' } };
    const res = await useAppStore.getState().setNutritionDayIncomplete('2026-09-30', false);
    expect(res.error).toBeTruthy();
    expect(useAppStore.getState().nutritionIncompleteDays).toEqual(['2026-09-30']);
  });

  it('uma exceção (sem rede) também volta atrás', async () => {
    db.gate = Promise.reject(new Error('offline'));
    const res = await useAppStore.getState().setNutritionDayIncomplete(D, true);
    expect(res.error).toBeTruthy();
    expect(useAppStore.getState().nutritionIncompleteDays).toEqual(['2026-09-30']);
  });

  it('o erro de um dia não desfaz outra marca feita entretanto', async () => {
    let open;
    db.gate = new Promise((r) => { open = r; });
    db.result = { error: { message: 'falhou' } };
    const p = useAppStore.getState().setNutritionDayIncomplete(D, true);
    useAppStore.setState({ nutritionIncompleteDays: [...useAppStore.getState().nutritionIncompleteDays, '2026-10-03'] });
    open();
    await p;
    expect(useAppStore.getState().nutritionIncompleteDays).toEqual(['2026-09-30', '2026-10-03']);
  });

  it('já marcado (chave repetida, 23505) conta como feito', async () => {
    db.result = { error: { code: '23505', message: 'duplicate key' } };
    const res = await useAppStore.getState().setNutritionDayIncomplete(D, true);
    expect(res).toEqual({ error: null });
    expect(useAppStore.getState().nutritionIncompleteDays).toContain(D);
  });

  it('sem mudança não vai à BD; sem sessão devolve erro', async () => {
    expect(await useAppStore.getState().setNutritionDayIncomplete('2026-09-30', true)).toEqual({ error: null });
    expect(db.calls).toHaveLength(0);
    useAppStore.setState({ session: null, profile: null });
    const res = await useAppStore.getState().setNutritionDayIncomplete(D, true);
    expect(res.error).toBeTruthy();
    expect(db.calls).toHaveLength(0);
  });
});

describe('dias marcados no carregamento', () => {
  it('das linhas às datas, ordenadas e sem repetidas', () => {
    expect(incompleteDatesOf([{ date: '2026-10-02' }, { date: '2026-09-30T00:00:00' }, { date: '2026-10-02' }, { date: null }, null]))
      .toEqual(['2026-09-30', '2026-10-02']);
    expect(incompleteDatesOf(null)).toEqual([]);
  });

  it('a Nutrição da Evolução espera por eles', () => {
    expect(EVOLUTION_TAB_SLICES.nutricao).toContain('nutritionIncompleteDays');
  });
});
