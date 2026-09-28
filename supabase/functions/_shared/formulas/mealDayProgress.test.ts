import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { dayProgressSection, mealDayProgress, normalizeMealTime, slotFromTime } from "./mealDayProgress.ts";

// 5.5, push 3: o dia até agora, na análise de uma refeição.

Deno.test("mealDayProgress: soma as outras refeições de hoje com esta, e usa a sugestão dela para o dia", () => {
  const p = mealDayProgress({
    thisMeal: { calories: 612.4, protein: 31.6 },
    otherMeals: [{ calories: 420, protein: 18.2 }, { calories: 180, protein: 10.4 }],
    suggestion: { kcal: 2400, protein_g: 125 },
    goals: { calorie_goal: 2200, protein_goal: 150 },
  });
  assertEquals(p, { meals: 3, kcal: 1212, protein: 60, target: { source: "sugestao", kcal: 2400, protein: 125 }, logged: [], thisTime: null, remaining: null });
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

// 2026-09-28: lanche registado depois do jantar — ela mandou "o jantar
// assumir o resto" porque só via a soma do dia, não que refeições já lá estavam.
Deno.test("mealDayProgress: lanche registado depois do jantar — o jantar conta como feito, só a ceia pode vir", () => {
  const p = mealDayProgress({
    thisMeal: { calories: 238, protein: 5.3, meal_type: "lanche" },
    otherMeals: [
      { calories: 700, protein: 30, meal_type: "jantar" },
      { calories: 650, protein: 40.7, meal_type: "almoco" },
    ],
    suggestion: { protein_g: 145 },
    goals: null,
  });
  assertEquals(p.protein, 76);
  assertEquals(p.logged.map((m) => m.meal_type), ["almoco", "jantar"]);
  assertEquals(p.remaining, ["ceia"]);
  const s = dayProgressSection(p);
  assertStringIncludes(s, "Já registadas hoje, além desta: Almoço (650 kcal, 41 g de proteína); Jantar (700 kcal, 30 g de proteína).");
  assertStringIncludes(s, "Refeições que ainda podem vir hoje: Ceia.");
  assertStringIncludes(s, "nunca uma que já está registada acima");
  assertStringIncludes(s, "NUNCA atribuas a compensação a uma refeição que já consta como registada");
  assertStringIncludes(s, "A CEIA É A ÚNICA HIPÓTESE QUE RESTA HOJE");
  assertStringIncludes(s, "antes de ir para a cama");
});

Deno.test("mealDayProgress: com a ceia registada não há refeição seguinte; sem tipo, fica o texto genérico", () => {
  const fechado = mealDayProgress({
    thisMeal: { calories: 238, protein: 5, meal_type: "lanche" },
    otherMeals: [{ calories: 200, protein: 20, meal_type: "ceia" }],
    suggestion: null,
    goals: null,
  });
  assertEquals(fechado.remaining, []);
  assertStringIncludes(dayProgressSection(fechado), "não há refeição seguinte hoje para compensar");

  const manha = mealDayProgress({ thisMeal: { calories: 400, protein: 20, meal_type: "pequeno-almoco" }, otherMeals: [], suggestion: null, goals: null });
  assertEquals(manha.remaining, ["lanche-manha", "almoco", "lanche", "jantar", "ceia"]);
  assertEquals(dayProgressSection(manha).includes("ÚNICA HIPÓTESE"), false);

  const semTipo = mealDayProgress({ thisMeal: { calories: 400, protein: 20 }, otherMeals: [], suggestion: null, goals: null });
  assertEquals(semTipo.remaining, null);
  assertStringIncludes(dayProgressSection(semTipo), "diz o que a próxima refeição pode fazer");
});

// 2026-09-28: a hora (meals.meal_time) passa a contar na posição do dia.
Deno.test("mealDayProgress: com hora, um lanche às 20:15 fica depois do jantar mesmo sem o jantar registado", () => {
  const p = mealDayProgress({
    thisMeal: { calories: 238, protein: 5, meal_type: "lanche", meal_time: "20:15" },
    otherMeals: [{ calories: 650, protein: 40, meal_type: "almoco", meal_time: "13:00:00" }],
    suggestion: null,
    goals: null,
  });
  assertEquals(p.thisTime, "20:15");
  assertEquals(p.logged[0].meal_time, "13:00");
  // O slot das 20:15 é o do jantar — só a ceia pode vir.
  assertEquals(p.remaining, ["ceia"]);
  const s = dayProgressSection(p);
  assertStringIncludes(s, "Esta refeição foi às 20:15.");
  assertStringIncludes(s, "Almoço às 13:00 (650 kcal, 40 g de proteína)");
});

Deno.test("mealDayProgress: a hora ordena as refeições registadas; antes das 05:00 não conta", () => {
  const p = mealDayProgress({
    thisMeal: { calories: 300, protein: 20, meal_type: "pequeno-almoco", meal_time: "04:30" },
    otherMeals: [
      { calories: 200, protein: 5, meal_type: "lanche", meal_time: "21:00" },
      { calories: 700, protein: 30, meal_type: "jantar", meal_time: "20:00" },
    ],
    suggestion: null,
    goals: null,
  });
  assertEquals(p.logged.map((m) => m.meal_type), ["jantar", "lanche"]);
  assertEquals(p.remaining, ["ceia"]);
  assertEquals(slotFromTime("04:30"), null);
  assertEquals(slotFromTime("23:10"), 5);
  assertEquals(normalizeMealTime("9:05"), "09:05");
  assertEquals(normalizeMealTime("25:00"), null);
  assertEquals(normalizeMealTime(null), null);
});
