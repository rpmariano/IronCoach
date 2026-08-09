import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { aggregateMealsByDate, runGetNutritionHistory, summariseSessions, formatSessionLine, runGetGymHistory, runProposeTrainingPlan } from "./index.ts";

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

// ── propose_training_plan ────────────────────────────────────────────────
// Ao contrário das outras ferramentas, esta ESCREVE — o mock regista o que foi
// inserido e apagado, para os testes verificarem que nada fica gravado quando
// a validação falha, e que o rollback acontece quando os itens falham.
// deno-lint-ignore no-explicit-any
function makePlanSb(opts: { planError?: any; itemsError?: any } = {}) {
  const calls = { planInserts: [] as any[], itemInserts: [] as any[], deletes: [] as string[] };
  const sb = {
    from: (table: string) => {
      if (table === "coach_plans") {
        return {
          // deno-lint-ignore no-explicit-any
          insert: (row: any) => {
            calls.planInserts.push(row);
            return {
              select: () => ({
                single: () => Promise.resolve(
                  opts.planError
                    ? { data: null, error: opts.planError }
                    : { data: { id: "plan-1", ...row }, error: null },
                ),
              }),
            };
          },
          delete: () => ({
            eq: (_col: string, id: string) => {
              calls.deletes.push(id);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      return {
        // deno-lint-ignore no-explicit-any
        insert: (rows: any[]) => {
          calls.itemInserts.push(...rows);
          return Promise.resolve({ error: opts.itemsError || null });
        },
      };
    },
  };
  return { sb, calls };
}

const VALID_PLAN = {
  period_start: "2026-08-10",
  period_end: "2026-08-16",
  summary: "4 treinos, base aeróbica",
  items: [
    { planned_date: "2026-08-10", kind: "corrida", training_type: "continuo", target_distance_km: 8 },
    { planned_date: "2026-08-16", kind: "corrida", training_type: "longo", target_distance_km: 18, notes: "Z2" },
  ],
};

Deno.test("runProposeTrainingPlan grava plano e itens", async () => {
  const { sb, calls } = makePlanSb();
  const result = await runProposeTrainingPlan(sb, "user-1", VALID_PLAN);
  assertStringIncludes(result, "Plano criado com 2 treino(s)");
  assertEquals(calls.planInserts.length, 1);
  assertEquals(calls.planInserts[0].status, "proposto");
  assertEquals(calls.itemInserts.length, 2);
  assertEquals(calls.itemInserts[0].plan_id, "plan-1");
  assertEquals(calls.itemInserts[1].training_type, "longo");
});

Deno.test("runProposeTrainingPlan rejeita training_type inválido sem gravar nada", async () => {
  const { sb, calls } = makePlanSb();
  const result = await runProposeTrainingPlan(sb, "user-1", {
    ...VALID_PLAN,
    items: [{ planned_date: "2026-08-10", kind: "corrida", training_type: "sprint_maluco" }],
  });
  assertStringIncludes(result, "não é válido");
  assertEquals(calls.planInserts.length, 0);
});

Deno.test("runProposeTrainingPlan rejeita item fora do período do plano", async () => {
  const { sb, calls } = makePlanSb();
  const result = await runProposeTrainingPlan(sb, "user-1", {
    ...VALID_PLAN,
    items: [{ planned_date: "2026-09-30", kind: "corrida" }],
  });
  assertStringIncludes(result, "fora do período");
  assertEquals(calls.planInserts.length, 0);
});

Deno.test("runProposeTrainingPlan rejeita kind desconhecido", async () => {
  const { sb } = makePlanSb();
  const result = await runProposeTrainingPlan(sb, "user-1", {
    ...VALID_PLAN,
    items: [{ planned_date: "2026-08-10", kind: "natacao" }],
  });
  assertStringIncludes(result, 'kind tem de ser "corrida" ou "ginasio"');
});

Deno.test("runProposeTrainingPlan rejeita plano sem treinos", async () => {
  const { sb } = makePlanSb();
  const result = await runProposeTrainingPlan(sb, "user-1", { ...VALID_PLAN, items: [] });
  assertStringIncludes(result, "pelo menos um treino");
});

Deno.test("runProposeTrainingPlan rejeita datas mal formadas", async () => {
  const { sb } = makePlanSb();
  const result = await runProposeTrainingPlan(sb, "user-1", { ...VALID_PLAN, period_start: "10/08/2026" });
  assertStringIncludes(result, "YYYY-MM-DD");
});

Deno.test("runProposeTrainingPlan limita o número de treinos", async () => {
  const { sb, calls } = makePlanSb();
  const items = Array.from({ length: 20 }, () => ({ planned_date: "2026-08-10", kind: "corrida" }));
  const result = await runProposeTrainingPlan(sb, "user-1", { ...VALID_PLAN, items });
  assertStringIncludes(result, "demasiados treinos");
  assertEquals(calls.planInserts.length, 0);
});

Deno.test("runProposeTrainingPlan não deixa training_type num item de ginásio", async () => {
  const { sb, calls } = makePlanSb();
  await runProposeTrainingPlan(sb, "user-1", {
    ...VALID_PLAN,
    items: [{ planned_date: "2026-08-10", kind: "ginasio", training_type: "longo", categories: ["Pernas"] }],
  });
  assertEquals(calls.itemInserts[0].training_type, null);
  assertEquals(calls.itemInserts[0].categories, ["Pernas"]);
});

Deno.test("runProposeTrainingPlan apaga o plano se os itens falharem", async () => {
  const { sb, calls } = makePlanSb({ itemsError: { message: "constraint violada" } });
  const result = await runProposeTrainingPlan(sb, "user-1", VALID_PLAN);
  assertStringIncludes(result, "Erro ao gravar os treinos");
  // Sem isto ficaria uma proposta vazia visível ao atleta.
  assertEquals(calls.deletes, ["plan-1"]);
});
