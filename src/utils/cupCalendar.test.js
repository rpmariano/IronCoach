import { describe, it, expect, vi } from 'vitest';

/* A régua comum do calendário do Troféu (specs/trofeu.md §4.3–§4.5, Fase 3,
   2026-09-27): o estado de cada jornada (texto + um de quatro ícones, nunca
   só cor, e uma frase por linha para o leitor de ecrã), os textos pequenos e
   o custo de promover uma jornada a principal, dito antes de gravar. */

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const {
  cupRoundStatus, CUP_STATUS_ICONS, dateChangeLabel, horaLabel, intentLabel, roleReasonLabel,
  diaCurto, dataLonga, diaMes, kmLabel, roundChip, roundDateText, roundPlaceLabel, promotionPreview, cupListingOf,
  nextRoundApart,
} = await import('./cupCalendar');
const { buildCupView } = await import('./useCup');
const F = await import('@formulas/cup.fixtures.ts');

const TODAY = '2027-01-20';
const CTX = { today: TODAY, nextRoundId: 'r3', roundLabel: 'Jornada' };
const MEIA = { id: 'meia', name: 'Meia de Lisboa', date: '2027-02-21', race_priority: 'a', status: 'agendada', cup_round_id: null };

// Uma jornada já enriquecida pela vista (useCup.buildCupView).
const round = (extra = {}) => ({
  id: 'rx', round_no: 4, name: 'GP Monte Real', date: '2027-02-07', date_status: 'confirmada',
  participation: null, race: null, done: false, run: null, result: null, intent: null, role: null, suggestion: null,
  ...extra,
});
const part = (decision, extra = {}) => ({ round_id: 'rx', decision, decision_source: 'atleta', ...extra });
const raceB = (extra = {}) => ({ id: 'race-x', race_priority: 'b', status: 'agendada', cup_round_id: 'rx', ...extra });

describe('cupRoundStatus — a tabela da régua (A.1)', () => {
  const cases = [
    ['cancelada', round({ id: 'r6', round_no: 6, name: 'Légua de Janes', date: '2027-03-14', date_status: 'cancelada', participation: part('vou') }),
      { icon: '✕', label: 'Cancelada', detail: '', color: 'var(--text-4)', actions: [], ariaLabel: 'Jornada 6, Légua de Janes, domingo, 14 de março. Cancelada.' }],
    ['feita', round({ id: 'r2', round_no: 2, name: 'Corta-mato', date: '2027-01-10', done: true, intent: 'controlar', race: raceB({ status: 'concluida' }), result: { category_position: 29, category_code: 'M45', position: 120 } }),
      { icon: '✓', label: 'Feita', detail: 'Controlada · 29.º M45', color: 'var(--ok)', actions: [], ariaLabel: 'Jornada 2, Corta-mato, domingo, 10 de janeiro. Feita: Controlada, 29.º M45.' }],
    ['nao_fui', round({ date: '2027-01-10', participation: part('nao_fui') }),
      { icon: '✕', label: 'Não fui', detail: '', color: 'var(--text-3)', actions: [], ariaLabel: 'Jornada 4, GP Monte Real, domingo, 10 de janeiro. Não fui.' }],
    ['por_registar', round({ date: '2027-01-10', participation: part('vou'), race: raceB() }),
      { icon: '⋯', label: 'Por registar', detail: '', color: 'var(--warn)', actions: ['registar', 'nao_fui'], ariaLabel: 'Jornada 4, GP Monte Real, domingo, 10 de janeiro. Por registar.' }],
    ['passada_nao_vou', round({ date: '2027-01-10', participation: part('nao_vou') }),
      { icon: '✕', label: 'Não vou', detail: '', color: 'var(--text-3)', actions: [] }],
    ['ja_passou', round({ date: '2027-01-10', participation: part('nao_sei') }),
      { icon: '⋯', label: 'Já passou', detail: '', color: 'var(--text-3)', actions: ['registar', 'nao_fui'] }],
    ['por_confirmar', round({ date: '2026-12-06', date_status: 'provavel' }),
      { icon: '⋯', label: 'Data por confirmar', detail: '', color: 'var(--text-4)', actions: [], ariaLabel: 'Jornada 4, GP Monte Real, domingo, 6 de dezembro. Data por confirmar.' }],
    ['proxima', round({ id: 'r3', round_no: 3, name: 'Corrida CCD', date: '2027-01-24', participation: part('vou'), intent: 'controlar' }),
      { icon: '▸', label: 'Próxima', detail: 'Vou · controlar · daqui a 4 dias', color: 'var(--race)', actions: [], ariaLabel: 'Jornada 3, Corrida CCD, domingo, 24 de janeiro. Próxima: Vou, controlar, daqui a 4 dias.' }],
    ['vou', round({ participation: part('vou'), intent: 'atacar' }),
      { icon: '✓', label: 'Vou', detail: 'atacar', color: 'var(--ok)', actions: [], ariaLabel: 'Jornada 4, GP Monte Real, domingo, 7 de fevereiro. Vou: atacar.' }],
    ['nao_vou', round({ participation: part('nao_vou', { intent: 'saltar' }) }),
      { icon: '✕', label: 'Não vou', detail: 'saltar', color: 'var(--danger)', actions: [] }],
    ['nao_sei', round({ participation: part('nao_sei') }),
      { icon: '⋯', label: 'Ainda não sei', detail: '', color: 'var(--text-3)', actions: [], ariaLabel: 'Jornada 4, GP Monte Real, domingo, 7 de fevereiro. Ainda não sei.' }],
    ['por_decidir', round(),
      { icon: '⋯', label: 'Por decidir', detail: '', color: 'var(--text-4)', actions: [], ariaLabel: 'Jornada 4, GP Monte Real, domingo, 7 de fevereiro. Por decidir.' }],
  ];

  it.each(cases)('%s', (key, r, expected) => {
    const s = cupRoundStatus(r, CTX);
    expect(s.key).toBe(key);
    expect(s).toMatchObject(expected);
    // Nunca só cor: sempre um dos quatro ícones e o texto.
    expect(CUP_STATUS_ICONS).toContain(s.icon);
    expect(s.label.length).toBeGreaterThan(0);
    expect(s.ariaLabel).toContain(s.label);
  });

  it('a ordem da régua: cancelada ganha a feita; feita ganha "Não fui"; uma prova por registar ganha "Não vou"', () => {
    expect(cupRoundStatus(round({ date_status: 'cancelada', done: true }), CTX).key).toBe('cancelada');
    expect(cupRoundStatus(round({ date: '2027-01-10', done: true, participation: part('nao_fui') }), CTX).key).toBe('feita');
    expect(cupRoundStatus(round({ date: '2027-01-10', race: raceB(), participation: part('nao_vou') }), CTX).key).toBe('por_registar');
    // Hoje ainda não passou.
    expect(cupRoundStatus(round({ date: TODAY, participation: part('vou') }), CTX).key).toBe('vou');
    // "Não fui" só sem corrida ligada.
    expect(cupRoundStatus(round({ date: '2027-01-10', race: raceB(), run: { id: 'run' } }), CTX).actions).toEqual(['registar']);
  });

  it('feita: o papel no passado e o lugar (oficial, geral, ou o que ele registou) — nunca o dorsal', () => {
    const feita = (extra) => cupRoundStatus(round({ date: '2027-01-10', done: true, ...extra }), CTX).detail;
    expect(feita({ intent: 'atacar', result: { position: 41 } })).toBe('Atacada · 41.º na geral');
    expect(feita({ intent: 'trote', result: { category_position: 7 } })).toBe('Em trote · 7.º no escalão');
    expect(feita({ intent: 'saltar' })).toBe('');
    expect(feita({ run: { details: { age_group_position: 29, bib_number: '4321' } } })).toBe('29.º no escalão (registado por ti)');
    expect(JSON.stringify(cupRoundStatus(round({ date: '2027-01-10', done: true, run: { details: { age_group_position: 29, bib_number: '4321' } } }), CTX))).not.toContain('4321');
    expect(roundPlaceLabel(round())).toBeNull();
  });

  it('próxima: sem data, por decidir; adiada; e o papel só com "Vou"', () => {
    expect(cupRoundStatus(round({ id: 'r3', date: null, date_status: 'provavel' }), CTX)).toMatchObject({
      key: 'proxima', detail: 'Por decidir · data por anunciar',
      ariaLabel: 'Jornada 4, GP Monte Real, data por anunciar. Próxima: Por decidir, data por anunciar.',
    });
    expect(cupRoundStatus(round({ id: 'r3', date_status: 'adiada', participation: part('nao_sei') }), CTX).detail).toBe('Ainda não sei · adiada');
    expect(cupRoundStatus(round({ id: 'r3', date: '2027-01-21', participation: part('nao_vou'), intent: 'atacar' }), CTX).detail).toBe('Não vou · amanhã');
    expect(cupRoundStatus(round({ id: 'r3', date: TODAY, participation: part('vou'), intent: 'trote' }), CTX).detail).toBe('Vou · em trote · hoje');
  });

  it('vou: provável → à espera da data confirmada; promovida → principal', () => {
    expect(cupRoundStatus(round({ date_status: 'provavel', participation: part('vou') }), CTX)).toMatchObject({
      detail: 'à espera da data confirmada',
      ariaLabel: 'Jornada 4, GP Monte Real, domingo, 7 de fevereiro (provável). Vou: à espera da data confirmada.',
    });
    expect(cupRoundStatus(round({ participation: part('vou'), intent: 'atacar', race: raceB({ race_priority: 'a' }) }), CTX).detail).toBe('atacar · principal');
  });

  it('colisão com uma principal: dita em texto em "Não vou" e "Por decidir"', () => {
    const suggestion = { decision: 'nao_vou', reason: 'principal', principal: MEIA };
    expect(cupRoundStatus(round({ suggestion, participation: part('nao_vou') }), CTX).detail).toBe('é o dia da tua Meia de Lisboa');
    expect(cupRoundStatus(round({ suggestion }), CTX).detail).toBe('é o dia da tua Meia de Lisboa (principal)');
    expect(cupRoundStatus(round({ participation: { decision: null, decision_source: 'colisao' } }), CTX).detail).toBe('é o dia de uma prova principal');
  });

  it('outro rótulo de competição ("Etapa") e jornada sem nome', () => {
    const s = cupRoundStatus(round({ name: null, round_no: 2 }), { ...CTX, roundLabel: 'Etapa' });
    expect(s.ariaLabel).toBe('Etapa 2, domingo, 7 de fevereiro. Por decidir.');
  });
});

describe('os textos pequenos', () => {
  it('datas', () => {
    expect(diaCurto('2027-01-24')).toBe('dom 24 jan');
    expect(diaCurto('2027-01-23T10:00:00Z')).toBe('sáb 23 jan');
    expect(dataLonga('2027-01-24')).toBe('domingo, 24 de janeiro');
    expect(dataLonga('2027-01-20')).toBe('quarta-feira, 20 de janeiro');
    expect(diaMes('2027-02-07')).toBe('7 fev');
    expect(diaCurto(null)).toBe('');
    expect(diaCurto('2027-13-45')).toBe('');
    expect(roundDateText({ date: '2027-01-24', date_status: 'provavel' }, TODAY)).toBe('dom 24 jan (provável)');
    expect(roundDateText({ date: '2027-01-24', date_status: 'adiada' }, TODAY)).toBe('adiada');
    expect(roundDateText({ date: null }, TODAY)).toBe('data por anunciar');
  });

  it('dateChangeLabel: mesmo mês, meses diferentes, igual → null, já passou → null', () => {
    expect(dateChangeLabel('2027-01-17', '2027-01-24', TODAY)).toBe('mudou de 17 para 24 jan');
    expect(dateChangeLabel('2027-01-30', '2027-02-06', TODAY)).toBe('mudou de 30 jan para 6 fev');
    expect(dateChangeLabel('2026-12-27', '2027-01-24')).toBe('mudou de 27 dez para 24 jan');
    expect(dateChangeLabel('2027-01-24', '2027-01-24', TODAY)).toBeNull();
    expect(dateChangeLabel(null, '2027-01-24', TODAY)).toBeNull();
    expect(dateChangeLabel('2027-01-03', '2027-01-10', TODAY)).toBeNull();
  });

  it('horaLabel, kmLabel, intentLabel, roundChip', () => {
    expect(horaLabel('09:30:00')).toBe('9h30');
    expect(horaLabel('10:00')).toBe('10h');
    expect(horaLabel('24:00:00')).toBe('24h');
    expect(horaLabel(null)).toBeNull();
    expect(horaLabel('às dez')).toBeNull();
    expect(kmLabel(7.4)).toBe('7,4 km');
    expect(kmLabel(8)).toBe('8 km');
    expect(kmLabel(0)).toBeNull();
    expect(['atacar', 'controlar', 'trote', 'saltar', 'outro'].map(intentLabel)).toEqual(['atacar', 'controlar', 'em trote', 'saltar', null]);
    expect(roundChip(3)).toBe('J3');
    expect(roundChip(2, 'Etapa')).toBe('E2');
  });

  it('roleReasonLabel: todas as razões, na 2.ª pessoa', () => {
    const view = { roundLabel: 'Jornada', rounds: [{ id: 'r2', round_no: 2, chip: 'J2' }] };
    const P = { id: 'meia', name: 'Meia da Marginal', date: '2027-02-14' };
    const role = (reason, extra = {}) => roleReasonLabel({ reason, principal: null, offsetDays: null, gapDays: null, refRoundId: null, every: null, ...extra }, view);
    expect(role('e_principal')).toBe('é a tua prova principal');
    expect(role('dia_da_principal', { principal: P, offsetDays: 0 })).toBe('é o dia da tua Meia da Marginal (14 fev)');
    expect(role('encostada_a_principal', { principal: P, offsetDays: -2 })).toBe('a 2 dias antes da tua Meia da Marginal (14 fev)');
    expect(role('encostada_a_principal', { principal: P, offsetDays: 1 })).toBe('a 1 dia depois da tua Meia da Marginal (14 fev)');
    expect(role('polimento_da_principal', { principal: P, offsetDays: -7 })).toBe('estás no polimento da Meia da Marginal (14 fev)');
    expect(role('recuperacao_da_principal', { principal: P, offsetDays: 7 })).toBe('ainda a recuperar da Meia da Marginal (14 fev)');
    expect(role('recuperacao_da_maratona', { principal: { ...P, name: 'Maratona de Lisboa' } })).toBe('é a primeira depois da Maratona de Lisboa (14 fev)');
    expect(role('par_curto', { gapDays: 7, refRoundId: 'r2' })).toBe('a 7 dias da J2, que atacas');
    expect(role('par_curto', { gapDays: 6 })).toBe('a 6 dias da tua prova principal');
    expect(role('recuperacao_da_jornada', { gapDays: 10, refRoundId: 'r2' })).toBe('ainda a recuperar da J2');
    expect(role('recuperacao_da_jornada', { gapDays: 10 })).toBe('ainda a recuperar da tua prova principal');
    expect(role('progressao', { every: 3 })).toBe('controlar para ganhar ritmo; atacas 1 em 3');
    expect(role('progressao_atacar', { every: 2 })).toBe('é a vez de atacar (1 em 2)');
    expect(role('livre')).toBe('fora das janelas das tuas principais');
    for (const r of ['sem_data', 'cancelada', 'passada', 'nao_vai']) expect(role(r)).toBeNull();
    expect(roleReasonLabel(null, view)).toBeNull();
  });
});

/* O custo de promover (A.2, "CupPromoteDialog"): a vista a sério
   (buildCupView), com jornadas semanais e a Meia de Lisboa a 14/03. */
describe('promotionPreview', () => {
  const USER = 'u-prom';
  const ROUNDS = [
    ['j1', '2027-01-10'], ['j2', '2027-01-31'], ['j3', '2027-02-07'], ['j4', '2027-02-12'], ['j5', '2027-03-07'],
  ].map(([id, date], i) => ({ id, edition_id: F.CASCAIS_34.id, round_no: i + 1, name: `Prova ${i + 1}`, date, date_status: 'confirmada', terrain: 'estrada' }));
  const raceOf = (id, date) => ({ id: `r${id}`, name: `Prova ${id.slice(1)}`, date, distance_km: 8, race_type: 'estrada', race_priority: 'b', status: 'agendada', cup_round_id: id });
  const MEIA_14 = { id: 'meia', name: 'Meia de Lisboa', date: '2027-03-14', distance_km: 21.1, race_type: 'estrada', race_priority: 'a', status: 'agendada', cup_round_id: null };
  const RACES = [raceOf('j2', '2027-01-31'), raceOf('j3', '2027-02-07'), raceOf('j4', '2027-02-12'), raceOf('j5', '2027-03-07'), MEIA_14];
  const PROFILE = { id: USER, gender: 'M', birth_date: '1982-01-24', experience_level: 'medio' };
  const ENR = { id: 'enr1', user_id: USER, edition_id: F.CASCAIS_34.id, team_id: 't-naza', season_goal: 'premio', status: 'ativa' };
  const cup = {
    status: 'ready', userId: USER, dismissals: [],
    editions: [{ ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION }],
    enrollments: [ENR],
    participations: ROUNDS.slice(1).map((r) => ({ id: `p-${r.id}`, enrollment_id: 'enr1', round_id: r.id, decision: 'vou' })),
    catalog: { [F.CASCAIS_34.id]: { status: 'ready', rounds: ROUNDS, courses: ROUNDS.map((r) => ({ round_id: r.id, code: 'U', distance_m: 8000, start_time: '10:00:00' })), overrides: [], categories: [], teams: F.CASCAIS_TEAMS } },
    results: { status: 'idle', enrollmentId: null, rows: [], teamRows: [] },
  };
  const today = '2027-01-11';
  const view = buildCupView({ cup, profile: PROFILE, raceEvents: RACES, runs: [], today });
  const opts = (extra = {}) => ({ raceEvents: RACES, coachPlans: [], profile: PROFILE, runs: [], today, ...extra });

  it('os quatro textos, exatos: afinação e recuperação; as jornadas que mudam; voltar atrás', () => {
    const p = promotionPreview(view, 'j3', opts());
    expect(p.lines).toEqual([
      'Uma prova principal muda o treino à volta dela: 10 dias de afinação antes e 5 de recuperação depois.',
      'Mudam de papel: J2 (31 jan) de atacar para controlar; J4 (12 fev) de controlar para em trote.',
      'Podes voltar a pô-la como secundária quando quiseres.',
    ]);
    expect(p).toMatchObject({ raceId: 'rj3', taperDays: 10, recoveryDays: 5, near: [], planConflict: null });
    expect(p.changes).toEqual([
      { roundId: 'j2', chip: 'J2', dateLabel: '31 jan', from: 'atacar', to: 'controlar' },
      { roundId: 'j4', chip: 'J4', dateLabel: '12 fev', from: 'controlar', to: 'trote' },
    ]);
    // Uma só mudança: singular.
    expect(promotionPreview(view, 'j4', opts()).lines[1]).toBe('Muda de papel: J3 (7 fev) de atacar para controlar.');
  });

  it('com uma principal de fora perto: dito antes — as de fora mandam', () => {
    const p = promotionPreview(view, 'j5', opts());
    expect(p.lines).toEqual([
      'Uma prova principal muda o treino à volta dela: 10 dias de afinação antes e 5 de recuperação depois.',
      'Nenhuma outra jornada muda de papel.',
      'A tua Meia de Lisboa (14 mar) também é principal e fica perto demais: as principais de fora mandam. Se promoveres esta jornada, a Carol vai pedir-te para escolherem juntos.',
      'Podes voltar a pô-la como secundária quando quiseres.',
    ]);
    expect(p.near).toEqual([{ id: 'meia', name: 'Meia de Lisboa', dateLabel: '14 mar' }]);
    // Duas: plural.
    const dez = { ...MEIA_14, id: 'dez', name: '10 km da Vila', distance_km: 10, date: '2027-03-10' };
    const two = promotionPreview(view, 'j5', opts({ raceEvents: [...RACES, dez] }));
    expect(two.lines[2]).toBe('As tuas 10 km da Vila (10 mar) e Meia de Lisboa (14 mar) também são principais e ficam perto demais: as principais de fora mandam. Se promoveres esta jornada, a Carol vai pedir-te para escolherem juntos.');
  });

  it('a jornada cai no plano aceite de outra principal: o conflito que a Carol vai levantar entra no custo', () => {
    const plan = { id: 'plan', status: 'aceite', race_id: 'meia', period_start: '2027-01-01', period_end: '2027-03-14' };
    const p = promotionPreview(view, 'j3', opts({ coachPlans: [plan] }));
    expect(p.planConflict).toEqual({ id: 'meia', targetName: 'Meia de Lisboa', dateLabel: '14 mar' });
    expect(p.lines[2]).toBe('A tua Meia de Lisboa (14 mar) também é principal e fica perto demais: as principais de fora mandam. Se promoveres esta jornada, a Carol vai pedir-te para escolherem juntos.');
    // A mesma principal perto E dona do plano: dita uma só vez.
    expect(promotionPreview(view, 'j5', opts({ coachPlans: [plan] })).lines[2]).toBe(p.lines[2]);
  });

  it('sem prova da jornada, ou sem inscrição → null; e nada é gravado (as provas ficam iguais)', () => {
    expect(promotionPreview(view, 'j1', opts())).toBeNull();
    expect(promotionPreview({ ...view, enrollment: null }, 'j3', opts())).toBeNull();
    expect(promotionPreview(null, 'j3', opts())).toBeNull();
    const before = JSON.stringify(RACES);
    promotionPreview(view, 'j3', opts());
    expect(JSON.stringify(RACES)).toBe(before);
  });

  it('a vista traz o papel de cada jornada (o mesmo cálculo da Carol) e o estado', () => {
    expect(view.rounds.map((r) => [r.chip, r.role?.intent ?? null, r.status.key])).toEqual([
      ['J1', null, 'ja_passou'],
      ['J2', 'atacar', 'proxima'],
      ['J3', 'atacar', 'vou'],
      ['J4', 'controlar', 'vou'],
      ['J5', 'controlar', 'vou'],
    ]);
    expect(cupListingOf(view).isFixed(RACES[0])).toBe(true);
    expect(cupListingOf(view).isFixed(MEIA_14)).toBe(false);
  });

  /* Revisão da Fase 3: a "próxima" do bloco e da linha do cartão não
     repete uma prova que já está à vista (uma promovida, a do próprio dia). */
  it('nextRoundApart: a régua de nextRoundId, a saltar as jornadas cuja prova já está à vista', () => {
    expect(view.nextRound.id).toBe('j2');
    expect(nextRoundApart(view).id).toBe('j2');
    const promovidas = new Set(['rj2']);
    expect(nextRoundApart(view, (race) => promovidas.has(race.id)).id).toBe('j3');
    // A J1 não tem prova (já passou, sem "Vou"): nunca é saltada por isto,
    // e as que já passaram não contam.
    expect(nextRoundApart(view, () => true)).toBeNull();
    const promovida = { ...view, rounds: view.rounds.map((r) => (r.id === 'j2' ? { ...r, race: { ...r.race, race_priority: 'a' } } : r)) };
    expect(nextRoundApart(promovida, (race) => !cupListingOf(promovida).isFixed(race)).id).toBe('j3');
    expect(nextRoundApart({ ...view, catalogReady: false })).toBeNull();
    expect(nextRoundApart(null)).toBeNull();
  });
});
