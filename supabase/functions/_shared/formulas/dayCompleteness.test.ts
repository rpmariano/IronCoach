import { assertEquals } from "jsr:@std/assert@1";
import {
  dayCompleteness, daysCompleteness, mealLoggingProfile, mealProfileStartISO, mealsOfCompleteDays, type MealForCompleteness,
} from "./dayCompleteness.ts";

// Opção B do Rui (2026-11-01): o dia completo ou parcial infere-se, sem botão.

const meal = (date: string, meal_type: string, calories: number): MealForCompleteness =>
  ({ date, meal_type, calories, protein_g: 0, carbs_g: 0, fat_g: 0 } as MealForCompleteness);
const cheio = (date: string, kcal: number) => [meal(date, "pequeno-almoco", kcal * 0.25), meal(date, "almoco", kcal * 0.4), meal(date, "jantar", kcal * 0.35)];
const TODAY = "2026-11-01";
const day = (n: number) => { // n dias antes de hoje
  const d = new Date(TODAY + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

Deno.test("mealProfileStartISO: hoje−28", () => {
  assertEquals(mealProfileStartISO(TODAY), "2026-10-04");
});

Deno.test("dayCompleteness com mediana: sem almoço e sem jantar, ou abaixo de 50% da mediana, é parcial", () => {
  const prof = { fullDayMedianKcal: 1700 };
  assertEquals(dayCompleteness([meal(day(1), "pequeno-almoco", 900)], null, prof), "parcial"); // só o pequeno-almoço
  assertEquals(dayCompleteness([meal(day(1), "almoco", 500), meal(day(1), "jantar", 400)], null, prof), "completo"); // 900 ≥ 850
  assertEquals(dayCompleteness([meal(day(1), "almoco", 500), meal(day(1), "jantar", 300)], null, prof), "parcial"); // 800 < 850
  assertEquals(dayCompleteness([], null, prof), "parcial");
});

Deno.test("dayCompleteness: as 3 principais registadas é sempre completo, por pouco que seja (decisão do Rui, RED-S)", () => {
  // 40% da mediana, com pequeno-almoço, almoço e jantar: é um dia de pouca
  // energia, não um registo parcial — tem de entrar na EA.
  assertEquals(dayCompleteness(cheio(day(1), 680), null, { fullDayMedianKcal: 1700 }), "completo");
  // Também na regra fixa, abaixo de 50% do objetivo.
  assertEquals(dayCompleteness(cheio(day(1), 600), 2400, null), "completo");
});

Deno.test("dayCompleteness sem mediana (regra fixa): < 2 principais, uma só refeição, ou < 50% do objetivo", () => {
  assertEquals(dayCompleteness([meal(day(1), "jantar", 1500)], 2000, null), "parcial"); // uma só
  assertEquals(dayCompleteness([meal(day(1), "almoco", 400), meal(day(1), "lanche", 400)], 2000, null), "parcial"); // 1 principal
  assertEquals(dayCompleteness([meal(day(1), "almoco", 500), meal(day(1), "jantar", 400)], 2000, null), "parcial"); // 900 < 1000
  assertEquals(dayCompleteness([meal(day(1), "almoco", 600), meal(day(1), "jantar", 400)], 2000, null), "completo"); // 1000 ≥ 1000
  assertEquals(dayCompleteness([meal(day(1), "almoco", 300), meal(day(1), "jantar", 300)], null, null), "completo"); // sem objetivo
});

Deno.test("dayCompleteness: hoje (ou depois) é sempre em curso", () => {
  assertEquals(dayCompleteness(cheio(TODAY, 2000), 2000, null, { dayISO: TODAY, todayISO: TODAY }), "em_curso");
  assertEquals(dayCompleteness([], 2000, null, { dayISO: "2026-11-02", todayISO: TODAY }), "em_curso");
  assertEquals(dayCompleteness(cheio(day(1), 2000), 2000, null, { dayISO: day(1), todayISO: TODAY }), "completo");
});

Deno.test("mealLoggingProfile: o Rui de outubro — 16 dias cheios em 28, mas 21 completos: 'completo'", () => {
  // Os 28 dias até 31-10 do Rui (kcal e principais), lidos da BD a 2026-11-01.
  const rui: Array<[number, number, string[]]> = [
    [4, 692, ["almoco", "jantar"]], [5, 2265, ["p", "a", "j"]], [6, 1990, ["p", "a", "j"]], [7, 2366, ["p", "a", "j"]],
    [8, 1518, ["p", "a", "j"]], [9, 1708, ["almoco", "jantar", "lanche"]], [10, 1312, ["p", "a", "j"]], [11, 1084, ["almoco", "jantar"]],
    [12, 2050, ["p", "a", "j"]], [13, 1398, ["p", "a", "j"]], [14, 2117, ["p", "a", "j"]], [15, 1604, ["p", "a", "j"]],
    [16, 1754, ["p", "a", "j"]], [17, 625, ["pequeno-almoco"]], [18, 333, ["pequeno-almoco"]], [19, 1403, ["p", "a", "j"]],
    [20, 1488, ["p", "a", "j"]], [21, 942, ["almoco", "jantar", "lanche"]], [22, 1806, ["p", "a", "j"]], [23, 1643, ["p", "a", "j"]],
    [24, 1682, ["p", "a", "j"]], [25, 247, ["pequeno-almoco"]], [26, 284, ["pequeno-almoco"]], [27, 1458, ["p", "a", "j"]],
    [28, 357, ["pequeno-almoco", "lanche"]], [29, 1229, ["almoco", "jantar", "lanche"]], [30, 1004, ["almoco", "jantar"]],
  ];
  const full: Record<string, string> = { p: "pequeno-almoco", a: "almoco", j: "jantar" };
  const meals = rui.flatMap(([d, kcal, types]) => {
    const ts = types.map((t) => full[t] ?? t);
    return ts.map((t) => meal(`2026-10-${String(d).padStart(2, "0")}`, t, kcal / ts.length));
  });
  const p = mealLoggingProfile(meals, TODAY, 2000);
  assertEquals([p.kind, p.fullDays, p.completeDays, p.loggedDays, p.spanDays, p.hasHistory], ["completo", 16, 21, 27, 28, true]);
  assertEquals(p.fullDayMedianKcal, 1663);
  assertEquals(p.completeDaysShare, 0.75);
  // Os parciais: 4, 17, 18, 25, 26, 28 (só o pequeno-almoço, ou abaixo de 832 kcal).
  const days = rui.map(([d]) => `2026-10-${String(d).padStart(2, "0")}`);
  const st = daysCompleteness(meals, days, { calorieTarget: 2000, profile: p, todayISO: TODAY });
  assertEquals(days.filter((d) => st.get(d) === "parcial").map((d) => Number(d.slice(-2))), [4, 17, 18, 25, 26, 28]);
});

Deno.test("mealLoggingProfile: quem regista de vez em quando é 'ocasional'; sem registos também", () => {
  const meals = [...cheio(day(20), 2000), ...cheio(day(9), 2000), meal(day(3), "almoco", 700)];
  const p = mealLoggingProfile(meals, TODAY, 2000);
  assertEquals([p.kind, p.loggedDays, p.completeDays, p.spanDays, p.fullDayMedianKcal], ["ocasional", 3, 2, 20, null]);
  const vazio = mealLoggingProfile([], TODAY);
  assertEquals([vazio.kind, vazio.hasHistory, vazio.completeDaysShare], ["ocasional", false, null]);
  // O que fica fora da janela (hoje, ou antes de hoje−28) não conta.
  const fora = mealLoggingProfile([...cheio(TODAY, 2000), ...cheio(day(29), 2000)], TODAY);
  assertEquals(fora.loggedDays, 0);
});

Deno.test("daysCompleteness + mealsOfCompleteDays: o objetivo de cada dia, e só as refeições dos completos", () => {
  // Almoço e jantar (sem pequeno-almoço): a regra fixa olha para o objetivo de cada dia.
  const doisPrincipais = (d: string) => [meal(d, "almoco", 700), meal(d, "jantar", 500)];
  const meals = [...doisPrincipais(day(2)), ...doisPrincipais(day(1)), meal(TODAY, "almoco", 600)];
  const target = (d: string) => (d === day(2) ? 2000 : 3000); // 1200 ≥ 1000 · 1200 < 1500
  const st = daysCompleteness(meals, [day(2), day(1), TODAY], { calorieTarget: target, profile: null, todayISO: TODAY });
  assertEquals([...st.values()], ["completo", "parcial", "em_curso"]);
  assertEquals(mealsOfCompleteDays(meals, st).map((m) => m.date), [day(2), day(2)]);
});
