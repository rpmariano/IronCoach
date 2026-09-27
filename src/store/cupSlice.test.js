import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* A fatia da competição por jornadas (specs/trofeu.md §4.1–4.3, Fase 1,
   2026-09-26). O Supabase é um esboço: cada tabela e cada RPC respondem com o
   que `net.tables[t]` / `net.rpcs[fn]` disserem (um valor, ou uma função da
   consulta), e `net.calls` guarda tudo o que saiu — é por aí que se prova que
   quem não está inscrito não gera leituras de provas nem de planos. */
const net = { tables: {}, rpcs: {}, calls: [], selects: [] };

function builder(table) {
  const q = { table, op: 'select', filters: [], payload: null, columns: null };
  const b = {};
  for (const m of ['select', 'eq', 'in', 'order', 'gte', 'lte', 'neq', 'limit']) {
    b[m] = (...args) => {
      if (m === 'select' && q.op === 'select') q.columns = args[0] ?? '*';
      if (m !== 'select' && m !== 'order') q.filters.push([m, ...args]);
      return b;
    };
  }
  b.insert = (payload) => { q.op = 'insert'; q.payload = payload; return b; };
  b.delete = () => { q.op = 'delete'; return b; };
  b.update = (payload) => { q.op = 'update'; q.payload = payload; return b; };
  const result = () => {
    // As colunas pedidas vão à parte (net.selects), para as comparações
    // exatas de net.calls ficarem como eram.
    net.selects.push({ table, op: q.op, columns: q.columns, filters: q.filters });
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

const { useAppStore } = await import('./index');
const { CUP_EMPTY, isCupSchemaMissing, pickCupEdition, __resetCupModuleState, cupEnrolledHintKey, readCupEnrolledHint, cupScreenRequestValid, CUP_SCREEN_REQUEST_TTL_MS } = await import('./cupSlice');
const F = await import('@formulas/cup.fixtures.ts');
const { buildCupView } = await import('../utils/useCup');

const USER = 'u-cup';
const ok = (data) => ({ data, error: null });
const missing = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.cup_editions' in the schema cache" } };

// Os dados "já carregados" de um atleta qualquer — o que não pode mudar.
const LOADED = {
  profile: { id: USER, gender: 'M', birth_date: '1982-01-24', training_lat: 38.70, training_lon: -9.42 },
  raceEvents: [{ id: 'meia', date: '2027-02-21', race_priority: 'a', cup_round_id: null, status: 'agendada' }],
  runs: [{ id: 'run1', date: '2026-09-20', distance_km: 10 }],
  coachPlans: [{ id: 'p1', status: 'aceite' }],
  coachPlanItems: [{ id: 'i1' }],
  meals: [{ id: 'm1' }],
  dailyCheckins: [{ id: 'c1' }],
};

function seedStore() {
  useAppStore.setState({ session: { user: { id: USER } }, cup: CUP_EMPTY, ...LOADED });
}

/** Tudo menos a fatia `cup` e as funções, para comparar por referência. */
function nonCupSnapshot() {
  const s = useAppStore.getState();
  return Object.fromEntries(Object.entries(s).filter(([k, v]) => k !== 'cup' && typeof v !== 'function'));
}
function expectNothingElseChanged(before) {
  const after = nonCupSnapshot();
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  for (const k of Object.keys(before)) expect(after[k], k).toBe(before[k]);
}

const tablesRead = () => net.calls.filter((c) => c.table).map((c) => c.table);

beforeEach(() => {
  net.tables = {};
  net.rpcs = {};
  net.calls = [];
  net.selects = [];
  __resetCupModuleState();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  seedStore();
});

function catalogTables(edition = F.CASCAIS_34_ABERTA) {
  const isC = edition.id === F.CASCAIS_34.id;
  net.tables.cup_rounds = ok(isC ? F.CASCAIS_ROUNDS : F.FICTICIA_ROUNDS);
  net.tables.cup_categories = ok(isC ? F.CASCAIS_CATEGORIES : F.FICTICIA_CATEGORIES);
  net.tables.cup_teams = ok(isC ? F.CASCAIS_TEAMS : F.FICTICIA_TEAMS);
  net.tables.cup_round_courses = ok(isC ? F.CASCAIS_COURSES : F.FICTICIA_COURSES);
  net.tables.cup_round_course_overrides = ok(isC ? F.CASCAIS_OVERRIDES : F.FICTICIA_OVERRIDES);
}

const ENROLLMENT = { id: 'enr1', user_id: USER, edition_id: F.CASCAIS_34.id, team_id: 't-naza', team_other: null, is_federated: false, season_goal: 'premio', status: 'ativa' };

describe('isCupSchemaMissing', () => {
  it('tabela ou função da M1 em falta → true; o resto não', () => {
    expect(isCupSchemaMissing({ code: '42P01', message: 'relation "public.cup_rounds" does not exist' })).toBe(true);
    expect(isCupSchemaMissing({ code: 'PGRST205' })).toBe(true);
    expect(isCupSchemaMissing({ code: 'PGRST202', message: 'Could not find the function public.enroll_cup' })).toBe(true);
    expect(isCupSchemaMissing({ code: '42883' })).toBe(true);
    expect(isCupSchemaMissing({ code: '22023', message: 'Faltam o género e a data de nascimento no perfil' })).toBe(false);
    expect(isCupSchemaMissing({ code: '42501' })).toBe(false);
    expect(isCupSchemaMissing(null)).toBe(false);
  });
});

describe('pickCupEdition', () => {
  it('a da inscrição ativa ganha; senão a primeira aceite pela ordem de criação', () => {
    const a = { id: 'a', created_at: '2026-01-02' };
    const b = { id: 'b', created_at: '2026-01-01' };
    expect(pickCupEdition([a, b], [{ edition_id: 'a', status: 'ativa' }])?.id).toBe('a');
    expect(pickCupEdition([a, b], [])?.id).toBe('b');
    expect(pickCupEdition([a, b], [], (e) => e.id === 'a')?.id).toBe('a');
    expect(pickCupEdition([a, b], [{ edition_id: 'z', status: 'ativa' }])).toBeNull();
    expect(pickCupEdition([], [])).toBeNull();
  });
});

describe('loadCup — invariância sem edição e sem inscrição', () => {
  it('sem edição aberta: três leituras pequenas, nada mais, e nenhuma outra fatia muda', async () => {
    const before = nonCupSnapshot();
    await useAppStore.getState().loadCup();
    const cup = useAppStore.getState().cup;
    expect(cup.status).toBe('ready');
    expect(cup.editions).toEqual([]);
    expect(tablesRead().sort()).toEqual(['cup_edition_dismissals', 'cup_editions', 'cup_enrollments']);
    expectNothingElseChanged(before);
  });

  it('edição aberta, não inscrito: o catálogo NÃO se lê aqui (só quando a porta aparecer)', async () => {
    net.tables.cup_editions = ok([{ ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION }]);
    const before = nonCupSnapshot();
    await useAppStore.getState().loadCup();
    const cup = useAppStore.getState().cup;
    expect(cup.editions[0].competition.slug).toBe('trofeu-cascais');
    expect(cup.catalog).toEqual({});
    expect(tablesRead()).not.toContain('cup_rounds');
    expect(tablesRead()).not.toContain('race_events');
    expectNothingElseChanged(before);
  });

  it('M1 por aplicar: indisponível, sem rebentar e sem mexer em mais nada', async () => {
    net.tables.cup_editions = missing;
    net.tables.cup_enrollments = { data: null, error: { code: '42P01', message: 'relation "public.cup_enrollments" does not exist' } };
    const before = nonCupSnapshot();
    const res = await useAppStore.getState().loadCup();
    expect(res.status).toBe('indisponivel');
    expect(useAppStore.getState().cup.status).toBe('indisponivel');
    expectNothingElseChanged(before);
    // E não volta a tentar sozinho.
    net.calls = [];
    await useAppStore.getState().loadCup();
    expect(net.calls).toEqual([]);
  });

  it('erro de rede: status "erro", nada mais muda', async () => {
    net.tables.cup_enrollments = { data: null, error: { code: '08006', message: 'rede' } };
    const before = nonCupSnapshot();
    await useAppStore.getState().loadCup();
    expect(useAppStore.getState().cup.status).toBe('erro');
    expectNothingElseChanged(before);
  });

  it('duas chamadas seguidas juntam-se numa só leitura', async () => {
    const a = useAppStore.getState().loadCup();
    const b = useAppStore.getState().loadCup();
    await Promise.all([a, b]);
    expect(tablesRead().filter((t) => t === 'cup_editions')).toHaveLength(1);
  });

  it('sem sessão não lê nada; ao sair, a fatia volta a vazia', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    await useAppStore.getState().loadCup();
    expect(useAppStore.getState().cup.userId).toBe(USER);
    useAppStore.getState().setSession(null);
    expect(useAppStore.getState().cup).toBe(CUP_EMPTY);
    useAppStore.setState({ profile: null });
    net.calls = [];
    expect(await useAppStore.getState().loadCup()).toBeNull();
    expect(net.calls).toEqual([]);
  });
});

describe('loadCup — inscrito', () => {
  it('lê o catálogo da edição da inscrição e as participações; a edição vem à parte se já não estiver aberta', async () => {
    net.tables.cup_editions = (q) => (q.filters.some(([m, col]) => m === 'eq' && col === 'id')
      ? ok([{ ...F.CASCAIS_34, status: 'por_anunciar', competition: F.CASCAIS_COMPETITION }])
      : ok([]));
    net.tables.cup_enrollments = ok([ENROLLMENT]);
    net.tables.cup_participations = ok([{ id: 'p1', enrollment_id: 'enr1', round_id: 'r-c3', decision: 'vou' }]);
    catalogTables();
    await useAppStore.getState().loadCup();
    const cup = useAppStore.getState().cup;
    expect(cup.editions.map((e) => e.id)).toEqual([F.CASCAIS_34.id]);
    expect(cup.catalog[F.CASCAIS_34.id].status).toBe('ready');
    expect(cup.catalog[F.CASCAIS_34.id].rounds).toHaveLength(F.CASCAIS_ROUNDS.length);
    expect(cup.catalog[F.CASCAIS_34.id].courses).toHaveLength(F.CASCAIS_COURSES.length);
    expect(cup.participations).toHaveLength(1);
    // Os percursos pedem-se só das jornadas desta edição.
    const courses = net.calls.find((c) => c.table === 'cup_round_courses');
    expect(courses.filters).toEqual([['in', 'round_id', F.CASCAIS_ROUNDS.map((r) => r.id)]]);
  });

  it('um catálogo com uma tabela em falta deixa tudo indisponível', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    net.tables.cup_enrollments = ok([ENROLLMENT]);
    catalogTables();
    net.tables.cup_round_course_overrides = missing;
    await useAppStore.getState().loadCup();
    expect(useAppStore.getState().cup.status).toBe('indisponivel');
  });
});

describe('ações (RPCs)', () => {
  async function loadedEnrolled() {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    net.tables.cup_enrollments = ok([ENROLLMENT]);
    net.tables.cup_participations = ok([]);
    catalogTables();
    await useAppStore.getState().loadCup();
    net.calls = [];
  }

  it('enrollCup: chama enroll_cup com o patch, junta a inscrição e não relê provas', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    await useAppStore.getState().loadCup();
    net.calls = [];
    catalogTables();
    net.rpcs.enroll_cup = ok(ENROLLMENT);
    const before = nonCupSnapshot();
    const res = await useAppStore.getState().enrollCup(F.CASCAIS_34.id, { team_id: 't-naza', season_goal: 'premio' });
    expect(res.ok).toBe(true);
    expect(net.calls[0]).toEqual({ rpc: 'enroll_cup', args: { p_edition_id: F.CASCAIS_34.id, p_data: { team_id: 't-naza', season_goal: 'premio' } } });
    const cup = useAppStore.getState().cup;
    expect(cup.enrollments).toEqual([ENROLLMENT]);
    expect(cup.catalog[F.CASCAIS_34.id].status).toBe('ready');
    expect(tablesRead()).not.toContain('race_events');
    expectNothingElseChanged(before);
  });

  it('enrollCup: o erro do servidor chega ao ecrã tal como veio', async () => {
    net.rpcs.enroll_cup = { data: null, error: { code: '22023', message: 'Faltam o género e a data de nascimento no perfil' } };
    const res = await useAppStore.getState().enrollCup(F.CASCAIS_34.id, {});
    expect(res).toEqual({ ok: false, error: { code: '22023', message: 'Faltam o género e a data de nascimento no perfil' }, unavailable: false });
  });

  it('RPC em falta (M1 por aplicar) → unavailable e a fatia fica indisponível', async () => {
    net.rpcs.set_participation = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.set_participation' } };
    const res = await useAppStore.getState().setCupParticipation('r-c3', { decision: 'vou' });
    expect(res.unavailable).toBe(true);
    expect(useAppStore.getState().cup.status).toBe('indisponivel');
    expect(tablesRead()).not.toContain('race_events');
  });

  it('setCupParticipation "Vou": grava, relê as provas (a sincronização criou a b) e os planos', async () => {
    await loadedEnrolled();
    const jornada = { id: 'rj3', date: '2027-01-24', race_priority: 'b', cup_round_id: 'r-c3', status: 'agendada' };
    net.rpcs.set_participation = ok({ id: 'p3', enrollment_id: 'enr1', round_id: 'r-c3', decision: 'vou', decision_source: 'atleta' });
    net.tables.race_events = ok([...LOADED.raceEvents, jornada]);
    net.tables.coach_plans = ok([{ id: 'p1', status: 'aceite', race_lost_at: null }]);
    const res = await useAppStore.getState().setCupParticipation('r-c3', { decision: 'vou' });
    expect(res).toMatchObject({ ok: true, collided: false });
    expect(net.calls[0]).toEqual({ rpc: 'set_participation', args: { p_round_id: 'r-c3', p_patch: { decision: 'vou' } } });
    const s = useAppStore.getState();
    expect(s.cup.participations.map((p) => p.id)).toEqual(['p3']);
    expect(s.raceEvents.map((r) => r.id)).toEqual(['meia', 'rj3']);
    expect(tablesRead()).toContain('coach_plans');
  });

  it('"Vou" num dia de principal volta null/colisao, e o ecrã sabe-o (collided)', async () => {
    await loadedEnrolled();
    net.rpcs.set_participation = ok({ id: 'p4', enrollment_id: 'enr1', round_id: 'r-c4', decision: null, decision_source: 'colisao' });
    net.tables.race_events = ok(LOADED.raceEvents);
    const res = await useAppStore.getState().setCupParticipation('r-c4', { decision: 'vou' });
    expect(res.collided).toBe(true);
    // As provas não mudaram: os planos não se releem.
    expect(tablesRead()).toEqual(['race_events']);
  });

  it('só a intenção ou o "Já me inscrevi": não relê provas', async () => {
    await loadedEnrolled();
    net.rpcs.set_participation = ok({ id: 'p3', enrollment_id: 'enr1', round_id: 'r-c3', decision: 'vou', intent: 'controlar' });
    await useAppStore.getState().setCupParticipation('r-c3', { intent: 'controlar', intent_source: 'atleta' });
    await useAppStore.getState().setCupParticipation('r-c3', { entry_done: true });
    expect(tablesRead()).toEqual([]);
  });

  it('setCupParticipations ("Confirmar"): uma RPC por jornada e as provas relidas uma só vez', async () => {
    await loadedEnrolled();
    net.rpcs.set_participation = (args) => ok({ id: `p-${args.p_round_id}`, enrollment_id: 'enr1', round_id: args.p_round_id, decision: args.p_patch.decision });
    net.tables.race_events = ok(LOADED.raceEvents);
    const res = await useAppStore.getState().setCupParticipations([
      { roundId: 'r-c2', patch: { decision: 'vou', decision_source: 'omissao' } },
      { roundId: 'r-c3', patch: { decision: 'vou' } },
      { roundId: 'r-c4', patch: { decision: 'nao_vou' } },
    ]);
    expect(res.ok).toBe(true);
    expect(net.calls.filter((c) => c.rpc === 'set_participation')).toHaveLength(3);
    expect(tablesRead().filter((t) => t === 'race_events')).toHaveLength(1);
    expect(useAppStore.getState().cup.participations).toHaveLength(3);
  });

  it('updateEnrollment: substitui a linha da inscrição', async () => {
    await loadedEnrolled();
    net.rpcs.update_enrollment = ok({ ...ENROLLMENT, bib: '123' });
    const res = await useAppStore.getState().updateEnrollment('enr1', { bib: '123' });
    expect(res.ok).toBe(true);
    expect(net.calls[0]).toEqual({ rpc: 'update_enrollment', args: { p_enrollment_id: 'enr1', p_patch: { bib: '123' } } });
    expect(useAppStore.getState().cup.enrollments[0].bib).toBe('123');
  });

  it('leaveCup: inscrição a "saiu", participações fora e as provas relidas', async () => {
    await loadedEnrolled();
    useAppStore.setState({ raceEvents: [...LOADED.raceEvents, { id: 'rj3', date: '2027-01-24', cup_round_id: 'r-c3' }] });
    net.rpcs.leave_cup = ok({ ...ENROLLMENT, status: 'saiu', left_at: '2026-10-01T10:00:00Z' });
    net.tables.race_events = ok(LOADED.raceEvents);
    net.tables.coach_plans = ok([]);
    const res = await useAppStore.getState().leaveCup('enr1');
    expect(res.ok).toBe(true);
    const s = useAppStore.getState();
    expect(s.cup.enrollments[0].status).toBe('saiu');
    expect(s.cup.participations).toEqual([]);
    expect(s.raceEvents.map((r) => r.id)).toEqual(['meia']);
    expect(tablesRead()).toContain('coach_plans');
  });
});

describe('"Não me interessa"', () => {
  it('insere a dispensa do próprio, e nada mais muda', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    await useAppStore.getState().loadCup();
    net.calls = [];
    const before = nonCupSnapshot();
    const res = await useAppStore.getState().dismissCupEdition(F.CASCAIS_34.id);
    expect(res.ok).toBe(true);
    expect(net.calls).toEqual([{ table: 'cup_edition_dismissals', op: 'insert', filters: [], payload: { user_id: USER, edition_id: F.CASCAIS_34.id } }]);
    expect(useAppStore.getState().cup.dismissals).toEqual([F.CASCAIS_34.id]);
    expectNothingElseChanged(before);
  });

  it('já dispensada (23505) conta como feito; desfazer apaga só a do próprio', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    await useAppStore.getState().loadCup();
    net.tables.cup_edition_dismissals = { data: null, error: { code: '23505', message: 'duplicate key' } };
    expect((await useAppStore.getState().dismissCupEdition(F.CASCAIS_34.id)).ok).toBe(true);
    net.tables.cup_edition_dismissals = ok(null);
    net.calls = [];
    expect((await useAppStore.getState().undismissCupEdition(F.CASCAIS_34.id)).ok).toBe(true);
    expect(net.calls[0]).toMatchObject({ table: 'cup_edition_dismissals', op: 'delete', filters: [['eq', 'user_id', USER], ['eq', 'edition_id', F.CASCAIS_34.id]] });
    expect(useAppStore.getState().cup.dismissals).toEqual([]);
  });

  it('tabela em falta: devolve unavailable, sem rebentar', async () => {
    net.tables.cup_edition_dismissals = missing;
    const before = nonCupSnapshot();
    const res = await useAppStore.getState().dismissCupEdition(F.CASCAIS_34.id);
    expect(res).toMatchObject({ ok: false, unavailable: true });
    expectNothingElseChanged(before);
  });
});

/* A pista local de inscrição (Fase 2): é por ela que o Início sabe que pode
   ler a competição sem ler nada a quem não está inscrito (useCupForHome). */
describe('a pista local de inscrição', () => {
  const HINT = cupEnrolledHintKey(USER);

  beforeEach(() => window.localStorage.clear());

  it('a chave é por conta', () => {
    expect(HINT).toBe('ironcoach:competicao-inscrito:u-cup');
    expect(cupEnrolledHintKey('outro')).not.toBe(HINT);
  });

  it('loadCup com inscrição ativa põe-na; sem inscrição tira-a', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    net.tables.cup_enrollments = ok([ENROLLMENT]);
    catalogTables();
    await useAppStore.getState().loadCup();
    expect(window.localStorage.getItem(HINT)).toBe('1');
    expect(readCupEnrolledHint(USER)).toBe(true);

    net.tables.cup_enrollments = ok([{ ...ENROLLMENT, status: 'saiu' }]);
    await useAppStore.getState().loadCup({ force: true });
    expect(window.localStorage.getItem(HINT)).toBeNull();
    expect(readCupEnrolledHint(USER)).toBe(false);
  });

  it('uma leitura falhada (M1 por aplicar, rede) não mexe nela', async () => {
    window.localStorage.setItem(HINT, '1');
    net.tables.cup_editions = missing;
    await useAppStore.getState().loadCup();
    expect(window.localStorage.getItem(HINT)).toBe('1');
  });

  it('enrollCup põe-na só quando o servidor aceita; leaveCup tira-a', async () => {
    net.rpcs.enroll_cup = { data: null, error: { code: '22023', message: 'Faltam o género e a data de nascimento no perfil' } };
    await useAppStore.getState().enrollCup(F.CASCAIS_34.id, {});
    expect(window.localStorage.getItem(HINT)).toBeNull();

    catalogTables();
    net.rpcs.enroll_cup = ok(ENROLLMENT);
    await useAppStore.getState().enrollCup(F.CASCAIS_34.id, { season_goal: 'premio' });
    expect(window.localStorage.getItem(HINT)).toBe('1');

    net.rpcs.leave_cup = ok({ ...ENROLLMENT, status: 'saiu', left_at: '2026-10-01T10:00:00Z' });
    net.tables.race_events = ok(LOADED.raceEvents);
    await useAppStore.getState().leaveCup('enr1');
    expect(window.localStorage.getItem(HINT)).toBeNull();
  });

  it('sem storage (modo privado): tudo funciona na mesma', async () => {
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    net.tables.cup_enrollments = ok([ENROLLMENT]);
    catalogTables();
    await useAppStore.getState().loadCup();
    expect(useAppStore.getState().cup.status).toBe('ready');
    expect(readCupEnrolledHint(USER)).toBe(false);
    set.mockRestore();
    get.mockRestore();
  });
});

/* Depois de a Carol gravar numa jornada ou no objetivo da época (o
   coach-chat responde `cup_updated`, só a um inscrito): a competição e as
   provas voltam a ler-se. */
describe('refreshCupAfterChat', () => {
  it('relê a competição (à força), as participações e as provas; os planos só se as jornadas mudaram', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    net.tables.cup_enrollments = ok([ENROLLMENT]);
    net.tables.cup_participations = ok([]);
    catalogTables();
    await useAppStore.getState().loadCup();
    net.calls = [];

    const jornada = { id: 'rj3', date: '2027-01-24', race_priority: 'b', cup_round_id: 'r-c3', status: 'agendada' };
    net.tables.cup_participations = ok([{ id: 'p3', enrollment_id: 'enr1', round_id: 'r-c3', decision: 'vou', decision_source: 'atleta', intent: 'controlar', intent_source: 'atleta' }]);
    net.tables.race_events = ok([...LOADED.raceEvents, jornada]);
    net.tables.coach_plans = ok([{ id: 'p1', status: 'aceite', race_lost_at: null }]);
    await useAppStore.getState().refreshCupAfterChat();

    const read = tablesRead();
    for (const t of ['cup_editions', 'cup_enrollments', 'cup_edition_dismissals', 'cup_rounds', 'cup_participations', 'race_events']) expect(read).toContain(t);
    const s = useAppStore.getState();
    expect(s.cup.participations.map((p) => p.intent)).toEqual(['controlar']);
    expect(s.raceEvents.map((r) => r.id)).toEqual(['meia', 'rj3']);
    expect(read).toContain('coach_plans');

    // Sem mudança nas provas das jornadas: os planos não se releem.
    net.calls = [];
    await useAppStore.getState().refreshCupAfterChat();
    expect(tablesRead()).toContain('race_events');
    expect(tablesRead()).not.toContain('coach_plans');
  });

  it('sem sessão não lê nada', async () => {
    useAppStore.setState({ session: null, profile: null });
    net.calls = [];
    await useAppStore.getState().refreshCupAfterChat();
    expect(net.calls).toEqual([]);
  });
});

/* ── Fase 3 (2026-09-27): a classificação e as ações do calendário ──────
   O dia é fixo (Date falso): as jornadas das fixtures vão de dezembro de
   2026 a março de 2027, e "já passou" não pode depender de quando o teste
   corre. */
describe('Fase 3 — a classificação (cup_results / cup_team_results)', () => {
  // As colunas escritas por extenso aqui (e não importadas): é o teste que as fixa.
  const CUP_RESULT_COLUMNS = 'round_id, position, category_code, category_position, points, official_time_s, match_status';
  const CUP_TEAM_RESULT_COLUMNS = 'round_id, position, points';
  const readsOf = (t) => net.selects.filter((c) => c.table === t);

  it('quem não está inscrito: as mesmas três leituras, e nenhuma da classificação', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    await useAppStore.getState().loadCup();
    expect(tablesRead().sort()).toEqual(['cup_edition_dismissals', 'cup_editions', 'cup_enrollments']);
    expect(useAppStore.getState().cup.results).toEqual(CUP_EMPTY.results);
    // Quem saiu também não.
    net.calls = [];
    net.tables.cup_enrollments = ok([{ ...ENROLLMENT, status: 'saiu', left_at: '2026-10-01T10:00:00Z' }]);
    await useAppStore.getState().loadCup({ force: true });
    expect(tablesRead()).not.toContain('cup_results');
    expect(tablesRead()).not.toContain('cup_team_results');
  });

  it('inscrito: a linha confirmada do próprio e a coletiva do clube dele, coluna a coluna', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    net.tables.cup_enrollments = ok([ENROLLMENT]);
    net.tables.cup_results = ok([{ round_id: 'r-c2', position: 41, category_code: 'M35', category_position: 12, points: 5, official_time_s: 1900, match_status: 'confirmada' }]);
    net.tables.cup_team_results = ok([{ round_id: 'r-c2', position: 6, points: 412 }]);
    catalogTables();
    await useAppStore.getState().loadCup();
    expect(readsOf('cup_results')).toEqual([{ table: 'cup_results', op: 'select', columns: CUP_RESULT_COLUMNS, filters: [['eq', 'enrollment_id', 'enr1'], ['eq', 'match_status', 'confirmada']] }]);
    expect(readsOf('cup_team_results')).toEqual([{ table: 'cup_team_results', op: 'select', columns: CUP_TEAM_RESULT_COLUMNS, filters: [['eq', 'team_id', 't-naza']] }]);
    for (const c of [...readsOf('cup_results'), ...readsOf('cup_team_results')]) {
      expect(c.columns).not.toMatch(/match_hash|team_name|athletes_count|\*/);
    }
    const { results } = useAppStore.getState().cup;
    expect(results).toMatchObject({ status: 'ready', enrollmentId: 'enr1', teamId: 't-naza' });
    expect(results.rows).toHaveLength(1);
    expect(results.teamRows).toEqual([{ round_id: 'r-c2', position: 6, points: 412 }]);
  });

  /* Revisão da Fase 3 (2026-09-27): mudar de clube a meio da época (§4.2)
     não pode deixar a coletiva do clube antigo com o nome do novo. */
  it('mudar de clube relê a coletiva do clube novo; a do antigo deixa de aparecer', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    net.tables.cup_enrollments = ok([ENROLLMENT]);
    net.tables.cup_results = ok([{ round_id: 'r-c2', position: 41, category_code: 'M35', category_position: 12, points: 5, official_time_s: 1900, match_status: 'confirmada' }]);
    net.tables.cup_team_results = (q) => ok(q.filters.some(([, col, v]) => col === 'team_id' && v === 't-naza')
      ? [{ round_id: 'r-c2', position: 6, points: 412 }]
      : []);
    catalogTables();
    await useAppStore.getState().loadCup();
    const vista = () => buildCupView({ cup: useAppStore.getState().cup, profile: LOADED.profile, raceEvents: [], runs: [], today: '2027-01-20' });
    expect(vista().results.teamByRound['r-c2']).toMatchObject({ position: 6, points: 412 });

    net.selects = [];
    net.rpcs.update_enrollment = ok({ ...ENROLLMENT, team_id: 't-ccd' });
    const res = await useAppStore.getState().updateEnrollment('enr1', { team_id: 't-ccd' });
    expect(res.ok).toBe(true);
    expect(readsOf('cup_team_results')).toEqual([{ table: 'cup_team_results', op: 'select', columns: CUP_TEAM_RESULT_COLUMNS, filters: [['eq', 'team_id', 't-ccd']] }]);
    const { results } = useAppStore.getState().cup;
    expect(results).toMatchObject({ status: 'ready', enrollmentId: 'enr1', teamId: 't-ccd', teamRows: [] });
    // A linha do próprio continua (é da inscrição, não do clube).
    expect(results.rows).toHaveLength(1);
    const v = vista();
    expect(v.results.teamByRound).toEqual({});
    expect(v.rounds.find((r) => r.id === 'r-c2').teamResult).toBeNull();
    expect(v.results.byRound['r-c2']).toMatchObject({ points: 5 });
  });

  it('mudar só o dorsal (ou outro campo que não o clube) não relê a classificação', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    net.tables.cup_enrollments = ok([ENROLLMENT]);
    catalogTables();
    await useAppStore.getState().loadCup();
    net.calls = [];
    net.rpcs.update_enrollment = ok({ ...ENROLLMENT, bib: '123', notify_calendar: true });
    await useAppStore.getState().updateEnrollment('enr1', { bib: '123', notify_calendar: true });
    expect(tablesRead()).toEqual([]);
  });

  it('clube que não está na lista (team_other): sem leitura da coletiva', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    net.tables.cup_enrollments = ok([{ ...ENROLLMENT, team_id: null, team_other: 'Os Amigos da Marginal' }]);
    catalogTables();
    await useAppStore.getState().loadCup();
    expect(tablesRead()).toContain('cup_results');
    expect(tablesRead()).not.toContain('cup_team_results');
  });

  it('um erro na classificação não mexe no resto: só results.status = "erro", e só a mensagem na consola', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    net.tables.cup_enrollments = ok([ENROLLMENT]);
    net.tables.cup_participations = ok([{ id: 'p3', enrollment_id: 'enr1', round_id: 'r-c3', decision: 'vou' }]);
    net.tables.cup_results = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
    catalogTables();
    const before = nonCupSnapshot();
    await useAppStore.getState().loadCup();
    const cup = useAppStore.getState().cup;
    expect(cup.status).toBe('ready');
    expect(cup.catalog[F.CASCAIS_34.id].status).toBe('ready');
    expect(cup.participations).toHaveLength(1);
    expect(cup.results.status).toBe('erro');
    expect(console.warn).toHaveBeenCalledWith('Competição: resultados:', 'canceling statement due to statement timeout');
    expectNothingElseChanged(before);
  });

  it('a tabela em falta (M1 parcial): fica vazia, e a competição NÃO passa a indisponível', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    net.tables.cup_enrollments = ok([ENROLLMENT]);
    net.tables.cup_team_results = { data: null, error: { code: '42P01', message: 'relation "public.cup_team_results" does not exist' } };
    catalogTables();
    await useAppStore.getState().loadCup();
    const cup = useAppStore.getState().cup;
    expect(cup.status).toBe('ready');
    expect(cup.results).toMatchObject({ status: 'ready', teamRows: [] });
  });

  it('inscrever lê a classificação; sair esquece-a', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    await useAppStore.getState().loadCup();
    catalogTables();
    net.rpcs.enroll_cup = ok(ENROLLMENT);
    net.tables.cup_results = ok([{ round_id: 'r-c2', position: 41, match_status: 'confirmada' }]);
    await useAppStore.getState().enrollCup(F.CASCAIS_34.id, { team_id: 't-naza' });
    expect(useAppStore.getState().cup.results.rows).toHaveLength(1);
    net.rpcs.leave_cup = ok({ ...ENROLLMENT, status: 'saiu', left_at: '2026-10-01T10:00:00Z' });
    net.tables.race_events = ok(LOADED.raceEvents);
    await useAppStore.getState().leaveCup('enr1');
    expect(useAppStore.getState().cup.results).toEqual(CUP_EMPTY.results);
  });
});

describe('Fase 3 — as ações do calendário do Troféu', () => {
  const setToday = (iso) => vi.setSystemTime(new Date(`${iso}T12:00:00Z`));
  const rpcCalls = () => net.calls.filter((c) => c.rpc);
  const JORNADA_2 = { id: 'x2', date: '2027-01-10', race_priority: 'b', cup_round_id: 'r-c2', status: 'agendada' };
  const JORNADA_3 = { id: 'x3', date: '2027-01-24', race_priority: 'b', cup_round_id: 'r-c3', status: 'agendada' };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    setToday('2027-01-20');
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    net.tables.cup_enrollments = ok([ENROLLMENT]);
    net.tables.cup_participations = ok([]);
    catalogTables();
    await useAppStore.getState().loadCup();
    net.calls = [];
    net.selects = [];
    net.rpcs.set_participation = (args) => ok({ id: `p-${args.p_round_id}`, enrollment_id: 'enr1', round_id: args.p_round_id, ...args.p_patch });
  });
  afterEach(() => vi.useRealTimers());

  it('setCupRoundIntent: o papel escolhido por ele; não relê provas', async () => {
    const res = await useAppStore.getState().setCupRoundIntent('r-c3', 'controlar');
    expect(res.ok).toBe(true);
    expect(rpcCalls()).toEqual([{ rpc: 'set_participation', args: { p_round_id: 'r-c3', p_patch: { intent: 'controlar', intent_source: 'atleta' } } }]);
    expect(tablesRead()).toEqual([]);
  });

  it('setCupRoundIntent "saltar": é também "Não vou" — e as provas releem-se (a sincronização tira a prova)', async () => {
    net.tables.race_events = ok(LOADED.raceEvents);
    await useAppStore.getState().setCupRoundIntent('r-c3', 'saltar');
    expect(rpcCalls()[0].args.p_patch).toEqual({ decision: 'nao_vou', decision_source: 'atleta', intent: 'saltar', intent_source: 'atleta' });
    expect(tablesRead()).toContain('race_events');
  });

  /* Revisão da Fase 3 (2026-09-27): o diálogo de "Saltar" diz que se pode
     voltar a dizer "Vou" — e esse "Vou" não pode ficar com o papel 'saltar'
     (o calendário, o hub, o taper e a Carol leriam um salto). */
  it('"Vou" depois de "Saltar": o papel saltar é limpo no mesmo patch (intent null)', async () => {
    net.tables.race_events = ok(LOADED.raceEvents);
    // A RPC como o servidor: junta o patch à linha que já existe; intent null limpa também intent_source.
    const rows = {};
    net.rpcs.set_participation = ({ p_round_id: id, p_patch: patch }) => {
      const cur = rows[id] || { id: `p-${id}`, enrollment_id: 'enr1', round_id: id, decision: null, decision_source: null, intent: null, intent_source: null };
      const next = { ...cur, ...patch };
      if ('intent' in patch && patch.intent == null) next.intent_source = null;
      rows[id] = next;
      return ok(next);
    };
    await useAppStore.getState().setCupRoundIntent('r-c3', 'saltar');
    expect(useAppStore.getState().cup.participations.find((p) => p.round_id === 'r-c3')).toMatchObject({ decision: 'nao_vou', intent: 'saltar' });

    net.calls = [];
    // O "Guardar" da folha da jornada.
    const res = await useAppStore.getState().setCupParticipation('r-c3', { decision: 'vou', decision_source: 'atleta' });
    expect(res.ok).toBe(true);
    expect(rpcCalls()[0].args.p_patch).toEqual({ decision: 'vou', decision_source: 'atleta', intent: null });
    expect(useAppStore.getState().cup.participations.find((p) => p.round_id === 'r-c3')).toMatchObject({ decision: 'vou', intent: null, intent_source: null });

    // O "Confirmar" do modo decidir passa pelo mesmo caminho.
    await useAppStore.getState().setCupRoundIntent('r-c4', 'saltar');
    net.calls = [];
    await useAppStore.getState().setCupParticipations([{ roundId: 'r-c4', patch: { decision: 'vou', decision_source: 'atleta' } }]);
    expect(rpcCalls()[0].args.p_patch).toEqual({ decision: 'vou', decision_source: 'atleta', intent: null });
    expect(useAppStore.getState().cup.participations.find((p) => p.round_id === 'r-c4').intent).toBeNull();
  });

  it('"Vou" com outro papel gravado (controlar), ou "Não vou" depois de "Saltar": o papel não se toca', async () => {
    net.tables.race_events = ok(LOADED.raceEvents);
    useAppStore.setState((s) => ({ cup: { ...s.cup, participations: [
      { id: 'p-r-c3', enrollment_id: 'enr1', round_id: 'r-c3', decision: 'nao_sei', intent: 'controlar', intent_source: 'atleta' },
      { id: 'p-r-c4', enrollment_id: 'enr1', round_id: 'r-c4', decision: 'nao_vou', intent: 'saltar', intent_source: 'atleta' },
    ] } }));
    await useAppStore.getState().setCupParticipation('r-c3', { decision: 'vou', decision_source: 'atleta' });
    await useAppStore.getState().setCupParticipation('r-c4', { decision: 'nao_sei', decision_source: 'atleta' });
    expect(rpcCalls().map((c) => c.args.p_patch)).toEqual([
      { decision: 'vou', decision_source: 'atleta' },
      { decision: 'nao_sei', decision_source: 'atleta' },
    ]);
  });

  it('setCupRoundIntent com um papel que não existe: recusa, sem RPC', async () => {
    const res = await useAppStore.getState().setCupRoundIntent('r-c3', 'sprintar');
    expect(res).toEqual({ ok: false, error: { code: '22023', message: 'Papel inválido' }, unavailable: false });
    expect(net.calls).toEqual([]);
  });

  it('"Não fui" numa jornada que já passou: nao_fui pelo atleta, e as provas releem-se', async () => {
    net.tables.race_events = ok(LOADED.raceEvents);
    const res = await useAppStore.getState().markCupRoundNotAttended('r-c2');
    expect(res.ok).toBe(true);
    expect(rpcCalls()).toEqual([{ rpc: 'set_participation', args: { p_round_id: 'r-c2', p_patch: { decision: 'nao_fui', decision_source: 'atleta' } } }]);
    expect(tablesRead()).toContain('race_events');
  });

  it('"Não fui" numa jornada de hoje, futura ou sem data: recusa sem chamar o servidor', async () => {
    for (const id of ['r-c3', 'r-c5', 'nao-existe']) {
      const res = await useAppStore.getState().markCupRoundNotAttended(id);
      expect(res).toEqual({ ok: false, error: { code: '22023', message: '"Não fui" só numa jornada que já passou' }, unavailable: false });
    }
    setToday('2027-01-24');
    expect((await useAppStore.getState().markCupRoundNotAttended('r-c3')).ok).toBe(false);
    expect(net.calls).toEqual([]);
  });

  it('"Já me inscrevi" e o desfazer: só entry_done, sem reler provas', async () => {
    await useAppStore.getState().markCupEntryDone('r-c3');
    await useAppStore.getState().markCupEntryDone('r-c3', false);
    expect(rpcCalls().map((c) => c.args.p_patch)).toEqual([{ entry_done: true }, { entry_done: false }]);
    expect(tablesRead()).toEqual([]);
  });

  it('registerCupRound com a prova da jornada no calendário: o raceId, sem RPC', async () => {
    useAppStore.setState({ raceEvents: [...LOADED.raceEvents, JORNADA_2] });
    const res = await useAppStore.getState().registerCupRound('r-c2');
    expect(res).toEqual({ ok: true, data: { raceId: 'x2' } });
    expect(net.calls).toEqual([]);
  });

  it('registerCupRound sem prova (passada, confirmada): grava "Vou", relê as provas e devolve a que a sincronização criou', async () => {
    net.tables.race_events = ok([...LOADED.raceEvents, JORNADA_2]);
    net.tables.coach_plans = ok([]);
    const res = await useAppStore.getState().registerCupRound('r-c2');
    expect(res).toEqual({ ok: true, data: { raceId: 'x2' } });
    expect(rpcCalls()).toEqual([{ rpc: 'set_participation', args: { p_round_id: 'r-c2', p_patch: { decision: 'vou', decision_source: 'atleta' } } }]);
    expect(useAppStore.getState().raceEvents.map((r) => r.id)).toEqual(['meia', 'x2']);
  });

  it('registerCupRound sem prova depois da sincronização: "sem_prova", com o caminho alternativo', async () => {
    net.tables.race_events = ok(LOADED.raceEvents);
    const res = await useAppStore.getState().registerCupRound('r-c2');
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('sem_prova');
    expect(res.error.message).toContain('«Prova fora da agenda»');
  });

  it('registerCupRound numa jornada que ainda não passou (ou provável): recusa sem RPC', async () => {
    for (const id of ['r-c3', 'r-c1']) {
      if (id === 'r-c1') setToday('2027-01-20'); // a 1.ª é provável (06/12)
      const res = await useAppStore.getState().registerCupRound(id);
      expect(res.ok).toBe(false);
    }
    expect(net.calls).toEqual([]);
  });

  it('setCupRoundPriority: só a prioridade, na prova do próprio, e a linha volta para as provas', async () => {
    useAppStore.setState({ raceEvents: [...LOADED.raceEvents, JORNADA_3] });
    net.tables.race_events = (q) => (q.op === 'update' ? ok({ ...JORNADA_3, race_priority: 'a' }) : ok([]));
    const before = nonCupSnapshot();
    const res = await useAppStore.getState().setCupRoundPriority('r-c3', 'a');
    expect(res.ok).toBe(true);
    expect(net.calls).toEqual([{ table: 'race_events', op: 'update', filters: [['eq', 'id', 'x3'], ['eq', 'user_id', USER]], payload: { race_priority: 'a' } }]);
    const s = useAppStore.getState();
    expect(s.raceEvents.find((r) => r.id === 'x3').race_priority).toBe('a');
    expect(s.raceEvents.find((r) => r.id === 'meia')).toBe(LOADED.raceEvents[0]);
    // Só as provas mudaram.
    const after = nonCupSnapshot();
    for (const k of Object.keys(before).filter((k) => k !== 'raceEvents')) expect(after[k], k).toBe(before[k]);
  });

  it('setCupRoundPriority: recusa sem prova da jornada, com outra prioridade, e devolve o erro do servidor', async () => {
    // A Meia não é de jornada nenhuma: não se mexe nela por aqui.
    expect((await useAppStore.getState().setCupRoundPriority('r-c3', 'a')).error.code).toBe('sem_prova');
    useAppStore.setState({ raceEvents: [...LOADED.raceEvents, JORNADA_3] });
    expect((await useAppStore.getState().setCupRoundPriority('r-c3', 'c')).error.code).toBe('22023');
    expect(net.calls).toEqual([]);
    net.tables.race_events = { data: null, error: { code: '42501', message: 'Esta prova é de uma competição' } };
    const res = await useAppStore.getState().setCupRoundPriority('r-c3', 'b');
    expect(res).toEqual({ ok: false, error: { code: '42501', message: 'Esta prova é de uma competição' }, unavailable: false });
    expect(useAppStore.getState().raceEvents.find((r) => r.id === 'x3').race_priority).toBe('b');
  });

  it('requestCupScreen / clearCupScreenRequest: o pedido para abrir o Troféu noutro ecrã', () => {
    expect(useAppStore.getState().cupScreenRequest).toBeNull();
    useAppStore.getState().requestCupScreen({ roundId: 'r-c3' });
    // Com o instante e o dono: só vale uns segundos e só para esta conta.
    expect(useAppStore.getState().cupScreenRequest).toEqual({ roundId: 'r-c3', mode: null, at: Date.parse('2027-01-20T12:00:00Z'), userId: USER });
    useAppStore.getState().requestCupScreen();
    expect(useAppStore.getState().cupScreenRequest).toMatchObject({ roundId: null, mode: null });
    useAppStore.getState().requestCupScreen({ mode: 'decidir' });
    expect(useAppStore.getState().cupScreenRequest.mode).toBe('decidir');
    useAppStore.getState().clearCupScreenRequest();
    expect(useAppStore.getState().cupScreenRequest).toBeNull();
    expect(net.calls).toEqual([]);
  });

  /* Revisão da Fase 3: o pedido não ficava pendurado para sempre — um toque
     no Início de quem saiu de Provas antes de a leitura acabar abria o
     Troféu sozinho horas depois; e passava para a conta seguinte. */
  it('o pedido vale 30 s e só para quem o fez', () => {
    const agora = Date.parse('2027-01-20T12:00:00Z');
    const req = { roundId: 'r-c3', mode: null, at: agora, userId: USER };
    expect(CUP_SCREEN_REQUEST_TTL_MS).toBe(30000);
    expect(cupScreenRequestValid(req, USER, agora)).toBe(true);
    expect(cupScreenRequestValid(req, USER, agora + 30000)).toBe(true);
    expect(cupScreenRequestValid(req, USER, agora + 30001)).toBe(false);
    expect(cupScreenRequestValid(req, 'outra-conta', agora)).toBe(false);
    expect(cupScreenRequestValid(req, null, agora)).toBe(false);
    expect(cupScreenRequestValid({ ...req, userId: undefined }, USER, agora)).toBe(false);
    expect(cupScreenRequestValid({ ...req, at: undefined }, USER, agora)).toBe(false);
    // Um relógio que andou para trás não o eterniza.
    expect(cupScreenRequestValid({ ...req, at: agora + 60000 }, USER, agora)).toBe(false);
    expect(cupScreenRequestValid(null, USER, agora)).toBe(false);
  });

  it('o logout limpa o pedido', () => {
    useAppStore.getState().requestCupScreen({ roundId: 'r-c3', mode: 'calendario' });
    expect(useAppStore.getState().cupScreenRequest).not.toBeNull();
    useAppStore.getState().setSession(null);
    expect(useAppStore.getState().cupScreenRequest).toBeNull();
  });
});
