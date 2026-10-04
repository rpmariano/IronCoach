// Testes de nutritionPeriod.ts (Nutrição por período, fase 4 da Evolução,
// 2026-10-04). Espelho vitest em src/utils/nutritionPeriod.spec.js — os dois
// têm de dar o mesmo, porque o ecrã (Vite) e, um dia, a Carol (Deno) leem este
// mesmo ficheiro. Ao mudar um, mudar o outro.
// "Hoje" do mock-up aprovado: domingo, 4 out 2026.
import { assertEquals } from "jsr:@std/assert@1";
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
  type DayGoals,
} from "./nutritionPeriod.ts";

const GOALS = { calorie_goal: 2400, protein_goal: 150, carbs_goal: 300, fat_goal: 80, water_goal_ml: 2500 };
const goalsFor = (d: string): DayGoals => ({ goals: GOALS, estimated: d < "2026-10-03" });
const meal = (date: string, calories: number, protein: number, carbs: number, fat: number, extra: Record<string, number> = {}) =>
  ({ date, meal_items: [{ calories, protein, carbs, fat, ...extra }] });
// Semana do mock-up (seg 28 set – sáb 3 out fechados; hoje, dom 4, fica de fora).
const WEEK = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"];

Deno.test("classifyMacroDay — a régua única: 90–115%, proteína e água sem teto (N7)", () => {
  assertEquals(classifyMacroDay("calories", 2160, 2400), { pct: 90, pctLabel: 90, status: "ok" });
  assertEquals(classifyMacroDay("calories", 2760, 2400).status, "ok"); // 115% exatos ainda é dentro
  assertEquals(classifyMacroDay("calories", 2770, 2400).status, "above");
  assertEquals(classifyMacroDay("calories", 1200, 2400).status, "below");
  assertEquals(classifyMacroDay("protein", 200, 150).status, "ok"); // proteína sem teto
  assertEquals(classifyMacroDay("water", 4000, 2500).status, "ok"); // água sem teto
  assertEquals(classifyMacroDay("fat", 100, 80).status, "above");
  assertEquals(classifyMacroDay("carbs", 0, 300).status, "below");
  assertEquals(classifyMacroDay("calories", null, 2400), { pct: null, pctLabel: null, status: null });
  assertEquals(classifyMacroDay("calories", 2000, 0), { pct: null, pctLabel: null, status: null });
});

Deno.test("classifyMacroDay — a % mostrada nunca contradiz a palavra", () => {
  // 2150/2400 = 89,58% → Abaixo, e mostra 89 (não "Abaixo · 90%").
  const below = classifyMacroDay("calories", 2150, 2400);
  assertEquals([below.status, below.pctLabel], ["below", 89]);
  // 2768/2400 = 115,33% → Acima, e mostra 116 (não "Acima · 115%").
  const above = classifyMacroDay("calories", 2768, 2400);
  assertEquals([above.status, above.pctLabel], ["above", 116]);
  // Longe dos limites é o arredondamento normal.
  assertEquals(classifyMacroDay("protein", 132, 150).pctLabel, 88);
});

Deno.test("dailyNutritionRows — só os dias pedidos, sem refeições = null (não 0), objetivo de cada dia", () => {
  const meals = [
    meal("2026-09-28", 1500, 80, 200, 50), meal("2026-09-28", 1020.4, 62, 110, 34),
    meal("2026-09-30", 1960, 118, 230, 70),
    meal("2026-10-04", 640, 30, 80, 20), // hoje — não está em WEEK, não entra (N1)
  ];
  const water = [{ date: "2026-09-28", amount_ml: 1500 }, { date: "2026-09-28", amount_ml: 1100 }, { date: "2026-10-01", amount_ml: 0 }];
  const rows = dailyNutritionRows({ meals, waterLogs: water, days: WEEK, goalsFor });
  assertEquals(rows.length, 6);
  assertEquals(rows[0].values, { calories: 2520, protein: 142, carbs: 310, fat: 84, water: 2600 });
  assertEquals(rows[0].hasMeals, true);
  assertEquals(rows[0].status.calories.status, "ok");
  assertEquals(rows[0].estimated, true);
  assertEquals(rows[1].hasMeals, false);
  assertEquals(rows[1].values.calories, null);
  assertEquals(rows[1].status.calories.status, null);
  assertEquals(rows[2].status.calories.status, "below"); // 1960 = 82%
  assertEquals(rows[3].hasWater, true); // um registo de 0 ml é um registo
  assertEquals(rows[3].values.water, 0);
  assertEquals(rows[5].estimated, false); // 3 out: já há histórico
});

Deno.test("dailyNutritionRows — o objetivo vem do dia (histórico), não do perfil de hoje (N5)", () => {
  const changed = (d: string): DayGoals => ({ goals: { ...GOALS, calorie_goal: d < "2026-10-01" ? 2000 : 2400 }, estimated: false });
  const rows = dailyNutritionRows({ meals: [meal("2026-09-30", 2100, 150, 300, 80), meal("2026-10-01", 2100, 150, 300, 80)], waterLogs: [], days: ["2026-09-30", "2026-10-01"], goalsFor: changed });
  assertEquals(rows[0].status.calories.status, "ok"); // 105% de 2000
  assertEquals(rows[1].status.calories.status, "below"); // 87,5% de 2400
});

Deno.test("summarizeNutritionPeriod — média por dia registado, X de N, água com mínimo de 3 dias", () => {
  const meals = [
    meal("2026-09-28", 2520, 142, 310, 84), meal("2026-09-29", 2180, 128, 275, 76),
    meal("2026-09-30", 1960, 118, 230, 70), meal("2026-10-01", 2610, 151, 320, 86),
    meal("2026-10-02", 2040, 125, 255, 74), meal("2026-10-03", 2550, 128, 320, 78),
  ];
  const water = [{ date: "2026-09-28", amount_ml: 2600 }, { date: "2026-09-29", amount_ml: 2400 }];
  const s = summarizeNutritionPeriod(dailyNutritionRows({ meals, waterLogs: water, days: WEEK, goalsFor }));
  assertEquals(s.nDays, 6);
  assertEquals(s.byKey.calories.avg, 2310);
  assertEquals(s.byKey.calories.pctLabel, 96);
  assertEquals(s.byKey.calories.status, "ok");
  assertEquals(s.byKey.calories.daysInGoal, 4);
  assertEquals(s.byKey.protein.status, "below"); // 132 g = 88%
  assertEquals(s.byKey.protein.daysInGoal, 2);
  assertEquals(s.both, { k: 2, n: 6 });
  // Água: 2 dias → sem média ("2 dias, poucos para média"), mas contados.
  assertEquals([s.byKey.water.avg, s.byKey.water.nDays, s.byKey.water.tooFew], [null, 2, true]);
  assertEquals(s.waterDays, 2);
  assertEquals(s.approxGoals, true);
});

Deno.test("summarizeNutritionPeriod — sem dias com registo: tudo a null, 0 de 0", () => {
  const s = summarizeNutritionPeriod(dailyNutritionRows({ meals: [], waterLogs: [], days: WEEK, goalsFor }));
  assertEquals(s.nDays, 0);
  assertEquals(s.byKey.calories.avg, null);
  assertEquals(s.byKey.calories.status, null);
  assertEquals(s.both, { k: 0, n: 0 });
  assertEquals(s.approxGoals, false);
});

Deno.test("trainingByDay / trainingDaySet — corridas e ginásio só nos dias pedidos", () => {
  const runs = [{ date: "2026-09-29", distance_km: 12 }, { date: "2026-10-03", distance_km: 20 }, { date: "2026-10-04", distance_km: 5 }];
  const gym = [{ date: "2026-09-30", kind: "forca" }, { date: "2026-09-30", kind: "aula" }];
  const t = trainingByDay({ runs, gymSessions: gym }, WEEK);
  assertEquals(t.get("2026-09-29"), { runs: 1, runKm: 12, gym: 0, classes: 0 });
  assertEquals(t.get("2026-09-30"), { runs: 0, runKm: 0, gym: 1, classes: 1 });
  assertEquals(t.has("2026-10-04"), false);
  assertEquals([...trainingDaySet({ runs, gymSessions: gym }, WEEK)].sort(), ["2026-09-29", "2026-09-30", "2026-10-03"]);
});

Deno.test("eatingForTraining — kcal com e sem treino só em dias com refeições, mínimo de dias fechados", () => {
  const meals = [
    meal("2026-09-28", 2520, 142, 310, 84), meal("2026-09-29", 2000, 128, 275, 76),
    meal("2026-09-30", 1960, 118, 230, 70), meal("2026-10-02", 2440, 125, 255, 74),
  ];
  const rows = dailyNutritionRows({ meals, waterLogs: [], days: WEEK, goalsFor });
  // Treino a 29, 30 e 1 (o dia 1 não tem refeições: fica de fora).
  const e = eatingForTraining(rows, new Set(["2026-09-29", "2026-09-30", "2026-10-01"]), { minClosed: 7 });
  assertEquals(e.enough, false); // 6 dias fechados < 7
  assertEquals(e.closedDays, 6);
  assertEquals(e.withTraining, { nDays: 2, avgKcal: 1980, belowDays: ["2026-09-29", "2026-09-30"] });
  assertEquals(e.withoutTraining, { nDays: 2, avgKcal: 2480 });
  assertEquals(e.goalKcal, 2400);
  assertEquals(e.lessOnTraining, true);
  assertEquals(eatingForTraining(rows, new Set(["2026-09-29"]), { minClosed: 4 }).enough, true);
  // Diferença pequena (< 50 kcal) não é "comeste menos".
  const close = dailyNutritionRows({ meals: [meal("2026-09-28", 2300, 0, 0, 0), meal("2026-09-29", 2290, 0, 0, 0), meal("2026-09-30", 2310, 0, 0, 0), meal("2026-10-01", 2280, 0, 0, 0)], waterLogs: [], days: WEEK, goalsFor });
  assertEquals(eatingForTraining(close, new Set(["2026-09-29", "2026-10-01"])).lessOnTraining, false);
});

Deno.test("leanMassAsOf — a avaliação do período, com a origem (N4)", () => {
  const body = [
    { date: "2026-07-10", weight_kg: 80, body_fat_pct: 20 },
    { date: "2026-09-15", weight_kg: 76, lean_body_mass_kg: 62 },
  ];
  assertEquals(leanMassAsOf(body, "2026-08-31"), { leanMass: 64, source: "estimada", assessmentDate: "2026-07-10", weightKg: 80 });
  assertEquals(leanMassAsOf(body, "2026-10-03"), { leanMass: 62, source: "medida", assessmentDate: "2026-09-15", weightKg: 76 });
  // Só avaliações depois do período: a mais próxima (a primeira).
  assertEquals(leanMassAsOf(body, "2026-06-30").assessmentDate, "2026-07-10");
  assertEquals(leanMassAsOf([{ date: "2026-09-01", weight_kg: 70 }], "2026-10-03"), { leanMass: 56, source: "omissao", assessmentDate: "2026-09-01", weightKg: 70 });
  assertEquals(leanMassAsOf([], "2026-10-03"), { leanMass: 55, source: "omissao", assessmentDate: null, weightKg: null });
});

Deno.test("energyAvailabilityForDays — só dias fechados com refeições; dias de treino abaixo de 30", () => {
  const meals = [meal("2026-09-28", 2500, 0, 0, 0), meal("2026-09-29", 2000, 0, 0, 0), meal("2026-10-04", 300, 0, 0, 0)];
  const runs = [
    { date: "2026-09-29", distance_km: 12 }, // 12 × 70 kg = 840 kcal → (2000 − 840)/50 = 23,2
    { date: "2026-09-30", distance_km: 10 }, // sem refeições: fora, contado à parte
    { date: "2026-10-04", distance_km: 8 }, // hoje: não está nos dias
  ];
  const gym = [{ date: "2026-09-28", calories_kcal: null }]; // 200 kcal por omissão → (2500 − 200)/50 = 46
  const body = [{ date: "2026-09-01", weight_kg: 70, lean_body_mass_kg: 50 }];
  const ea = energyAvailabilityForDays({ meals, runs, gymSessions: gym, bodyAssessments: body, days: WEEK });
  assertEquals(ea.daily.map((d) => [d.date, d.ea, d.status, d.training]), [
    ["2026-09-28", 46, "optimal", true],
    ["2026-09-29", 23.2, "critical", true],
  ]);
  assertEquals(ea.nDays, 2);
  assertEquals(ea.average, 34.6);
  assertEquals(ea.lowTrainingDays, [{ date: "2026-09-29", ea: 23.2 }]);
  assertEquals(ea.trainingDaysWithoutMeals, 1);
  assertEquals([ea.leanMass, ea.leanMassSource, ea.weightFallback], [50, "medida", false]);
  const none = energyAvailabilityForDays({ meals: [], days: WEEK });
  assertEquals([none.nDays, none.average, none.leanMassSource, none.weightFallback], [0, null, "omissao", true]);
});

Deno.test("micronutrientAverages — média por dia com refeições, do período certo (N2)", () => {
  const meals = [
    meal("2026-09-28", 1000, 0, 0, 0, { fiber: 10, sodium: 1000 }),
    meal("2026-09-28", 1000, 0, 0, 0, { fiber: 10, sodium: 1000 }),
    meal("2026-09-30", 1000, 0, 0, 0, { fiber: 30, sodium: 1600, iron_mg: 6 }),
    meal("2026-10-04", 1000, 0, 0, 0, { fiber: 99 }), // hoje: fora
  ];
  const m = micronutrientAverages(meals, WEEK);
  assertEquals(m.nDays, 2);
  assertEquals(m.avg?.fiber, 25);
  assertEquals(m.avg?.sodium, 1800);
  assertEquals(m.avg?.iron_mg, 3);
  assertEquals(m.avg?.potassium_mg, 0);
  assertEquals(micronutrientAverages(meals, ["2026-09-29"]), { nDays: 0, avg: null });
});
