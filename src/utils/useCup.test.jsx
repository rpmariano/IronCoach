import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
const { useCup, useTaca, buildCupView, useCupForHome } = await import('./useCup');
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
