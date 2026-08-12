import { assertEquals } from "jsr:@std/assert@1";
import { addDaysISO, buildDailySummaryContext } from "./index.ts";

Deno.test("addDaysISO avança dias e atravessa meses", () => {
  assertEquals(addDaysISO("2026-08-11", 1), "2026-08-12");
  assertEquals(addDaysISO("2026-08-31", 1), "2026-09-01");
  assertEquals(addDaysISO("2026-01-01", -1), "2025-12-31");
});

const baseParams = {
  today: "2026-08-11",
  profile: {
    calorie_goal: 2500, protein_goal: 150, carbs_goal: 300, fat_goal: 80,
    water_goal_ml: 2000, dietary_restrictions: null, dietary_notes: null,
    experience_level: "medio",
  },
  todayMeals: [],
  todayWater: [],
  recentRuns: [],
  recentGym: [],
  planItems: [],
  nextRace: null,
};

Deno.test("sem restrições, restricoes_alimentares fica null", () => {
  const ctx = buildDailySummaryContext(baseParams);
  assertEquals(ctx.restricoes_alimentares, null);
});

Deno.test("restrições traduzem as chaves para rótulos legíveis", () => {
  const ctx = buildDailySummaryContext({
    ...baseParams,
    profile: { ...baseParams.profile, dietary_restrictions: ["vegetariano", "sem_lactose"] },
  });
  assertEquals(ctx.restricoes_alimentares?.restrictions, ["Vegetariano", "Sem lactose"]);
});

Deno.test("notas de alergia sozinhas já ativam o bloco de restrições", () => {
  const ctx = buildDailySummaryContext({
    ...baseParams,
    profile: { ...baseParams.profile, dietary_notes: "alergia a marisco" },
  });
  assertEquals(ctx.restricoes_alimentares?.notes, "alergia a marisco");
  assertEquals(ctx.restricoes_alimentares?.restrictions, []);
});

Deno.test("soma as refeições de hoje e arredonda os totais", () => {
  const ctx = buildDailySummaryContext({
    ...baseParams,
    todayMeals: [
      { meal_type: "almoco", meal_items: [{ quantity_grams: 200, calories_per_100g: 165, protein_per_100g: 31, carbs_per_100g: 0, fat_per_100g: 3.6 }] },
      { meal_type: "jantar", meal_items: [{ quantity_grams: 150, calories_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fat_per_100g: 0.3 }] },
    ],
  });
  assertEquals(ctx.hoje_ate_agora.refeicoes_registadas, ["Almoço", "Jantar"]);
  assertEquals(ctx.hoje_ate_agora.calorias, Math.round(200 * 1.65 + 150 * 1.30));
});

Deno.test("soma a água de hoje", () => {
  const ctx = buildDailySummaryContext({
    ...baseParams,
    todayWater: [{ amount_ml: 250 }, { amount_ml: 300 }],
  });
  assertEquals(ctx.hoje_ate_agora.agua_ml, 550);
});

Deno.test("separa os itens do plano em hoje/amanhã/depois de amanhã — chaves com data explícita", () => {
  // today = "2026-08-11", tomorrow = "2026-08-12", depois de amanhã = "2026-08-13"
  const ctx = buildDailySummaryContext({
    ...baseParams,
    planItems: [
      { planned_date: "2026-08-11", kind: "corrida" },
      { planned_date: "2026-08-12", kind: "ginasio" },
      { planned_date: "2026-08-13", kind: "descanso" },  // depois de amanhã — vai para o seu próprio balde
    ],
  }) as Record<string, unknown[]>;
  // As chaves incluem a data para que o modelo não confunda os dias
  assertEquals(ctx["plano_treino_hoje_2026-08-11"].length, 1);
  assertEquals(ctx["plano_treino_amanha_2026-08-12"].length, 1);
  assertEquals(ctx["plano_treino_depois_de_amanha_2026-08-13"].length, 1);
  assertEquals(ctx["plano_treino_hoje_2026-08-11"][0], { planned_date: "2026-08-11", kind: "corrida" });
  assertEquals(ctx["plano_treino_amanha_2026-08-12"][0], { planned_date: "2026-08-12", kind: "ginasio" });
  assertEquals(ctx["plano_treino_depois_de_amanha_2026-08-13"][0], { planned_date: "2026-08-13", kind: "descanso" });
});

Deno.test("itens a partir de D+3 não entram em nenhum balde (fronteira da janela de 3 dias)", () => {
  const today = "2026-08-11";
  const ctx = buildDailySummaryContext({
    ...baseParams,
    today,
    planItems: [
      { planned_date: "2026-08-14", kind: "corrida" },  // D+3 — fora da janela
      { planned_date: "2026-08-20", kind: "ginasio" },   // bem fora da janela
    ],
  }) as Record<string, unknown[]>;
  assertEquals(ctx["plano_treino_hoje_2026-08-11"].length, 0);
  assertEquals(ctx["plano_treino_amanha_2026-08-12"].length, 0);
  assertEquals(ctx["plano_treino_depois_de_amanha_2026-08-13"].length, 0);
});

Deno.test("regressão: ginásio amanhã e corrida depois de amanhã ficam em baldes separados", () => {
  // Bug reportado: o card dizia 'amanhã tens um dia duplo' quando havia
  // ginásio em D+1 e corrida em D+2 — o modelo tinha visibilidade de D+2
  // (via race/plan context) mas atribuiu os dois itens ao mesmo dia.
  // Fix: D+2 entra no contexto num balde PRÓPRIO (plano_treino_depois_de_amanha_*),
  // nunca junto do balde de amanhã — cada item só aparece no balde da sua
  // própria planned_date.
  const today = "2026-08-12";
  const tomorrow = "2026-08-13";
  const dayAfter = "2026-08-14";
  const ctx = buildDailySummaryContext({
    ...baseParams,
    today,
    planItems: [
      { planned_date: tomorrow, kind: "ginasio", categories: ["peito"] },
      { planned_date: dayAfter, kind: "corrida", training_type: "intervalos" },
    ],
  }) as Record<string, unknown[]>;
  // Amanhã só tem ginásio
  assertEquals(ctx[`plano_treino_amanha_${tomorrow}`].length, 1);
  const amanha = ctx[`plano_treino_amanha_${tomorrow}`] as Array<{kind: string}>;
  assertEquals(amanha[0].kind, "ginasio");
  // Hoje continua vazio
  assertEquals(ctx[`plano_treino_hoje_${today}`].length, 0);
  // A corrida de D+2 aparece no SEU PRÓPRIO balde, não no de amanhã
  assertEquals(ctx[`plano_treino_depois_de_amanha_${dayAfter}`].length, 1);
  const depoisDeAmanha = ctx[`plano_treino_depois_de_amanha_${dayAfter}`] as Array<{kind: string}>;
  assertEquals(depoisDeAmanha[0].kind, "corrida");
  // Confirma que os dois baldes nunca se misturam
  assertEquals(amanha.some((i) => i.kind === "corrida"), false);
});

Deno.test("sem refeições nem água, os totais de hoje ficam a zero, não undefined", () => {
  const ctx = buildDailySummaryContext(baseParams);
  assertEquals(ctx.hoje_ate_agora.calorias, 0);
  assertEquals(ctx.hoje_ate_agora.agua_ml, 0);
  assertEquals(ctx.hoje_ate_agora.refeicoes_registadas, []);
});
