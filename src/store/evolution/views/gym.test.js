import { describe, it, expect } from 'vitest';
import { buildGymView, GYM_MIN_CLOSED, CHART_MIN_WEEKS, fmtRange } from './gym';
import { getEvolutionViewDef } from '../registry';

/* Vista do Ginásio (2026-10-04, fase 5): período de calendário, só dias
   fechados, semanas fechadas (G2), volume semanal com zeros e a semana em curso
   marcada (G3/G4), séries por semana (G1) e progressão por exercício (D5).
   "Hoje" é passado por argumento — a vista é pura. Segunda-feira = 28 set. */

const HOJE = '2026-10-04'; // domingo
let n = 0;
const sets = (count, weight = 100, reps = 10, name = 'Supino reto') =>
  Array.from({ length: count }, () => ({ exercise_name: name, reps, weight }));
const forca = (date, over = {}) => ({ id: `f${n++}`, date, kind: 'forca', categories: ['Peito'], workout_session_sets: sets(2), ...over });
const aula = (date, over = {}) => ({ id: `a${n++}`, date, kind: 'aula', name: 'Pilates', class_types: ['Pilates'], categories: [], workout_session_sets: [], ...over });
const view = (sessions, kind, offset = 0, today = HOJE, runs = []) => buildGymView([sessions, runs], { kind, offset }, today);

// Quem treina duas vezes por semana desde agosto, com a semana de 14 set em branco.
const SETEMBRO = [
  forca('2026-08-25'),
  forca('2026-09-07'), forca('2026-09-10'),
  // semana de 14 set: nada (zero explícito)
  forca('2026-09-21'), forca('2026-09-24'),
  aula('2026-09-22', { exertion: 7 }),
  forca('2026-09-28'), forca('2026-09-30'), forca('2026-10-01'),
  forca(HOJE, { workout_session_sets: sets(10, 200, 10) }), // hoje: não entra
];

describe('registo', () => {
  it('regista a vista "ginasio" com os dados de que depende', () => {
    const def = getEvolutionViewDef('ginasio');
    expect(def).toBeTruthy();
    expect(def.deps({ gymSessions: [1], runs: [2], meals: [3] })).toEqual([[1], [2]]);
  });
});

describe('só dias fechados do período (R2)', () => {
  it('hoje (domingo 4 out) fica fora do mês em curso', () => {
    const v = view(SETEMBRO, 'mes');
    expect(v.closedDays).toBe(3); // 1–3 out
    expect(v.cur.strength).toBe(1); // 1 out; hoje fica de fora
    expect(v.earlyState).toBe('cedo');
  });

  it('o mês fechado conta todas as sessões de setembro, força e aulas à parte', () => {
    const v = view(SETEMBRO, 'mes', -1);
    expect(v.closedDays).toBe(30);
    expect(v.cur.strength).toBe(6); // 7, 10, 21, 24, 28, 30 set
    expect(v.cur.classes).toBe(1);
    expect(v.earlyState).toBe('ok');
  });

  it('hoje não conta nem para o volume da semana em curso', () => {
    const v = view(SETEMBRO, 'semana');
    const corrente = v.weeklyData.at(-1);
    expect(corrente.weekStart).toBe('2026-09-28');
    expect(corrente.inProgress).toBe(true);
    // 28 set, 30 set e 1 out: 3 sessões × (2 séries × 100 kg × 10 reps).
    expect(corrente.volumeLoad).toBe(6000);
  });
});

describe('G2: semanas fechadas, só força', () => {
  it('setembro tem 3 semanas inteiras (7, 14 e 21 set); a de 28 set cruza o mês', () => {
    const v = view(SETEMBRO, 'mes', -1);
    expect(v.weeks.count).toBe(3);
    expect(v.weeks.strength).toBe(4); // 7, 10, 21, 24 set; as de 28 e 30 não estão numa semana inteira
    expect(v.weeks.onTarget).toBe(2); // a semana de 14 set teve 0
    expect(v.weeks.onTargetPct).toBe(67);
    expect(v.weeks.perWeekStrength).toBeCloseTo(4 / 3, 6);
  });

  it('as aulas não entram na frequência de força', () => {
    const v = view([forca('2026-09-08'), aula('2026-09-09'), aula('2026-09-10'), aula('2026-09-15'), aula('2026-09-16'), forca('2026-09-01'),
      aula('2026-09-22'), aula('2026-09-23')], 'mes', -1);
    expect(v.weeks.strength).toBe(1);
    expect(v.weeks.classes).toBe(6);
    expect(v.weeks.perWeekClasses).toBe(2);
  });

  it('quem começou há 10 dias não leva "a menos": diz que ainda é cedo', () => {
    // 3 sessões desde 24 set; "Mês" de setembro tem 0 semanas inteiras desde o 1.º registo.
    const v = view([forca('2026-09-24'), forca('2026-09-26'), forca('2026-09-30')], 'mes', -1);
    expect(v.dataStartISO).toBe('2026-09-24');
    expect(v.closedDays).toBe(7); // desde 24 set, não 30 dias
    expect(v.weeks.count).toBe(0);
    expect(v.cur.strength).toBe(3);
    expect(v.verdict.tone).toBe('neutral');
    expect(v.verdict.early).toBe(true);
    expect(v.verdict.text).not.toMatch(/a menos/);
    expect(v.verdict.text).toContain('Ainda não há semanas fechadas em setembro');
  });

  it('trimestre com histórico curto também não divide por 13', () => {
    const v = view([forca('2026-09-08'), forca('2026-09-10'), forca('2026-09-15'), forca('2026-09-17'), forca('2026-09-22'), forca('2026-09-24')], 'trimestre', -1);
    // Desde o 1.º registo (8 set): a semana de 7 set começa antes, só há as de 14 e 21 set.
    expect(v.weeks.count).toBe(2);
    expect(v.verdict.early).toBe(true);
    expect(v.verdict.text).toBe('Só 2 semanas fechadas em jul – set 2026 — ainda é cedo para conclusões.');
  });

  it('com 3+ semanas fechadas avalia a frequência real (4/3 = 1,3 por semana)', () => {
    const v = view(SETEMBRO, 'mes', -1);
    expect(v.verdict.tone).toBe('warn');
    expect(v.verdict.text).toContain('Vais 1,3 vezes por semana em média, em três semanas fechadas');
  });

  it('semana fechada: as sessões da semana contra o alvo de 2', () => {
    const v = view(SETEMBRO, 'semana', -1); // 21–27 set
    expect(v.cur.strength).toBe(2);
    expect(v.verdict.tone).toBe('ok');
    expect(v.verdict.text).toContain('Duas sessões de força na semana passada');
  });
});

describe('G3/G4: volume semanal de calendário', () => {
  it('mostra todas as semanas, com zeros explícitos, e a em curso marcada', () => {
    const v = view(SETEMBRO, 'mes', -1);
    expect(v.weeklyData.map((w) => w.weekStart)).toEqual(['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
    expect(v.weeklyData.map((w) => w.volumeLoad)).toEqual([0, 4000, 0, 4000, 6000]);
    expect(v.weeklyData.map((w) => w.inProgress)).toEqual([false, false, false, false, true]);
    expect(v.weeklyData[2].volumeLoad).toBe(0); // a semana sem treino é um 0, não um buraco
  });

  it('em Semana mostra pelo menos 5 semanas, acabando na do período', () => {
    const v = view(SETEMBRO, 'semana', -1);
    expect(v.weeklyData).toHaveLength(CHART_MIN_WEEKS);
    expect(v.weeklyData.at(-1).weekStart).toBe('2026-09-21');
    expect(v.weeklyData.at(-1).inProgress).toBe(false);
  });

  it('semanas inteiras antes do 1.º registo não existem (não são zeros)', () => {
    const v = view([forca('2026-09-21'), forca('2026-09-25')], 'semana', -1);
    expect(v.weeklyData.map((w) => w.weekStart)).toEqual(['2026-09-21']);
    expect(v.weeklyData[0].partial).toBe(false);
  });

  it('a semana que começa antes do 1.º registo vem marcada "partial"', () => {
    const v = view([forca('2026-09-23'), forca('2026-09-25')], 'semana', -1);
    expect(v.weeklyData[0]).toMatchObject({ weekStart: '2026-09-21', partial: true });
  });
});

describe('G1: séries por semana, só sessões de um grupo', () => {
  it('séries por semana sobre as semanas fechadas, e conta as sessões com vários grupos', () => {
    const sessions = [
      forca('2026-08-25'),
      forca('2026-09-08', { workout_session_sets: sets(6), categories: ['Costas'] }),
      forca('2026-09-09', { workout_session_sets: sets(20), categories: ['Peito', 'Tríceps'] }),
      forca('2026-09-15', { workout_session_sets: sets(6), categories: ['Costas'] }),
      forca('2026-09-22', { workout_session_sets: sets(3), categories: ['Costas'] }),
    ];
    const v = view(sessions, 'mes', -1);
    expect(v.muscle.weeks).toBe(3);
    expect(v.muscle.multiGroupSessions).toBe(1);
    expect(v.muscle.groups).toHaveLength(1); // Peito+Tríceps não duplica
    expect(v.muscle.groups[0]).toMatchObject({ name: 'Costas', sets: 15 });
    expect(v.muscle.groups[0].perWeek).toBeCloseTo(5, 6);
  });

  it('sem semanas fechadas não há séries por semana', () => {
    const v = view(SETEMBRO, 'semana'); // semana em curso
    expect(v.muscle.weeks).toBe(0);
    expect(v.muscle.groups).toEqual([]);
  });
});

describe('D5: progressão por exercício', () => {
  const B = [
    forca('2026-09-01', { workout_session_sets: sets(1, 40, 10, 'Remada') }),
    forca('2026-09-15', { workout_session_sets: sets(3, 75, 8) }),
    forca('2026-09-21', { workout_session_sets: sets(3, 80, 8) }),
    forca('2026-09-24', { workout_session_sets: [...sets(3, 80, 8), ...sets(2, 60, 10, 'Remada')] }),
  ];

  it('compara o melhor 1RM da semana com o da anterior, só de exercícios com 2+ sessões', () => {
    const v = view(B, 'semana', -1);
    expect(v.progression.rows).toHaveLength(1);
    const r = v.progression.rows[0];
    expect(r.name).toBe('Supino reto');
    expect(r.current.sessions).toBe(2);
    expect(r.current.bestSet).toEqual({ weight: 80, reps: 8 });
    expect(r.diffKg).toBeGreaterThan(0);
    expect(v.progression.withoutPrevious).toBe(0); // a Remada só tem 1 sessão: nem conta
  });

  it('um exercício com 2+ sessões mas sem anterior não é comparável: conta-se à parte', () => {
    const sessoes = [...B, forca('2026-09-22', { workout_session_sets: sets(2, 60, 10, 'Remada') })];
    const v = view(sessoes, 'semana', -1);
    expect(v.progression.rows.map((r) => r.name)).toEqual(['Supino reto']);
    expect(v.progression.withoutPrevious).toBe(1);
  });

  it('só com o período em condições e um anterior fechado completo', () => {
    expect(view(B, 'mes').progression.rows).toEqual([]); // cedo
    // O anterior começa antes do 1.º registo: não se compara.
    expect(view(B, 'mes', -1).progression.rows).toEqual([]);
  });
});

describe('▲/▼ só contra o anterior equivalente e fechado (R5)', () => {
  it('semana fechada contra a anterior, com os mesmos 7 dias', () => {
    const v = view([forca('2026-09-01'), forca('2026-09-15'), forca('2026-09-21'), forca('2026-09-24'), aula('2026-09-23')], 'semana', -1);
    expect(v.prevCoverage).toBe('full');
    expect(v.delta).toMatchObject({ label: 'semana de 14 set', strength: { cur: 2, prev: 1 }, classes: { cur: 1, prev: 0 }, windowDays: 7 });
  });

  it('a semana em curso compara os mesmos dias da anterior ("21 – 26 set")', () => {
    const v = view([forca('2026-09-01'), forca('2026-09-22'), forca('2026-09-26'), forca('2026-09-29'), forca('2026-10-01'), forca('2026-10-02'), forca('2026-10-03')], 'semana');
    expect(v.earlyState).toBe('ok'); // 6 dias fechados
    expect(v.delta).toMatchObject({ label: '21 – 26 set', windowDays: 6, strength: { cur: 4, prev: 2 } });
  });

  it('mês: compara a % de semanas com 2+ treinos, com semanas dos dois lados', () => {
    const agosto = ['2026-08-03', '2026-08-05', '2026-08-10', '2026-08-12', '2026-08-17', '2026-08-19', '2026-08-24', '2026-08-26'];
    const setembro = ['2026-09-07', '2026-09-09', '2026-09-14', '2026-09-21', '2026-09-23'];
    const v = view([...agosto, ...setembro, '2026-07-20'].map((d) => forca(d)), 'mes', -1);
    expect(v.weeks).toMatchObject({ count: 3, onTarget: 2, onTargetPct: 67 });
    expect(v.weeksDelta).toMatchObject({ current: 67, previous: 100, previousLabel: 'agosto', previousText: '4 de 4 (100%)' });
  });

  it('sem período anterior com registos não há delta', () => {
    const v = view([forca('2026-09-21'), forca('2026-09-24')], 'semana', -1);
    expect(v.prevCoverage).toBe('none');
    expect(v.delta).toBeNull();
    expect(v.weeksDelta).toBeNull();
  });

  it('com o anterior a meio (começou a meio dele) também não há delta', () => {
    const v = view([forca('2026-09-17'), forca('2026-09-21'), forca('2026-09-24')], 'semana', -1);
    expect(v.prevCoverage).toBe('partial');
    expect(v.delta).toBeNull();
  });

  it('com o período "cedo" (menos de 4 dias fechados) não há delta nem progressão', () => {
    const v = view(SETEMBRO, 'mes');
    expect(v.earlyState).toBe('cedo');
    expect(v.delta).toBeNull();
    expect(v.progression.rows).toEqual([]);
  });
});

describe('período fechado de tamanho diferente: compara o período inteiro (revisão de 2026-10-04)', () => {
  const NOV = '2026-11-10';
  it('outubro fechado (31 dias) contra setembro (30): o treino de 31 out conta', () => {
    const sessoes = ['2026-09-01', '2026-09-15', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-10-31'].map((d) => forca(d));
    const v = view(sessoes, 'mes', -1, NOV);
    expect(v.cur.strength).toBe(5);
    expect(v.delta).toMatchObject({ label: 'setembro', windowDays: 30, strength: { cur: 5, prev: 2 } });
  });

  it('trimestre fechado de 90 dias contra um de 92: os treinos de 30 e 31 dez contam', () => {
    const q4 = ['2026-10-01', '2026-11-10', '2026-12-30', '2026-12-31'];
    const q1 = ['2027-01-12', '2027-02-09', '2027-03-30'];
    const v = view([...q4, ...q1].map((d) => forca(d)), 'trimestre', -1, '2027-04-10');
    expect(v.period.totalDays).toBe(90);
    expect(v.previous.totalDays).toBe(92);
    expect(v.delta).toMatchObject({ windowDays: 92, strength: { cur: 3, prev: 4 } });
    expect(v.delta.label).toBe(v.prevName);
  });

  it('a progressão segue a mesma janela: o único dia 31 conta como 2.ª sessão do mês', () => {
    const ex = (date, w) => forca(date, { workout_session_sets: sets(2, w, 10, 'Agachamento') });
    const v = view([ex('2026-09-01', 80), ex('2026-09-15', 80), ex('2026-10-05', 100), ex('2026-10-31', 100)], 'mes', -1, NOV);
    expect(v.progression.rows).toHaveLength(1);
    expect(v.progression.rows[0].current.sessions).toBe(2);
    expect(v.progression.label).toBe('setembro');
  });

  it('período em curso continua a cortar nos mesmos N primeiros dias', () => {
    const v = view([forca('2026-09-01'), forca('2026-09-02'), forca('2026-09-29'), forca('2026-10-01'), forca('2026-10-03')], 'mes', 0, '2026-10-05');
    expect(v.delta.windowDays).toBe(4);
    expect(v.delta.label).toBe('1 – 4 set');
  });
});

describe('veredicto: zero observado com histórico (revisão de 2026-10-04)', () => {
  it('agosto fechado sem treinos, com julho e setembro: facto e não NO_DATA', () => {
    const v = view([forca('2026-07-10'), forca('2026-07-20'), forca('2026-09-10')], 'mes', -2, '2026-10-04');
    expect(v.cur.total).toBe(0);
    expect(v.verdict.text).toBe('Nenhuma sessão de força em agosto — o alvo são duas por semana.');
    expect(v.verdict.tone).toBe('warn');
  });

  it('período antes do 1.º registo e quem nunca registou ficam em NO_DATA', () => {
    expect(view([forca('2026-09-24')], 'mes', -2).verdict.text).toMatch(/Ainda não tenho dados/);
    expect(view([], 'mes').verdict.text).toMatch(/Ainda não tenho dados/);
  });

  it('só as corridas dos dias fechados do período contam para o veredicto', () => {
    // Uma sessão por semana: o veredicto fala do volume de corrida só com corridas no período.
    const sessoes = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'].map((d) => forca(d));
    const velha = [{ id: 'r1', date: '2025-03-01' }];
    const nova = [{ id: 'r2', date: '2026-09-05' }];
    expect(view(sessoes, 'mes', -1, HOJE, velha).verdict.text).not.toMatch(/corrida/);
    expect(view(sessoes, 'mes', -1, HOJE, nova).verdict.text).toMatch(/corrida/);
  });
});

describe('R7: o anterior que começou antes do 1.º registo diz "desde"', () => {
  it('prevLabel traz a cobertura "desde 25 ago"', () => {
    const v = view([forca('2026-08-25'), forca('2026-09-10'), forca('2026-10-01')], 'trimestre', 0, '2026-10-01');
    expect(v.prevLabel.coverage).toBe('desde 25 ago');
  });
});

describe('fmtRange com ano (revisão de 2026-10-04)', () => {
  it('só põe o ano quando o intervalo não é do ano de hoje', () => {
    expect(fmtRange('2025-10-01', '2025-12-29', HOJE)).toBe('1 out – 29 dez 2025');
    expect(fmtRange('2025-12-29', '2026-01-04', HOJE)).toBe('29 dez 2025 – 4 jan 2026');
    expect(fmtRange('2026-09-21', '2026-09-26', HOJE)).toBe('21 – 26 set');
    expect(fmtRange('2026-09-21', '2026-09-26')).toBe('21 – 26 set');
  });
});

describe('a começar (R8) e antes do 1.º registo (R7)', () => {
  it('segunda-feira sem dias fechados: "a_comecar", com o que já há hoje', () => {
    const v = view([forca('2026-09-28'), forca('2026-10-05')], 'semana', 0, '2026-10-05');
    expect(v.earlyState).toBe('a_comecar');
    expect(v.firstDay).toBe(false);
    expect(v.closedDays).toBe(0);
    expect(v.todaySessions.strength).toBe(1);
    expect(v.prevFull.strength).toBe(1);
  });

  it('o 1.º registo é hoje: "a começar" com título próprio (firstDay)', () => {
    const v = view([forca(HOJE)], 'semana');
    expect(v.earlyState).toBe('a_comecar');
    expect(v.firstDay).toBe(true);
  });

  it('um período antes do 1.º registo diz-o e não tem números', () => {
    const v = view([forca('2026-09-24')], 'mes', -2);
    expect(v.beforeData).toBe(true);
    expect(v.closedDays).toBe(0);
    expect(v.cur.total).toBe(0);
  });

  it('sem sessões nenhumas', () => {
    const v = view([], 'mes');
    expect(v.hasSessions).toBe(false);
    expect(v.weeklyData).toEqual([]);
    expect(v.dataStartISO).toBeNull();
  });
});

describe('aulas', () => {
  it('conta quantas aulas têm RPE, no geral e por modalidade (G6)', () => {
    const sessoes = [
      forca('2026-09-01'),
      aula('2026-09-08', { name: 'HIIT', class_types: ['HIIT'], exertion: 8, duration_seconds: 1800 }),
      aula('2026-09-09', { name: 'HIIT', class_types: ['HIIT'], exertion: 7 }),
      aula('2026-09-10', { name: 'HIIT', class_types: ['HIIT'], exertion: 7.5 }),
      aula('2026-09-11', { name: 'Pilates', class_types: ['Pilates'] }),
    ];
    const v = view(sessoes, 'mes', -1);
    expect(v.classes.totalClasses).toBe(4);
    expect(v.classes.rpeCount).toBe(3);
    expect(v.classes.rpeCountByName).toEqual({ HIIT: 3 });
    expect(v.classes.classesWithDuration).toBe(1);
    expect(v.classes.avgRpe).toBe('7.5');
    // G7 por modalidade: só uma aula de HIIT tem duração.
    expect(v.classes.durationCountByName).toEqual({ HIIT: 1 });
  });

  it('as aulas de hoje ficam de fora', () => {
    const v = view([forca('2026-09-20'), aula(HOJE)], 'semana');
    expect(v.cur.classes).toBe(0);
    expect(v.todaySessions.classes).toBe(1);
  });
});

describe('constantes', () => {
  it('o "cedo" é com menos de 4 dias fechados', () => {
    expect(GYM_MIN_CLOSED).toBe(4);
  });
});
