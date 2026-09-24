import { assert, assertEquals } from "jsr:@std/assert@1";
import { isMealOnlyItem, mealTextFromItems, mergeSingleMeal } from "./mealSuggestions.ts";

// As regras das refeições (2026-09-23): uma refeição substitui só essa.

Deno.test("mergeSingleMeal — com lista: troca só essa refeição e refaz o texto que a Carol lê", () => {
  const r = mergeSingleMeal({
    meal_suggestion: "texto antigo",
    meal_macros: { items: [{ tipo: "jantar", texto: "Frango." }, { tipo: "almoco", texto: "Peixe." }], kcal: 1500, protein_g: 1, carbs_g: 1, fat_g: 1 },
  }, "jantar", "Omelete.");
  assertEquals(r.meal_macros!.items, [{ tipo: "almoco", texto: "Peixe." }, { tipo: "jantar", texto: "Omelete." }]);
  assertEquals(r.meal_macros!.kcal, null);
  assertEquals(r.meal_suggestion, "Almoço: Peixe.\nJantar: Omelete.");
});

Deno.test("mergeSingleMeal — só com texto: troca o troço dessa refeição, nunca fica duplicado", () => {
  const r = mergeSingleMeal({ meal_suggestion: "Pequeno-almoço: aveia. Almoço: peixe. Jantar: frango." }, "jantar", "Omelete.");
  assertEquals(r.meal_suggestion, "Pequeno-almoço: aveia.\nAlmoço: peixe.\nJantar: Omelete.");
  // Dois nomes para o mesmo lanche num texto antigo: fica um.
  assertEquals(mergeSingleMeal({ meal_suggestion: "Lanche da tarde: iogurte. Lanche: fruta." }, "lanche", "Tosta.").meal_suggestion, "Lanche: Tosta.");
});

Deno.test("mergeSingleMeal — texto sem essa refeição: acrescenta; sem nada: nasce a lista", () => {
  assertEquals(mergeSingleMeal({ meal_suggestion: "Dia leve." }, "jantar", "Sopa.").meal_suggestion, "Dia leve.\nJantar: Sopa.");
  const novo = mergeSingleMeal(null, "jantar", "Sopa.");
  assertEquals(novo.meal_macros!.items, [{ tipo: "jantar", texto: "Sopa." }]);
  assertEquals(novo.meal_suggestion, "Jantar: Sopa.");
});

Deno.test("isMealOnlyItem — só o descanso com a marca", () => {
  assert(isMealOnlyItem({ kind: "descanso", categories: ["so-refeicoes"] }));
  assertEquals(isMealOnlyItem({ kind: "descanso", categories: [] }), false);
  assertEquals(isMealOnlyItem({ kind: "ginasio", categories: ["so-refeicoes"] }), false);
  assertEquals(mealTextFromItems([{ tipo: "ceia", texto: "Chá." }]), "Ceia: Chá.");
});

Deno.test("mergeSingleMeal — texto antigo com markdown não deixa lixo no texto da Carol", () => {
  const r = mergeSingleMeal({ meal_suggestion: "- **Almoço:** arroz\n- **Jantar:** frango" }, "jantar", "Omelete.");
  assertEquals(r.meal_suggestion, "Almoço: arroz\nJantar: Omelete.");
});

