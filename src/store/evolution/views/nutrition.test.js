import { describe, it, expect, beforeEach } from 'vitest';
import { buildNutritionView, resetNutritionViewMemo, EATING_MIN_CLOSED, nutritionEarlyState } from './nutrition';
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

const deps = ({ meals = [...PREV_WEEK, ...WEEK], waterLogs = WATER, runs = RUNS, gym = GYM, body = [], profile = PROFILE, goalHistory = [] } = {}) =>
  [meals, waterLogs, runs, gym, body, profile, goalHistory];
const build = (period, today = TODAY, d = deps()) => buildNutritionView(d, period, today);

describe('vista da Nutrição (views/nutrition.js)', () => {
  beforeEach(() => resetNutritionViewMemo());

  it('regista-se como a vista do separador nutricao, com os 7 deps', () => {
    const def = getEvolutionViewDef('nutricao');
    expect(def).toBeTruthy();
    expect(def.deps({ meals: 1, waterLogs: 2, runs: 3, gymSessions: 4, bodyAssessments: 5, profile: 6, goalHistory: 7 })).toEqual([1, 2, 3, 4, 5, 6, 7]);
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
