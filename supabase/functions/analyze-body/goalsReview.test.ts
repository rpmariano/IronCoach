import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { goalsInterventionFor, goalsReviewSection, parseGoalsReview, parseManualSummary } from "./goalsReview.ts";
import { GOALS_INTERVENTION_TAG, isGoalsIntervention } from "../_shared/formulas/goalsIntervention.ts";

// Bug #41 (2026-09-22): a Carol chama o atleta para definir objetivos — e
// volta a chamar sempre que uma avaliação mostre que deviam mudar.

const COM_OBJETIVOS = { goal_weight_kg: 72, calorie_goal: 2300, coach_intervention_status: null };

Deno.test("parseGoalsReview — rever só com uma razão concreta", () => {
  assertEquals(parseGoalsReview({ needed: true, reason: "Já estás nos 71,8 kg, abaixo do peso-alvo de 72." }),
    { needed: true, reason: "Já estás nos 71,8 kg, abaixo do peso-alvo de 72." });
  assertEquals(parseGoalsReview({ needed: true, reason: "  " }), { needed: false, reason: null });
  assertEquals(parseGoalsReview({ needed: false, reason: "x" }), { needed: false, reason: null });
  assertEquals(parseGoalsReview(undefined), null);
});

Deno.test("parseManualSummary — JSON dá comentário e juízo; texto solto fica comentário", () => {
  const r = parseManualSummary(JSON.stringify({ summary: "Bom registo.", goals_review: { needed: true, reason: "Peso-alvo atingido." } }));
  assertEquals(r.text, "Bom registo.");
  assertEquals(r.goalsReview, { needed: true, reason: "Peso-alvo atingido." });
  assertEquals(parseManualSummary("Comentário em texto."), { text: "Comentário em texto.", goalsReview: null });
  assertEquals(parseManualSummary(""), { text: null, goalsReview: null });
});

Deno.test("goalsReviewSection — mostra os objetivos atuais, ou diz que não há", () => {
  const s = goalsReviewSection({ goal_weight_kg: 72, calorie_goal: null });
  assertStringIncludes(s, "peso-alvo (kg): 72");
  assert(!s.includes("calorias"));
  assertStringIncludes(goalsReviewSection(null), "ainda não tem objetivos definidos");
});

Deno.test("goalsInterventionFor — sem objetivos: convida a definir, com a etiqueta", () => {
  const r = goalsInterventionFor({ coach_intervention_status: null }, null);
  assert(isGoalsIntervention(r));
  assertStringIncludes(r!, "os do corpo e os de macronutrientes");
});

Deno.test("goalsInterventionFor — com objetivos e a Carol a ler que deviam mudar: rever", () => {
  const r = goalsInterventionFor(COM_OBJETIVOS, { needed: true, reason: "Peso-alvo atingido (71,8 kg)." });
  assert(r!.startsWith(GOALS_INTERVENTION_TAG));
  assertStringIncludes(r!, "deviam ser revistos: Peso-alvo atingido (71,8 kg).");
});

Deno.test("goalsInterventionFor — com objetivos e sem razão para mudar: nada", () => {
  assertEquals(goalsInterventionFor(COM_OBJETIVOS, { needed: false, reason: null }), null);
  assertEquals(goalsInterventionFor(COM_OBJETIVOS, null), null);
});

Deno.test("goalsInterventionFor — uma intervenção pendente não é substituída", () => {
  for (const status of ["needed", "in_progress"]) {
    assertEquals(goalsInterventionFor({ ...COM_OBJETIVOS, coach_intervention_status: status }, { needed: true, reason: "x" }), null);
    assertEquals(goalsInterventionFor({ coach_intervention_status: status }, null), null);
  }
});
