import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildPrescriptionAdherenceContext, evaluatePrescriptions, evaluateTrainingItem, executionBase, executionScore, mealTotalsByDate } from "./prescriptionAdherence.ts";

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
    "2026-09-16 · sugeriste 2000 kcal / 125 g proteína → comeu 1600 kcal (80%) / 80 g proteína (64%) em 3 refeições",
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

Deno.test("revisão: descanso só de planos com treinos; um dia meio registado sai da média", () => {
  const summary = evaluatePrescriptions({
    items: [
      { planned_date: "2026-09-14", kind: "corrida", target_distance_km: 10, plan_id: "treino" },
      { planned_date: "2026-09-15", kind: "descanso", plan_id: "treino" },
      // Sugestão de refeição avulsa: plano só de refeições, gravada como "descanso".
      { planned_date: "2026-09-16", kind: "descanso", plan_id: "refeicoes", meal_macros: { kcal: 2000, protein_g: 100 } },
      { planned_date: "2026-09-17", kind: "descanso", plan_id: "refeicoes", meal_macros: { kcal: 2000, protein_g: 100 } },
    ],
    runs: [{ date: "2026-09-14", distance_km: 10 }, { date: "2026-09-16", distance_km: 6 }],
    gym: [],
    mealsByDate: {
      "2026-09-16": { kcal: 1900, prot: 95, carbs: 0, fat: 0, meals: 3 },
      "2026-09-17": { kcal: 400, prot: 20, carbs: 0, fat: 0, meals: 1 },
    },
  }, TODAY);
  // A corrida de dia 16 não é "descanso NÃO respeitado": esse dia nunca foi descanso prescrito.
  assertEquals(summary.training.map((t) => t.outcome), ["cumprido", "descanso_respeitado"]);
  assertStringIncludes(summary.nutrition[1].text, "dia meio registado, fora da média");
  assertStringIncludes(buildPrescriptionAdherenceContext(summary)!, "a proteína ficou em média em 95% do que sugeriste");
});

Deno.test("revisão: marcado como feito conta; a data real conta; uma corrida ligada não serve a outro dia", () => {
  // Feito e marcado, com a corrida fora da janela: feito, sem números.
  assertEquals(evaluateTrainingItem({ planned_date: "2026-09-14", kind: "corrida", status: "concluido", completed_run_id: "longe" }, [], []).text,
    "2026-09-14 · Corrida → marcado como feito");
  // Marcado para outro dia: procura-se no dia em que foi feito.
  assertEquals(evaluateTrainingItem({ planned_date: "2026-09-14", kind: "corrida", actual_date: "2026-09-13", target_distance_km: 8 }, [{ date: "2026-09-13", distance_km: 8 }], []).outcome, "cumprido");
  // Terça ligada à corrida de quarta: a quarta não fica "feita" com ela.
  const summary = evaluatePrescriptions({
    items: [
      { planned_date: "2026-09-15", kind: "corrida", target_distance_km: 8, status: "concluido", completed_run_id: "r-qua" },
      { planned_date: "2026-09-16", kind: "corrida", target_distance_km: 8 },
    ],
    runs: [{ id: "r-qua", date: "2026-09-16", distance_km: 8 }],
    gym: [],
    mealsByDate: {},
  }, TODAY);
  assertEquals(summary.training.map((t) => t.outcome), ["cumprido", "falhado"]);
});


/* ── executionScore ───────────────────────────────────────────────────────
   Tabela golden como as outras fórmulas puras da pasta: o mapa counts →
   número é exatamente o tipo de coisa que se lê melhor em JSON do que em
   asserções espalhadas. */
const golden = JSON.parse(await Deno.readTextFile(new URL("./prescriptionAdherence.golden.json", import.meta.url)));

for (const { name, counts, expect } of golden) {
  Deno.test(`executionScore — ${name}`, () => {
    assertEquals(executionScore(counts), expect.score);
    assertEquals(executionBase(counts), expect.base);
  });
}

Deno.test("executionScore: o índice entra no resumo, e é null quando não houve plano nenhum", () => {
  const comPlano = evaluatePrescriptions({
    items: [
      { planned_date: "2026-09-14", kind: "corrida", target_distance_km: 10 },
      { planned_date: "2026-09-15", kind: "corrida", target_distance_km: 10 },
      { planned_date: "2026-09-16", kind: "descanso" },
    ],
    runs: [{ date: "2026-09-14", distance_km: 10 }],
    gym: [],
    mealsByDate: {},
  }, TODAY);
  // cumprido + falhado + descanso respeitado: (1 + 0 + 0,5) / (2 + 0,5) = 60.
  assertEquals(comPlano.counts, { cumprido: 1, a_menos: 0, a_mais: 0, falhado: 1, descanso_respeitado: 1, descanso_nao_respeitado: 0 });
  assertEquals(comPlano.executionScore, 60);
  // Sem itens de treino na janela não há índice — 0 diria "cumpriu nada".
  assertEquals(evaluatePrescriptions({ items: [], runs: [], gym: [], mealsByDate: {} }, TODAY).executionScore, null);
});

Deno.test("executionScore: o texto do prompt não mudou por causa do índice", () => {
  const summary = evaluatePrescriptions({
    items: [{ planned_date: "2026-09-14", kind: "corrida", training_type: "longo", target_distance_km: 18 }],
    runs: [{ date: "2026-09-14", distance_km: 18 }],
    gym: [],
    mealsByDate: {},
  }, TODAY);
  const texto = buildPrescriptionAdherenceContext(summary)!;
  assertStringIncludes(texto, "1 treinos prescritos: 1 cumpridos, 0 a menos, 0 a mais, 0 não feitos");
  assert(!texto.includes("índice"));
});

// 2026-09-23: um dia "só refeições" DENTRO de um plano de treino (marca
// 'so-refeicoes') também não é descanso prescrito.
Deno.test("um dia só com refeições dentro do plano de treino não conta como descanso", () => {
  const summary = evaluatePrescriptions({
    items: [
      { planned_date: "2026-09-14", kind: "corrida", target_distance_km: 10, plan_id: "treino" },
      { planned_date: "2026-09-15", kind: "descanso", categories: ["so-refeicoes"], plan_id: "treino" },
    ],
    runs: [{ date: "2026-09-14", distance_km: 10 }, { date: "2026-09-15", distance_km: 6 }],
    gym: [],
    mealsByDate: {},
  }, TODAY);
  assertEquals(summary.training.map((t) => t.outcome), ["cumprido"]);
});

