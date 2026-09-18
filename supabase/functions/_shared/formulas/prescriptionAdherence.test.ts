import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildPrescriptionAdherenceContext, evaluatePrescriptions, evaluateTrainingItem, mealTotalsByDate } from "./prescriptionAdherence.ts";

const TODAY = "2026-09-18";

Deno.test("corrida: a distância decide, ±15% é cumprido; a ligação ao registo ganha à data", () => {
  const item = { planned_date: "2026-09-14", kind: "corrida", training_type: "longo", target_distance_km: 18 };
  assertEquals(evaluateTrainingItem(item, [{ date: "2026-09-14", distance_km: 12.4, duration_seconds: 4200, effort_rpe: 8 }], []).text,
    "2026-09-14 · Corrida longo (18 km) → fez 12,4 km (69%), RPE 8 · a menos");
  assertEquals(evaluateTrainingItem(item, [{ date: "2026-09-14", distance_km: 17 }], []).outcome, "cumprido");
  assertEquals(evaluateTrainingItem(item, [{ date: "2026-09-14", distance_km: 22 }], []).outcome, "a_mais");
  assertEquals(evaluateTrainingItem(item, [], []).text, "2026-09-14 · Corrida longo (18 km) → não feito");
  // Marcado como feito com uma corrida de outro dia: vale a ligação.
  const linked = { ...item, completed_run_id: "r9" };
  assertEquals(evaluateTrainingItem(linked, [{ id: "r9", date: "2026-09-15", distance_km: 18.2 }], []).outcome, "cumprido");
});

Deno.test("corrida só com duração; duas corridas no mesmo dia somam", () => {
  const item = { planned_date: "2026-09-14", kind: "corrida", target_duration_min: 40 };
  assertEquals(evaluateTrainingItem(item, [{ date: "2026-09-14", duration_seconds: 1200 }, { date: "2026-09-14", duration_seconds: 1200 }], []).outcome, "cumprido");
  assertStringIncludes(evaluateTrainingItem(item, [{ date: "2026-09-14", duration_seconds: 1200 }], []).text, "fez 20 min (50%)");
});

Deno.test("ginásio e descanso", () => {
  const gym = { planned_date: "2026-09-15", kind: "ginasio", target_duration_min: 60 };
  assertEquals(evaluateTrainingItem(gym, [], [{ date: "2026-09-15", duration_seconds: 3300 }]).outcome, "cumprido");
  assertEquals(evaluateTrainingItem(gym, [], []).outcome, "falhado");
  const rest = { planned_date: "2026-09-16", kind: "descanso" };
  assertEquals(evaluateTrainingItem(rest, [{ date: "2026-09-16", distance_km: 5 }], []).outcome, "descanso_nao_respeitado");
  assertEquals(evaluateTrainingItem(rest, [], []).outcome, "descanso_respeitado");
});

Deno.test("evaluatePrescriptions: só os 14 dias antes de hoje, sem cancelados; as refeições contra o sugerido", () => {
  const summary = evaluatePrescriptions({
    items: [
      { planned_date: "2026-09-01", kind: "corrida", target_distance_km: 10 },             // fora da janela
      { planned_date: "2026-09-14", kind: "corrida", target_distance_km: 18 },
      { planned_date: "2026-09-15", kind: "ginasio", status: "cancelado" },                 // cancelado
      { planned_date: "2026-09-16", kind: "descanso", meal_macros: { kcal: 2000, protein_g: 125 } },
      { planned_date: "2026-09-17", kind: "descanso", meal_macros: { kcal: 2000, protein_g: 125 } },
      { planned_date: TODAY, kind: "corrida", target_distance_km: 8 },                      // hoje ainda não conta
    ],
    runs: [{ date: "2026-09-14", distance_km: 18 }],
    gym: [],
    mealsByDate: { "2026-09-16": { kcal: 1600, prot: 80, carbs: 200, fat: 50, meals: 3 } },
  }, TODAY);
  assertEquals(summary.training.map((t) => t.outcome), ["cumprido", "descanso_respeitado", "descanso_respeitado"]);
  assertEquals(summary.nutrition.map((n) => n.text), [
    "2026-09-16 · sugeriste 2000 kcal / 125 g proteína → comeu 1600 kcal (80%) / 80 g proteína (64%)",
    "2026-09-17 · sugeriste 2000 kcal / 125 g proteína → sem refeições registadas",
  ]);

  const text = buildPrescriptionAdherenceContext(summary)!;
  assertStringIncludes(text, "1 treinos prescritos: 1 cumpridos, 0 a menos, 0 a mais, 0 não feitos; descanso respeitado em 2 de 2 dias");
  assertStringIncludes(text, "a proteína ficou em média em 64% do que sugeriste");
  assertStringIncludes(text, "Um dia isolado não é um padrão");
});

Deno.test("sem nada prescrito, não há bloco", () => {
  assertEquals(buildPrescriptionAdherenceContext(evaluatePrescriptions({ items: [], runs: [], gym: [], mealsByDate: {} }, TODAY)), null);
});

Deno.test("mealTotalsByDate: soma por 100 g e conta as refeições", () => {
  const totals = mealTotalsByDate([
    { date: TODAY, meal_items: [{ quantity_grams: 200, calories_per_100g: 150, protein_per_100g: 20, carbs_per_100g: 5, fat_per_100g: 6 }] },
    { date: TODAY, meal_items: [] },
  ]);
  assertEquals(totals[TODAY], { kcal: 300, prot: 40, carbs: 10, fat: 12, meals: 2 });
  assert(!("2026-09-17" in totals));
});
