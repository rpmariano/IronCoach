import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildRecommendationsContext, evaluateRecommendations, parseRecommendations, MAX_RECOMMENDATIONS_PER_REPLY } from "./recommendations.ts";
import { assertCarolVoice } from "../carolTone.ts";

// 5.5, push 2: as recomendações soltas que a Carol dá na conversa.

const TODAY = "2026-09-25";

Deno.test("parseRecommendations: só o que é verificável — data de ontem a +14 dias, tipo conhecido, números plausíveis", () => {
  const rows = parseRecommendations([
    { date: "2026-09-26", kind: "descanso" },
    { date: "2026-09-25", kind: "corrida", duration_min: 30, distance_km: "5,5" },
    { date: "2026-09-25", kind: "proteina", protein_g: 140 },
    { date: "2026-09-27", kind: "ginasio", duration_min: 45 },
    { date: "2026-09-23", kind: "descanso" },          // anteontem: fora
    { date: "2026-10-20", kind: "descanso" },          // mais de 14 dias à frente: fora
    { date: "amanhã", kind: "descanso" },              // data que não é data
    { date: "2026-09-26", kind: "alongamentos" },      // tipo desconhecido
    { date: "2026-09-26", kind: "proteina" },          // proteína sem gramas não serve
    null,
  ], TODAY);
  assertEquals(rows, [
    { date: "2026-09-26", kind: "descanso" },
    { date: "2026-09-25", kind: "corrida", distance_km: 5.5, duration_min: 30 },
    { date: "2026-09-25", kind: "proteina", protein_g: 140 },
    { date: "2026-09-27", kind: "ginasio", duration_min: 45 },
  ]);
  assertEquals(parseRecommendations("nada", TODAY), []);
  assertEquals(parseRecommendations(undefined, TODAY), []);
});

Deno.test("parseRecommendations: um número fora do plausível cai, a recomendação fica; o mesmo dia e tipo fica com a última", () => {
  assertEquals(parseRecommendations([{ date: TODAY, kind: "corrida", distance_km: 250 }], TODAY), [{ date: TODAY, kind: "corrida", distance_km: null, duration_min: null }]);
  assertEquals(parseRecommendations([
    { date: TODAY, kind: "proteina", protein_g: 120 },
    { date: TODAY, kind: "proteina", protein_g: 140 },
  ], TODAY), [{ date: TODAY, kind: "proteina", protein_g: 140 }]);
});

Deno.test("parseRecommendations: no máximo cinco por resposta — mais do que isso é um plano", () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ date: `2026-09-${String(26 + (i % 5)).padStart(2, "0")}`, kind: i < 5 ? "descanso" : "ginasio", duration_min: 40 }));
  assertEquals(parseRecommendations(many, TODAY).length, MAX_RECOMMENDATIONS_PER_REPLY);
});

const meals = { "2026-09-20": { kcal: 2200, prot: 95, carbs: 250, fat: 70, meals: 4 }, "2026-09-21": { kcal: 900, prot: 40, carbs: 100, fat: 30, meals: 1 } };

Deno.test("evaluateRecommendations: cada tipo cruzado com o registo do dia", () => {
  const results = evaluateRecommendations({
    recommendations: [
      { date: "2026-09-22", kind: "descanso" },
      { date: "2026-09-21", kind: "corrida", duration_min: 30 },
      { date: "2026-09-20", kind: "proteina", protein_g: 140 },
      { date: "2026-09-19", kind: "ginasio", duration_min: 45 },
      { date: "2026-09-18", kind: "corrida", distance_km: 8 },
      { date: TODAY, kind: "descanso" },                 // hoje ainda não aconteceu
      { date: "2026-09-26", kind: "descanso" },          // futuro
    ],
    runs: [{ date: "2026-09-21", distance_km: 5, duration_seconds: 32 * 60 }],
    gym: [{ date: "2026-09-19", duration_seconds: 30 * 60 }],
    mealsByDate: meals,
    checkins: [{ date: "2026-09-23", sleep: 4, pain: 0 }],
  }, TODAY);
  assertEquals(results.map((r) => [r.date, r.outcome]), [
    ["2026-09-18", "nao_feito"],
    ["2026-09-19", "a_menos"],
    ["2026-09-20", "a_menos"],
    ["2026-09-21", "cumprido"],
    ["2026-09-22", "descanso_respeitado"],
  ]);
  assertEquals(results[4].text, "2026-09-22 · recomendaste descanso → respeitado; no dia seguinte: sono 4/5, sem dor");
  assertStringIncludes(results[3].text, "fez 32 min (107%) · cumprido");
  assertStringIncludes(results[2].text, "comeu 95 g (68%) · a menos");
  assertStringIncludes(results[1].text, "fez 30 min (67%) · a menos");
});

Deno.test("evaluateRecommendations: descanso não respeitado, dor no dia seguinte, e proteína num dia meio registado", () => {
  const [rest, protein] = evaluateRecommendations({
    recommendations: [{ date: "2026-09-21", kind: "descanso" }, { date: "2026-09-21", kind: "proteina", protein_g: 120 }],
    runs: [{ date: "2026-09-21", distance_km: 10, duration_seconds: 3000 }],
    gym: [],
    mealsByDate: meals,
    checkins: [{ date: "2026-09-22", sleep: 2, pain: 6 }],
  }, TODAY);
  assertEquals(rest.outcome, "descanso_nao_respeitado");
  assertEquals(rest.text, "2026-09-21 · recomendaste descanso → treinou nesse dia; no dia seguinte: sono 2/5, dor 6/10");
  assertStringIncludes(protein.text, "— dia meio registado");
});

Deno.test("buildRecommendationsContext: só com recomendações vividas; para calibrar, não para cobrar", () => {
  assertEquals(buildRecommendationsContext([]), null);
  const block = buildRecommendationsContext(evaluateRecommendations({
    recommendations: [{ date: "2026-09-22", kind: "descanso" }],
    runs: [], gym: [], mealsByDate: {},
  }, TODAY))!;
  assertStringIncludes(block, "RECOMENDAÇÕES SOLTAS QUE DESTE NA CONVERSA");
  assertStringIncludes(block, "- 2026-09-22 · recomendaste descanso → respeitado");
  assertStringIncludes(block, "para calibrar, não para cobrar");
  assertCarolVoice(block.split("\n").pop()!);
});
