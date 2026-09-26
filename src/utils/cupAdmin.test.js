import { describe, it, expect, vi, beforeEach } from 'vitest';

/* As ações do backoffice "Competições" (specs/trofeu.md §6, Fase 1b),
   2026-09-26. O Supabase é o mesmo esboço do cupSlice.test.js: cada tabela e
   cada RPC respondem com o que `net.tables[t]` / `net.rpcs[fn]` disserem, e
   `net.calls` guarda tudo o que saiu — é por aí que se prova QUE tabela ou
   RPC cada ação usa (nomeadamente: "Confirmar jornada" nunca escreve sem ter
   pedido a pré-visualização antes, e updateRound recusa data/date_status). */
const net = { tables: {}, rpcs: {}, calls: [] };

function builder(table) {
  const q = { table, op: 'select', filters: [], payload: null };
  const b = {};
  for (const m of ['select', 'eq', 'in', 'order']) {
    b[m] = (...args) => { if (m !== 'select' && m !== 'order') q.filters.push([m, ...args]); return b; };
  }
  b.insert = (payload) => { q.op = 'insert'; q.payload = payload; return b; };
  b.delete = () => { q.op = 'delete'; return b; };
  b.update = (payload) => { q.op = 'update'; q.payload = payload; return b; };
  const result = () => {
    net.calls.push({ table, op: q.op, filters: q.filters, payload: q.payload });
    const plan = net.tables[table];
    const r = typeof plan === 'function' ? plan(q) : plan;
    return Promise.resolve(r ?? { data: [], error: null });
  };
  b.single = result;
  b.maybeSingle = result;
  b.then = (res, rej) => result().then(res, rej);
  return b;
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (t) => builder(t),
    rpc: (fn, args) => {
      net.calls.push({ rpc: fn, args });
      const plan = net.rpcs[fn];
      return Promise.resolve(typeof plan === 'function' ? plan(args) : (plan ?? { data: null, error: null }));
    },
  },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const cupAdmin = await import('./cupAdmin.js');

const okRes = (data) => ({ data, error: null });
const missing = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.cup_editions' in the schema cache" } };
const lastCall = () => net.calls[net.calls.length - 1];

beforeEach(() => {
  net.tables = {};
  net.rpcs = {};
  net.calls = [];
});

describe('cupAdmin — competições e edições', () => {
  it('listCompetitions junta as edições de cada competição, mais recente primeiro', async () => {
    net.tables.cup_competitions = okRes([
      { id: 'c1', name: 'Troféu de Cascais', editions: [{ id: 'e1', edition_no: 33 }, { id: 'e2', edition_no: 34 }] },
    ]);
    const res = await cupAdmin.listCompetitions();
    expect(res.ok).toBe(true);
    expect(res.data[0].editions.map((e) => e.edition_no)).toEqual([34, 33]);
  });

  it('listCompetitions devolve unavailable quando a M1 não está aplicada', async () => {
    net.tables.cup_competitions = missing;
    const res = await cupAdmin.listCompetitions();
    expect(res.ok).toBe(false);
    expect(res.unavailable).toBe(true);
  });

  it('setEditionStatus só aceita por_anunciar/aberta — encerrada é sempre closeEdition', async () => {
    net.tables.cup_editions = okRes({ id: 'e1', status: 'aberta' });
    const res = await cupAdmin.setEditionStatus('e1', 'aberta');
    expect(res.ok).toBe(true);
    expect(lastCall()).toMatchObject({ table: 'cup_editions', op: 'update', payload: { status: 'aberta' } });

    const rejected = await cupAdmin.setEditionStatus('e1', 'encerrada');
    expect(rejected.ok).toBe(false);
    // Nada chegou a sair para o Supabase — recusado antes da chamada.
    expect(net.calls.some((c) => c.table === 'cup_editions')).toBe(true); // só a 1.ª chamada válida
    expect(net.calls.filter((c) => c.table === 'cup_editions')).toHaveLength(1);
  });

  it('closeEdition chama a RPC close_edition com o id da edição', async () => {
    net.rpcs.close_edition = okRes({ edition_id: 'e1', status: 'encerrada' });
    const res = await cupAdmin.closeEdition('e1');
    expect(res.ok).toBe(true);
    expect(lastCall()).toEqual({ rpc: 'close_edition', args: { p_edition_id: 'e1' } });
  });

  it('closeEdition propaga o erro do servidor (ex.: is_admin() recusa)', async () => {
    net.rpcs.close_edition = { data: null, error: { code: '42501', message: 'Só para administradores' } };
    const res = await cupAdmin.closeEdition('e1');
    expect(res.ok).toBe(false);
    expect(res.error.message).toBe('Só para administradores');
    expect(res.unavailable).toBe(false);
  });
});

describe('cupAdmin — jornadas', () => {
  it('createRound insere com o edition_id e devolve a linha', async () => {
    net.tables.cup_rounds = okRes({ id: 'r1', edition_id: 'e1', round_no: 1, name: 'Padroeira' });
    const res = await cupAdmin.createRound('e1', { round_no: 1, name: 'Padroeira', date_status: 'provavel' });
    expect(res.ok).toBe(true);
    expect(lastCall().payload).toMatchObject({ edition_id: 'e1', round_no: 1, name: 'Padroeira' });
  });

  it('updateRound recusa patches com date ou date_status — só confirmRoundChange grava isso', async () => {
    const withDate = await cupAdmin.updateRound('r1', { date: '2026-12-06' });
    expect(withDate.ok).toBe(false);
    const withStatus = await cupAdmin.updateRound('r1', { date_status: 'confirmada' });
    expect(withStatus.ok).toBe(false);
    expect(net.calls.filter((c) => c.table === 'cup_rounds')).toHaveLength(0);
  });

  it('updateRound grava os outros campos diretamente', async () => {
    net.tables.cup_rounds = okRes({ id: 'r1', location: 'Cascais' });
    const res = await cupAdmin.updateRound('r1', { location: 'Cascais' });
    expect(res.ok).toBe(true);
    expect(lastCall()).toMatchObject({ table: 'cup_rounds', op: 'update', payload: { location: 'Cascais' } });
  });

  it('previewRoundChange chama preview_round_change e devolve as bandas', async () => {
    net.rpcs.preview_round_change = okRes({ atletas_vou: '20+', colisoes: '0' });
    const res = await cupAdmin.previewRoundChange('r1', { date: '2026-12-13', date_status: 'confirmada' });
    expect(res.ok).toBe(true);
    expect(res.data.atletas_vou).toBe('20+');
    expect(lastCall()).toEqual({
      rpc: 'preview_round_change',
      args: { p_round_id: 'r1', p_patch: { date: '2026-12-13', date_status: 'confirmada' } },
    });
  });

  it('confirmRoundChange grava data/date_status depois da pré-visualização, sem RPC', async () => {
    net.tables.cup_rounds = okRes({ id: 'r1', date: '2026-12-13', date_status: 'confirmada' });
    const res = await cupAdmin.confirmRoundChange('r1', { date: '2026-12-13', date_status: 'confirmada' });
    expect(res.ok).toBe(true);
    expect(lastCall()).toMatchObject({ table: 'cup_rounds', op: 'update', payload: { date: '2026-12-13', date_status: 'confirmada' } });
    expect(net.calls.some((c) => c.rpc)).toBe(false);
  });

  it('deleteRound propaga o erro do trigger quando a jornada já foi corrida', async () => {
    net.tables.cup_rounds = { error: { code: '23503', message: 'Esta jornada já foi corrida por atletas da app: marca-a como cancelada em vez de a apagar' } };
    const res = await cupAdmin.deleteRound('r1');
    expect(res.ok).toBe(false);
    expect(res.error.message).toMatch(/marca-a como cancelada/);
  });
});

describe('cupAdmin — percursos', () => {
  it('listCourses sem jornadas não chama o Supabase', async () => {
    const res = await cupAdmin.listCourses([]);
    expect(res).toEqual({ ok: true, data: [] });
    expect(net.calls).toHaveLength(0);
  });

  it('listCourses filtra pelos round_id dados', async () => {
    net.tables.cup_round_courses = okRes([{ id: 'c1', round_id: 'r1', code: 'A' }]);
    const res = await cupAdmin.listCourses(['r1', 'r2']);
    expect(res.ok).toBe(true);
    expect(lastCall().filters).toContainEqual(['in', 'round_id', ['r1', 'r2']]);
  });

  it('createCourse insere com o round_id', async () => {
    net.tables.cup_round_courses = okRes({ id: 'c1', round_id: 'r1', code: 'A', distance_m: 7400 });
    const res = await cupAdmin.createCourse('r1', { code: 'A', distance_m: 7400, distance_status: 'provisoria' });
    expect(res.ok).toBe(true);
    expect(lastCall().payload).toMatchObject({ round_id: 'r1', code: 'A', distance_m: 7400 });
  });

  it('deleteCourse apaga pelo id', async () => {
    net.tables.cup_round_courses = okRes(null);
    const res = await cupAdmin.deleteCourse('c1');
    expect(res.ok).toBe(true);
    expect(lastCall()).toMatchObject({ table: 'cup_round_courses', op: 'delete', filters: [['eq', 'id', 'c1']] });
  });
});

describe('cupAdmin — clubes', () => {
  it('createTeam insere com o edition_id', async () => {
    net.tables.cup_teams = okRes({ id: 't1', edition_id: 'e1', name: 'CCD', kind: 'clube' });
    const res = await cupAdmin.createTeam('e1', { name: 'CCD', short_name: 'CCD', kind: 'clube', eligible_final: null });
    expect(res.ok).toBe(true);
    expect(lastCall().payload).toMatchObject({ edition_id: 'e1', name: 'CCD' });
  });

  it('deleteTeam propaga a violação de FK quando o clube tem inscrições', async () => {
    net.tables.cup_teams = { error: { code: '23503', message: 'update or delete on table "cup_teams" violates foreign key constraint' } };
    const res = await cupAdmin.deleteTeam('t1');
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('23503');
  });

  it('updateTeam grava o patch (ex.: eligible_final)', async () => {
    net.tables.cup_teams = okRes({ id: 't1', eligible_final: true });
    const res = await cupAdmin.updateTeam('t1', { eligible_final: true });
    expect(res.ok).toBe(true);
    expect(lastCall()).toMatchObject({ table: 'cup_teams', op: 'update', payload: { eligible_final: true } });
  });
});
