// Espelho vitest de supabase/functions/_shared/formulas/nutritionPeriod.test.ts
// (Nutrição por período, fase 4 da Evolução — 2026-10-04). Os mesmos casos
// correm no Deno e aqui (Vite, via alias @formulas), para o ecrã e a Carol
// lerem os mesmos números. Ao mudar um, mudar o outro.
// "Hoje" do mock-up aprovado: domingo, 4 out 2026.
import { describe, it, expect } from 'vitest';
import {
  classifyMacroDay,
  dailyNutritionRows,
  eatingForTraining,
  energyAvailabilityForDays,
  leanMassAsOf,
  micronutrientAverages,
  summarizeNutritionPeriod,
  trainingByDay,
  trainingDaySet,
} from '@formulas/nutritionPeriod.ts';

const GOALS = { calorie_goal: 2400, protein_goal: 150, carbs_goal: 300, fat_goal: 80, water_goal_ml: 2500 };
const goalsFor = (d) => ({ goals: GOALS, estimated: d < "2026-10-03" });
const meal = (date, calories, protein, carbs, fat, extra = {}) =>
  ({ date, meal_items: [{ calories, protein, carbs, fat, ...extra }] });
// Semana do mock-up (seg 28 set – sáb 3 out fechados; hoje, dom 4, fica de fora).
const WEEK = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"];

describe('nutritionPeriod', () => {
  it("classifyMacroDay — a régua única: 90–115%, proteína e água sem teto (N7)", () => {
    expect(classifyMacroDay("calories", 2160, 2400)).toEqual({ pct: 90, pctLabel: 90, status: "ok" });
    expect(classifyMacroDay("calories", 2760, 2400).status).toEqual("ok"); // 115% exatos ainda é dentro
    expect(classifyMacroDay("calories", 2770, 2400).status).toEqual("above");
    expect(classifyMacroDay("calories", 1200, 2400).status).toEqual("below");
    expect(classifyMacroDay("protein", 200, 150).status).toEqual("ok"); // proteína sem teto
    expect(classifyMacroDay("water", 4000, 2500).status).toEqual("ok"); // água sem teto
    expect(classifyMacroDay("fat", 100, 80).status).toEqual("above");
    expect(classifyMacroDay("carbs", 0, 300).status).toEqual("below");
    expect(classifyMacroDay("calories", null, 2400)).toEqual({ pct: null, pctLabel: null, status: null });
    expect(classifyMacroDay("calories", 2000, 0)).toEqual({ pct: null, pctLabel: null, status: null });
  });

  it("classifyMacroDay — a % mostrada nunca contradiz a palavra", () => {
    // 2150/2400 = 89,58% → Abaixo, e mostra 89 (não "Abaixo · 90%").
    const below = classifyMacroDay("calories", 2150, 2400);
    expect([below.status, below.pctLabel]).toEqual(["below", 89]);
    // 2768/2400 = 115,33% → Acima, e mostra 116 (não "Acima · 115%").
    const above = classifyMacroDay("calories", 2768, 2400);
    expect([above.status, above.pctLabel]).toEqual(["above", 116]);
    // Longe dos limites é o arredondamento normal.
    expect(classifyMacroDay("protein", 132, 150).pctLabel).toEqual(88);
  });

  it("dailyNutritionRows — só os dias pedidos, sem refeições = null (não 0), objetivo de cada dia", () => {
    const meals = [
      meal("2026-09-28", 1500, 80, 200, 50), meal("2026-09-28", 1020.4, 62, 110, 34),
      meal("2026-09-30", 1960, 118, 230, 70),
      meal("2026-10-04", 640, 30, 80, 20), // hoje — não está em WEEK, não entra (N1)
    ];
    const water = [{ date: "2026-09-28", amount_ml: 1500 }, { date: "2026-09-28", amount_ml: 1100 }, { date: "2026-10-01", amount_ml: 0 }];
    const rows = dailyNutritionRows({ meals, waterLogs: water, days: WEEK, goalsFor });
    expect(rows.length).toEqual(6);
    expect(rows[0].values).toEqual({ calories: 2520, protein: 142, carbs: 310, fat: 84, water: 2600 });
    expect(rows[0].hasMeals).toEqual(true);
    expect(rows[0].status.calories.status).toEqual("ok");
    expect(rows[0].estimated).toEqual(true);
    expect(rows[1].hasMeals).toEqual(false);
    expect(rows[1].values.calories).toEqual(null);
    expect(rows[1].status.calories.status).toEqual(null);
    expect(rows[2].status.calories.status).toEqual("below"); // 1960 = 82%
    expect(rows[3].hasWater).toEqual(true); // um registo de 0 ml é um registo
    expect(rows[3].values.water).toEqual(0);
    expect(rows[5].estimated).toEqual(false); // 3 out: já há histórico
  });

  it("dailyNutritionRows — o objetivo vem do dia (histórico), não do perfil de hoje (N5)", () => {
    const changed = (d) => ({ goals: { ...GOALS, calorie_goal: d < "2026-10-01" ? 2000 : 2400 }, estimated: false });
    const rows = dailyNutritionRows({ meals: [meal("2026-09-30", 2100, 150, 300, 80), meal("2026-10-01", 2100, 150, 300, 80)], waterLogs: [], days: ["2026-09-30", "2026-10-01"], goalsFor: changed });
    expect(rows[0].status.calories.status).toEqual("ok"); // 105% de 2000
    expect(rows[1].status.calories.status).toEqual("below"); // 87,5% de 2400
  });

  it("summarizeNutritionPeriod — média por dia registado, X de N, água com mínimo de 3 dias", () => {
    const meals = [
      meal("2026-09-28", 2520, 142, 310, 84), meal("2026-09-29", 2180, 128, 275, 76),
      meal("2026-09-30", 1960, 118, 230, 70), meal("2026-10-01", 2610, 151, 320, 86),
      meal("2026-10-02", 2040, 125, 255, 74), meal("2026-10-03", 2550, 128, 320, 78),
    ];
    const water = [{ date: "2026-09-28", amount_ml: 2600 }, { date: "2026-09-29", amount_ml: 2400 }];
    const s = summarizeNutritionPeriod(dailyNutritionRows({ meals, waterLogs: water, days: WEEK, goalsFor }));
    expect(s.nDays).toEqual(6);
    expect(s.byKey.calories.avg).toEqual(2310);
    expect(s.byKey.calories.pctLabel).toEqual(96);
    expect(s.byKey.calories.status).toEqual("ok");
    expect(s.byKey.calories.daysInGoal).toEqual(4);
    expect(s.byKey.protein.status).toEqual("below"); // 132 g = 88%
    expect(s.byKey.protein.daysInGoal).toEqual(2);
    expect(s.both).toEqual({ k: 2, n: 6 });
    // Água: 2 dias → sem média ("2 dias, poucos para média"), mas contados.
    expect([s.byKey.water.avg, s.byKey.water.nDays, s.byKey.water.tooFew]).toEqual([null, 2, true]);
    expect(s.waterDays).toEqual(2);
    expect(s.approxGoals).toEqual(true);
  });

  it("summarizeNutritionPeriod — sem dias com registo: tudo a null, 0 de 0", () => {
    const s = summarizeNutritionPeriod(dailyNutritionRows({ meals: [], waterLogs: [], days: WEEK, goalsFor }));
    expect(s.nDays).toEqual(0);
    expect(s.byKey.calories.avg).toEqual(null);
    expect(s.byKey.calories.status).toEqual(null);
    expect(s.both).toEqual({ k: 0, n: 0 });
    expect(s.approxGoals).toEqual(false);
  });

  it("trainingByDay / trainingDaySet — corridas e ginásio só nos dias pedidos", () => {
    const runs = [{ date: "2026-09-29", distance_km: 12 }, { date: "2026-10-03", distance_km: 20 }, { date: "2026-10-04", distance_km: 5 }];
    const gym = [{ date: "2026-09-30", kind: "forca" }, { date: "2026-09-30", kind: "aula" }];
    const t = trainingByDay({ runs, gymSessions: gym }, WEEK);
    expect(t.get("2026-09-29")).toEqual({ runs: 1, runKm: 12, gym: 0, classes: 0 });
    expect(t.get("2026-09-30")).toEqual({ runs: 0, runKm: 0, gym: 1, classes: 1 });
    expect(t.has("2026-10-04")).toEqual(false);
    expect([...trainingDaySet({ runs, gymSessions: gym }, WEEK)].sort()).toEqual(["2026-09-29", "2026-09-30", "2026-10-03"]);
  });

  it("eatingForTraining — kcal com e sem treino só em dias com refeições, mínimo de dias fechados", () => {
    const meals = [
      meal("2026-09-28", 2520, 142, 310, 84), meal("2026-09-29", 2000, 128, 275, 76),
      meal("2026-09-30", 1960, 118, 230, 70), meal("2026-10-02", 2440, 125, 255, 74),
    ];
    const rows = dailyNutritionRows({ meals, waterLogs: [], days: WEEK, goalsFor });
    // Treino a 29, 30 e 1 (o dia 1 não tem refeições: fica de fora).
    const e = eatingForTraining(rows, new Set(["2026-09-29", "2026-09-30", "2026-10-01"]), { minClosed: 7 });
    expect(e.enough).toEqual(false); // 6 dias fechados < 7
    expect(e.closedDays).toEqual(6);
    expect(e.withTraining).toEqual({ nDays: 2, avgKcal: 1980, belowDays: ["2026-09-29", "2026-09-30"] });
    expect(e.withoutTraining).toEqual({ nDays: 2, avgKcal: 2480 });
    expect(e.goalKcal).toEqual(2400);
    expect(e.lessOnTraining).toEqual(true);
    expect(eatingForTraining(rows, new Set(["2026-09-29"]), { minClosed: 4 }).enough).toEqual(true);
    // Diferença pequena (< 50 kcal) não é "comeste menos".
    const close = dailyNutritionRows({ meals: [meal("2026-09-28", 2300, 0, 0, 0), meal("2026-09-29", 2290, 0, 0, 0), meal("2026-09-30", 2310, 0, 0, 0), meal("2026-10-01", 2280, 0, 0, 0)], waterLogs: [], days: WEEK, goalsFor });
    expect(eatingForTraining(close, new Set(["2026-09-29", "2026-10-01"])).lessOnTraining).toEqual(false);
  });

  it("leanMassAsOf — a avaliação do período, com a origem (N4)", () => {
    const body = [
      { date: "2026-07-10", weight_kg: 80, body_fat_pct: 20 },
      { date: "2026-09-15", weight_kg: 76, lean_body_mass_kg: 62 },
    ];
    expect(leanMassAsOf(body, "2026-08-31")).toEqual({ leanMass: 64, source: "estimada", assessmentDate: "2026-07-10", weightKg: 80 });
    expect(leanMassAsOf(body, "2026-10-03")).toEqual({ leanMass: 62, source: "medida", assessmentDate: "2026-09-15", weightKg: 76 });
    // Só avaliações depois do período: a mais próxima (a primeira).
    expect(leanMassAsOf(body, "2026-06-30").assessmentDate).toEqual("2026-07-10");
    expect(leanMassAsOf([{ date: "2026-09-01", weight_kg: 70 }], "2026-10-03")).toEqual({ leanMass: 56, source: "omissao", assessmentDate: "2026-09-01", weightKg: 70 });
    expect(leanMassAsOf([], "2026-10-03")).toEqual({ leanMass: 55, source: "omissao", assessmentDate: null, weightKg: null });
  });

  it("energyAvailabilityForDays — só dias fechados com refeições; dias de treino abaixo de 30", () => {
    const meals = [meal("2026-09-28", 2500, 0, 0, 0), meal("2026-09-29", 2000, 0, 0, 0), meal("2026-10-04", 300, 0, 0, 0)];
    const runs = [
      { date: "2026-09-29", distance_km: 12 }, // 12 × 70 kg = 840 kcal → (2000 − 840)/50 = 23,2
      { date: "2026-09-30", distance_km: 10 }, // sem refeições: fora, contado à parte
      { date: "2026-10-04", distance_km: 8 }, // hoje: não está nos dias
    ];
    const gym = [{ date: "2026-09-28", calories_kcal: null }]; // 200 kcal por omissão → (2500 − 200)/50 = 46
    const body = [{ date: "2026-09-01", weight_kg: 70, lean_body_mass_kg: 50 }];
    const ea = energyAvailabilityForDays({ meals, runs, gymSessions: gym, bodyAssessments: body, days: WEEK });
    expect(ea.daily.map((d) => [d.date, d.ea, d.status, d.training])).toEqual([
      ["2026-09-28", 46, "optimal", true],
      ["2026-09-29", 23.2, "critical", true],
    ]);
    expect(ea.nDays).toEqual(2);
    expect(ea.average).toEqual(34.6);
    expect(ea.lowTrainingDays).toEqual([{ date: "2026-09-29", ea: 23.2 }]);
    expect(ea.trainingDaysWithoutMeals).toEqual(1);
    expect([ea.leanMass, ea.leanMassSource, ea.weightFallback]).toEqual([50, "medida", false]);
    const none = energyAvailabilityForDays({ meals: [], days: WEEK });
    expect([none.nDays, none.average, none.leanMassSource, none.weightFallback]).toEqual([0, null, "omissao", true]);
  });

  it("micronutrientAverages — média por dia com refeições, do período certo (N2)", () => {
    const meals = [
      meal("2026-09-28", 1000, 0, 0, 0, { fiber: 10, sodium: 1000 }),
      meal("2026-09-28", 1000, 0, 0, 0, { fiber: 10, sodium: 1000 }),
      meal("2026-09-30", 1000, 0, 0, 0, { fiber: 30, sodium: 1600, iron_mg: 6 }),
      meal("2026-10-04", 1000, 0, 0, 0, { fiber: 99 }), // hoje: fora
    ];
    const m = micronutrientAverages(meals, WEEK);
    expect(m.nDays).toEqual(2);
    expect(m.avg?.fiber).toEqual(25);
    expect(m.avg?.sodium).toEqual(1800);
    expect(m.avg?.iron_mg).toEqual(3);
    expect(m.avg?.potassium_mg).toEqual(0);
    expect(micronutrientAverages(meals, ["2026-09-29"])).toEqual({ nDays: 0, avg: null });
  });
});
