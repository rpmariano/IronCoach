import { assertEquals } from "jsr:@std/assert@1";
import { calorieGoalResolver, DAY_GOAL_DEFAULTS, goalsForDay, goalsResolver, GOAL_HISTORY_SINCE } from "./goalHistory.ts";

// A regra do objetivo de cada dia, uma só para o ecrã e para a Carol
// (movida de src/utils/goalHistory.js a 2026-11-02; os testes do cliente
// continuam em src/utils/goalHistory.test.js, sobre a mesma função).

const history = [
  { valid_from: "2026-10-03T21:00:00Z", source: "inicial", calorie_goal: 2400, protein_goal: 140, carbs_goal: 300, fat_goal: 70, water_goal_ml: 2500 },
  // Mudou às 23:30 UTC de 20-10 = 00:30 de 21-10 em Lisboa (hora de verão até 25-10).
  { valid_from: "2026-10-20T23:30:00Z", source: "perfil", calorie_goal: 2000, protein_goal: 150, carbs_goal: 220, fat_goal: 65, water_goal_ml: 2500 },
];
const profile = { calorie_goal: 2200 };

Deno.test("goalsResolver: o objetivo de cada dia, em hora de Lisboa; hoje é o perfil", () => {
  const r = goalsResolver(history, profile, "2026-11-01");
  assertEquals(r("2026-10-15").goals.calorie_goal, 2400);
  assertEquals(r("2026-10-20").goals.calorie_goal, 2400);
  assertEquals(r("2026-10-21").goals.calorie_goal, 2000); // a mudança vale em Lisboa a partir de 21
  assertEquals(r("2026-11-01").goals.calorie_goal, 2200); // hoje: o perfil manda
  assertEquals(r("2026-10-01").estimated, true);
  assertEquals(r(GOAL_HISTORY_SINCE).estimated, false);
});

Deno.test("goalsForDay e calorieGoalResolver: sem histórico vale o perfil; sem perfil, as omissões", () => {
  assertEquals(goalsForDay([], "2026-10-21", profile), { goals: { ...DAY_GOAL_DEFAULTS, calorie_goal: 2200 }, estimated: false });
  assertEquals(goalsForDay(history, "2026-10-21", profile).goals.calorie_goal, 2000);
  const cal = calorieGoalResolver(history, profile, "2026-11-01");
  assertEquals([cal("2026-10-15"), cal("2026-10-25"), cal("2026-11-01")], [2400, 2000, 2200]);
  assertEquals(calorieGoalResolver(null, null, "2026-11-01")("2026-10-25"), DAY_GOAL_DEFAULTS.calorie_goal);
});
