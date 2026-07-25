import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { aggregateMealsByDate, runGetNutritionHistory, summariseSessions, formatSessionLine, runGetGymHistory } from "./index.ts";

// deno-lint-ignore no-explicit-any
function makeMeal(date: string, kcal: number, prot: number, carbs: number, fat: number): any {
  return {
    date,
    meal_items: [
      { quantity_grams: 100, calories_per_100g: kcal, protein_per_100g: prot, carbs_per_100g: carbs, fat_per_100g: fat },
    ],
  };
}

Deno.test("aggregateMealsByDate soma vários itens no mesmo dia", () => {
  const meals = [
    makeMeal("2026-05-01", 200, 10, 20, 5),
    makeMeal("2026-05-01", 300, 15, 30, 10),
    makeMeal("2026-05-02", 100, 5, 10, 2),
  ];
  const byDate = aggregateMealsByDate(meals);
  assertEquals(Object.keys(byDate).length, 2);
  assertEquals(byDate["2026-05-01"].kcal, 500);
  assertEquals(byDate["2026-05-01"].prot, 25);
  assertEquals(byDate["2026-05-01"].meals, 2);
  assertEquals(byDate["2026-05-02"].kcal, 100);
});

Deno.test("aggregateMealsByDate com lista vazia devolve objeto vazio", () => {
  assertEquals(aggregateMealsByDate([]), {});
});

// Mock mínimo do supabase-js query builder usado por runGetNutritionHistory:
// sb.from(...).select(...).eq(...).gte(...).lte(...) -> { data, error }
// deno-lint-ignore no-explicit-any
function makeMockSb(meals: any[], error: { message: string } | null = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            lte: () => Promise.resolve({ data: meals, error }),
          }),
        }),
      }),
    }),
  };
}

Deno.test("runGetNutritionHistory rejeita datas em formato inválido", async () => {
  const sb = makeMockSb([]);
  const result = await runGetNutritionHistory(sb, "user-1", { start_date: "01-05-2026", end_date: "2026-05-31" });
  assertStringIncludes(result, "Erro: start_date e end_date");
});

Deno.test("runGetNutritionHistory rejeita start_date depois de end_date", async () => {
  const sb = makeMockSb([]);
  const result = await runGetNutritionHistory(sb, "user-1", { start_date: "2026-05-31", end_date: "2026-05-01" });
  assertStringIncludes(result, "posterior a end_date");
});

Deno.test("runGetNutritionHistory devolve mensagem quando não há refeições no intervalo", async () => {
  const sb = makeMockSb([]);
  const result = await runGetNutritionHistory(sb, "user-1", { start_date: "2026-05-01", end_date: "2026-05-31" });
  assertStringIncludes(result, "Sem refeições registadas entre 2026-05-01 e 2026-05-31");
});

Deno.test("runGetNutritionHistory devolve resumo diário para intervalo curto (ex: comparar Maio)", async () => {
  const meals = [
    makeMeal("2026-05-01", 2000, 100, 200, 60),
    makeMeal("2026-05-02", 1800, 90, 180, 55),
  ];
  const sb = makeMockSb(meals);
  const result = await runGetNutritionHistory(sb, "user-1", { start_date: "2026-05-01", end_date: "2026-05-03" });
  assertStringIncludes(result, "Resumo diário de 2026-05-01 a 2026-05-03");
  assertStringIncludes(result, "2026-05-01: 2000 kcal");
  assertStringIncludes(result, "2026-05-02: 1800 kcal");
  assertStringIncludes(result, "2026-05-03: sem refeições registadas");
});

Deno.test("runGetNutritionHistory agrega por semana para intervalos longos", async () => {
  const meals = [
    makeMeal("2026-01-01", 2000, 100, 200, 60),
    makeMeal("2026-01-02", 2000, 100, 200, 60),
    makeMeal("2026-02-15", 1500, 80, 150, 40),
  ];
  const sb = makeMockSb(meals);
  // Intervalo de ~90 dias força o modo semanal (threshold = 35 dias).
  const result = await runGetNutritionHistory(sb, "user-1", { start_date: "2026-01-01", end_date: "2026-03-31" });
  assertStringIncludes(result, "Resumo semanal (médias diárias) de 2026-01-01 a 2026-03-31");
});

Deno.test("runGetNutritionHistory rejeita intervalo demasiado longo", async () => {
  const sb = makeMockSb([]);
  const result = await runGetNutritionHistory(sb, "user-1", { start_date: "2020-01-01", end_date: "2026-01-01" });
  assertStringIncludes(result, "intervalo demasiado longo");
});

Deno.test("runGetNutritionHistory propaga erro de query do supabase", async () => {
  const sb = makeMockSb([], { message: "tabela indisponível" });
  const result = await runGetNutritionHistory(sb, "user-1", { start_date: "2026-05-01", end_date: "2026-05-05" });
  assertStringIncludes(result, "Erro ao consultar dados: tabela indisponível");
});

/* ===================== Ginásio ===================== */

// deno-lint-ignore no-explicit-any
function makeSession(date: string, name: string, sets: any[], extra: any = {}): any {
  return { date, name, status: "concluido", workout_session_sets: sets, ...extra };
}

// Aula: sem séries, descrita só pelas métricas do relógio.
// deno-lint-ignore no-explicit-any
function makeAula(date: string, name: string, extra: any = {}): any {
  return {
    date,
    name,
    status: "concluido",
    kind: "aula",
    workout_session_sets: [],
    ...extra,
  };
}

// Mock do chain usado por runGetGymHistory:
// from().select().eq().eq().gte().lte().order() -> { data, error }
// deno-lint-ignore no-explicit-any
function makeGymSb(sessions: any[], error: { message: string } | null = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: () => ({
              lte: () => ({
                order: () => Promise.resolve({ data: sessions, error }),
              }),
            }),
          }),
        }),
      }),
    }),
  };
}

Deno.test("summariseSessions calcula volume e séries só sobre sets com reps e carga", () => {
  const rows = summariseSessions([
    makeSession("2026-07-01", "Push", [
      { reps: 10, weight: 60 },   // 600
      { reps: 8, weight: 60 },    // 480
      { reps: null, weight: 60 }, // ignorado
      { reps: 12, weight: null }, // ignorado
    ]),
  ]);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].volume, 1080);
  assertEquals(rows[0].sets, 2);
  assertEquals(rows[0].name, "Push");
});

Deno.test("summariseSessions usa 'Treino' quando o nome está vazio", () => {
  const rows = summariseSessions([makeSession("2026-07-01", "", [{ reps: 5, weight: 20 }])]);
  assertEquals(rows[0].name, "Treino");
});

Deno.test("runGetGymHistory rejeita datas inválidas", async () => {
  const sb = makeGymSb([]);
  const result = await runGetGymHistory(sb, "user-1", { start_date: "2026/07/01", end_date: "2026-07-31" });
  assertStringIncludes(result, "Erro: start_date e end_date");
});

Deno.test("runGetGymHistory mensagem quando não há treinos no intervalo", async () => {
  const sb = makeGymSb([]);
  const result = await runGetGymHistory(sb, "user-1", { start_date: "2026-06-01", end_date: "2026-06-30" });
  assertStringIncludes(result, "Sem treinos concluídos entre 2026-06-01 e 2026-06-30");
});

Deno.test("runGetGymHistory resume treinos com volume e séries", async () => {
  const sb = makeGymSb([
    makeSession("2026-07-02", "Push", [{ reps: 10, weight: 50 }, { reps: 8, weight: 50 }]), // 900
    makeSession("2026-07-05", "Pull", [{ reps: 10, weight: 40 }]),                           // 400
  ]);
  const result = await runGetGymHistory(sb, "user-1", { start_date: "2026-07-01", end_date: "2026-07-31" });
  assertStringIncludes(result, "Treinos de 2026-07-01 a 2026-07-31 (2)");
  assertStringIncludes(result, "2026-07-02: Push — 900 kg de volume, 2 séries");
  assertStringIncludes(result, "2026-07-05: Pull — 400 kg de volume, 1 séries");
});

Deno.test("summariseSessions lê tipo, categorias e métricas", () => {
  const rows = summariseSessions([
    makeSession("2026-07-02", "Ombros e Tríceps", [{ reps: 10, weight: 50 }], {
      categories: ["Ombros", "Tríceps"],
      duration_seconds: 2580,
      exertion: 6,
    }),
  ]);
  assertEquals(rows[0].kind, "forca");
  assertEquals(rows[0].categories, ["Ombros", "Tríceps"]);
  assertEquals(rows[0].durationSeconds, 2580);
  assertEquals(rows[0].exertion, 6);
});

Deno.test("summariseSessions assume 'forca' quando a sessão não tem tipo", () => {
  // Sessões anteriores à coluna kind existir.
  const rows = summariseSessions([makeSession("2026-07-01", "Push", [{ reps: 5, weight: 20 }])]);
  assertEquals(rows[0].kind, "forca");
  assertEquals(rows[0].categories, []);
  assertEquals(rows[0].exertion, null);
});

// A regressão que motivou tudo isto: uma aula não tem séries, e descrevê-la
// como "0 kg de volume, 0 séries" fazia o coach lê-la como treino falhado.
Deno.test("formatSessionLine omite volume e séries numa aula", () => {
  const [row] = summariseSessions([
    makeAula("2026-07-25", "Aula de HIIT", {
      categories: ["HIIT"],
      duration_seconds: 2277,
      calories_kcal: 175,
      avg_hr: 100,
      max_hr: 139,
      exertion: 6,
    }),
  ]);
  const line = formatSessionLine(row);
  assertEquals(line.includes("0 kg"), false);
  assertEquals(line.includes("0 séries"), false);
  assertStringIncludes(line, "Aula de HIIT (aula) [HIIT]");
  assertStringIncludes(line, "38 min");
  assertStringIncludes(line, "175 kcal");
  assertStringIncludes(line, "FC média 100 / máx 139 bpm");
  assertStringIncludes(line, "esforço 6/10");
});

Deno.test("formatSessionLine mantém volume e séries num treino de força", () => {
  const [row] = summariseSessions([
    makeSession("2026-07-02", "Push", [{ reps: 10, weight: 50 }], { categories: ["Peito"] }),
  ]);
  assertStringIncludes(formatSessionLine(row), "Push [Peito] — 500 kg de volume, 1 séries");
});

Deno.test("formatSessionLine avisa quando não há detalhe nenhum", () => {
  const [row] = summariseSessions([makeAula("2026-07-25", "Aula")]);
  assertStringIncludes(formatSessionLine(row), "sem detalhes registados");
});

Deno.test("runGetGymHistory propaga erro de query", async () => {
  const sb = makeGymSb([], { message: "falha db" });
  const result = await runGetGymHistory(sb, "user-1", { start_date: "2026-07-01", end_date: "2026-07-31" });
  assertStringIncludes(result, "Erro ao consultar dados: falha db");
});
