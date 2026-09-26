import { describe, it, expect, vi, beforeEach } from 'vitest';

/* A fatia da competição por jornadas (specs/trofeu.md §4.1–4.3, Fase 1,
   2026-09-26). O Supabase é um esboço: cada tabela e cada RPC respondem com o
   que `net.tables[t]` / `net.rpcs[fn]` disserem (um valor, ou uma função da
   consulta), e `net.calls` guarda tudo o que saiu — é por aí que se prova que
   quem não está inscrito não gera leituras de provas nem de planos. */
const net = { tables: {}, rpcs: {}, calls: [] };

function builder(table) {
  const q = { table, op: 'select', filters: [], payload: null };
  const b = {};
  for (const m of ['select', 'eq', 'in', 'order', 'gte', 'lte', 'neq', 'limit']) {
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

const { useAppStore } = await import('./index');
const { CUP_EMPTY, isCupSchemaMissing, pickCupEdition, __resetCupModuleState, cupEnrolledHintKey, readCupEnrolledHint } = await import('./cupSlice');
const F = await import('@formulas/cup.fixtures.ts');

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
