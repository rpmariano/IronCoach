import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildNutritionView, resetNutritionViewMemo, EATING_MIN_CLOSED, nutritionEarlyState, incompleteDaysOf,
  WEEKDAY_MIN, WEEKDAY_MIN_DAYS, INCOMPLETE_KCAL_RATIO,
} from './nutrition';
import { calendarPeriod } from '@formulas/calendarPeriod.ts';
import { getEvolutionViewDef } from '../registry';

/* Vista pré-calculada da Nutrição (fase 4 da Evolução, 2026-10-04). Os
   números do mock-up aprovado "Evolução · Nutrição por período": hoje é
   domingo, 4 out 2026; a semana em curso tem seg 28 set – sáb 3 out fechados. */

const TODAY = '2026-10-04';
const PROFILE = { calorie_goal: 2400, protein_goal: 150, carbs_goal: 300, fat_goal: 80, water_goal_ml: 2500 };
const meal = (date, calories, protein, carbs, fat) => ({ id: `${date}-${calories}`, date, meal_items: [{ calories, protein, carbs, fat }] });

// Semana do mock-up (Main) + hoje "até agora".
const WEEK = [
  meal('2026-09-28', 2520, 142, 310, 84), meal('2026-09-29', 2180, 128, 275, 76),
  meal('2026-09-30', 1960, 118, 230, 70), meal('2026-10-01', 2610, 151, 320, 86),
  meal('2026-10-02', 2040, 125, 255, 74), meal('2026-10-03', 2550, 128, 320, 78),
  meal('2026-10-04', 1240, 64, 150, 38),
];
// Semana anterior (21 – 27 set): calorias e proteína no objetivo em 3 dos 6 primeiros.
const PREV_WEEK = [
  meal('2026-09-21', 2400, 150, 300, 80), meal('2026-09-22', 2400, 150, 300, 80),
  meal('2026-09-23', 2400, 150, 300, 80), meal('2026-09-24', 2000, 120, 250, 70),
  meal('2026-09-25', 2000, 120, 250, 70), meal('2026-09-26', 2000, 120, 250, 70),
  meal('2026-09-27', 2400, 150, 300, 80),
];
const WATER = [
  { date: '2026-09-28', amount_ml: 2600 }, { date: '2026-09-29', amount_ml: 2400 }, { date: '2026-09-30', amount_ml: 2100 },
  { date: '2026-10-02', amount_ml: 2200 }, { date: '2026-10-03', amount_ml: 2350 },
];
const RUNS = [{ date: '2026-09-29', distance_km: 12 }, { date: '2026-10-01', distance_km: 8 }, { date: '2026-10-03', distance_km: 20 }];
const GYM = [{ date: '2026-09-30', kind: 'forca' }];

const deps = ({ meals = [...PREV_WEEK, ...WEEK], waterLogs = WATER, runs = RUNS, gym = GYM, body = [], profile = PROFILE, goalHistory = [], marked = [] } = {}) =>
  [meals, waterLogs, runs, gym, body, profile, goalHistory, marked];
const build = (period, today = TODAY, d = deps()) => buildNutritionView(d, period, today);

describe('vista da Nutrição (views/nutrition.js)', () => {
  beforeEach(() => resetNutritionViewMemo());

  it('regista-se como a vista do separador nutricao, com os 8 deps (os dias marcados por último)', () => {
    const def = getEvolutionViewDef('nutricao');
    expect(def).toBeTruthy();
    expect(def.deps({ meals: 1, waterLogs: 2, runs: 3, gymSessions: 4, bodyAssessments: 5, profile: 6, goalHistory: 7, nutritionIncompleteDays: 8 }))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('a vista Dia não usa a cache (é a de sempre)', () => {
    expect(build({ kind: 'dia', offset: 0 })).toEqual({ kind: 'dia', offset: 0 });
  });

  it('semana em curso: só os dias fechados (N1) — hoje fica à parte, "até agora"', () => {
    const v = build({ kind: 'semana', offset: 0 });
    expect(v.closedDays).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(v.rows.map((r) => r.date)).not.toContain(TODAY);
    expect(v.summary.nDays).toBe(6);
    expect(v.summary.byKey.calories.avg).toBe(2310);
    expect(v.summary.byKey.calories.pctLabel).toBe(96);
    expect(v.summary.byKey.protein).toMatchObject({ avg: 132, status: 'below', daysInGoal: 2, nDays: 6 });
    expect(v.summary.byKey.water).toMatchObject({ avg: 2330, status: 'ok', daysInGoal: 3, nDays: 5 });
    expect(v.todayRow.values.calories).toBe(1240);
    expect(v.days.map((d) => d.state)).toEqual(['closed', 'closed', 'closed', 'closed', 'closed', 'closed', 'today']);
    expect(v.earlyState).toBe('ok');
    expect(v.label).toMatchObject({ title: 'Esta semana', range: '28 set – 4 out', status: 'em curso' });
    expect(v.verdict).toEqual({
      text: 'Calorias no sítio (96%), mas a proteína está curta: 88% do objetivo — só 2 de 6 dias lá chegaram.',
      tone: 'warn',
    });
  });

  it('▲/▼ contra os MESMOS dias da semana anterior (R5/N6): "21 – 26 set", não a distância ao objetivo', () => {
    const v = build({ kind: 'semana', offset: 0 });
    expect(v.compare.label).toBe('21 – 26 set');
    expect(v.compare.both).toMatchObject({ cur: { k: 2, n: 6 }, prev: { k: 3, n: 6 }, sameN: true });
    expect(v.compare.byKey.calories.prevAvg).toBe(2200);
    expect(v.firstPeriod).toBe(false);
  });

  it('semana passada (fechada) contra a anterior inteira', () => {
    const v = build({ kind: 'semana', offset: -1 });
    expect(v.period.start).toBe('2026-09-21');
    expect(v.closedDays).toHaveLength(7);
    // A anterior (14 – 20 set) não tem registos: não há ▲/▼, mas também não é a 1.ª.
    expect(v.compare).toBe(null);
    expect(v.firstPeriod).toBe(true); // 1.º registo a 21 set
  });

  it('mês fechado contra o mês anterior inteiro, pelas % (dias diferentes): "agosto"', () => {
    const aug = Array.from({ length: 9 }, (_, i) => meal(`2026-08-${String(i + 10).padStart(2, '0')}`, i < 4 ? 2400 : 2000, 150, 300, 80));
    const v = build({ kind: 'mes', offset: -1 }, TODAY, deps({ meals: [...aug, ...PREV_WEEK, ...WEEK] }));
    expect(v.label.title).toBe('setembro 2026');
    expect(v.compare.label).toBe('agosto');
    expect(v.compare.both.sameN).toBe(false);
    expect(v.compare.both.prev).toEqual({ k: 4, n: 9 });
    expect(v.compare.both.prevPct).toBe(44);
    expect(v.compare.both.cur).toEqual({ k: 5, n: 10 });
    expect(v.firstPeriod).toBe(false);
    expect(v.label.coverage).toBe('10 de 30 dias com registo'); // 1.º registo a 10 ago: setembro conta inteiro
  });

  it('mês FECHADO com os mesmos dias dos dois lados: sameN é false (o mock-up diz "▲ agosto: 11 de 29 (38%)", não "▲ 3 face a agosto")', () => {
    const day = (m, d) => `2026-${m}-${String(d).padStart(2, '0')}`;
    const aug = Array.from({ length: 28 }, (_, i) => meal(day('08', i + 1), i < 14 ? 2400 : 2000, 150, 300, 80));
    const sep = Array.from({ length: 28 }, (_, i) => meal(day('09', i + 3), 2400, 150, 300, 80));
    const v = build({ kind: 'mes', offset: -1 }, TODAY, deps({ meals: [...aug, ...sep] }));
    expect(v.compare.both.cur.n).toBe(28);
    expect(v.compare.both.prev.n).toBe(28);
    expect(v.compare.both.sameN).toBe(false);
    expect(v.compare.both).toMatchObject({ curPct: 100, prevPct: 50 });
  });

  it('período em curso: sameN continua true quando os dias são os mesmos do anterior (a diferença de dias)', () => {
    const v = build({ kind: 'semana', offset: 0 });
    expect(v.compare.both.sameN).toBe(true);
  });

  it('o período começa antes do 1.º registo: "desde 13 jul", 1.º trimestre, sem ▲/▼ (R7)', () => {
    const jul = [meal('2026-07-13', 2400, 150, 300, 80), meal('2026-07-14', 2400, 150, 300, 80)];
    const v = build({ kind: 'trimestre', offset: -1 }, TODAY, deps({ meals: [...jul, ...PREV_WEEK, ...WEEK] }));
    expect(v.dataStartISO).toBe('2026-07-13');
    expect(v.closedDays[0]).toBe('2026-07-13');
    expect(v.label.coverage).toBe('desde 13 jul · 12 de 80 dias com registo');
    expect(v.firstPeriod).toBe(true);
    expect(v.compare).toBe(null);
    // As semanas antes do 1.º registo ficam marcadas (não são "sem registo").
    expect(v.weeks[0]).toMatchObject({ start: '2026-07-01', beforeData: true });
    expect(v.weeks[2]).toMatchObject({ start: '2026-07-13', beforeData: false });
  });

  it('a começar (segunda, 5 out): nada fechado, e o resumo da semana passada inteira (R8)', () => {
    const v = build({ kind: 'semana', offset: 0 }, '2026-10-05');
    expect(v.earlyState).toBe('a_comecar');
    expect(v.closedDays).toEqual([]);
    expect(v.previousFull).toMatchObject({ range: '28 set – 4 out', nDays: 7 });
    expect(v.previousFull.both.n).toBe(7);
  });

  it('cedo (outubro com 3 dias fechados): o resumo de setembro para o "Ver setembro"', () => {
    const v = build({ kind: 'mes', offset: 0 });
    expect(v.earlyState).toBe('cedo');
    expect(v.closedDays).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(v.previousFull).toMatchObject({ name: 'setembro', nDays: 10 });
    expect(v.eating.enough).toBe(false);
    expect(v.eating.minClosed).toBe(EATING_MIN_CLOSED.mes);
  });

  it('o objetivo de cada dia vem do histórico (N5) e antes de 3 out é aproximado', () => {
    const goalHistory = [
      { valid_from: '2026-09-01T08:00:00Z', source: 'inicial', calorie_goal: 2000, protein_goal: 150, carbs_goal: 300, fat_goal: 80, water_goal_ml: 2500 },
      { valid_from: '2026-10-03T08:00:00Z', source: 'perfil', calorie_goal: 2400, protein_goal: 150, carbs_goal: 300, fat_goal: 80, water_goal_ml: 2500 },
    ];
    const v = build({ kind: 'semana', offset: 0 }, TODAY, deps({ goalHistory }));
    const byDate = Object.fromEntries(v.rows.map((r) => [r.date, r]));
    expect(byDate['2026-09-28'].goals.calorie_goal).toBe(2000);
    expect(byDate['2026-09-28'].status.calories.status).toBe('above'); // 2520 = 126% de 2000
    expect(byDate['2026-10-03'].goals.calorie_goal).toBe(2400);
    expect(v.summary.approxGoals).toBe(true);
    // Objetivo médio dos dias registados: (5 × 2000 + 2400) / 6.
    expect(Math.round(v.summary.byKey.calories.goal)).toBe(2067);
  });

  it('comer para treinar e EA só em dias fechados com refeições (N4)', () => {
    const v = build({ kind: 'semana', offset: 0 }, TODAY, deps({ runs: [...RUNS, { date: '2026-10-04', distance_km: 10 }] }));
    expect(v.eating.enough).toBe(true); // 6 dias fechados ≥ 4
    expect(v.eating.withTraining).toMatchObject({ nDays: 4, avgKcal: 2325 });
    expect(v.eating.withoutTraining).toMatchObject({ nDays: 2, avgKcal: 2280 });
    expect(v.ea.daily.map((d) => d.date)).not.toContain(TODAY);
    expect(v.ea.lowTrainingDays.map((d) => d.date)).toEqual(['2026-09-29', '2026-10-03']);
  });

  it('trimestre em curso: a semana de hoje só com os dias fechados, marcada; dias da semana com mínimo de 4', () => {
    const v = build({ kind: 'trimestre', offset: 0 });
    const w = v.weeks[0];
    expect(w).toMatchObject({ start: '2026-10-01', end: '2026-10-04', inProgress: true, closedDays: 3 });
    expect(w.perKey.calories.nDays).toBe(3);
    expect(v.weeks[1].future).toBe(true);
    expect(v.weekdays.calories.complete).toBe(false);
  });

  it('micronutrientes: média por dia dos dias fechados do período (N2)', () => {
    const m = [{ date: '2026-10-01', meal_items: [{ calories: 1000, fiber: 20 }] }, { date: '2026-10-02', meal_items: [{ calories: 1000, fiber: 30 }] }, { date: TODAY, meal_items: [{ calories: 500, fiber: 99 }] }];
    const v = build({ kind: 'mes', offset: 0 }, TODAY, deps({ meals: m }));
    expect(v.micros.nDays).toBe(2);
    expect(v.micros.avg.fiber).toBe(25);
  });

  /* Revisão de 2026-10-04: com o 1.º registo a meio do período em curso, o
     "cedo" conta os dias fechados DESDE ele — os de antes não são dias da
     app (o gráfico marca-os "antes do primeiro registo"). */
  describe('estado do período com o 1.º registo a meio (R6/R7)', () => {
    it('1.ª refeição na sexta: 2 dias fechados desde aí → "cedo" (o calendário tinha 6)', () => {
      const m = [meal('2026-10-02', 2040, 125, 255, 74), meal('2026-10-03', 2550, 128, 320, 78)];
      const v = build({ kind: 'semana', offset: 0 }, TODAY, deps({ meals: m }));
      expect(v.period.closedDays).toBe(6);
      expect(v.closedDays).toEqual(['2026-10-02', '2026-10-03']);
      expect(v.earlyState).toBe('cedo');
      expect(v.startsBeforeData).toBe(true);
      // 2, 3 e 4 out: a semana nunca chega aos 4 dias de "Comer para treinar".
      expect(v.daysFromDataStart).toBe(3);
    });

    it('1.ª refeição hoje, a meio da semana: nada fechado desde ela → "a_comecar"', () => {
      const v = build({ kind: 'semana', offset: 0 }, TODAY, deps({ meals: [meal(TODAY, 640, 30, 80, 20)] }));
      expect(v.closedDays).toEqual([]);
      expect(v.earlyState).toBe('a_comecar');
      expect(v.firstPeriod).toBe(true);
    });

    it('com 4 dias desde o 1.º registo já é "ok"; sem corte fica o do calendário', () => {
      const p = calendarPeriod('mes', TODAY, 0);
      expect(nutritionEarlyState(p, TODAY, 3, null)).toBe('cedo'); // 3 de outubro, do calendário
      const w = calendarPeriod('semana', TODAY, 0);
      expect(nutritionEarlyState(w, TODAY, 4, '2026-09-30')).toBe('ok');
      expect(nutritionEarlyState(w, TODAY, 3, '2026-10-01')).toBe('cedo');
      expect(nutritionEarlyState(w, TODAY, 6, '2026-09-01')).toBe('ok');
      // Um período passado não fica "cedo" (o veredicto diz "Só 3 dias com registo").
      const past = calendarPeriod('mes', TODAY, -1);
      expect(nutritionEarlyState(past, TODAY, 3, '2026-09-28')).toBe('ok');
    });

    it('mês passado cortado pelo 1.º registo: dias desde ele', () => {
      const v = build({ kind: 'mes', offset: -1 }, TODAY, deps({ meals: WEEK }));
      expect(v.startsBeforeData).toBe(true);
      expect(v.daysFromDataStart).toBe(3);
      expect(v.eating).toMatchObject({ enough: false, closedDays: 3, minClosed: EATING_MIN_CLOSED.mes });
    });
  });
});

/* 2026-10-05 — limiares da Nutrição (auditoria, N3/N4/N6) e dias provavelmente
   incompletos. Uma refeição por dia nos dados de cima: aqui constroem-se dias
   com o número de refeições que cada caso precisa. */
describe('dias provavelmente incompletos', () => {
  const rowOf = (date, calories, goal = 2400) => ({ date, hasMeals: calories != null, values: { calories }, goals: { calorie_goal: goal } });
  const counts = (o) => new Map(Object.entries(o));

  it('menos de 40% do objetivo de calorias OU uma só refeição; continuam nas contas', () => {
    expect(INCOMPLETE_KCAL_RATIO).toBe(0.4);
    const rows = [rowOf('2026-10-01', 2300), rowOf('2026-10-02', 2300), rowOf('2026-10-03', 900)];
    // 1 out: 3 refeições, completo. 2 out: uma só refeição. 3 out: 900 < 40% de 2 400 (960).
    const r = incompleteDaysOf(rows, counts({ '2026-10-01': 3, '2026-10-02': 1, '2026-10-03': 2 }));
    expect(r).toEqual({ days: ['2026-10-02', '2026-10-03'], n: 2, of: 3 });
  });

  it('exatamente 40% já não é incompleto; dias sem refeições não entram', () => {
    const rows = [rowOf('2026-10-01', 960), rowOf('2026-10-02', null)];
    expect(incompleteDaysOf(rows, counts({ '2026-10-01': 2 }))).toEqual({ days: [], n: 0, of: 1 });
  });

  it('sem objetivo de calorias só vale o "uma só refeição"', () => {
    const rows = [rowOf('2026-10-01', 100, 0), rowOf('2026-10-02', 100, 0)];
    expect(incompleteDaysOf(rows, counts({ '2026-10-01': 2, '2026-10-02': 1 })).days).toEqual(['2026-10-02']);
  });

  it('a vista diz quantos e o intervalo dos dias com refeições (cabeçalho "3 dias: 1–3 out")', () => {
    const m = (date, kcal) => ({ id: `${date}-${kcal}`, date, meal_items: [{ calories: kcal, protein: 100, carbs: 200, fat: 60 }] });
    const meals = [
      m('2026-10-01', 1200), m('2026-10-01', 1200), // 2 refeições, 2 400
      m('2026-10-02', 1900), // uma só refeição
      m('2026-10-03', 500), m('2026-10-03', 400), // 900 < 960
    ];
    const v = build({ kind: 'mes', offset: 0 }, TODAY, deps({ meals, waterLogs: [], runs: [], gym: [] }));
    expect(v.incomplete).toEqual({ days: ['2026-10-02', '2026-10-03'], n: 2, of: 3 });
    expect(v.recordedRange).toEqual({ first: '2026-10-01', last: '2026-10-03' });
    // Continuam nas contas: a média é a dos 3 dias.
    expect(v.summary.nDays).toBe(3);
    expect(v.summary.byKey.calories.avg).toBeCloseTo((2400 + 1900 + 900) / 3, 5);
  });
});

describe('limiares da Nutrição (N3, N4, N6)', () => {
  beforeEach(() => resetNutritionViewMemo());
  const dayMeals = (iso, n = 3) => Array.from({ length: n }, (_, i) => ({ id: `${iso}-${i}`, date: iso, meal_items: [{ calories: 800, protein: 50, carbs: 100, fat: 25 }] }));
  const range = (from, to) => {
    const out = [];
    for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
    return out;
  };

  it('N3: "Comer para treinar" conta dias com refeições, não dias fechados', () => {
    // Setembro inteiro fechado (30 dias) mas só 5 dias com refeições: < 7.
    const meals = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'].flatMap((d) => dayMeals(d));
    const v = build({ kind: 'mes', offset: -1 }, TODAY, deps({ meals, waterLogs: [], runs: [], gym: [] }));
    expect(v.closedDays).toHaveLength(30);
    expect(v.eating).toMatchObject({ enough: false, mealDays: 5, closedDays: 30, minClosed: 7 });
    // Com 7 dias com refeições passa.
    const more = [...meals, ...dayMeals('2026-09-06'), ...dayMeals('2026-09-07')];
    const v2 = build({ kind: 'mes', offset: -1 }, TODAY, deps({ meals: more, waterLogs: [], runs: [], gym: [] }));
    expect(v2.eating).toMatchObject({ enough: true, mealDays: 7 });
  });

  it('N3: no mês em curso curto, o período anterior diz quantos dias com refeições tem', () => {
    const meals = [...range('2026-09-01', '2026-09-24').flatMap((d) => dayMeals(d)), ...range('2026-10-01', '2026-10-03').flatMap((d) => dayMeals(d))];
    const v = build({ kind: 'mes', offset: 0 }, TODAY, deps({ meals, waterLogs: [], runs: [], gym: [] }));
    expect(v.eating).toMatchObject({ enough: false, mealDays: 3 });
    expect(v.previousData).toMatchObject({ name: 'setembro', mealDays: 24 });
  });

  it('N4: o padrão por dia da semana aparece com 5 dos 7 dias com ≥ 4 registos — um domingo por registar não o esconde', () => {
    expect(WEEKDAY_MIN).toBe(4);
    expect(WEEKDAY_MIN_DAYS).toBe(5);
    // 13 jul a 30 set (11 semanas e meia), sem nenhum registo ao domingo e 2 aos sábados.
    const days = range('2026-07-13', '2026-09-30').filter((d) => {
      const wd = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;
      if (wd === 6) return false; // domingo
      if (wd === 5) return d <= '2026-07-27'; // sábado: só 2 (18 e 25 jul)
      return true;
    });
    const meals = days.flatMap((d) => dayMeals(d));
    const v = build({ kind: 'trimestre', offset: -1 }, TODAY, deps({ meals, waterLogs: [], runs: [], gym: [] }));
    const wk = v.weekdays.calories;
    expect(wk.strong).toBe(5);
    expect(wk.shown).toBe(true);
    expect(wk.complete).toBe(false);
    expect(wk.days[5]).toMatchObject({ n: 2, thin: true }); // sábado: a cinzento
    expect(wk.days[6]).toBe(null); // domingo: nada
    expect(wk.days[0].thin).toBe(false);
  });

  it('N4: com menos de 5 dias da semana a cumprir não aparece, e diz quantos há', () => {
    const meals = range('2026-10-01', '2026-10-03').flatMap((d) => dayMeals(d)); // qui, sex, sáb: 1 registo cada
    const v = build({ kind: 'trimestre', offset: 0 }, TODAY, deps({ meals, waterLogs: [], runs: [], gym: [] }));
    expect(v.weekdays.calories).toMatchObject({ shown: false, strong: 0 });
  });

  it('N6: sem ▲/▼ por falta de dias, diz de que lado', () => {
    // Semana passada fechada com 3 dias com refeições: não dá para comparar com a anterior.
    const meals = [...range('2026-09-14', '2026-09-16').flatMap((d) => dayMeals(d)), ...range('2026-09-21', '2026-09-27').flatMap((d) => dayMeals(d))];
    const v = build({ kind: 'semana', offset: -1 }, TODAY, deps({ meals, waterLogs: [], runs: [], gym: [] }));
    expect(v.compare).toBe(null);
    expect(v.compareNote).toBe('Sem comparação: 14 – 20 set só tem 3 dias com refeições.');
    // Com os dois lados completos não há nota.
    const ok = build({ kind: 'semana', offset: -1 }, TODAY, deps({ meals: range('2026-09-14', '2026-09-27').flatMap((d) => dayMeals(d)), waterLogs: [], runs: [], gym: [] }));
    expect(ok.compare).not.toBe(null);
    expect(ok.compareNote).toBe(null);
  });
});


/* 2026-10-06 — dias MARCADOS como incompletos pelo atleta: saem de todas as
   contas; continuam no calendário (closedDays) e em `days` como 'incomplete'. */
describe('dias marcados como incompletos', () => {
  beforeEach(() => resetNutritionViewMemo());
  const MARK = '2026-09-30'; // quarta desta semana: 1 960 kcal

  it('saem do resumo e das linhas; em `days` ficam "incomplete" com a linha só para mostrar', () => {
    const v = build({ kind: 'semana', offset: 0 }, TODAY, deps({ marked: [MARK] }));
    expect(v.closedDays).toHaveLength(6); // o calendário não muda
    expect(v.rows.map((r) => r.date)).not.toContain(MARK);
    expect(v.summary.nDays).toBe(5);
    expect(v.summary.byKey.calories.avg).toBe((2520 + 2180 + 2610 + 2040 + 2550) / 5);
    expect(v.days.map((d) => d.state)).toEqual(['closed', 'closed', 'incomplete', 'closed', 'closed', 'closed', 'today']);
    expect(v.days[2].row.values.calories).toBe(1960);
    expect(v.marked).toEqual({ days: [MARK], n: 1 });
    expect(v.earlyState).toBe('ok');
  });

  it('sem marcas, `marked` vem vazio e nada muda', () => {
    const a = build({ kind: 'semana', offset: 0 });
    const b = build({ kind: 'semana', offset: 0 }, TODAY, deps({ marked: [] }));
    expect(a.marked).toEqual({ days: [], n: 0 });
    expect(b.summary).toEqual(a.summary);
  });

  it('hoje, o futuro e dias antes do período não contam como marcados', () => {
    const v = build({ kind: 'semana', offset: 0 }, TODAY, deps({ marked: [TODAY, '2026-10-10', '2026-01-01'] }));
    expect(v.marked.n).toBe(0);
    expect(v.days[6].state).toBe('today');
    expect(v.summary.nDays).toBe(6);
  });

  it('saem da comparação, dos dois lados (o período anterior equivalente também)', () => {
    const v = build({ kind: 'semana', offset: 0 }, TODAY, deps({ marked: [MARK, '2026-09-24'] }));
    expect(v.compare.both.cur.n).toBe(5);
    expect(v.compare.both.prev.n).toBe(5);
    // 21–26 set sem o 24 (2 000): 2 400 ×3 + 2 000 ×2.
    expect(v.compare.byKey.calories.prevAvg).toBe((2400 * 3 + 2000 * 2) / 5);
    expect(v.compare.both.sameN).toBe(true);
  });

  it('saem das sugestões de dias provavelmente incompletos', () => {
    const m = (date, kcal) => ({ id: `${date}-${kcal}`, date, meal_items: [{ calories: kcal, protein: 100, carbs: 200, fat: 60 }] });
    const meals = [m('2026-10-01', 1200), m('2026-10-01', 1200), m('2026-10-02', 1900), m('2026-10-03', 500), m('2026-10-03', 400)];
    const v = build({ kind: 'mes', offset: 0 }, TODAY, deps({ meals, waterLogs: [], runs: [], gym: [], marked: ['2026-10-02'] }));
    expect(v.incomplete).toEqual({ days: ['2026-10-03'], n: 1, of: 2 });
    expect(v.summary.nDays).toBe(2);
    expect(v.recordedRange).toEqual({ first: '2026-10-01', last: '2026-10-03' });
    expect(v.days.find((d) => d.date === '2026-10-02').state).toBe('incomplete');
  });

  it('saem de Comer para treinar, EA e micronutrientes', () => {
    const micro = (date) => ({ id: `${date}-m`, date, meal_items: [{ calories: 2400, protein: 150, carbs: 300, fat: 80, iron_mg: 10 }] });
    const meals = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'].map(micro);
    const all = build({ kind: 'semana', offset: 0 }, TODAY, deps({ meals }));
    const v = build({ kind: 'semana', offset: 0 }, TODAY, deps({ meals, marked: ['2026-09-29', MARK] }));
    expect(all.eating.mealDays).toBe(6);
    expect(v.eating.mealDays).toBe(4);
    expect(v.eating.enough).toBe(true);
    expect(v.micros.nDays).toBe(all.micros.nDays - 2);
    // Os dias de treino marcados (29 set corrida, 30 set ginásio) já não entram nos "com treino".
    expect(all.eating.withTraining.nDays).toBe(4);
    expect(v.eating.withTraining.nDays).toBe(2);
    expect(v.eating.withoutTraining.nDays).toBe(all.eating.withoutTraining.nDays);
  });

  it('saem das semanas e dos dias da semana (trimestre)', () => {
    // 3.º trimestre (fechado): a última semana tem 28, 29 e 30 set.
    const all = build({ kind: 'trimestre', offset: -1 }, TODAY, deps());
    const v = build({ kind: 'trimestre', offset: -1 }, TODAY, deps({ marked: [MARK] }));
    const wk = (x) => x.weeks.find((w) => w.weekStart === '2026-09-28');
    expect(wk(all).closedDays).toBe(3);
    expect(wk(v).closedDays).toBe(2);
    expect(wk(v).perKey.calories.nDays).toBe(2);
    // Quartas com registo: 23 e 30 set; sem a marcada fica uma.
    expect(all.weekdays.calories.days[2].n).toBe(2);
    expect(v.weekdays.calories.days[2].n).toBe(1);
  });

  it('saem do período anterior inteiro (previousData / previousFull)', () => {
    const dayMeals = (iso) => [{ id: `${iso}-0`, date: iso, meal_items: [{ calories: 2400, protein: 150, carbs: 300, fat: 80 }] }];
    const sept = Array.from({ length: 24 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
    const meals = [...sept.flatMap(dayMeals), ...['2026-10-01', '2026-10-02', '2026-10-03'].flatMap(dayMeals)];
    const v = build({ kind: 'mes', offset: 0 }, TODAY, deps({ meals, waterLogs: [], runs: [], gym: [], marked: ['2026-09-01', '2026-09-02'] }));
    expect(v.previousData).toMatchObject({ name: 'setembro', mealDays: 22 });
    expect(v.previousFull.nDays).toBe(22);
  });
});
