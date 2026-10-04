import { describe, it, expect, beforeEach } from 'vitest';
import { buildHubView, resetHubViewMemo, HUB_MIN_MEAL_DAYS, HUB_DELTA_MIN_MEAL_DAYS } from './hub';
import { getEvolutionViewDef } from '../registry';

/* Vista do Geral (2026-10-04, fase 6, D2): a semana de calendário, só dias
   fechados, os quatro pilares com o denominador à vista. "Hoje" é passado por
   argumento — a vista é pura. Sábado 10 out 2026: a semana é 5–11 out (5 dias
   fechados, seg–sex) e a anterior 28 set – 4 out. */

const HOJE = '2026-10-10';
let n = 0;
const run = (date, km = 5, over = {}) => ({ id: `r${n++}`, date, distance_km: km, duration_seconds: km * 330, ...over });
const forca = (date, kg = 1000) => ({ id: `f${n++}`, date, kind: 'forca', categories: ['Costas'], workout_session_sets: [{ reps: 10, weight: kg / 10 }] });
const aula = (date) => ({ id: `a${n++}`, date, kind: 'aula', name: 'Pilates', workout_session_sets: [] });
const meal = (date, kcal = 2000) => ({ id: `m${n++}`, date, meal_items: [{ quantity_grams: kcal / 2, calories_per_100g: 200 }] });
const peso = (date, kg) => ({ id: `p${n++}`, date, weight_kg: kg });
const goal = (validFrom, kcal) => ({ valid_from: validFrom, source: 'manual', calorie_goal: kcal, protein_goal: 150, carbs_goal: 200, fat_goal: 70, water_goal_ml: 2000 });

const build = (over = {}, period = { offset: 0 }, today = HOJE) => {
  const d = { runs: [], sessions: [], meals: [], body: [], profile: {}, goalHistory: [], ...over };
  return buildHubView([d.runs, d.sessions, d.meals, d.body, d.profile, d.goalHistory], period, today);
};

beforeEach(() => resetHubViewMemo());

describe('registo', () => {
  it('regista a vista "hub", com o histórico de objetivos na espera', () => {
    const def = getEvolutionViewDef('hub');
    expect(def).toBeTruthy();
    const deps = def.deps({ runs: [1], gymSessions: [2], meals: [3], bodyAssessments: [4], profile: { a: 1 }, goalHistory: [5], waterLogs: [6] });
    expect(deps).toEqual([[1], [2], [3], [4], { a: 1 }, [5]]);
    expect(def.slices).toContain('goalHistory');
  });
});

describe('a semana de calendário (D2)', () => {
  it('só dias fechados: 5–9 out; hoje fica de fora', () => {
    const v = build({ runs: [run('2026-10-05', 4), run('2026-10-09', 6), run(HOJE, 30), run('2026-10-04', 50)] });
    expect(v.kind).toBe('semana');
    expect(v.period.start).toBe('2026-10-05');
    expect(v.closedDays).toBe(5);
    expect(v.run.count).toBe(2);
    expect(v.run.km).toBe(10);
  });

  it('qualquer `kind` do store lê-se como semana (o Geral só tem Semana)', () => {
    expect(build({}, { kind: 'mes', offset: 0 }).kind).toBe('semana');
  });

  it('offset −1: a semana passada inteira (7 dias fechados)', () => {
    const v = build({ runs: [run('2026-09-28', 3), run('2026-10-04', 7), run('2026-10-05', 99)] }, { offset: -1 });
    expect(v.period.start).toBe('2026-09-28');
    expect(v.closedDays).toBe(7);
    expect(v.run.km).toBe(10);
    expect(v.earlyState).toBe('ok');
  });

  it('offset positivo nunca vai para o futuro', () => {
    expect(build({}, { offset: 3 }).offset).toBe(0);
  });

  it('segunda-feira: 0 dias fechados → "a começar" com o resumo da semana passada', () => {
    const v = build({
      runs: [run('2026-10-06', 7), run('2026-10-08', 5)],
      sessions: [forca('2026-10-07'), aula('2026-10-09')],
      meals: [meal('2026-10-09'), meal('2026-10-10')],
    }, { offset: 0 }, '2026-10-12');
    expect(v.closedDays).toBe(0);
    expect(v.earlyState).toBe('a_comecar');
    expect(v.previousWeek).toEqual({ range: '5 – 11 out', km: 12, runs: 2, strength: 1, classes: 1, mealDays: 2 });
    expect(v.run.count).toBe(0);
  });

  it('sem segunda-feira o resumo da semana passada não vem', () => {
    expect(build({ runs: [run('2026-10-06')] }).previousWeek).toBeNull();
  });

  it('o 1.º registo de qualquer pilar dá o `dataStartISO`; sem nenhum, não há registos', () => {
    expect(build().hasAnyRecords).toBe(false);
    const v = build({ runs: [run('2026-10-02')], meals: [meal('2026-09-20')] });
    expect(v.hasAnyRecords).toBe(true);
    expect(v.dataStartISO).toBe('2026-09-20');
  });
});

describe('Corrida', () => {
  it('▲/▼ face aos MESMOS dias da semana anterior (28 set – 2 out) e só com histórico nessa altura', () => {
    const base = [run('2026-09-28', 5), run('2026-10-06', 8), run('2026-10-08', 7)];
    const v = build({ runs: base });
    expect(v.run.delta).toEqual({
      km: { cur: 15, prev: 5 }, count: { cur: 2, prev: 1 }, windowDays: 5, label: 'a 28 set – 2 out',
    });
    // um km no fim da semana anterior (4 out) não entra na comparação de 5 dias
    expect(build({ runs: [...base, run('2026-10-04', 40)] }).run.delta.km.prev).toBe(5);
    // o histórico só começa esta semana: "0 km" na anterior não é um facto
    expect(build({ runs: [run('2026-10-06', 8)] }).run.delta).toBeNull();
  });

  it('semana fechada compara com a anterior inteira', () => {
    const v = build({ runs: [run('2026-09-21', 5), run('2026-09-30', 5)] }, { offset: -1 });
    expect(v.run.delta.windowDays).toBe(7);
    expect(v.run.delta.label).toBe('à semana anterior');
  });

  it('sem corridas em nenhuma das duas semanas, não há seta', () => {
    expect(build({ runs: [run('2026-08-01')] }).run.delta).toBeNull();
  });

  it('ACWR: o de hoje na semana em curso; com histórico incompleto diz quantas semanas faltam', () => {
    const v = build({ runs: [run('2026-10-06', 10)] });
    expect(v.run.acwr.hasEnoughData).toBe(false);
    expect(v.run.acwr.missing).toBe(2);
    expect(v.run.acwr.atWeekEnd).toBe(false);
  });

  it('ACWR numa semana passada é o do fim dessa semana', () => {
    const runs = [run('2026-09-10', 10), run('2026-09-17', 10), run('2026-09-24', 10), run('2026-09-30', 10)];
    const passada = build({ runs }, { offset: -1 });
    expect(passada.run.acwr.atWeekEnd).toBe(true);
    expect(passada.run.acwr.hasEnoughData).toBe(true);
    // a mesma conta feita hoje (10 out) já não vê a corrida de 10 set
    expect(build({ runs }).run.acwr.atWeekEnd).toBe(false);
  });
});

describe('Ginásio', () => {
  it('sessões de força à frente, aulas à parte e kg só sobre as sessões COM carga (O3)', () => {
    const v = build({ sessions: [forca('2026-10-06', 5000), forca('2026-10-07', 3000), aula('2026-10-08'), aula('2026-10-09')] });
    expect(v.gym.strength).toBe(2);
    expect(v.gym.classes).toBe(2);
    expect(v.gym.loadedSessions).toBe(2);
    expect(v.gym.kgPerSession).toBe(4000);
  });

  it('séries sem peso não entram no denominador; sem nenhuma com carga não há kg/sessão', () => {
    const semCarga = { id: 'sc', date: '2026-10-06', kind: 'forca', categories: ['Costas'], workout_session_sets: [{ reps: 10, weight: 0 }] };
    const v = build({ sessions: [forca('2026-10-07', 3000), semCarga] });
    expect(v.gym.strength).toBe(2);
    expect(v.gym.kgPerSession).toBe(3000);
    expect(v.gym.loadedSessions).toBe(1);
    const so = build({ sessions: [semCarga] });
    expect(so.gym.kgPerSession).toBeNull();
    expect(so.gym.hasSetsWithoutLoad).toBe(true);
  });

  it('hoje não conta', () => {
    expect(build({ sessions: [forca(HOJE), forca('2026-10-06')] }).gym.strength).toBe(1);
  });

  it('▲/▼ das sessões de força nos mesmos dias, e só com histórico', () => {
    const v = build({ sessions: [forca('2026-09-28'), forca('2026-10-06'), forca('2026-10-07'), forca('2026-10-08')] });
    expect(v.gym.delta.strength).toEqual({ cur: 3, prev: 1 });
    expect(build({ sessions: [forca('2026-10-06')] }).gym.delta).toBeNull();
  });
});

describe('Nutrição (O1)', () => {
  const quatro = [meal('2026-10-05'), meal('2026-10-06'), meal('2026-10-07'), meal('2026-10-08')];

  it('sem objetivo definido não há % nem estado — nem o 2000 kcal inventado', () => {
    const v = build({ meals: quatro });
    expect(v.nutrition.hasGoal).toBe(false);
    expect(v.nutrition.pct).toBeNull();
    expect(v.nutrition.status).toBeNull();
    expect(v.nutrition.avgKcal).toBe(2000);
    expect(v.nutrition.nDays).toBe(4);
  });

  it('com objetivo no perfil: %, estado e "X de N dias"', () => {
    const v = build({ meals: quatro, profile: { calorie_goal: 2000 } });
    expect(v.nutrition.hasGoal).toBe(true);
    expect(v.nutrition.pct).toBe(100);
    expect(v.nutrition.status).toBe('ok');
    expect(v.nutrition.daysInGoal).toBe(4);
    expect(v.nutrition.nDays).toBe(4);
  });

  it('um objetivo só no histórico (perfil vazio) também é objetivo', () => {
    expect(build({ meals: quatro, goalHistory: [goal('2026-09-01T10:00:00Z', 2000)] }).nutrition.hasGoal).toBe(true);
  });

  it('o objetivo é o de cada dia (goalsResolver), não o de hoje para todos', () => {
    const v = build({
      meals: quatro,
      profile: { calorie_goal: 2500 },
      goalHistory: [goal('2026-09-01T10:00:00Z', 2000), goal('2026-10-07T10:00:00Z', 2500)],
    });
    // 5 e 6 out: 2000/2000 dentro; 7 e 8 out: 2000/2500 = 80% abaixo
    expect(v.nutrition.daysInGoal).toBe(2);
    expect(v.nutrition.nDays).toBe(4);
    expect(v.nutrition.goalKcal).toBe(2250);
  });

  it('hoje, mesmo parcial, não baixa a média nem acrescenta um dia', () => {
    const v = build({ meals: [...quatro, meal(HOJE, 300)], profile: { calorie_goal: 2000 } });
    expect(v.nutrition.nDays).toBe(4);
    expect(v.nutrition.avgKcal).toBe(2000);
    expect(v.nutrition.pct).toBe(100);
  });

  it(`com menos de ${HUB_MIN_MEAL_DAYS} dias registados não há % nem estado nem EA`, () => {
    const v = build({ meals: [meal('2026-10-05'), meal('2026-10-06')], profile: { calorie_goal: 2000 } });
    expect(v.nutrition.enough).toBe(false);
    expect(v.nutrition.pct).toBeNull();
    expect(v.nutrition.status).toBeNull();
    expect(v.nutrition.ea).toBeNull();
    expect(v.nutrition.avgKcal).toBe(2000);
  });

  it('EA só em dias fechados COM refeições, com a origem da massa magra', () => {
    const v = build({
      meals: [meal('2026-10-05'), meal('2026-10-06'), meal('2026-10-07')],
      runs: [run('2026-10-08', 20)], // dia de treino sem refeições: não é EA negativa
      body: [{ id: 'b', date: '2026-09-01', weight_kg: 70, lean_body_mass_kg: 50 }],
      profile: { calorie_goal: 2000 },
    });
    expect(v.nutrition.ea).toEqual({ average: 40, nDays: 3, source: 'medida', weightFallback: false, hasRuns: true });
  });

  it('EA sem composição corporal diz que é por omissão', () => {
    const v = build({ meals: quatro, profile: { calorie_goal: 2000 } });
    expect(v.nutrition.ea.source).toBe('omissao');
    expect(v.nutrition.ea.weightFallback).toBe(true);
    // sem corridas nos dias contados, os 70 kg por omissão não pesam em nada
    expect(v.nutrition.ea.hasRuns).toBe(false);
  });

  it('o 70 kg por omissão só pesa quando há corridas nos dias fechados', () => {
    const v = build({ meals: quatro, runs: [run('2026-10-06', 8)], profile: { calorie_goal: 2000 } });
    expect(v.nutrition.ea.weightFallback).toBe(true);
    expect(v.nutrition.ea.hasRuns).toBe(true);
  });

  it('O1 por dia: os dias antes de haver objetivo ficam de fora do % e do "X de N" (sem o 2000 inventado)', () => {
    // perfil sem objetivo; histórico = linha 'inicial' sem calorie_goal + uma manual de 3000 a partir de 6 out
    const inicial = { valid_from: '2026-07-11T10:00:00Z', source: 'inicial', calorie_goal: null, protein_goal: 150, carbs_goal: 200, fat_goal: 70, water_goal_ml: 2000 };
    const v = build({
      meals: [meal('2026-10-05', 2000), meal('2026-10-06', 3000), meal('2026-10-07', 3000), meal('2026-10-08', 3000), meal('2026-10-09', 3000)],
      goalHistory: [inicial, goal('2026-10-06T08:00:00Z', 3000)],
    });
    expect(v.nutrition.nDays).toBe(5);
    expect(v.nutrition.goalDays).toBe(4);
    expect(v.nutrition.daysWithoutGoal).toBe(1);
    expect(v.nutrition.hasGoal).toBe(true);
    expect(v.nutrition.goalKcal).toBe(3000);
    expect(v.nutrition.pct).toBe(100);
    expect(v.nutrition.status).toBe('ok');
    expect(v.nutrition.daysInGoal).toBe(4);
    // a média em kcal é de todos os dias registados
    expect(v.nutrition.avgKcal).toBe(2800);
  });

  it('O1: com menos de 3 dias com objetivo não há %, mesmo com 5 dias registados', () => {
    const inicial = { valid_from: '2026-07-11T10:00:00Z', source: 'inicial', calorie_goal: null };
    const v = build({
      meals: [meal('2026-10-05'), meal('2026-10-06'), meal('2026-10-07'), meal('2026-10-08', 3000), meal('2026-10-09', 3000)],
      goalHistory: [inicial, goal('2026-10-08T08:00:00Z', 3000)],
    });
    expect(v.nutrition.enough).toBe(true);
    expect(v.nutrition.goalDays).toBe(2);
    expect(v.nutrition.goalEnough).toBe(false);
    expect(v.nutrition.pct).toBeNull();
    expect(v.nutrition.status).toBeNull();
  });

  it('O1: sem nenhum dia com objetivo (só a linha inicial sem calorias) continua sem objetivo', () => {
    const inicial = { valid_from: '2026-07-11T10:00:00Z', source: 'inicial', calorie_goal: null };
    const v = build({ meals: quatro, goalHistory: [inicial] });
    expect(v.nutrition.hasGoal).toBe(false);
    expect(v.nutrition.pct).toBeNull();
  });

  it(`▲/▼ dos dias no objetivo só com ${HUB_DELTA_MIN_MEAL_DAYS}+ dias dos dois lados e histórico na semana anterior`, () => {
    const anterior = [meal('2026-09-28', 800), meal('2026-09-29', 2000), meal('2026-09-30', 2000), meal('2026-10-01', 800), meal('2026-10-02', 800)];
    const v = build({ meals: [...quatro, ...anterior], profile: { calorie_goal: 2000 } });
    expect(v.nutrition.delta).toEqual({
      cur: { k: 4, n: 4 }, prev: { k: 2, n: 5 }, windowDays: 5, label: 'a 28 set – 2 out',
    });
    // só 3 dias na anterior: não se compara
    expect(build({ meals: [...quatro, ...anterior.slice(0, 3)], profile: { calorie_goal: 2000 } }).nutrition.delta).toBeNull();
    // o histórico começa depois do início da janela anterior
    expect(build({ meals: [...quatro, ...anterior.slice(1)], profile: { calorie_goal: 2000 } }).nutrition.delta).toBeNull();
  });

  it('objetivos aproximados quando a semana tem dias antes de 3 out', () => {
    expect(build({ meals: quatro, profile: { calorie_goal: 2000 } }).nutrition.approxGoals).toBe(false);
    const passada = build({ meals: [meal('2026-09-29'), meal('2026-09-30'), meal('2026-10-01')], profile: { calorie_goal: 2000 } }, { offset: -1 });
    expect(passada.nutrition.approxGoals).toBe(true);
  });

  it('sem refeições nunca: hasHistory é falso', () => {
    expect(build().nutrition.hasHistory).toBe(false);
  });
});

describe('Corpo (O4)', () => {
  it('a última pesagem, com data; uma pesagem de hoje é um facto fechado', () => {
    const v = build({ body: [peso('2026-10-01', 75), peso(HOJE, 74.2)] });
    expect(v.body.last).toEqual({ date: HOJE, weight: 74.2 });
    expect(v.body.ageDays).toBe(0);
  });

  it('com uma pesagem não há tendência (nunca "0 kg/sem")', () => {
    const v = build({ body: [peso('2026-10-07', 74.6)] });
    expect(v.body.trendKnown).toBe(false);
    expect(v.body.trend).toBeNull();
    expect(v.body.weeklyRate).toBeNull();
    expect(v.body.pointsInWindow).toBe(1);
  });

  it('tendência só com 3 pesagens em 10+ dias e a última recente', () => {
    const v = build({ body: [peso('2026-09-28', 80), peso('2026-10-04', 78), peso('2026-10-09', 76)] });
    expect(v.body.trendKnown).toBe(true);
    expect(v.body.trend).toBe('descendo');
    expect(v.body.weeklyRate).toBeLessThan(-1);
    expect(v.body.pointsInWindow).toBe(3);
  });

  it('pesagens espaçadas (80 → 74 em 3 meses): não é "estável", é "a calibrar"', () => {
    const v = build({ body: [peso('2026-07-10', 80), peso(HOJE, 74)] });
    expect(v.body.trendKnown).toBe(false);
    expect(v.body.trend).toBeNull();
  });

  it('última pesagem a mais de 14 dias: desatualizado, sem tendência no presente', () => {
    const v = build({ body: [peso('2026-06-20', 80), peso('2026-06-26', 78), peso('2026-07-02', 76)] });
    expect(v.body.stale).toBe(true);
    expect(v.body.trendKnown).toBe(false);
    expect(v.body.staleDays).toBeGreaterThan(14);
  });

  it('numa semana passada, só as pesagens até ao fim dessa semana', () => {
    const v = build({ body: [peso('2026-10-01', 75), peso('2026-10-08', 73)] }, { offset: -1 });
    expect(v.body.last.date).toBe('2026-10-01');
    // idade contada de hoje (para o texto) e frescura contada do fim da semana
    expect(v.body.ageDays).toBe(9);
    expect(v.body.staleDays).toBe(3);
    expect(v.body.stale).toBe(false);
  });

  it('conta as avaliações da semana (todas, não só as com peso)', () => {
    const v = build({ body: [peso('2026-10-06', 74), { id: 'bf', date: '2026-10-07', body_fat_pct: 18 }, peso('2026-09-30', 75)] });
    expect(v.body.assessments).toBe(2);
  });

  it('sem pesagens: sem última', () => {
    expect(build({ body: [{ id: 'bf', date: '2026-10-07', body_fat_pct: 18 }] }).body.last).toBeNull();
  });
});

describe('Antes do 1.º registo de cada módulo (R7)', () => {
  // runs e ginásio começam a 6 out (terça); a semana de 31 ago – 6 set é muito anterior
  const inicio = { runs: [run('2026-10-06', 8)], sessions: [forca('2026-10-06')], meals: [meal('2026-10-06')], body: [peso('2026-10-06', 75)] };

  it('uma semana inteira antes do 1.º registo: nada de "0", `beforeData` em todos os pilares', () => {
    const v = build(inicio, { offset: -5 });
    expect(v.period.start).toBe('2026-08-31');
    for (const k of ['run', 'gym', 'nutrition', 'body']) {
      expect(v[k].beforeData, k).toBe(true);
      expect(v[k].dataStart, k).toBe('2026-10-06');
    }
    expect(v.run.partial).toBe(false);
    expect(v.gym.partial).toBe(false);
    expect(v.body.last).toBeNull();
    expect(v.run.delta).toBeNull();
    expect(v.gym.delta).toBeNull();
    expect(v.nutrition.delta).toBeNull();
  });

  it('só um módulo é recente: anda meses a correr mas só registou ginásio esta semana', () => {
    // semana passada (28 set – 4 out): corridas existiam, ginásio ainda não
    const v = build({ runs: [run('2026-08-01'), run('2026-10-01')], sessions: [forca('2026-10-07')] }, { offset: -1 });
    expect(v.run.beforeData).toBe(false);
    expect(v.run.count).toBe(1);
    expect(v.gym.beforeData).toBe(true);
    expect(v.gym.strength).toBe(0);
  });

  it('o 1.º registo a meio da semana vista (sábado): `partial`, não `beforeData`', () => {
    // semana de 28 set – 4 out: o ginásio só começa no sábado 3 out
    const v = build({ sessions: [forca('2026-10-03')] }, { offset: -1 });
    expect(v.gym.beforeData).toBe(false);
    expect(v.gym.partial).toBe(true);
    expect(v.gym.strength).toBe(1);
  });

  it('o histórico começa antes do início da semana: nem `partial` nem `beforeData`', () => {
    const v = build({ sessions: [forca('2026-09-20'), forca('2026-10-01')] }, { offset: -1 });
    expect(v.gym.beforeData).toBe(false);
    expect(v.gym.partial).toBe(false);
  });

  it('semana em curso com o 1.º registo hoje: os dias fechados são anteriores ao registo', () => {
    const v = build({ runs: [run(HOJE)], sessions: [forca(HOJE)] });
    expect(v.run.beforeData).toBe(true);
    expect(v.gym.beforeData).toBe(true);
  });

  it('segunda-feira (0 dias fechados) nunca é `beforeData`: é "a começar"', () => {
    const v = build({ runs: [run('2026-10-12')] }, { offset: 0 }, '2026-10-12');
    expect(v.closedDays).toBe(0);
    expect(v.run.beforeData).toBe(false);
  });

  it('sem registos de um módulo (nunca) não é "antes do 1.º registo"', () => {
    const v = build({ runs: [run('2026-10-06')] }, { offset: -5 });
    expect(v.gym.hasHistory).toBe(false);
    expect(v.gym.beforeData).toBe(false);
    expect(v.body.beforeData).toBe(false);
  });
});

describe('pureza', () => {
  it('o mesmo (deps, período, hoje) dá o mesmo resultado, e dados em falta não rebentam', () => {
    const a = build({ runs: [run('2026-10-06')] });
    expect(build({ runs: [run('2026-10-06')] }).run.km).toBe(a.run.km);
    expect(() => buildHubView(undefined, undefined, HOJE)).not.toThrow();
    expect(() => buildHubView([null, null, null, null, null, null], { offset: 0 }, HOJE)).not.toThrow();
  });
});
