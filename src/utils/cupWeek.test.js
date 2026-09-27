import { describe, it, expect, vi } from 'vitest';

/* A semana da jornada (specs/trofeu.md §4.4, Fase 3, 2026-09-27): a linha do
   cartão diário ("Domingo, Corrida CCD, 7,4 km às 9h30. Pelas contas:
   controlar, 36:40."), a previsão — que NUNCA se grava (§2.6) — e os avisos
   de prazo de inscrição. */

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(() => { throw new Error('sem rede nos testes'); }), rpc: vi.fn() },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const { cupWeekLine, cupEntryNotices, cupRoundPrediction } = await import('./cupWeek');
const { buildCupView } = await import('./useCup');
const { useAppStore } = await import('../store');
const { getRacePrediction } = await import('./biEngine');
const F = await import('@formulas/cup.fixtures.ts');

const USER = 'u-semana';
// Nasceu a 24/1/1982: na J3 (24/01/2027) faz 45 — M45, percurso longo (7,4 km às 9h30).
const PROFILE = { id: USER, gender: 'M', birth_date: '1982-01-24', experience_level: 'medio' };
const ENR = { id: 'enr1', user_id: USER, edition_id: F.CASCAIS_34.id, team_id: 't-naza', season_goal: 'premio', status: 'ativa', entry_by: 'atleta', bib: '4321' };
const X3 = { id: 'x3', name: 'Corrida CCD Cascais', date: '2027-01-24', distance_km: 7.4, race_type: 'estrada', race_priority: 'b', status: 'agendada', cup_round_id: 'r-c3' };
const RUNS = [
  { id: 'run1', date: '2027-01-10', distance_km: 10, duration_seconds: 2700 },
  { id: 'run2', date: '2027-01-12', distance_km: 6, duration_seconds: 0 }, // sem duração: não conta
];
const ROUNDS = F.CASCAIS_ROUNDS.map((r) => (r.id === 'r-c3' ? { ...r, entry_deadline_at: '2027-01-21T00:00:00+00:00' } : r));

function makeView({ participation = { decision: 'vou' }, enrollment = ENR, edition = {}, races = [X3], today = '2027-01-19' } = {}) {
  const cup = {
    status: 'ready', userId: USER, dismissals: [],
    editions: [{ ...F.CASCAIS_34_ABERTA, ...edition, competition: F.CASCAIS_COMPETITION }],
    enrollments: [enrollment],
    participations: participation ? [{ id: 'p3', enrollment_id: 'enr1', round_id: 'r-c3', ...participation }] : [],
    catalog: { [F.CASCAIS_34.id]: { status: 'ready', rounds: ROUNDS, courses: F.CASCAIS_COURSES, overrides: F.CASCAIS_OVERRIDES, categories: F.CASCAIS_CATEGORIES, teams: F.CASCAIS_TEAMS } },
    results: { status: 'idle', enrollmentId: null, rows: [], teamRows: [] },
  };
  return buildCupView({ cup, profile: PROFILE, raceEvents: races, runs: RUNS, today });
}

const PREVISTO = Math.round(getRacePrediction(X3, PROFILE, [RUNS[0]]).predictedSeconds);

describe('cupRoundPrediction', () => {
  it('o tempo previsto para a distância do percurso, pela mesma função do hub', () => {
    const view = makeView();
    const r3 = view.rounds.find((r) => r.id === 'r-c3');
    const p = cupRoundPrediction(r3, PROFILE, RUNS);
    expect(p.seconds).toBe(PREVISTO);
    expect(p).toEqual({ seconds: 1962, label: '32:42' });
    // Sem prova: a distância do percurso dele (7,4 km).
    const semProva = makeView({ races: [] }).rounds.find((r) => r.id === 'r-c3');
    expect(cupRoundPrediction(semProva, PROFILE, RUNS)).toEqual(p);
    // Sem corridas com tempo, ou sem distância: nada.
    expect(cupRoundPrediction(r3, PROFILE, [RUNS[1]])).toBeNull();
    expect(cupRoundPrediction({ id: 'x', course: null, race: null }, PROFILE, RUNS)).toBeNull();
    expect(cupRoundPrediction(null, PROFILE, RUNS)).toBeNull();
  });

  it('não grava nada: nem no store, nem na prova, nem na participação (§2.6)', () => {
    useAppStore.setState({ session: { user: { id: USER } }, profile: PROFILE, raceEvents: [X3], runs: RUNS });
    const before = useAppStore.getState();
    const snapshot = Object.fromEntries(Object.entries(before).filter(([, v]) => typeof v !== 'function'));
    const view = makeView();
    const r3 = view.rounds.find((r) => r.id === 'r-c3');
    const json = JSON.stringify(r3);
    cupRoundPrediction(r3, PROFILE, RUNS);
    cupWeekLine({ view, today: '2027-01-19', profile: PROFILE, runs: RUNS });
    expect(JSON.stringify(r3)).toBe(json);
    expect(r3.race.target_time).toBeUndefined();
    const after = useAppStore.getState();
    for (const [k, v] of Object.entries(snapshot)) expect(after[k], k).toBe(v);
  });
});

describe('cupWeekLine', () => {
  const line = (today, opts = {}) => cupWeekLine({ view: makeView({ today, ...opts }), today, profile: PROFILE, runs: RUNS, ...(opts.call || {}) });

  it('o texto exato: o dia, a prova, a distância e a hora, o papel e a previsão', () => {
    // Médio, sem principais nem ataques antes: a J3 é para atacar (livre);
    // 10 km em 45:00 → 7,4 km em 32:42 (Riegel, fator 1,06).
    expect(makeView().rounds.find((r) => r.id === 'r-c3').role).toMatchObject({ intent: 'atacar', reason: 'livre' });
    expect(line('2027-01-19')).toEqual({
      roundId: 'r-c3',
      raceId: 'x3',
      lead: 'Domingo, Corrida CCD Cascais, 7,4 km às 9h30. Pelas contas: atacar',
      calc: '32:42',
      text: 'Domingo, Corrida CCD Cascais, 7,4 km às 9h30. Pelas contas: atacar, 32:42.',
    });
  });

  it('com o papel escolhido por ele: "O teu papel"; sem previsão, acaba no papel', () => {
    const own = line('2027-01-19', { participation: { decision: 'vou', intent: 'atacar', intent_source: 'atleta' } });
    expect(own.lead).toBe('Domingo, Corrida CCD Cascais, 7,4 km às 9h30. O teu papel: atacar');
    const semPrev = cupWeekLine({ view: makeView(), today: '2027-01-19', profile: PROFILE, runs: [] });
    expect(semPrev.calc).toBeNull();
    expect(semPrev.text).toBe(`${semPrev.lead}.`);
    // Em trote não leva um tempo de prova ao lado.
    const trote = line('2027-01-19', { participation: { decision: 'vou', intent: 'trote', intent_source: 'atleta' } });
    expect(trote).toMatchObject({ lead: 'Domingo, Corrida CCD Cascais, 7,4 km às 9h30. O teu papel: em trote', calc: null });
  });

  // Revisão da Fase 3, aviso [d]: a D−7 é o mesmo dia da semana de hoje —
  // "Domingo, …" num domingo lia-se como hoje.
  it('a D−7 o dia diz "da próxima semana"; de D−6 a D−2, só o dia', () => {
    expect(line('2027-01-17').lead).toBe('Domingo da próxima semana, Corrida CCD Cascais, 7,4 km às 9h30. Pelas contas: atacar');
    expect(line('2027-01-17').text).toMatch(/^Domingo da próxima semana, Corrida CCD Cascais, 7,4 km às 9h30\. Pelas contas: atacar/);
    expect(line('2027-01-18').lead).toMatch(/^Domingo, Corrida CCD Cascais/);
    expect(line('2027-01-22').lead).toMatch(/^Domingo, Corrida CCD Cascais/);
  });

  it('só de D−7 a D−2 (a véspera e o dia são das linhas que já existem)', () => {
    expect(line('2027-01-16')).toBeNull(); // D−8
    expect(line('2027-01-17')).not.toBeNull(); // D−7
    expect(line('2027-01-22')).not.toBeNull(); // D−2
    expect(line('2027-01-23')).toBeNull(); // D−1
    expect(line('2027-01-24')).toBeNull(); // D0
  });

  it('só com "Vou", data confirmada e a prova no calendário; e não repete uma prova já dita', () => {
    expect(line('2027-01-19', { participation: { decision: 'nao_sei' } })).toBeNull();
    expect(line('2027-01-19', { participation: null })).toBeNull();
    expect(line('2027-01-19', { races: [] })).toBeNull();
    const view = makeView();
    expect(cupWeekLine({ view, today: '2027-01-19', profile: PROFILE, runs: RUNS, skipRaceIds: ['x3'] })).toBeNull();
    expect(cupWeekLine({ view: { ...view, enrollment: null }, today: '2027-01-19', profile: PROFILE, runs: RUNS })).toBeNull();
    expect(cupWeekLine({ view: null, today: '2027-01-19' })).toBeNull();
  });

  it('nunca o dorsal', () => {
    expect(JSON.stringify(line('2027-01-19'))).not.toContain('4321');
  });
});

describe('cupEntryNotices', () => {
  const NOW = '2027-01-17T10:00:00Z';

  it('pela fórmula partilhada: "A inscrição na jornada 3 (…) fecha quarta às 24h."', () => {
    expect(cupEntryNotices({ view: makeView(), now: NOW })).toEqual([{
      roundId: 'r-c3',
      raceId: 'x3',
      text: 'A inscrição na jornada 3 (Corrida CCD Cascais) fecha quarta às 24h.',
      entryUrl: null,
      whenLabel: 'quarta às 24h',
      deadlineAt: '2027-01-21T00:00:00+00:00',
    }]);
    const comLink = cupEntryNotices({ view: makeView({ edition: { entry_url: 'https://example.org/inscricao' } }), now: NOW });
    expect(comLink[0].entryUrl).toBe('https://example.org/inscricao');
  });

  it('nada com "o meu clube", já inscrito, sem "Vou", por época, fora da janela, ou sem inscrição', () => {
    expect(cupEntryNotices({ view: makeView({ enrollment: { ...ENR, entry_by: 'clube' } }), now: NOW })).toEqual([]);
    expect(cupEntryNotices({ view: makeView({ participation: { decision: 'vou', entry_done_at: '2027-01-16T09:00:00Z' } }), now: NOW })).toEqual([]);
    expect(cupEntryNotices({ view: makeView({ participation: { decision: 'nao_sei' } }), now: NOW })).toEqual([]);
    expect(cupEntryNotices({ view: makeView({ edition: { entry_mode: 'epoca' } }), now: NOW })).toEqual([]);
    expect(cupEntryNotices({ view: makeView(), now: '2027-01-10T10:00:00Z' })).toEqual([]);
    expect(cupEntryNotices({ view: null, now: NOW })).toEqual([]);
    expect(JSON.stringify(cupEntryNotices({ view: makeView(), now: NOW }))).not.toContain('4321');
  });
});
