import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { dayProgressSection, mealDayProgress } from "./mealDayProgress.ts";

// 5.5, push 3: o dia até agora, na análise de uma refeição.

Deno.test("mealDayProgress: soma as outras refeições de hoje com esta, e usa a sugestão dela para o dia", () => {
  const p = mealDayProgress({
    thisMeal: { calories: 612.4, protein: 31.6 },
    otherMeals: [{ calories: 420, protein: 18.2 }, { calories: 180, protein: 10.4 }],
    suggestion: { kcal: 2400, protein_g: 125 },
    goals: { calorie_goal: 2200, protein_goal: 150 },
  });
  assertEquals(p, { meals: 3, kcal: 1212, protein: 60, target: { source: "sugestao", kcal: 2400, protein: 125 } });
  const s = dayProgressSection(p);
  assertStringIncludes(s, "O DIA ATÉ AGORA (3 refeições registadas hoje, com esta): 1212 kcal e 60 g de proteína.");
  assertStringIncludes(s, "Sugeriste para hoje 2400 kcal e 125 g de proteína — vai em 51% das kcal e 48% da proteína.");
  assertStringIncludes(s, "não cobres o que falta");
});

Deno.test("mealDayProgress: sem sugestão para hoje, a meta do perfil; sem nenhuma, só o dia", () => {
  const meta = mealDayProgress({ thisMeal: { calories: 500, protein: 40 }, otherMeals: [], suggestion: null, goals: { protein_goal: 150 } });
  assertEquals(meta.target, { source: "meta", kcal: null, protein: 150 });
  const s = dayProgressSection(meta);
  assertStringIncludes(s, "(é a primeira refeição registada hoje): 500 kcal e 40 g de proteína.");
  assertStringIncludes(s, "A meta diária dele é 150 g de proteína — vai em 27% da proteína.");

  const nada = mealDayProgress({ thisMeal: { calories: 500, protein: 40 }, otherMeals: null, suggestion: { kcal: 0 }, goals: {} });
  assertEquals(nada.target, null);
  assertEquals(dayProgressSection(nada).includes("vai em"), false);
});
