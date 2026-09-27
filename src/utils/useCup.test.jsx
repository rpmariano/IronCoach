import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GOLDEN_FASE3 from './useCup.fase3.golden.json';

/* useCup — a competição do atleta pronta a mostrar (specs/trofeu.md §4.1–4.3,
   Fase 1, 2026-09-26). O que se guarda aqui, acima de tudo, é a
   INVARIÂNCIA: sem edição na área, com "Não me interessa", ou com a M1 por
   aplicar, o hook devolve null e nenhuma fatia do store que já estava
   carregada muda (nem de referência). */
const net = { tables: {}, calls: [] };
function builder(table) {
  const b = {};
  for (const m of ['select', 'eq', 'in', 'order', 'gte', 'lte', 'neq', 'limit']) b[m] = () => b;
  b.insert = () => b;
  b.delete = () => b;
  const result = () => {
    net.calls.push(table);
    return Promise.resolve(net.tables[table] ?? { data: [], error: null });
  };
  b.single = result;
  b.maybeSingle = result;
  b.then = (res, rej) => result().then(res, rej);
  return b;
}
vi.mock('../lib/supabase', () => ({
  supabase: { from: (t) => builder(t), rpc: vi.fn(() => Promise.resolve({ data: null, error: null })) },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));
// O dia fixo: as jornadas das fixtures são de dezembro a julho.
vi.mock('../lib/utils', async (importOriginal) => ({ ...(await importOriginal()), lisbonTodayISO: () => '2027-01-11' }));

const { useAppStore } = await import('../store');
const { CUP_EMPTY, __resetCupModuleState } = await import('../store/cupSlice');
const { useCup, useTaca, buildCupView, selectCupView, cupContextOf, cupResultsOf, cupRoundsOf, cupViewOf, useCupForHome, useCupForRace, useCupListing } = await import('./useCup');
const { cupRoundRoles } = await import('@formulas/cupRoles.ts');
const { cupEnrolledHintKey } = await import('../store/cupSlice');
const F = await import('@formulas/cup.fixtures.ts');

const USER = 'u-hook';
const ok = (data) => ({ data, error: null });
const PROFILE = { id: USER, gender: 'M', birth_date: '1982-01-24', training_lat: 38.6979, training_lon: -9.4215 };
const MEIA = { id: 'meia', name: 'Meia de Lisboa', date: '2027-02-21', race_priority: 'a', cup_round_id: null, status: 'agendada' };
const LOADED = {
  profile: PROFILE,
  raceEvents: [MEIA],
  runs: [{ id: 'run1', date: '2026-09-20' }],
  coachPlans: [{ id: 'p1' }],
  coachPlanItems: [{ id: 'i1' }],
  coachMessages: [{ id: 'm1' }],
  dailySummary: { date: '2027-01-11' },
};

function nonCupSnapshot() {
  const s = useAppStore.getState();
  return Object.fromEntries(Object.entries(s).filter(([k, v]) => k !== 'cup' && typeof v !== 'function'));
}
function expectNothingElseChanged(before) {
  const after = nonCupSnapshot();
  for (const k of Object.keys(before)) expect(after[k], k).toBe(before[k]);
}

function catalogTables() {
  net.tables.cup_rounds = ok(F.CASCAIS_ROUNDS);
  net.tables.cup_categories = ok(F.CASCAIS_CATEGORIES);
  net.tables.cup_teams = ok(F.CASCAIS_TEAMS);
  net.tables.cup_round_courses = ok(F.CASCAIS_COURSES);
  net.tables.cup_round_course_overrides = ok(F.CASCAIS_OVERRIDES);
}

beforeEach(() => {
  net.tables = {};
  net.calls = [];
  __resetCupModuleState();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  useAppStore.setState({ session: { user: { id: USER } }, cup: CUP_EMPTY, ...LOADED });
});

async function settle(result) {
  await waitFor(() => expect(['ready', 'indisponivel', 'erro']).toContain(useAppStore.getState().cup.status));
  // O catálogo (se a porta o pedir) chega numa segunda volta.
  await act(async () => { await Promise.resolve(); });
  return result.current;
}

describe('useCup — invariância', () => {
  it('sem edição aberta: null, e nada do que estava carregado muda', async () => {
    const before = nonCupSnapshot();
    const { result } = renderHook(() => useCup());
    expect(result.current).toBeNull();
    expect(await settle(result)).toBeNull();
    expect(net.calls.sort()).toEqual(['cup_edition_dismissals', 'cup_editions', 'cup_enrollments']);
    expectNothingElseChanged(before);
  });

  it('edição só por anunciar (o seed da M1): null', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34]);
    const before = nonCupSnapshot();
    const { result } = renderHook(() => useCup());
    expect(await settle(result)).toBeNull();
    expect(net.calls).not.toContain('cup_rounds');
    expectNothingElseChanged(before);
  });

  it('edição aberta mas longe do local de treino: null, sem ler o catálogo', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    useAppStore.setState({ profile: { ...PROFILE, training_lat: 41.1496, training_lon: -8.6109 } });
    const before = nonCupSnapshot();
    const { result } = renderHook(() => useCup());
    expect(await settle(result)).toBeNull();
    expect(net.calls).not.toContain('cup_rounds');
    expectNothingElseChanged(before);
  });

  it('"Não me interessa" desta edição: null', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    net.tables.cup_edition_dismissals = ok([{ edition_id: F.CASCAIS_34.id }]);
    const { result } = renderHook(() => useCup());
    expect(await settle(result)).toBeNull();
  });

  it('M1 por aplicar: null, sem rebentar, e nada muda', async () => {
    net.tables.cup_editions = { data: null, error: { code: '42P01', message: 'relation "public.cup_editions" does not exist' } };
    const before = nonCupSnapshot();
    const { result } = renderHook(() => useCup());
    expect(await settle(result)).toBeNull();
    expect(useAppStore.getState().cup.status).toBe('indisponivel');
    expectNothingElseChanged(before);
  });

  it('dispensar a partir da porta: a vista passa a null e nada mais muda', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    catalogTables();
    const { result } = renderHook(() => useCup());
    await waitFor(() => expect(result.current?.door?.kind).toBe('convite'));
    const before = nonCupSnapshot();
    await act(async () => { await useAppStore.getState().dismissCupEdition(F.CASCAIS_34.id); });
    expect(result.current).toBeNull();
    expectNothingElseChanged(before);
  });

  it('buildCupView: sem leitura pronta, null', () => {
    expect(buildCupView({ cup: CUP_EMPTY, profile: PROFILE, raceEvents: [], runs: [], today: '2027-01-11' })).toBeNull();
    expect(buildCupView({ cup: null })).toBeNull();
  });
});

describe('useCup — convite', () => {
  it('edição aberta na área, não inscrito: a porta de convite com o calendário resumido', async () => {
    net.tables.cup_editions = ok([{ ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION }]);
    catalogTables();
    const { result } = renderHook(() => useTaca());
    await waitFor(() => expect(result.current?.catalogReady).toBe(true));
    const v = result.current;
    expect(v.edition.id).toBe(F.CASCAIS_34.id);
    expect(v.competition.short_name).toBe('Troféu de Cascais');
    expect(v.enrollment).toBeNull();
    expect(v.rejoin).toBe(false);
    expect(v.kind).toBeNull();
    expect(v.door.kind).toBe('convite');
    // 6 jornadas, uma cancelada → 5; datas da 1.ª à última com data.
    expect(v.door.span).toEqual({ count: 5, from: '2026-12-06', to: '2027-02-21' });
    expect(v.door.nextRound.id).toBe('r-c3');
    expect(v.attendance).toBeNull();
    expect(v.rounds.every((r) => r.participation === null && r.suggestion === null)).toBe(true);
    expect(v.profileMissing).toEqual({ gender: false, birthDate: false });
  });

  it('quem saiu volta a ver o convite, marcado como regresso', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    net.tables.cup_enrollments = ok([{ id: 'e0', user_id: USER, edition_id: F.CASCAIS_34.id, status: 'saiu', season_goal: 'premio' }]);
    catalogTables();
    const { result } = renderHook(() => useCup());
    await waitFor(() => expect(result.current?.door?.kind).toBe('convite'));
    expect(result.current.rejoin).toBe(true);
    expect(result.current.enrollment).toBeNull();
  });
});

describe('useCup — inscrito', () => {
  const ENR = { id: 'enr1', user_id: USER, edition_id: F.CASCAIS_34.id, team_id: 't-naza', team_other: null, is_federated: false, season_goal: 'premio', status: 'ativa' };

  it('jornadas com escalão, percurso, decisão e proposta; contador e tipo de inscrição', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    net.tables.cup_enrollments = ok([ENR]);
    net.tables.cup_participations = ok([{ id: 'p3', enrollment_id: 'enr1', round_id: 'r-c3', decision: 'vou', decision_source: 'atleta' }]);
    catalogTables();
    // Já correu a 1.ª (o dia fixo é 11/1/2027) e tem a prova da 3.ª criada.
    useAppStore.setState({ raceEvents: [
      MEIA,
      { id: 'x1', date: '2026-12-06', cup_round_id: 'r-c1', status: 'concluida', race_priority: 'b' },
      { id: 'x3', date: '2027-01-24', cup_round_id: 'r-c3', status: 'agendada', race_priority: 'b' },
    ] });
    const { result } = renderHook(() => useCup());
    await waitFor(() => expect(result.current?.catalogReady).toBe(true));
    const v = result.current;
    expect(v.door.kind).toBe('inscrito');
    expect(v.enrollment.id).toBe('enr1');
    expect(v.kind).toBe('clube_por_confirmar');
    const byId = Object.fromEntries(v.rounds.map((r) => [r.id, r]));
    // Nasceu a 24/1/1982: a 10/1 tem 44 (M35, longo), a 24/1 faz 45 (M45).
    expect(byId['r-c2'].category.code).toBe('M35');
    expect(byId['r-c2'].course.distance_m).toBe(8000);
    expect(byId['r-c3'].category.code).toBe('M45');
    expect(byId['r-c3'].course.distance_m).toBe(7400);
    expect(byId['r-c3'].participation.decision).toBe('vou');
    expect(byId['r-c3'].race.id).toBe('x3');
    // A 4.ª é no dia da Meia (principal): a proposta é "não vou", com o motivo.
    expect(byId['r-c4'].suggestion).toMatchObject({ decision: 'nao_vou', reason: 'principal' });
    expect(byId['r-c4'].suggestion.principal.name).toBe('Meia de Lisboa');
    expect(byId['r-c5'].suggestion.decision).toBe('vou');
    // A próxima é a 3.ª (a 2.ª foi ontem).
    expect(v.nextRound.id).toBe('r-c3');
    expect(v.category.code).toBe('M45');
    // 5 que contam → ⌈3,5⌉ = 4; feita 1; a 2.ª passou sem prova; faltam 3 de 3 pela frente.
    expect(v.attendance).toMatchObject({ total: 5, required: 4, done: 1, ahead: 3, missing: 3, canMiss: 0, rounding: 'a_confirmar' });
    expect(v.showCounter).toBe(true);
  });

  it('sem objetivo prémio, o contador não se mostra', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    net.tables.cup_enrollments = ok([{ ...ENR, season_goal: 'participar' }]);
    catalogTables();
    const { result } = renderHook(() => useCup());
    await waitFor(() => expect(result.current?.catalogReady).toBe(true));
    expect(result.current.showCounter).toBe(false);
    expect(result.current.rounds.find((r) => r.id === 'r-c3').suggestion.decision).toBeNull();
  });

  it('a inscrição ativa mantém a vista mesmo longe e com dispensa antiga', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    net.tables.cup_enrollments = ok([ENR]);
    net.tables.cup_edition_dismissals = ok([{ edition_id: F.CASCAIS_34.id }]);
    catalogTables();
    useAppStore.setState({ profile: { ...PROFILE, training_lat: 41.1496, training_lon: -8.6109 } });
    const { result } = renderHook(() => useCup());
    await waitFor(() => expect(result.current?.door?.kind).toBe('inscrito'));
  });
});

/* useCupForHome — a competição para o mapa da época no Início (Fase 2). A
   regra é a da spec §5: a quem não está inscrito, o Início não lê nenhuma
   tabela cup_*. Só lê com indício (a pista local, ou uma prova de jornada por
   correr) e só devolve alguma coisa com inscrição ativa. */
describe('useCupForHome', () => {
  const ENR = { id: 'enr1', user_id: USER, edition_id: F.CASCAIS_34.id, team_id: 't-naza', team_other: null, is_federated: false, season_goal: 'premio', status: 'ativa' };
  const HINT = cupEnrolledHintKey(USER);

  beforeEach(() => window.localStorage.clear());

  it('persona I (sem pista, sem provas de jornada): null e zero leituras — mesmo com uma edição aberta na área', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    catalogTables();
    const before = nonCupSnapshot();
    const { result } = renderHook(() => useCupForHome());
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBeNull();
    expect(net.calls).toEqual([]);
    expect(useAppStore.getState().cup).toBe(CUP_EMPTY);
    expectNothingElseChanged(before);
  });

  it('uma prova de jornada já corrida não é indício', async () => {
    useAppStore.setState({ raceEvents: [MEIA, { id: 'x1', date: '2026-12-06', cup_round_id: 'r-c1', status: 'concluida', race_priority: 'b' }] });
    const { result } = renderHook(() => useCupForHome());
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBeNull();
    expect(net.calls).toEqual([]);
  });

  it('com a pista: lê e devolve a vista da inscrição, com o catálogo', async () => {
    window.localStorage.setItem(HINT, '1');
    net.tables.cup_editions = ok([{ ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION }]);
    net.tables.cup_enrollments = ok([ENR]);
    catalogTables();
    const { result } = renderHook(() => useCupForHome());
    await waitFor(() => expect(result.current?.catalogReady).toBe(true));
    expect(result.current.enrollment.id).toBe('enr1');
    expect(result.current.competition.short_name).toBe('Troféu de Cascais');
    expect(net.calls).toContain('cup_enrollments');
    expect(net.calls).toContain('cup_rounds');
  });

  it('com uma prova de jornada por correr (inscrito noutro dispositivo): lê', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    net.tables.cup_enrollments = ok([ENR]);
    catalogTables();
    useAppStore.setState({ raceEvents: [MEIA, { id: 'x3', date: '2027-01-24', cup_round_id: 'r-c3', status: 'agendada', race_priority: 'b' }] });
    const { result } = renderHook(() => useCupForHome());
    await waitFor(() => expect(result.current?.enrollment?.id).toBe('enr1'));
    // E a leitura base deixa a pista posta, para a próxima vez.
    expect(window.localStorage.getItem(HINT)).toBe('1');
  });

  it('pista velha de quem já saiu: uma leitura base, null, a pista cai — e o catálogo do convite não se lê', async () => {
    window.localStorage.setItem(HINT, '1');
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    net.tables.cup_enrollments = ok([{ ...ENR, status: 'saiu' }]);
    catalogTables();
    const { result } = renderHook(() => useCupForHome());
    await settle(result);
    expect(result.current).toBeNull();
    expect(net.calls.sort()).toEqual(['cup_edition_dismissals', 'cup_editions', 'cup_enrollments']);
    expect(window.localStorage.getItem(HINT)).toBeNull();
  });

  it('a competição já em memória (o ecrã de Provas leu-a): a vista monta-se sem ler nada', async () => {
    useAppStore.setState({ cup: {
      ...CUP_EMPTY, status: 'ready', userId: USER,
      editions: [{ ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION }],
      enrollments: [ENR],
      catalog: { [F.CASCAIS_34.id]: { status: 'ready', rounds: F.CASCAIS_ROUNDS, courses: F.CASCAIS_COURSES, overrides: F.CASCAIS_OVERRIDES, categories: F.CASCAIS_CATEGORIES, teams: F.CASCAIS_TEAMS } },
    } });
    const { result } = renderHook(() => useCupForHome());
    expect(result.current?.enrollment?.id).toBe('enr1');
    await act(async () => { await Promise.resolve(); });
    expect(net.calls).toEqual([]);
  });

  it('em memória, não inscrito (a porta de convite): null, e o catálogo do convite não se pede', async () => {
    useAppStore.setState({ cup: {
      ...CUP_EMPTY, status: 'ready', userId: USER,
      editions: [{ ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION }],
    } });
    const { result } = renderHook(() => useCupForHome());
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBeNull();
    expect(net.calls).toEqual([]);
  });
});

/* ── Fase 3 (2026-09-27): os campos novos da vista e os hooks do hub e da
   lista. Nada do que já existia muda de nome nem de valor (os testes acima
   continuam iguais). */
describe('buildCupView — os campos da Fase 3', () => {
  const ENR = { id: 'enr1', user_id: USER, edition_id: F.CASCAIS_34.id, team_id: 't-naza', team_other: null, is_federated: false, season_goal: 'premio', status: 'ativa' };
  const ROUNDS = F.CASCAIS_ROUNDS.map((r) => (r.id === 'r-c3' ? { ...r, previous_date: '2027-01-17' } : r));
  const CATALOG = { status: 'ready', rounds: ROUNDS, courses: F.CASCAIS_COURSES, overrides: F.CASCAIS_OVERRIDES, categories: F.CASCAIS_CATEGORIES, teams: F.CASCAIS_TEAMS };
  const RACES = [
    MEIA,
    { id: 'x1', date: '2026-12-06', cup_round_id: 'r-c1', status: 'concluida', race_priority: 'b', distance_km: 7 },
    { id: 'x2', date: '2027-01-10', cup_round_id: 'r-c2', status: 'agendada', race_priority: 'b', distance_km: 8 },
    { id: 'x3', date: '2027-01-24', cup_round_id: 'r-c3', status: 'agendada', race_priority: 'b', distance_km: 7.4 },
  ];
  const cupState = (extra = {}) => ({
    ...CUP_EMPTY, status: 'ready', userId: USER,
    editions: [{ ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION }],
    enrollments: [ENR],
    participations: [
      { id: 'p2', enrollment_id: 'enr1', round_id: 'r-c2', decision: 'vou' },
      { id: 'p3', enrollment_id: 'enr1', round_id: 'r-c3', decision: 'vou', intent: 'controlar', intent_source: 'atleta' },
    ],
    catalog: { [F.CASCAIS_34.id]: CATALOG },
    results: {
      status: 'ready', enrollmentId: 'enr1', teamId: 't-naza',
      rows: [{ round_id: 'r-c1', position: 41, category_code: 'M35', category_position: 12, points: 5, official_time_s: 1900, match_status: 'confirmada' }],
      teamRows: [{ round_id: 'r-c1', position: 6, points: 412 }],
    },
    ...extra,
  });
  const RUNS = [{ id: 'run-x1', race_id: 'x1', date: '2026-12-06', distance_km: 7, duration_seconds: 1900, details: { age_group_position: 11 } }];
  const view = () => buildCupView({ cup: cupState(), profile: PROFILE, raceEvents: RACES, runs: RUNS, today: '2027-01-11' });

  it('nomes, rótulos, progresso e contagens', () => {
    const v = view();
    expect(v).toMatchObject({
      shortName: 'Troféu de Cascais',
      title: '34.º Troféu de Atletismo de Cascais',
      roundLabel: 'Jornada',
      roundInitial: 'J',
      today: '2027-01-11',
      catalogStatus: 'ready',
      // 5 que contam (a 6.ª foi cancelada); feita a 1.ª.
      progress: { done: 1, total: 5 },
      // Por correr: a 3.ª, a 4.ª e a 5.ª (sem data).
      aheadCount: 3,
      // Futuras COM data e sem decisão: só a 4.ª.
      undecidedCount: 1,
    });
    expect(v.courses).toBe(F.CASCAIS_COURSES);
    expect(v.overrides).toBe(F.CASCAIS_OVERRIDES);
  });

  it('a classificação: a linha do próprio e a coletiva do clube, por jornada', () => {
    const v = view();
    expect(v.results.status).toBe('ready');
    expect(Object.keys(v.results.byRound)).toEqual(['r-c1']);
    expect(v.results.teamByRound['r-c1']).toEqual({ round_id: 'r-c1', position: 6, points: 412 });
    expect(v.results.summary).toEqual({ count: 1, points: 5 });
    const r1 = v.rounds.find((r) => r.id === 'r-c1');
    expect(r1.result.category_position).toBe(12);
    expect(r1.teamResult.points).toBe(412);
    // Sem pontos em nenhuma linha: null (não 0).
    const semPontos = buildCupView({ cup: cupState({ results: { status: 'ready', enrollmentId: 'enr1', rows: [{ round_id: 'r-c1', position: 41, match_status: 'confirmada' }], teamRows: [] } }), profile: PROFILE, raceEvents: RACES, runs: RUNS, today: '2027-01-11' });
    expect(semPontos.results.summary).toEqual({ count: 1, points: null });
    // A classificação de outra inscrição (ou de ninguém) não entra; nem a coletiva sem clube da lista.
    const outra = buildCupView({ cup: cupState({ results: { ...cupState().results, enrollmentId: 'enr-velha' } }), profile: PROFILE, raceEvents: RACES, runs: RUNS, today: '2027-01-11' });
    expect(outra.results).toMatchObject({ status: 'idle', byRound: {}, teamByRound: {}, summary: { count: 0, points: null } });
    const semClube = buildCupView({ cup: cupState({ enrollments: [{ ...ENR, team_id: null, team_other: 'Os Amigos' }] }), profile: PROFILE, raceEvents: RACES, runs: RUNS, today: '2027-01-11' });
    expect(semClube.results.teamByRound).toEqual({});
    // Mudou de clube e a coletiva ainda é a lida para o antigo: não passa
    // para o novo (a linha do próprio fica — é da inscrição, não do clube).
    const mudouDeClube = buildCupView({ cup: cupState({ enrollments: [{ ...ENR, team_id: 't-ccd' }] }), profile: PROFILE, raceEvents: RACES, runs: RUNS, today: '2027-01-11' });
    expect(mudouDeClube.results.teamByRound).toEqual({});
    expect(mudouDeClube.rounds.find((r) => r.id === 'r-c1').teamResult).toBeNull();
    expect(mudouDeClube.results.summary).toEqual({ count: 1, points: 5 });
  });

  it('cada jornada: papel (o mesmo cálculo da Carol), intenção, feita, corrida, chip, mudança de data e estado', () => {
    const v = view();
    const roles = cupRoundRoles({
      edition: v.edition, rounds: [...ROUNDS].sort((a, b) => a.round_no - b.round_no), participations: v.participations,
      categories: F.CASCAIS_CATEGORIES, courses: F.CASCAIS_COURSES, overrides: F.CASCAIS_OVERRIDES,
      races: RACES, runs: RUNS, profile: PROFILE, seasonGoal: 'premio', todayISO: '2027-01-11',
    });
    expect(v.rounds.map((r) => r.role)).toEqual(roles);
    const by = Object.fromEntries(v.rounds.map((r) => [r.id, r]));
    expect(by['r-c1']).toMatchObject({ done: true, chip: 'J1', dateChange: null });
    expect(by['r-c1'].run.id).toBe('run-x1');
    expect(by['r-c1'].status).toMatchObject({ key: 'feita', label: 'Feita', detail: '12.º M35' });
    expect(by['r-c2']).toMatchObject({ done: false, run: null });
    expect(by['r-c2'].status).toMatchObject({ key: 'por_registar', actions: ['registar', 'nao_fui'] });
    // A escolha dele manda; a fonte diz-se.
    expect(by['r-c3']).toMatchObject({ intent: 'controlar', intentSource: 'atleta', chip: 'J3' });
    expect(by['r-c3'].dateChange).toEqual({ from: '2027-01-17', to: '2027-01-24', label: 'mudou de 17 para 24 jan' });
    expect(by['r-c3'].status).toMatchObject({ key: 'proxima', detail: 'Vou · controlar · daqui a 13 dias' });
    // Sem escolha: o papel proposto, como 'sugerida'. A 4.ª é no dia da Meia: saltar.
    expect(by['r-c4']).toMatchObject({ intent: 'saltar', intentSource: 'sugerida' });
    expect(by['r-c4'].status).toMatchObject({ key: 'por_decidir', detail: 'é o dia da tua Meia de Lisboa (principal)' });
    expect(by['r-c5']).toMatchObject({ intent: null, intentSource: null });
    expect(by['r-c6'].status.key).toBe('cancelada');
    // nextRound é a jornada enriquecida (a mesma de `rounds`).
    expect(v.nextRound).toBe(by['r-c3']);
    expect(v.door.nextRound).toBe(by['r-c3']);
  });

  it('sem inscrição (o convite): sem papéis, sem classificação e sem jornadas por decidir', () => {
    const v = buildCupView({ cup: cupState({ enrollments: [] }), profile: PROFILE, raceEvents: RACES, runs: RUNS, today: '2027-01-11' });
    expect(v.door.kind).toBe('convite');
    expect(v.rounds.every((r) => r.role === null)).toBe(true);
    expect(v.undecidedCount).toBe(0);
    expect(v.results).toMatchObject({ status: 'idle', summary: { count: 0, points: null } });
  });

  it('com o catálogo por ler: os campos novos existem, vazios', () => {
    const v = buildCupView({ cup: cupState({ catalog: {} }), profile: PROFILE, raceEvents: RACES, runs: RUNS, today: '2027-01-11' });
    expect(v).toMatchObject({ catalogReady: false, catalogStatus: 'idle', rounds: [], nextRound: null, progress: { done: 0, total: 0 }, aheadCount: 0, undecidedCount: 0 });
  });
});

describe('useCupForRace — o bloco Troféu do hub', () => {
  const ENR = { id: 'enr1', user_id: USER, edition_id: F.CASCAIS_34.id, team_id: 't-naza', team_other: null, is_federated: false, season_goal: 'premio', status: 'ativa' };
  beforeEach(() => window.localStorage.clear());

  it('uma prova sem cup_round_id: null e ZERO leituras (mesmo com uma edição aberta na área)', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    const before = nonCupSnapshot();
    const { result } = renderHook(() => useCupForRace(MEIA));
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toBeNull();
    expect(net.calls).toEqual([]);
    expect(useAppStore.getState().cup).toBe(CUP_EMPTY);
    expectNothingElseChanged(before);
    const semProva = renderHook(() => useCupForRace(null));
    expect(semProva.result.current).toBeNull();
    expect(net.calls).toEqual([]);
  });

  it('uma prova de jornada, inscrito: a vista e a jornada dessa prova', async () => {
    net.tables.cup_editions = ok([{ ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION }]);
    net.tables.cup_enrollments = ok([ENR]);
    catalogTables();
    const X3 = { id: 'x3', date: '2027-01-24', cup_round_id: 'r-c3', status: 'agendada', race_priority: 'b' };
    useAppStore.setState({ raceEvents: [MEIA, X3] });
    const { result } = renderHook(() => useCupForRace(X3));
    await waitFor(() => expect(result.current?.round?.id).toBe('r-c3'));
    expect(result.current.view.enrollment.id).toBe('enr1');
    expect(result.current.round.race.id).toBe('x3');
    expect(result.current.round.chip).toBe('J3');
  });

  it('uma prova de jornada de quem já saiu: uma leitura base, e null', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    net.tables.cup_enrollments = ok([{ ...ENR, status: 'saiu' }]);
    const velha = { id: 'x1', date: '2026-12-06', cup_round_id: 'r-c1', status: 'concluida', race_priority: 'b' };
    const { result } = renderHook(() => useCupForRace(velha));
    await settle(result);
    expect(result.current).toBeNull();
    expect(net.calls).not.toContain('cup_rounds');
  });
});

describe('useCupListing — a lista de Provas e o "Para onde vou"', () => {
  const ENR = { id: 'enr1', user_id: USER, edition_id: F.CASCAIS_34.id, team_id: 't-naza', team_other: null, is_federated: false, season_goal: 'premio', status: 'ativa' };
  const HINT = cupEnrolledHintKey(USER);
  beforeEach(() => window.localStorage.clear());

  it('sem vista nem pista: listing null e zero leituras (groupRaces fica como era)', async () => {
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    const { result } = renderHook(() => useCupListing());
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toEqual({ view: null, listing: null });
    expect(net.calls).toEqual([]);
  });

  it('com a pista: a ler, as jornadas já contam como fixas; lida a vista, o listing é o dela', async () => {
    window.localStorage.setItem(HINT, '1');
    net.tables.cup_editions = ok([{ ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION }]);
    net.tables.cup_enrollments = ok([ENR]);
    catalogTables();
    const X3 = { id: 'x3', date: '2027-01-24', cup_round_id: 'r-c3', status: 'agendada', race_priority: 'b' };
    const { result } = renderHook(() => useCupListing());
    expect(result.current.view).toBeNull();
    expect(result.current.listing.loading).toBe(true);
    expect(result.current.listing.isFixed(X3)).toBe(true);
    expect(result.current.listing.tag(X3)).toBeNull();
    await waitFor(() => expect(result.current.view?.catalogReady).toBe(true));
    expect(result.current.listing.loading).toBe(false);
    expect(result.current.listing.tag(X3)).toMatchObject({ roundId: 'r-c3', chip: 'J3' });
    expect(result.current.listing.isFixed({ ...X3, race_priority: 'a' })).toBe(false);
  });

  it('pista velha de quem saiu: lida a base, o listing volta a null', async () => {
    window.localStorage.setItem(HINT, '1');
    net.tables.cup_editions = ok([F.CASCAIS_34_ABERTA]);
    net.tables.cup_enrollments = ok([{ ...ENR, status: 'saiu' }]);
    const { result } = renderHook(() => useCupListing());
    await waitFor(() => expect(useAppStore.getState().cup.status).toBe('ready'));
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toEqual({ view: null, listing: null });
  });
});

/* ── Fase 4 (2026-09-27): a divisão da vista (aviso [f]) e a correspondência
   com a classificação oficial (specs/trofeu.md §7). ─────────────────────── */

describe('buildCupView — a divisão não muda nada (aviso [f])', () => {
  // As vistas da Fase 3 guardadas ANTES de a função se dividir (7 estados:
  // inscrito em janeiro e em março, convite, quem saiu, catálogo por ler,
  // clube fora da lista, e o circuito fictício). Os campos novos da Fase 4
  // tiram-se antes de comparar — o resto tem de ser igual, valor a valor.
  const golden = GOLDEN_FASE3;
  const semFase4 = (view) => {
    if (!view) return view;
    const tira = (r) => (r ? (({ proposal, matchIssue, ...rest }) => rest)(r) : r);
    const { pending, standing, m2, ...results } = view.results;
    return {
      ...view,
      results,
      rounds: view.rounds.map(tira),
      nextRound: tira(view.nextRound),
      door: view.door ? { ...view.door, nextRound: tira(view.door.nextRound) } : null,
    };
  };

  for (const s of golden.scenarios) {
    it(`igual à da Fase 3 — ${s.name}`, () => {
      const view = buildCupView(s.input);
      expect(JSON.parse(JSON.stringify(semFase4(view)))).toEqual(s.view);
      // A composição dos quatro passos é a própria buildCupView.
      const ctx = cupContextOf(s.input);
      const res = cupResultsOf(ctx, s.input.cup);
      expect(cupViewOf(ctx, res, cupRoundsOf(ctx, res, s.input), s.input)).toEqual(view);
    });
  }

  it('sem campos novos a aparecer onde não há inscrição', () => {
    const convite = golden.scenarios.find((s) => s.name === 'convite');
    const v = buildCupView(convite.input);
    expect(v.results).toMatchObject({ pending: [], standing: null, m2: false });
    expect(v.rounds.every((r) => r.proposal === null && r.matchIssue === null)).toBe(true);
  });
});

describe('selectCupView — o seletor partilhado', () => {
  const input = () => {
    return structuredClone(GOLDEN_FASE3.scenarios[0].input);
  };

  it('as mesmas cinco entradas devolvem o MESMO objeto; uma que mude, um novo', () => {
    const { cup, profile, raceEvents, runs, today } = input();
    const a = selectCupView(cup, profile, raceEvents, runs, today);
    expect(selectCupView(cup, profile, raceEvents, runs, today)).toBe(a);
    expect(a).toEqual(buildCupView({ cup, profile, raceEvents, runs, today }));
    const b = selectCupView({ ...cup }, profile, raceEvents, runs, today);
    expect(b).not.toBe(a);
    expect(b).toEqual(a);
    expect(selectCupView({ ...cup }, profile, [...raceEvents], runs, today)).not.toBe(b);
    const c = selectCupView(cup, profile, raceEvents, runs, today);
    expect(selectCupView(cup, profile, raceEvents, runs, '2027-01-12')).not.toBe(c);
  });

  it('com Provas, o Início e o hub montados, uma mudança do store calcula a vista uma vez', async () => {
    const ENR = { id: 'enr1', user_id: USER, edition_id: F.CASCAIS_34.id, team_id: 't-naza', team_other: null, is_federated: false, season_goal: 'premio', status: 'ativa' };
    const X3 = { id: 'x3', date: '2027-01-24', cup_round_id: 'r-c3', status: 'agendada', race_priority: 'b' };
    const cup = {
      ...CUP_EMPTY, status: 'ready', userId: USER,
      editions: [{ ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION }],
      enrollments: [ENR],
      catalog: { [F.CASCAIS_34.id]: { status: 'ready', rounds: F.CASCAIS_ROUNDS, courses: F.CASCAIS_COURSES, overrides: F.CASCAIS_OVERRIDES, categories: F.CASCAIS_CATEGORIES, teams: F.CASCAIS_TEAMS } },
    };
    useAppStore.setState({ cup, raceEvents: [MEIA, X3] });
    const { result } = renderHook(() => ({ provas: useCup(), inicio: useCupForHome(), hub: useCupForRace(X3) }));
    expect(result.current.provas).not.toBeNull();
    expect(result.current.inicio).toBe(result.current.provas);
    expect(result.current.hub.view).toBe(result.current.provas);
    const antes = result.current.provas;
    act(() => { useAppStore.setState({ raceEvents: [MEIA, { ...X3, status: 'concluida' }] }); });
    const depois = result.current.provas;
    expect(depois).not.toBe(antes);
    expect(result.current.inicio).toBe(depois);
    expect(result.current.hub.view).toBe(depois);
    expect(net.calls).toEqual([]);
  });
});

describe('buildCupView — a correspondência (Fase 4)', () => {
  const ENR = { id: 'enr1', user_id: USER, edition_id: F.CASCAIS_34.id, team_id: 't-naza', team_other: null, is_federated: false, season_goal: 'premio', status: 'ativa', bib: '412' };
  const RACES = [
    MEIA,
    { id: 'x1', date: '2026-12-06', cup_round_id: 'r-c1', status: 'concluida', race_priority: 'b', distance_km: 7 },
    { id: 'x2', date: '2027-01-10', cup_round_id: 'r-c2', status: 'agendada', race_priority: 'b', distance_km: 8 },
  ];
  const linha = (roundId, status, extra = {}) => ({ round_id: roundId, position: 41, category_code: 'M35', category_position: 12, points: 5, official_time_s: 2172, match_status: status, points_source: 'calculado', ...extra });
  const vista = ({ rows = [], publication = {}, standing = null, m2 = true, syncMode = 'publicar', enrollment = ENR, participations = [{ id: 'p2', enrollment_id: 'enr1', round_id: 'r-c2', decision: 'vou' }], status = 'ready' } = {}) => buildCupView({
    cup: {
      ...CUP_EMPTY, status: 'ready', userId: USER,
      editions: [{ ...F.CASCAIS_34_ABERTA, sync_mode: syncMode, competition: F.CASCAIS_COMPETITION }],
      enrollments: [enrollment],
      participations,
      catalog: { [F.CASCAIS_34.id]: { status: 'ready', rounds: F.CASCAIS_ROUNDS, courses: F.CASCAIS_COURSES, overrides: F.CASCAIS_OVERRIDES, categories: F.CASCAIS_CATEGORIES, teams: F.CASCAIS_TEAMS } },
      results: { status, enrollmentId: 'enr1', teamId: 't-naza', rows, teamRows: [], standing, publication, m2 },
    },
    profile: PROFILE, raceEvents: RACES, runs: [], today: '2027-01-11',
  });
  const J = (v, id) => v.rounds.find((r) => r.id === id);

  it('proposta e perdida com dados → `proposal` e `pending` pela data; a confirmada é o resultado', () => {
    const v = vista({ rows: [linha('r-c2', 'proposta'), linha('r-c1', 'perdida', { position: 40 }), linha('r-c3', 'confirmada')] });
    expect(v.results.pending.map((r) => r.id)).toEqual(['r-c1', 'r-c2']);
    expect(J(v, 'r-c2').proposal).toMatchObject({ match_status: 'proposta' });
    expect(J(v, 'r-c2').result).toBeNull();
    expect(J(v, 'r-c1').proposal).toMatchObject({ match_status: 'perdida', position: 40 });
    expect(J(v, 'r-c3').result).toMatchObject({ match_status: 'confirmada' });
    expect(J(v, 'r-c3').proposal).toBeNull();
    // Só as confirmadas contam no resumo.
    expect(v.results.summary).toEqual({ count: 1, points: 5 });
  });

  it('uma perdida SEM dados não é proposta: é a frase de falha', () => {
    const v = vista({ rows: [{ round_id: 'r-c2', position: null, official_time_s: null, match_status: 'perdida' }], publication: { 'r-c2': '2027-01-10T18:37:00Z' } });
    expect(J(v, 'r-c2').proposal).toBeNull();
    expect(v.results.pending).toEqual([]);
    expect(J(v, 'r-c2').matchIssue).toBe('rever_dorsal');
  });

  it('matchIssue: as quatro condições (publicar, classificação saída, feita ou "Vou", sem linha)', () => {
    const saiu = { 'r-c1': '2026-12-06T18:00:00Z', 'r-c2': '2027-01-10T18:37:00Z' };
    const v = vista({ publication: saiu });
    // J1 feita (prova concluída), J2 "Vou" já passada: as duas falham.
    expect(J(v, 'r-c1').matchIssue).toBe('rever_dorsal');
    expect(J(v, 'r-c2').matchIssue).toBe('rever_dorsal');
    // Sem dorsal: a outra frase.
    expect(J(vista({ publication: saiu, enrollment: { ...ENR, bib: null } }), 'r-c2').matchIssue).toBe('sem_dorsal');
    expect(J(vista({ publication: saiu, enrollment: { ...ENR, bib: '  ' } }), 'r-c2').matchIssue).toBe('sem_dorsal');
    // Com linha (confirmada ou por confirmar): nada.
    expect(J(vista({ publication: saiu, rows: [linha('r-c2', 'confirmada')] }), 'r-c2').matchIssue).toBeNull();
    expect(J(vista({ publication: saiu, rows: [linha('r-c2', 'proposta')] }), 'r-c2').matchIssue).toBeNull();
    // Classificação por sair: nada.
    expect(J(vista({ publication: {} }), 'r-c2').matchIssue).toBeNull();
    // Nem feita nem "Vou" (disse "Não sei"): nada.
    expect(J(vista({ publication: saiu, participations: [{ id: 'p2', enrollment_id: 'enr1', round_id: 'r-c2', decision: 'nao_sei' }] }), 'r-c2').matchIssue).toBeNull();
    // Observar, desligado, sem M2, ou a leitura falhou: sempre null.
    for (const extra of [{ syncMode: 'observar' }, { syncMode: 'desligado' }, { m2: false }, { status: 'erro' }]) {
      const w = vista({ publication: saiu, ...extra });
      expect(w.rounds.map((r) => r.matchIssue).filter(Boolean)).toEqual([]);
    }
  });

  it('a geral oficial: o total dela manda nos pontos do resumo', () => {
    const standing = { category_code: 'M35', category_rank: 12, total_points: 43, rounds_scored: 4, source_checked_at: '2027-01-24T18:00:00Z' };
    const v = vista({ rows: [linha('r-c1', 'confirmada')], standing });
    expect(v.results.standing).toEqual(standing);
    expect(v.results.summary).toEqual({ count: 1, points: 43 });
    expect(vista({ rows: [linha('r-c1', 'confirmada')] }).results.summary).toEqual({ count: 1, points: 5 });
  });

  it('a classificação de outra inscrição não entra, nem as propostas dela', () => {
    const v = buildCupView({
      cup: {
        ...CUP_EMPTY, status: 'ready', userId: USER,
        editions: [{ ...F.CASCAIS_34_ABERTA, sync_mode: 'publicar', competition: F.CASCAIS_COMPETITION }],
        enrollments: [ENR],
        catalog: { [F.CASCAIS_34.id]: { status: 'ready', rounds: F.CASCAIS_ROUNDS, courses: F.CASCAIS_COURSES, overrides: F.CASCAIS_OVERRIDES, categories: F.CASCAIS_CATEGORIES, teams: F.CASCAIS_TEAMS } },
        results: { status: 'ready', enrollmentId: 'enr-velha', rows: [linha('r-c2', 'proposta')], teamRows: [], standing: { total_points: 99 }, publication: { 'r-c2': 'x' }, m2: true },
      },
      profile: PROFILE, raceEvents: RACES, runs: [], today: '2027-01-11',
    });
    expect(v.results).toMatchObject({ status: 'idle', pending: [], standing: null, m2: false, summary: { count: 0, points: null } });
    expect(v.rounds.every((r) => r.proposal === null && r.matchIssue === null)).toBe(true);
  });
});
