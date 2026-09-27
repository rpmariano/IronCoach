import { describe, it, expect, vi, beforeEach } from 'vitest';

/* As ações do backoffice "Competições" (specs/trofeu.md §6, Fase 1b),
   2026-09-26. O Supabase é o mesmo esboço do cupSlice.test.js: cada tabela e
   cada RPC respondem com o que `net.tables[t]` / `net.rpcs[fn]` disserem, e
   `net.calls` guarda tudo o que saiu — é por aí que se prova QUE tabela ou
   RPC cada ação usa (nomeadamente: "Confirmar jornada" nunca escreve sem ter
   pedido a pré-visualização antes, e updateRound recusa data/date_status). */
const net = { tables: {}, rpcs: {}, calls: [], queries: [] };

function builder(table) {
  const q = { table, op: 'select', filters: [], payload: null };
  const b = {};
  for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit']) {
    b[m] = (...args) => {
      if (m === 'select' && q.op === 'select') q.columns = args[0] ?? '*';
      if (m !== 'select' && m !== 'order') q.filters.push([m, ...args]);
      return b;
    };
  }
  b.insert = (payload) => { q.op = 'insert'; q.payload = payload; return b; };
  b.upsert = (payload, options) => { q.op = 'upsert'; q.payload = payload; q.options = options; return b; };
  b.delete = () => { q.op = 'delete'; return b; };
  b.update = (payload) => { q.op = 'update'; q.payload = payload; return b; };
  const result = () => {
    net.calls.push({ table, op: q.op, filters: q.filters, payload: q.payload });
    net.queries.push({ ...q });
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
  invokeEdgeFunctionWithTimeout: (...a) => invoke(...a),
}));

const invoke = vi.fn();
const cupAdmin = await import('./cupAdmin.js');

const okRes = (data) => ({ data, error: null });
const missing = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.cup_editions' in the schema cache" } };
const lastCall = () => net.calls[net.calls.length - 1];

beforeEach(() => {
  net.tables = {};
  net.rpcs = {};
  net.calls = [];
  net.queries = [];
  invoke.mockReset();
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

/* ── Fase 4 (2026-09-27): a classificação oficial e a guarda do fecho ─── */

describe('cupAdmin — closeEditionBlocker (a mesma regra do close_edition da M2)', () => {
  const r = (round_no, date, date_status = 'confirmada') => ({ id: `r${round_no}`, round_no, date, date_status });
  const HOJE = '2027-06-14';

  it('sem jornadas (ou só canceladas): "a edição não tem jornadas"', () => {
    expect(cupAdmin.closeEditionBlocker([], HOJE)).toBe('a edição não tem jornadas');
    expect(cupAdmin.closeEditionBlocker(null, HOJE)).toBe('a edição não tem jornadas');
    expect(cupAdmin.closeEditionBlocker([r(1, '2026-12-06', 'cancelada')], HOJE)).toBe('a edição não tem jornadas');
  });

  it('uma jornada sem data conta como a última: "a jornada N ainda não tem data"', () => {
    expect(cupAdmin.closeEditionBlocker([r(1, '2026-12-06'), r(5, null, 'provavel'), r(3, '2027-06-13')], HOJE)).toBe('a jornada 5 ainda não tem data');
    expect(cupAdmin.closeEditionBlocker([r(1, '2026-12-06'), r(2, null)], HOJE, 'Etapa')).toBe('a etapa 2 ainda não tem data');
  });

  it('a última por passar (hoje conta como por passar): "a última jornada (N, DD/MM) ainda não passou"', () => {
    expect(cupAdmin.closeEditionBlocker([r(1, '2026-12-06'), r(11, '2027-06-14')], HOJE)).toBe('a última jornada (11, 14/06) ainda não passou');
    expect(cupAdmin.closeEditionBlocker([r(1, '2026-12-06'), r(11, '2027-06-20', 'provavel')], HOJE)).toBe('a última jornada (11, 20/06) ainda não passou');
  });

  it('todas passadas (uma cancelada no futuro não conta): null', () => {
    expect(cupAdmin.closeEditionBlocker([r(1, '2026-12-06'), r(11, '2027-06-13')], HOJE)).toBeNull();
    expect(cupAdmin.closeEditionBlocker([r(1, '2026-12-06'), r(12, '2027-07-01', 'cancelada')], HOJE)).toBeNull();
  });

  it('editionTodayISO: o dia no fuso da edição', () => {
    const quase = new Date('2027-06-14T23:30:00Z');
    expect(cupAdmin.editionTodayISO('Europe/Lisbon', quase)).toBe('2027-06-15');
    expect(cupAdmin.editionTodayISO('Atlantic/Azores', quase)).toBe('2027-06-14');
    expect(cupAdmin.editionTodayISO('Fuso/Inventado', quase)).toBe('2027-06-15');
  });
});

describe('cupAdmin — os links e o modo (Fase 4)', () => {
  it('updateEditionLinks: fora do formato do adaptador recusa SEM pedido; o certo grava só o standings_url', async () => {
    const mau = await cupAdmin.updateEditionLinks('e34', { standings_url: 'https://trofeuatletismocascais.pt/Resultados/727' }, { adapter: 'trofeu_cascais' });
    expect(mau).toEqual({ ok: false, error: { code: 'url', message: 'Cola o link da classificação geral: https://trofeuatletismocascais.pt/Trofeu/17' }, unavailable: false });
    expect(net.calls).toEqual([]);

    net.tables.cup_editions = okRes({ id: 'e34', standings_url: 'https://trofeuatletismocascais.pt/Trofeu/18' });
    const bom = await cupAdmin.updateEditionLinks('e34', { standings_url: ' https://trofeuatletismocascais.pt/Trofeu/18 ' }, { adapter: 'trofeu_cascais' });
    expect(bom.ok).toBe(true);
    expect(lastCall()).toEqual({ table: 'cup_editions', op: 'update', filters: [['eq', 'id', 'e34']], payload: { standings_url: 'https://trofeuatletismocascais.pt/Trofeu/18' } });
    // Vazio apaga; sem adaptador, qualquer link.
    await cupAdmin.updateEditionLinks('e34', { standings_url: '' }, { adapter: 'trofeu_cascais' });
    expect(lastCall().payload).toEqual({ standings_url: null });
    await cupAdmin.updateEditionLinks('e34', { standings_url: 'https://example.org/geral' });
    expect(lastCall().payload).toEqual({ standings_url: 'https://example.org/geral' });
  });

  it('setEditionSyncMode: só os três modos, e só a coluna sync_mode', async () => {
    expect((await cupAdmin.setEditionSyncMode('e34', 'ligado')).ok).toBe(false);
    expect(net.calls).toEqual([]);
    net.tables.cup_editions = okRes({ id: 'e34', sync_mode: 'observar' });
    await cupAdmin.setEditionSyncMode('e34', 'observar');
    expect(lastCall()).toEqual({ table: 'cup_editions', op: 'update', filters: [['eq', 'id', 'e34']], payload: { sync_mode: 'observar' } });
  });
});

describe('cupAdmin — o estado do job (Fase 4)', () => {
  it('listSyncState: a M2 em falta devolve m2Missing (não "indisponível"), e não pede o trinco nem as contagens', async () => {
    net.tables.cup_sync_state = { data: null, error: { code: '42P01', message: 'relation "public.cup_sync_state" does not exist' } };
    const res = await cupAdmin.listSyncState('e34');
    expect(res).toMatchObject({ ok: false, m2Missing: true, unavailable: false });
    net.tables.cup_sync_state = okRes([{ target: 'edicao' }]);
    expect((await cupAdmin.listSyncState('e34')).data).toEqual([{ target: 'edicao' }]);
    const q = net.queries[net.queries.length - 1];
    expect(q.filters).toEqual([['eq', 'edition_id', 'e34']]);
    expect(q.columns).not.toMatch(/running_since|rows_by_category|\*/);
  });

  it('markRoundPublished: upsert à mão (source manual), pela jornada', async () => {
    net.tables.cup_round_publication = okRes({ round_id: 'r1', source: 'manual' });
    await cupAdmin.markRoundPublished('r1');
    const q = net.queries[net.queries.length - 1];
    expect(q.op).toBe('upsert');
    expect(q.payload).toMatchObject({ round_id: 'r1', source: 'manual' });
    expect(Number.isNaN(Date.parse(q.payload.results_ready_at))).toBe(false);
    expect(q.options).toEqual({ onConflict: 'round_id' });
  });

  it('listRoundPublication sem jornadas não pede nada; listAliases e linkAlias pela edição e pelo id', async () => {
    expect(await cupAdmin.listRoundPublication([])).toEqual({ ok: true, data: [] });
    expect(net.calls).toEqual([]);
    await cupAdmin.listAliases('e34');
    expect(lastCall()).toMatchObject({ table: 'cup_team_aliases', filters: [['eq', 'edition_id', 'e34']] });
    await cupAdmin.linkAlias('a1', 't-naza');
    expect(lastCall()).toEqual({ table: 'cup_team_aliases', op: 'update', filters: [['eq', 'id', 'a1']], payload: { team_id: 't-naza' } });
  });

  it('listSyncAlerts: só os do job, os 20 mais recentes', async () => {
    await cupAdmin.listSyncAlerts();
    expect(lastCall()).toMatchObject({ table: 'app_logs', filters: [['eq', 'event', 'cup-standings-sync'], ['is', 'user_id', null], ['limit', 20]] });
  });
});

describe('cupAdmin — a Edge Function (Ler agora e ensaio)', () => {
  it('runCupSync: correr esta edição (e só as jornadas dadas), 90 s', async () => {
    invoke.mockResolvedValue({ data: { jornadas: [] }, error: null });
    expect(await cupAdmin.runCupSync('e34')).toEqual({ ok: true, data: { jornadas: [] } });
    expect(invoke).toHaveBeenLastCalledWith('cup-standings-sync', { body: { modo: 'correr', edition_id: 'e34' } }, 90000);
    await cupAdmin.runCupSync('e34', ['r1', null]);
    expect(invoke).toHaveBeenLastCalledWith('cup-standings-sync', { body: { modo: 'correr', edition_id: 'e34', round_ids: ['r1'] } }, 90000);
  });

  it('runCupSync: a recusa do job (409) chega com a frase dele', async () => {
    invoke.mockResolvedValue({ data: null, error: 'Liga «Observar» ou «Publicar» primeiro.', status: 409 });
    expect(await cupAdmin.runCupSync('e34')).toEqual({ ok: false, error: { code: 409, message: 'Liga «Observar» ou «Publicar» primeiro.' }, unavailable: false, isTimeout: false });
  });

  it('runCupEnsaio: links validados antes (nenhum pedido com um mau); o corpo do ensaio', async () => {
    const mau = await cupAdmin.runCupEnsaio({ jornadas: ['https://trofeuatletismocascais.pt/Resultados/727', 'https://example.org/x'] });
    expect(mau.ok).toBe(false);
    expect(mau.error.message).toBe('Cola o link de uma prova do site do Troféu: https://trofeuatletismocascais.pt/Resultados/727');
    expect((await cupAdmin.runCupEnsaio({ jornadas: [] })).error.message).toBe('Cola pelo menos o link de uma prova.');
    expect((await cupAdmin.runCupEnsaio({ jornadas: Array.from({ length: 13 }, (_, i) => `https://trofeuatletismocascais.pt/Resultados/${700 + i}`) })).error.message).toBe('No máximo 12 provas por ensaio.');
    expect((await cupAdmin.runCupEnsaio({ jornadas: ['https://trofeuatletismocascais.pt/Resultados/727'], geral: 'https://trofeuatletismocascais.pt/Resultados/1' })).error.message).toBe('Cola o link da classificação geral: https://trofeuatletismocascais.pt/Trofeu/17');
    expect(invoke).not.toHaveBeenCalled();

    invoke.mockResolvedValue({ data: { modo: 'ensaio' }, error: null });
    await cupAdmin.runCupEnsaio({ jornadas: 'https://trofeuatletismocascais.pt/Resultados/727\n https://www.trofeuatletismocascais.pt/Resultados/728/ ', geral: 'https://trofeuatletismocascais.pt/Trofeu/17', pointsTable: [15, 13] });
    expect(invoke).toHaveBeenCalledWith('cup-standings-sync', { body: {
      modo: 'ensaio',
      jornadas: ['https://trofeuatletismocascais.pt/Resultados/727', 'https://www.trofeuatletismocascais.pt/Resultados/728/'],
      geral: 'https://trofeuatletismocascais.pt/Trofeu/17',
      points_table: [15, 13],
    } }, 90000);
  });
});

