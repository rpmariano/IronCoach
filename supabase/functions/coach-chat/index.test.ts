import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { runSaveCoachNote, buildCoachNotesContext, classifyTurn, allowedToolsFor, aggregateMealsByDate, runGetNutritionHistory, summariseSessions, formatSessionLine, runGetGymHistory, runProposeTrainingPlan, runUpdateGoals, runSaveMealSuggestions, buildSystemInstruction, buildPlanContext, computeACWR, computeGymMetrics, buildNutritionTargets, computeBodyMetrics, summariseRuns, type BodyAssessmentRow } from "./index.ts";

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
function makePlanSb(opts: { planError?: any; itemsError?: any; activePlans?: any[] } = {}) {
  const calls = { planInserts: [] as any[], itemInserts: [] as any[], deletes: [] as string[], supersededIds: [] as string[] };
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
          // Suporta a query de replace_active_plan: .select().eq().eq().gte()
          select: (_cols: string) => ({
            eq: (_c1: string, _v1: unknown) => ({
              eq: (_c2: string, _v2: unknown) => ({
                gte: (_c3: string, _v3: unknown) => Promise.resolve({ data: opts.activePlans ?? [], error: null }),
              }),
            }),
          }),
          // Suporta o update de replace_active_plan: .update({status}).in("id", ids)
          update: (_data: unknown) => ({
            in: (_col: string, ids: string[]) => {
              calls.supersededIds.push(...ids);
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
  assertStringIncludes(result, 'kind tem de ser "corrida", "ginasio" ou "descanso"');
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

// ── replace_active_plan ──────────────────────────────────────────────────
// Só resta aqui o caso trivial (não pedir substituição não mexe em nada).
// Os casos com estado — qual plano é escolhido para substituir, quando a
// substituição se concretiza, o que acontece se o atleta recusar — vivem em
// plan-simulation.test.ts, que usa um Supabase falso COM ESTADO. Testá-los
// com os mocks rasos deste ficheiro dava falsa confiança: eles ignoram o
// nome das colunas e a forma da query, que foi precisamente como o bug real
// de `day` vs `planned_date` sobreviveu a uma suite verde.

Deno.test("sem replace_active_plan, planos ativos não são tocados", async () => {
  const { sb, calls } = makePlanSb({
    activePlans: [{ id: "old-plan", coach_plan_items: [{ kind: "corrida" }] }],
  });
  await runProposeTrainingPlan(sb, "user-1", VALID_PLAN); // replace_active_plan omitido
  assertEquals(calls.planInserts[0].supersedes_plan_id, null);
});

// ── Restrições alimentares no prompt ────────────────────────────────────────
// Ver specs/coach-investigacao.md, Bloco 7 #5. Estes testes existem porque a
// falha aqui é silenciosa e cara: o coach continua a responder, só que sugere
// frango a um vegetariano.

const BIO_BASE = {
  height_cm: null, weight_kg: null, gender: null, birth_date: null,
  experience_level: null, resting_hr_bpm: null,
  dietary_restrictions: null as string[] | null, dietary_notes: null as string | null,
  coach_can_set_nutrition_goals: false as boolean | null,
};

function sysCom(restrictions: string[] | null, notes: string | null): string {
  return buildSystemInstruction(
    null,
    { ...BIO_BASE, dietary_restrictions: restrictions, dietary_notes: notes },
    null, null, "NUTRIÇÃO", "ÁGUA", null, null, null, null, null, null,
  );
}

Deno.test("sem restrições não gasta tokens a afirmar ausência", () => {
  const sys = sysCom(null, null);
  assertEquals(sys.includes("restrições alimentares do utilizador"), false);
  assertEquals(sysCom([], "  ").includes("restrições alimentares do utilizador"), false);
});

Deno.test("vegano traz B12 e o multiplicador de ferro para o prompt", () => {
  const sys = sysCom(["vegano"], null);
  assertStringIncludes(sys, "Vegano");
  assertStringIncludes(sys, "B12");
  // Este número recalibra o alarme de ferro do Bloco 4.2 #2 — se sair do
  // prompt, o alarme volta a estar calibrado para um omnívoro.
  assertStringIncludes(sys, "1,8×");
});

Deno.test("vegetariano não manda suplementar B12", () => {
  // Come ovos e lacticínios; mandá-lo suplementar mina a credibilidade do resto.
  const sys = sysCom(["vegetariano"], null);
  assertStringIncludes(sys, "Vegetariano");
  assertEquals(sys.includes("B12"), false);
});

Deno.test("combina várias restrições no mesmo prompt", () => {
  const sys = sysCom(["vegetariano", "sem_lactose"], null);
  assertStringIncludes(sys, "Vegetariano");
  assertStringIncludes(sys, "Sem lactose");
});

Deno.test("as notas de alergia entram em bruto e marcadas como absolutas", () => {
  const sys = sysCom(null, "alergia a frutos secos");
  assertStringIncludes(sys, "alergia a frutos secos");
  assertStringIncludes(sys, "restrição absoluta");
});

Deno.test("uma chave desconhecida é ignorada em vez de rebentar", () => {
  // Um valor antigo na BD não deve impedir o coach de responder.
  const sys = sysCom(["inventada"], null);
  assertEquals(sys.includes("restrições alimentares do utilizador"), false);
});

// ─── sugestão alimentar nos itens do plano (Bloco 7, forma de entrega 2) ────

Deno.test("runProposeTrainingPlan grava a sugestão alimentar do dia", async () => {
  const { sb, calls } = makePlanSb();
  const result = await runProposeTrainingPlan(sb, "user-1", {
    ...VALID_PLAN,
    items: [{
      planned_date: "2026-08-16",
      kind: "corrida",
      training_type: "longo",
      target_distance_km: 18,
      meal_suggestion: "  Ao pequeno-almoço, 80 g de aveia com banana.  ",
    }],
  });
  assertStringIncludes(result, "Plano criado com 1 treino(s)");
  assertEquals(calls.itemInserts[0].meal_suggestion, "Ao pequeno-almoço, 80 g de aveia com banana.");
});

Deno.test("uma sugestão alimentar em branco fica null, não string vazia", async () => {
  const { sb, calls } = makePlanSb();
  await runProposeTrainingPlan(sb, "user-1", {
    ...VALID_PLAN,
    items: [{ planned_date: "2026-08-16", kind: "corrida", meal_suggestion: "   " }],
  });
  assertEquals(calls.itemInserts[0].meal_suggestion, null);
});

Deno.test("aceita um dia de descanso que traga sugestão alimentar", async () => {
  // É este o caso que motivou o kind 'descanso': véspera de longão, sem
  // treino, mas com algo a dizer sobre o que comer.
  const { sb, calls } = makePlanSb();
  const result = await runProposeTrainingPlan(sb, "user-1", {
    ...VALID_PLAN,
    items: [{
      planned_date: "2026-08-15",
      kind: "descanso",
      meal_suggestion: "Reforça os hidratos ao jantar.",
    }],
  });
  assertStringIncludes(result, "Plano criado com 1 treino(s)");
  assertEquals(calls.itemInserts[0].kind, "descanso");
  assertEquals(calls.itemInserts[0].training_type, null);
  assertEquals(calls.itemInserts[0].target_distance_km, null);
  assertEquals(calls.itemInserts[0].categories.length, 0);
});

Deno.test("um dia de descanso vazio é rejeitado sem gravar nada", async () => {
  // Sem sugestão nem nota, o dia só ocuparia uma linha vazia no plano.
  const { sb, calls } = makePlanSb();
  const result = await runProposeTrainingPlan(sb, "user-1", {
    ...VALID_PLAN,
    items: [{ planned_date: "2026-08-15", kind: "descanso" }],
  });
  assertStringIncludes(result, "precisa de meal_suggestion ou notes");
  assertEquals(calls.planInserts.length, 0);
  assertEquals(calls.itemInserts.length, 0);
});

Deno.test("um dia de descanso com nota mas sem refeição é aceite", async () => {
  const { sb, calls } = makePlanSb();
  const result = await runProposeTrainingPlan(sb, "user-1", {
    ...VALID_PLAN,
    items: [{ planned_date: "2026-08-15", kind: "descanso", notes: "Descanso total." }],
  });
  assertStringIncludes(result, "Plano criado com 1 treino(s)");
  assertEquals(calls.itemInserts[0].notes, "Descanso total.");
});

Deno.test("descarta a duração que o modelo ponha num dia de descanso", async () => {
  const { sb, calls } = makePlanSb();
  await runProposeTrainingPlan(sb, "user-1", {
    ...VALID_PLAN,
    items: [{
      planned_date: "2026-08-15",
      kind: "descanso",
      target_duration_min: 45,
      meal_suggestion: "Prato de massa ao jantar.",
    }],
  });
  assertEquals(calls.itemInserts[0].target_duration_min, null);
});

// ─── update_nutrition_goals — DECISÃO N1, camada 1 ──────────────────────────
// Ver specs/coach-investigacao.md, DECISÃO N1. Só proteína e gordura (metas
// estáveis); calorias e hidratos são metas variáveis e não passam por aqui.

// deno-lint-ignore no-explicit-any
function makeGoalsSb(opts: {
  authorized?: boolean;
  profileError?: any;
  updateError?: any;
  profile?: any;
  supersedeError?: any;
  insertError?: any;
} = {}) {
  // deno-lint-ignore no-explicit-any
  const calls: { updates: any[]; supersedes: any[]; inserts: any[] } = { updates: [], supersedes: [], inserts: [] };
  const sb = {
    from: (table: string) => {
      if (table === "coach_goal_proposals") {
        // Toda a proposta nova substitui qualquer 'proposto' anterior do
        // atleta (ver comentário em runUpdateGoals) — o mock precisa de
        // suportar tanto esse update() de substituição como o insert() da
        // proposta nova, na mesma tabela.
        return {
          // deno-lint-ignore no-explicit-any
          update: (row: any) => {
            calls.supersedes.push(row);
            return { eq: () => ({ eq: () => Promise.resolve({ error: opts.supersedeError ?? null }) }) };
          },
          // deno-lint-ignore no-explicit-any
          insert: (row: any) => {
            calls.inserts.push(row);
            return Promise.resolve({ error: opts.insertError ?? null });
          },
        };
      }
      if (table !== "profiles") throw new Error(`tabela inesperada: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve(
              opts.profileError
                ? { data: null, error: opts.profileError }
                : { data: { coach_can_set_nutrition_goals: opts.authorized ?? true, ...(opts.profile || {}) }, error: null },
            ),
          }),
        }),
        // deno-lint-ignore no-explicit-any
        update: (row: any) => {
          calls.updates.push(row);
          return { eq: () => Promise.resolve({ error: opts.updateError ?? null }) };
        },
      };
    },
  };
  return { sb, calls };
}

// Nota: runUpdateGoals já não escreve diretamente em `profiles` — grava
// uma proposta em `coach_goal_proposals` (goals fica dentro de
// calls.inserts[0].goals), que o atleta depois aceita ou recusa na
// persiana. Estes testes foram reescritos para o fluxo atual; estavam
// desatualizados de uma refactor anterior (checavam calls.updates, que
// já não existe para este caminho) e passavam a throw silenciosamente
// mal a lógica de auto-substituição de propostas foi adicionada.

Deno.test("recusa escrever sem autorização, mesmo com valores válidos", async () => {
  const { sb, calls } = makeGoalsSb({ authorized: false });
  const result = await runUpdateGoals(sb, "user-1", { protein_goal: 150 });
  assertStringIncludes(result, "não autorizou");
  assertEquals(calls.inserts.length, 0);
});

Deno.test("com autorização, propõe a proteína e marca a origem", async () => {
  const { sb, calls } = makeGoalsSb({ authorized: true });
  const result = await runUpdateGoals(sb, "user-1", { protein_goal: 150.4 });
  assertStringIncludes(result, "criada com SUCESSO");
  assertEquals(calls.inserts[0].goals.protein_goal, 150); // arredondado
  assertEquals(calls.inserts[0].goals.protein_goal_set_by_coach, true);
  assertEquals(calls.inserts[0].goals.fat_goal, undefined); // não mexe no que não foi pedido
});

Deno.test("propõe proteína e gordura ao mesmo tempo", async () => {
  const { sb, calls } = makeGoalsSb({ authorized: true });
  await runUpdateGoals(sb, "user-1", { protein_goal: 140, fat_goal: 70 });
  assertEquals(calls.inserts[0].goals.protein_goal, 140);
  assertEquals(calls.inserts[0].goals.fat_goal, 70);
  assertEquals(calls.inserts[0].goals.fat_goal_set_by_coach, true);
});

Deno.test("aceita calorie_goal e carbs_goal — todos os macros são agora editáveis pelo Coach", async () => {
  const { sb, calls } = makeGoalsSb({ authorized: true });
  await runUpdateGoals(sb, "user-1", { calorie_goal: 2200, carbs_goal: 300 });
  assertEquals(calls.inserts[0].goals.calorie_goal, 2200);
  assertEquals(calls.inserts[0].goals.calorie_goal_set_by_coach, true);
  assertEquals(calls.inserts[0].goals.carbs_goal, 300);
  assertEquals(calls.inserts[0].goals.carbs_goal_set_by_coach, true);
});

Deno.test("aceita water_goal_ml e objetivos corporais", async () => {
  const { sb, calls } = makeGoalsSb({ authorized: true });
  await runUpdateGoals(sb, "user-1", { water_goal_ml: 2500, goal_weight_kg: 70.5, goal_body_fat_pct: 15 });
  assertEquals(calls.inserts[0].goals.water_goal_ml, 2500);
  assertEquals(calls.inserts[0].goals.water_goal_set_by_coach, true);
  assertEquals(calls.inserts[0].goals.goal_weight_kg, 70.5);
  assertEquals(calls.inserts[0].goals.goal_weight_set_by_coach, true);
  assertEquals(calls.inserts[0].goals.goal_body_fat_pct, 15);
  assertEquals(calls.inserts[0].goals.goal_body_fat_set_by_coach, true);
});

Deno.test("rejeita sem gravar quando nenhum campo é dado", async () => {
  const { sb, calls } = makeGoalsSb({ authorized: true });
  const result = await runUpdateGoals(sb, "user-1", {});
  assertStringIncludes(result, "Erro");
  assertEquals(calls.inserts.length, 0);
});

Deno.test("rejeita um valor fora do intervalo plausível (proteína 900g)", async () => {
  const { sb, calls } = makeGoalsSb({ authorized: true });
  const result = await runUpdateGoals(sb, "user-1", { protein_goal: 900 });
  assertStringIncludes(result, "Erro");
  assertEquals(calls.inserts.length, 0);
});

Deno.test("rejeita um valor negativo ou zero (gordura 0g)", async () => {
  const { sb, calls } = makeGoalsSb({ authorized: true });
  const result = await runUpdateGoals(sb, "user-1", { fat_goal: 0 });
  assertStringIncludes(result, "Erro");
  assertEquals(calls.inserts.length, 0);
});

Deno.test("propaga o erro se a leitura do perfil falhar", async () => {
  const { sb, calls } = makeGoalsSb({ profileError: { message: "timeout" } });
  const result = await runUpdateGoals(sb, "user-1", { protein_goal: 150 });
  assertStringIncludes(result, "timeout");
  assertEquals(calls.inserts.length, 0);
});

Deno.test("propaga o erro se substituir propostas anteriores falhar", async () => {
  const { sb } = makeGoalsSb({ authorized: true, supersedeError: { message: "conflito ao substituir" } });
  const result = await runUpdateGoals(sb, "user-1", { protein_goal: 150 });
  assertStringIncludes(result, "conflito ao substituir");
});

Deno.test("propaga o erro se a escrita da proposta falhar", async () => {
  const { sb } = makeGoalsSb({ authorized: true, insertError: { message: "conflito" } });
  const result = await runUpdateGoals(sb, "user-1", { protein_goal: 150 });
  assertStringIncludes(result, "conflito");
});

Deno.test("uma nova proposta substitui (marca 'recusado') qualquer proposta anterior ainda pendente", async () => {
  const { sb, calls } = makeGoalsSb({ authorized: true });
  await runUpdateGoals(sb, "user-1", { protein_goal: 150 });
  assertEquals(calls.supersedes.length, 1);
  assertEquals(calls.supersedes[0].status, "recusado");
});

// ─── regressão: colunas `numeric` do Postgres vêm como STRING via PostgREST ──
// Bug real em produção: profile.calorie_goal chegava como "2200" (string),
// e a comparação `currentVal !== v` (v é sempre Number) dava sempre true —
// a proposta era tratada como "mudança real" mesmo com valores idênticos,
// criando uma nova proposta pendente a cada chamada. Isto gerou um loop
// visível: o atleta aceitava, a Carol recalculava e repropunha os "mesmos"
// valores, o atleta aceitava outra vez, e assim sucessivamente.

Deno.test("valores idênticos aos atuais NÃO geram proposta, mesmo vindo como string do Postgres (numeric)", async () => {
  const { sb, calls } = makeGoalsSb({
    authorized: true,
    profile: { calorie_goal: "2200", protein_goal: "150" }, // como o PostgREST devolve `numeric`
  });
  const result = await runUpdateGoals(sb, "user-1", { calorie_goal: 2200, protein_goal: 150 });
  assertStringIncludes(result, "IDÊNTICOS");
  assertEquals(calls.inserts.length, 0);
});

Deno.test("uma mudança real ainda é detetada quando o valor atual vem como string", async () => {
  const { sb, calls } = makeGoalsSb({
    authorized: true,
    profile: { calorie_goal: "2200", protein_goal: "150" },
  });
  await runUpdateGoals(sb, "user-1", { calorie_goal: 2400, protein_goal: 150 });
  assertEquals(calls.inserts[0].goals.calorie_goal, 2400);
  assertEquals(calls.inserts[0].goals.protein_goal, undefined); // idêntico, não entra na proposta
});

// ─── autorização no system prompt ────────────────────────────────────────

Deno.test("sem autorização, o prompt diz ao modelo para não tentar a ferramenta", () => {
  const sys = sysCom(null, null); // BIO_BASE tem coach_can_set_nutrition_goals: false
  assertStringIncludes(sys, "NÃO uses a ferramenta update_goals");
});

Deno.test("com autorização, o prompt obriga o modelo a chamar a ferramenta imediatamente ao discutir valores", () => {
  // Fluxo mudou de "propõe em texto, pede confirmação, só depois chama" para
  // chamada imediata (commit 06edc19, "force tool usage when discussing
  // goals") — a confirmação passou a acontecer na persiana (Aceitar/Recusar),
  // não por troca de mensagens antes de a ferramenta ser chamada.
  const sys = buildSystemInstruction(
    null,
    { ...BIO_BASE, coach_can_set_nutrition_goals: true },
    null, null, "NUTRIÇÃO", "ÁGUA", null, null, null, null, null, null,
  );
  assertStringIncludes(sys, "OBRIGATÓRIO");
  assertStringIncludes(sys, "TENS DE CHAMAR IMEDIATAMENTE");
  assertStringIncludes(sys, "CUMPRE O QUE FICOU PENDENTE — AÇÃO, NÃO SÓ TEXTO");
  assertEquals(sys.includes("NÃO uses a ferramenta update_goals"), false);
});

Deno.test("regra 5 exige chamar a ferramenta certa consoante o pedido original (plano vs. refeições avulsas)", () => {
  const sys = buildSystemInstruction(
    null,
    { ...BIO_BASE, coach_can_set_nutrition_goals: true },
    null, null, "NUTRIÇÃO", "ÁGUA", null, null, null, null, null, null,
  );
  assertStringIncludes(sys, "propose_training_plan com replace_active_plan=true");
  assertStringIncludes(sys, "NÃO é suficiente escrever um resumo em texto");
});

Deno.test("regra 5 tem ação por omissão (propor plano de refeições) quando não há pedido explícito anterior", () => {
  // Reproduz o cenário real: se a proposta de objetivos surgir sem um
  // pedido prévio de plano/refeições no histórico, a Carol não pode
  // limitar-se a perguntar "queres que detalhe?" — tem de agir.
  // A ação por omissão é propose_training_plan (proposta com Aceitar/
  // Recusar, cobrindo o período do plano ativo), NÃO save_meal_suggestions
  // (grava direto sem revisão, e só para os dias explicitamente indicados
  // — errado como omissão, o atleta esperava um plano para rever, cobrindo
  // o período todo, não uma alteração silenciosa de 2-3 dias).
  const sys = buildSystemInstruction(
    null,
    { ...BIO_BASE, coach_can_set_nutrition_goals: true },
    null, null, "NUTRIÇÃO", "ÁGUA", null, null, null, null, null, null,
  );
  assertStringIncludes(sys, "SEM PEDIDO EXPLÍCITO NO HISTÓRICO");
  assertStringIncludes(sys, "a ação por omissão é CHAMAR propose_training_plan");
  assertStringIncludes(sys, "NUNCA save_meal_suggestions aqui, porque essa ferramenta grava direto sem revisão do atleta");
});

Deno.test("regra 5(c) cobre o período do plano ativo (não um sub-período curto), com teto de 14 dias alinhado à doutrina de microciclo", () => {
  // Regressão: uma versão anterior desta regra limitava sempre a 3-4 dias,
  // deixando de fora o resto de um plano ativo mais longo (ex.: plano até
  // dia 27, proposta só cobria até dia 20) — o atleta esperava o plano
  // todo, não um excerto. O teto existe só como salvaguarda técnica para
  // planos excecionalmente longos (não deveria disparar na prática — a
  // doutrina DURAÇÃO DO PLANO e o limite MAX_PLAN_ITEMS já capam qualquer
  // plano a 7-14 dias por microciclo), por isso o teto está em 14 dias
  // (não um número arbitrário menor) para coincidir com esse máximo.
  const sys = buildSystemInstruction(
    null,
    { ...BIO_BASE, coach_can_set_nutrition_goals: true },
    null, null, "NUTRIÇÃO", "ÁGUA", null, null, null, null, null, null,
  );
  assertStringIncludes(sys, "cobre o período do plano de treino aceite em curso, de hoje até ao fim desse plano — NUNCA um sub-período mais curto");
  assertStringIncludes(sys, "se esse período tiver MAIS de 14 dias a partir de hoje");
});

Deno.test("Regra 5(a) tem precedência sobre a Regra 1 — não reproponhas objetivos ao recalculares macros para o plano seguinte", () => {
  // Regressão: depois de aceitar objetivos, a Carol às vezes recalculava os
  // macros de novo ao preparar a proposta de plano/refeições seguinte, e a
  // Regra 1 (chamar update_goals sempre que decidir valores diferentes)
  // disparava outra vez — resultado: uma segunda proposta de objetivos
  // aparecia logo a seguir a aceitar a primeira, num ciclo. As duas regras
  // têm agora precedência cruzada explícita para o modelo não hesitar.
  const sys = buildSystemInstruction(
    null,
    { ...BIO_BASE, coach_can_set_nutrition_goals: true },
    null, null, "NUTRIÇÃO", "ÁGUA", null, null, null, null, null, null,
  );
  assertStringIncludes(sys, "Exceção 2 (tem PRECEDÊNCIA sobre esta regra — ver Regra 5(a))");
  assertStringIncludes(sys, "esta regra tem PRECEDÊNCIA sobre a Regra 1");
});

// ─── doutrina de nutrição no prompt (Bloco 7) ───────────────────────────────
// Ver src/coach-knowledge/07-sugestoes-alimentares.md. Antes disto, o campo
// meal_suggestion vinha do conhecimento geral do Gemini, não da literatura
// registada na investigação.

Deno.test("o prompt inclui a doutrina de distribuição de macros por refeição", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "20-25% kcal");
  assertStringIncludes(sys, "peri-treino");
});

Deno.test("o prompt inclui a tabela de equivalência proteína/alimento do INSA/PortFIR", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "INSA/PortFIR");
  assertStringIncludes(sys, "frango/peru peito 30-31");
});

Deno.test("o prompt lembra o modelo de somar em vez de copiar ementas de exemplo", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "SOMA sempre");
});

Deno.test("a doutrina de nutrição reforça sugestão educativa, não prescrição", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "SUGESTÃO EDUCATIVA");
});

// ─── buildPlanContext — plano activo ─────────────────────────────────────────

const TODAY = "2026-08-11";

// deno-lint-ignore no-explicit-any
function makeItem(date: string, kind: string, extra: any = {}): any {
  return { planned_date: date, kind, training_type: null, categories: null,
    target_distance_km: null, target_duration_min: null, notes: null, meal_suggestion: null, ...extra };
}

Deno.test("sem itens em nenhum plano, devolve null", () => {
  assertEquals(buildPlanContext([], [], TODAY), null);
});

Deno.test("plano proposto aparece com aviso de não propor outro", () => {
  const ctx = buildPlanContext([makeItem("2026-08-12", "corrida")], [], TODAY);
  assertStringIncludes(ctx!, "PLANO PROPOSTO");
  assertStringIncludes(ctx!, "aguarda aceitação");
});

Deno.test("plano aceite em curso aparece com proibição de novo plano", () => {
  const ctx = buildPlanContext([], [makeItem("2026-08-12", "ginasio")], TODAY);
  assertStringIncludes(ctx!, "PLANO ACEITE EM CURSO");
  assertStringIncludes(ctx!, "NÃO propões plano novo");
});

Deno.test("plano aceite e proposto ao mesmo tempo aparecem os dois", () => {
  const ctx = buildPlanContext(
    [makeItem("2026-08-15", "corrida")],
    [makeItem("2026-08-12", "ginasio")],
    TODAY,
  );
  assertStringIncludes(ctx!, "PLANO PROPOSTO");
  assertStringIncludes(ctx!, "PLANO ACEITE EM CURSO");
});

Deno.test("item com meal_suggestion aparece no contexto", () => {
  const ctx = buildPlanContext([], [makeItem("2026-08-12", "descanso", { meal_suggestion: "Salmão com arroz" })], TODAY);
  assertStringIncludes(ctx!, "Salmão com arroz");
});

Deno.test("o prompt inclui os 4 sinais de interrupção do microciclo", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "EVA ≥ 4");
  assertStringIncludes(sys, "FC de repouso");
  assertStringIncludes(sys, "HRV");
  assertStringIncludes(sys, "Mudança imprevista de agenda");
});

// ─── ESQUEMA DE DECISÃO (casos A-E) ─────────────────────────────────────────
// Decidir na persiana só grava o estado — não é uma troca de mensagens, por
// isso a Carol não reagia. O cliente dispara agora uma das quatro frases
// sintéticas (Coach.jsx: handleRespond / handleRespondGoal), e o esquema
// classifica-as e fixa que ferramentas podem ser chamadas em cada caso.
//
// O esquema substituiu um conjunto de regras espalhadas pelo prompt que se
// CONTRADIZIAM: a "Regra de Autorização" mandava nunca chamar uma ferramenta
// sem confirmação prévia em texto, enquanto a Regra 1 dos objetivos mandava
// chamar update_goals IMEDIATAMENTE na mesma mensagem. O modelo resolvia o
// conflito de forma diferente a cada turno — daí propostas de objetivos a
// aparecerem como efeito colateral de aceitar/recusar um plano.

Deno.test("o esquema de decisão está no prompt e declara precedência absoluta", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "ESQUEMA DE DECISÃO — PRECEDÊNCIA ABSOLUTA SOBRE TODAS AS OUTRAS REGRAS");
  assertStringIncludes(sys, "Ferramentas fora da lista PERMITIDO são PROIBIDAS");
});

Deno.test("esquema: caso A (aceitou objetivos) propõe plano e proíbe update_goals", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, 'CASO A — "Aceitei os novos objetivos."');
  assertStringIncludes(sys, "PERMITIDO: propose_training_plan · PROIBIDO: update_goals, save_meal_suggestions");
  // Não deve anunciar o plano como concluído — só que está à espera de revisão.
  assertStringIncludes(sys, "NÃO assumas que vai aceitar");
});

Deno.test("esquema: casos B, C e D não permitem NENHUMA ferramenta", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, 'CASO B — "Recusei os novos objetivos."');
  assertStringIncludes(sys, 'CASO C — "Aceitei o plano."');
  assertStringIncludes(sys, 'CASO D — "Recusei o plano."');
  // Três casos, todos com a mesma lista fechada de ferramentas proibidas.
  const proibidoTudo = sys.split(
    "PERMITIDO: nenhuma ferramenta · PROIBIDO: update_goals, propose_training_plan, save_meal_suggestions",
  ).length - 1;
  assertEquals(proibidoTudo, 3);
});

Deno.test("esquema: caso D avisa explicitamente contra propor objetivos ao recusar um plano", () => {
  // Foi exatamente isto que aconteceu em produção: recusar o plano fazia
  // aparecer uma proposta de objetivos nova.
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "ERRO GRAVE a evitar: propor objetivos novos");
  assertStringIncludes(sys, "O que foi recusado foi o PLANO — os objetivos não estão em causa e NÃO se mexem");
});

Deno.test("esquema: caso E fixa que objetivos só nascem de um pedido, nunca de uma reação", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "CASO E — Mensagem escrita pelo próprio atleta");
  assertStringIncludes(sys, "NUNCA como reação a ele ter aceite ou recusado alguma coisa");
});

// Regressão concreta: o atleta recusou o plano, a Carol perguntou o que não
// encaixou, ele respondeu "quero refeições vegetarianas" — e recebeu uma
// proposta de OBJETIVOS novos em vez do plano corrigido. Essa resposta caía
// no caso E, onde a regra de dependência mandava passar primeiro pelos
// objetivos. O caso F trata-a como continuação do que foi recusado.
// ─── Memória de longo prazo (coach_notes) ───────────────────────────────────
// O histórico que vai ao modelo são as últimas MAX_HISTORY mensagens. Um facto
// dito há semanas cai fora dessa janela e a Carol volta a propor o que já sabia
// estar errado. As notas são o oposto: poucas, curadas, sempre no prompt.

// deno-lint-ignore no-explicit-any
function makeNotesSb(opts: { count?: number; insertError?: any; deleteError?: any } = {}) {
  // deno-lint-ignore no-explicit-any
  const calls: any = { inserts: [], deletes: [] };
  const sb = {
    from: (table: string) => {
      if (table !== "coach_notes") throw new Error(`tabela inesperada: ${table}`);
      return {
        // deno-lint-ignore no-explicit-any
        insert: (row: any) => {
          calls.inserts.push(row);
          return Promise.resolve({ error: opts.insertError ?? null });
        },
        select: () => ({
          eq: () => Promise.resolve({ count: opts.count ?? 0, error: null }),
        }),
        delete: () => ({
          eq: (_k: string, v: string) => {
            calls.deletes.push(v);
            return { eq: () => Promise.resolve({ error: opts.deleteError ?? null }) };
          },
        }),
      };
    },
  };
  return { sb, calls };
}

Deno.test("runSaveCoachNote grava um facto duradouro com a categoria certa", async () => {
  const { sb, calls } = makeNotesSb();
  const r = await runSaveCoachNote(sb, "u1", {
    category: "preferencia_alimentar",
    note: "Prefere refeições predominantemente vegetarianas",
  });
  assertStringIncludes(r, "Nota guardada");
  assertEquals(calls.inserts[0].category, "preferencia_alimentar");
  assertEquals(calls.inserts[0].source, "coach");
  assertEquals(calls.inserts[0].user_id, "u1");
});

Deno.test("runSaveCoachNote rejeita categoria fora da lista", async () => {
  const { sb, calls } = makeNotesSb();
  const r = await runSaveCoachNote(sb, "u1", { category: "aleatorio", note: "qualquer coisa" });
  assertStringIncludes(r, "category inválida");
  assertEquals(calls.inserts.length, 0);
});

Deno.test("runSaveCoachNote rejeita nota vazia ou demasiado longa", async () => {
  const { sb, calls } = makeNotesSb();
  assertStringIncludes(await runSaveCoachNote(sb, "u1", { category: "outro", note: "ab" }), "Erro");
  assertStringIncludes(await runSaveCoachNote(sb, "u1", { category: "outro", note: "x".repeat(501) }), "Erro");
  assertEquals(calls.inserts.length, 0);
});

Deno.test("runSaveCoachNote apaga a nota substituída antes de inserir a nova", async () => {
  // Passar a vegetariano contradiz uma nota anterior — substituir evita que a
  // memória guarde as duas versões e a Carol siga a errada.
  const { sb, calls } = makeNotesSb();
  await runSaveCoachNote(sb, "u1", {
    category: "preferencia_alimentar",
    note: "Prefere refeições vegetarianas",
    replaces_note_id: "nota-antiga",
  });
  assertEquals(calls.deletes[0], "nota-antiga");
  assertEquals(calls.inserts.length, 1);
});

Deno.test("runSaveCoachNote trata facto repetido como já sabido, não como erro", async () => {
  const { sb } = makeNotesSb({ insertError: { code: "23505", message: "duplicate key" } });
  const r = await runSaveCoachNote(sb, "u1", { category: "outro", note: "Já sabido" });
  assertStringIncludes(r, "já estava registado");
  assertStringIncludes(r, "NÃO digas ao atleta que o guardaste agora");
});

Deno.test("runSaveCoachNote recusa passar do teto de notas", async () => {
  const { sb, calls } = makeNotesSb({ count: 40 });
  const r = await runSaveCoachNote(sb, "u1", { category: "outro", note: "mais uma" });
  assertStringIncludes(r, "máximo 40");
  assertStringIncludes(r, "replaces_note_id");
  assertEquals(calls.inserts.length, 0);
});

Deno.test("buildCoachNotesContext agrupa por categoria e expõe os ids", () => {
  const ctx = buildCoachNotesContext([
    { id: "n1", category: "preferencia_alimentar", note: "Prefere vegetariano" },
    { id: "n2", category: "limitacao_fisica", note: "Epicondilite no cotovelo direito" },
    { id: "n3", category: "preferencia_alimentar", note: "Sem glúten" },
  ])!;
  assertStringIncludes(ctx, "MEMÓRIA DO ATLETA");
  assertStringIncludes(ctx, "preferencia_alimentar:");
  assertStringIncludes(ctx, "limitacao_fisica:");
  // O id tem de ir junto para o modelo poder pedir a substituição da nota certa.
  assertStringIncludes(ctx, "[id: n1]");
  assertStringIncludes(ctx, "[id: n2]");
});

Deno.test("buildCoachNotesContext devolve null sem notas", () => {
  assertEquals(buildCoachNotesContext([]), null);
  assertEquals(buildCoachNotesContext(null), null);
});

Deno.test("as notas entram no system prompt e valem sempre", () => {
  const ctx = buildCoachNotesContext([
    { id: "n1", category: "limitacao_fisica", note: "Epicondilite no cotovelo direito" },
  ]);
  const sys = buildSystemInstruction(
    null, BIO_BASE, null, null, "NUTRIÇÃO", "ÁGUA", null, null, null, null, null, null, ctx,
  );
  assertStringIncludes(sys, "Epicondilite no cotovelo direito");
  assertStringIncludes(sys, "valem SEMPRE");
});

Deno.test("o prompt distingue as três fontes de informação", () => {
  // Era o que faltava: a Carol não sabia quando o histórico ajuda e quando
  // baralha, nem que factos duradouros se guardam em vez de recordar.
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "DADOS ESTRUTURADOS");
  assertStringIncludes(sys, "MEMÓRIA DO ATLETA");
  assertStringIncludes(sys, "HISTÓRICO DA CONVERSA");
  assertStringIncludes(sys, "NÃO é fonte fiável para factos antigos");
  assertStringIncludes(sys, "GUARDA-O com save_coach_note");
});

Deno.test("save_coach_note é permitida em todos os casos do esquema", () => {
  // Guardar um facto não cria nada que o atleta tenha de decidir, e é ao
  // reagir a uma recusa que ele explica o porquê.
  for (const caso of ["A", "B", "C", "D", "F_PLAN", "F_GOALS"] as const) {
    assertEquals(allowedToolsFor(caso)!.has("save_coach_note"), true, `caso ${caso}`);
  }
  assertEquals(allowedToolsFor("E"), null); // E não restringe nada
});

// ─── classifyTurn / allowedToolsFor ─────────────────────────────────────────
// O ESQUEMA DE DECISÃO no prompt não bastava: num prompt de ~166 KB as regras
// da secção dos objetivos continuavam a ganhar e a Carol propunha metas onde
// não devia. A whitelist abaixo é a mesma regra, mas imposta em código — o que
// não vai na lista nem chega ao Gemini.

const H = (...pares: [string, string][]) => pares.map(([role, content]) => ({ role, content }));

Deno.test("classifyTurn reconhece as quatro frases de decisão", () => {
  assertEquals(classifyTurn("Aceitei os novos objetivos.", []), "A");
  assertEquals(classifyTurn("Recusei os novos objetivos.", []), "B");
  assertEquals(classifyTurn("Aceitei o plano.", []), "C");
  assertEquals(classifyTurn("Recusei o plano.", []), "D");
});

Deno.test("classifyTurn ignora maiúsculas e espaços à volta", () => {
  assertEquals(classifyTurn("  aceitei o plano.  ", []), "C");
});

Deno.test("classifyTurn: resposta depois de recusar o plano é F_PLAN", () => {
  // Cenário exato do bug: recusa → pergunta → resposta do atleta.
  const hist = H(["user", "Recusei o plano."], ["model", "O que não encaixou?"]);
  assertEquals(classifyTurn("Quero refeições predominantemente vegetarianas", hist), "F_PLAN");
});

Deno.test("classifyTurn: resposta depois de recusar objetivos é F_GOALS", () => {
  const hist = H(["user", "Recusei os novos objetivos."], ["model", "O que não encaixou?"]);
  assertEquals(classifyTurn("As calorias estão baixas de mais", hist), "F_GOALS");
});

Deno.test("classifyTurn: o caso F dura só um turno", () => {
  // Já houve uma resposta do atleta depois da recusa — a partir daqui é E,
  // senão as ferramentas ficavam bloqueadas no resto da conversa.
  const hist = H(
    ["user", "Recusei o plano."],
    ["model", "O que não encaixou?"],
    ["user", "Quero mais vegetariano"],
    ["model", "Enviei a proposta ajustada."],
  );
  assertEquals(classifyTurn("E quantas calorias devo comer ao pequeno-almoço?", hist), "E");
});

Deno.test("classifyTurn: mensagem normal sem recusa anterior é E", () => {
  const hist = H(["user", "Olá"], ["model", "Olá! Como estás?"]);
  assertEquals(classifyTurn("Cria-me um plano para esta semana", hist), "E");
});

Deno.test("allowedToolsFor: aceitar objetivos (A) permite o plano mas proíbe update_goals", () => {
  const a = allowedToolsFor("A")!;
  assertEquals(a.has("propose_training_plan"), true);
  assertEquals(a.has("update_goals"), false);
  assertEquals(a.has("save_meal_suggestions"), false);
});

Deno.test("allowedToolsFor: reações (B, C, D) não permitem NENHUMA ferramenta de escrita", () => {
  for (const caso of ["B", "C", "D"] as const) {
    const a = allowedToolsFor(caso)!;
    assertEquals(a.has("update_goals"), false);
    assertEquals(a.has("propose_training_plan"), false);
    assertEquals(a.has("save_meal_suggestions"), false);
    // As de leitura mantêm-se sempre disponíveis.
    assertEquals(a.has("get_running_history"), true);
  }
});

Deno.test("allowedToolsFor: F_PLAN propõe plano e nunca objetivos", () => {
  // É isto que impede o bug relatado: dizer "quero vegetariano" depois de
  // recusar um plano não pode gerar uma proposta de metas.
  const a = allowedToolsFor("F_PLAN")!;
  assertEquals(a.has("propose_training_plan"), true);
  assertEquals(a.has("update_goals"), false);
});

Deno.test("allowedToolsFor: F_GOALS corrige objetivos e nunca propõe plano", () => {
  const a = allowedToolsFor("F_GOALS")!;
  assertEquals(a.has("update_goals"), true);
  assertEquals(a.has("propose_training_plan"), false);
});

Deno.test("allowedToolsFor: caso E não restringe nada", () => {
  assertEquals(allowedToolsFor("E"), null);
});

Deno.test("esquema: caso F retoma o que foi recusado em vez de reiniciar o ciclo", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "CASO F — O atleta responde à pergunta que fizeste depois de uma recusa");
  assertStringIncludes(sys, "Recusou o PLANO (caso D) → chama propose_training_plan com o ajuste pedido. PROIBIDO update_goals");
  assertStringIncludes(sys, "Recusou os OBJETIVOS (caso B) → chama update_goals com os valores corrigidos. PROIBIDO propose_training_plan");
  assertStringIncludes(sys, "NUNCA reinicies o ciclo a propor objetivos outra vez");
});

Deno.test("esquema: preferência alimentar não desencadeia proposta de objetivos", () => {
  // Domínio: mudar para vegetariano não altera calorias nem macros — altera
  // que alimentos os cumprem. Era este raciocínio que faltava e levava a
  // Carol a tratar "quero mais vegetariano" como um recálculo de metas.
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "NOTA TRANSVERSAL — preferências alimentares NÃO são objetivos");
  assertStringIncludes(sys, "As calorias e os macros mantêm-se exatamente iguais");
  assertStringIncludes(sys, "NUNCA chames update_goals por causa de uma mudança de preferência alimentar");
});

Deno.test("caso A manda rever a proposta no Coach, não no ecrã Início", () => {
  // O atleta está no Coach quando aceita os objetivos; a proposta de plano
  // abre ali mesmo. Mandá-lo ao Início é mandá-lo procurar noutro ecrã algo
  // que tem à frente.
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "AQUI MESMO, no Coach — não mandes o atleta para o ecrã Início");
});

Deno.test("a dependência objetivos→plano não se aplica a objetivos já aceites", () => {
  // A regra 4 vive no ramo autorizado do prompt — sysCom() usa BIO_BASE, que
  // tem coach_can_set_nutrition_goals: false, e aí esta secção nem existe.
  const sys = buildSystemInstruction(
    null,
    { ...BIO_BASE, coach_can_set_nutrition_goals: true },
    null, null, "NUTRIÇÃO", "ÁGUA", null, null, null, null, null, null,
  );
  assertStringIncludes(sys, "não se aplica se os objetivos atuais já foram aceites nesta conversa e continuam válidos");
  assertStringIncludes(sys, "avança DIRETO para o plano, sem passar outra vez pelos objetivos");
});

Deno.test("a contradição antiga (confirmar em texto antes de chamar) foi removida do prompt", () => {
  const sys = sysCom(null, null);
  assertEquals(sys.includes("Regra de Autorização"), false);
  assertEquals(sys.includes("Aguarda uma confirmação clara do atleta"), false);
  // ...e a frase que dizia ao modelo para anunciar objetivos como já gravados.
  assertEquals(sys.includes("os objetivos estão atualizados no teu perfil"), false);
  // O modelo correto: a ferramenta cria a proposta, o ecrã confirma.
  assertStringIncludes(sys, "a confirmação é o ecrã de aceitação");
  assertStringIncludes(sys, 'NUNCA digas que algo "já está atualizado"');
});

// ─── runSaveMealSuggestions ──────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
function makeMealsSb(opts: {
  activePlan?: { id: string; period_start: string; period_end: string } | null;
  existingItem?: { id: string } | null;
  planError?: any;
  insertPlanError?: any;
  insertItemsError?: any;
  updateError?: any;
} = {}): { sb: any; calls: any } {
  const calls: any = { updates: [], inserts: [], planInserts: [] };

  const sb = {
    from(table: string) {
      return {
        select(_cols: string) { return this; },
        eq(_col: string, _val: unknown) { return this; },
        gte(_col: string, _val: unknown) { return this; },
        order(_col: string, _opts: unknown) { return this; },
        limit(_n: number) { return this; },
        async maybeSingle() {
          if (table === "coach_plans") return { data: opts.activePlan ?? null, error: opts.planError ?? null };
          if (table === "coach_plan_items") return { data: opts.existingItem ?? null, error: null };
          return { data: null, error: null };
        },
        async single() {
          calls.planInserts.push(this._insertData);
          if (opts.insertPlanError) return { data: null, error: opts.insertPlanError };
          return { data: { id: "new-plan-id" }, error: null };
        },
        update(data: any) {
          calls.updates.push(data);
          return {
            eq(_col: string, _val: unknown) { return this; },
            async then(resolve: any) { resolve({}); },
            // make awaitable
            get [Symbol.toStringTag]() { return "Promise"; },
          };
        },
        insert(data: any) {
          const isArray = Array.isArray(data);
          if (isArray) calls.inserts.push(...data);
          else { this._insertData = data; calls.inserts.push(data); }
          const self = this;
          const ret: any = {
            _insertData: data,
            select(_c: string) { return this; },
            async single() {
              if (opts.insertPlanError) return { data: null, error: opts.insertPlanError };
              return { data: { id: "new-plan-id" }, error: null };
            },
            async then(resolve: any) {
              if (opts.insertItemsError && isArray) resolve({ error: opts.insertItemsError });
              else if (opts.updateError && !isArray) resolve({ error: opts.updateError });
              else resolve({ error: null });
            },
          };
          return ret;
        },
        _insertData: null as any,
      };
    },
  };
  return { sb, calls };
}

Deno.test("save_meal_suggestions: rejeita lista vazia", async () => {
  const { sb } = makeMealsSb();
  const result = await runSaveMealSuggestions(sb, "u1", { suggestions: [] });
  assertStringIncludes(result, "Erro");
});

// Colar a sugestão a um item já existente depende de casar o dia com o plano
// certo entre vários ativos — estado a mais para um mock raso. Coberto por
// PERCURSO A e PERCURSO H em plan-simulation.test.ts.

Deno.test("save_meal_suggestions: cria item descanso quando não existe item no plano ativo para esse dia", async () => {
  const { sb, calls } = makeMealsSb({
    activePlan: { id: "plan-1", period_start: "2026-08-10", period_end: "2026-08-17" },
    existingItem: null,
  });
  const result = await runSaveMealSuggestions(sb, "u1", {
    suggestions: [{ date: "2026-08-13", meal: "Salmão com batata doce" }],
  });
  assertStringIncludes(result, "gravadas");
  const inserted = calls.inserts.find((i: any) => i.planned_date === "2026-08-13");
  assertEquals(inserted?.kind, "descanso");
  assertEquals(inserted?.user_id, "u1");
  assertEquals(inserted?.meal_suggestion, "Salmão com batata doce");
});

Deno.test("save_meal_suggestions: cria plano proposto para datas fora do plano ativo", async () => {
  const { sb, calls } = makeMealsSb({
    activePlan: { id: "plan-1", period_start: "2026-08-10", period_end: "2026-08-14" },
  });
  const result = await runSaveMealSuggestions(sb, "u1", {
    suggestions: [{ date: "2026-08-20", meal: "Pasta pré-corrida" }],
  });
  assertStringIncludes(result, "gravadas");
  const inserted = calls.inserts.find((i: any) => i.planned_date === "2026-08-20");
  assertEquals(inserted?.kind, "descanso");
  assertEquals(inserted?.meal_suggestion, "Pasta pré-corrida");
  assertEquals(inserted?.user_id, "u1");
  // O plano proposto criado para datas fora do plano ativo usa "summary",
  // nunca "notes" (coach_plans não tem essa coluna — ver migração
  // 20260810000000_coach_plans.sql; "notes" só existe em coach_plan_items).
  const planInsert = calls.inserts.find((i: any) => i.status === "proposto");
  assertEquals(planInsert?.summary, "Sugestões alimentares do Coach");
  assertEquals(Object.prototype.hasOwnProperty.call(planInsert ?? {}, "notes"), false);
});

Deno.test("save_meal_suggestions: sem plano ativo cria plano proposto", async () => {
  const { sb, calls } = makeMealsSb({ activePlan: null });
  const result = await runSaveMealSuggestions(sb, "u1", {
    suggestions: [{ date: "2026-08-15", meal: "Ovos mexidos com tosta" }],
  });
  assertStringIncludes(result, "gravadas");
  const inserted = calls.inserts.find((i: any) => i.planned_date === "2026-08-15");
  assertEquals(inserted?.kind, "descanso");
  assertEquals(inserted?.user_id, "u1");
});

Deno.test("save_meal_suggestions: regressão — nunca escreve na coluna 'day' (não existe em coach_plan_items)", async () => {
  // Bug real reportado pelo utilizador: a função usava .eq("day", date) e
  // insert({ day: date, ... }) — "day" nunca existiu em coach_plan_items
  // (a coluna sempre foi planned_date, ver migração 20260810000000_coach_plans.sql).
  // Isto fazia a escrita falhar sempre que o Coach tentava gravar uma sugestão
  // alimentar no plano, e o atleta via "Edge Function returned a non-2xx status code".
  const { sb, calls } = makeMealsSb({ activePlan: null });
  await runSaveMealSuggestions(sb, "u1", {
    suggestions: [{ date: "2026-08-16", meal: "Massa integral com atum" }],
  });
  for (const insertedRow of calls.inserts) {
    assertEquals(Object.prototype.hasOwnProperty.call(insertedRow, "day"), false);
  }
});

Deno.test("save_meal_suggestions: propaga erro da criação do plano", async () => {
  const { sb } = makeMealsSb({
    activePlan: null,
    insertPlanError: { message: "permission denied" },
  });
  const result = await runSaveMealSuggestions(sb, "u1", {
    suggestions: [{ date: "2026-08-15", meal: "Banana e iogurte" }],
  });
  assertStringIncludes(result, "permission denied");
});

Deno.test("o prompt instrui a usar save_meal_suggestions em vez de propose_training_plan para refeições", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "save_meal_suggestions");
  assertEquals(sys.includes("usa propose_training_plan com itens de kind=\"descanso\""), false);
});

// ─── Bloco 2.1 — computeACWR ─────────────────────────────────────────────────

const TODAY_ACWR = "2026-08-11";

// Cria runs simples para ACWR: data + distância.
function makeRun(daysAgo: number, km: number) {
  const d = new Date("2026-08-11T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return { date: d.toISOString().slice(0, 10), distance_km: km };
}

Deno.test("computeACWR devolve null com lista vazia", () => {
  assertEquals(computeACWR([], TODAY_ACWR), null);
});

Deno.test("computeACWR devolve null quando crónica < 1 km/sem", () => {
  // Apenas 1 run de 0,5 km nas últimas 4 semanas → crónica = 0,125 < 1
  assertEquals(computeACWR([makeRun(3, 0.5)], TODAY_ACWR), null);
});

Deno.test("computeACWR zona segura: 40 km/sem crónica, 40 km aguda → rácio 1,00", () => {
  // 40 km nas 4 semanas = 10 km/sem crónica; 10 km nos últimos 7 dias = acute
  // Para rácio 1.0: aguda = crónica → usamos 40 km distribuídos + 10 km na última semana
  const runs = [
    makeRun(1,  5), makeRun(3,  5), // 10 km aguda (7 dias)
    makeRun(8,  8), makeRun(15, 8), makeRun(22, 8), makeRun(25, 6), // + 30 km  → total 40 km/4 sem
  ];
  // crónica = (10+30)/4 = 10; aguda = 10 → ratio = 1.0
  const r = computeACWR(runs, TODAY_ACWR);
  assertEquals(r?.zone, "seguro(0,80-1,30)");
  assertEquals(r?.ratio, 1.0);
});

Deno.test("computeACWR zona PERIGO: aguda muito alta relativamente à crónica", () => {
  // Crónica: 20 km/4 sem = 5 km/sem; Aguda: 10 km em 7 dias → rácio 2,0
  const runs = [
    makeRun(1, 5), makeRun(3, 5),   // 10 km aguda
    makeRun(10, 4), makeRun(18, 4), makeRun(26, 4), makeRun(27, 8), // + 20 km crónica = 10+20=30/4=7.5
  ];
  // vamos usar valores que deem claramente ≥1.5
  const runs2 = [
    makeRun(1, 30), // 30 km na última semana (aguda)
    makeRun(9, 5),  makeRun(16, 5), makeRun(23, 5), // 15 km nas 3 semanas anteriores → total 45/4=11.25 crónica
  ];
  // rácio = 30 / 11.25 = 2.67
  const r = computeACWR(runs2, TODAY_ACWR);
  assertEquals(r?.zone, "PERIGO(≥1,50)");
});

Deno.test("computeACWR zona risco_acrescido: rácio entre 1.31 e 1.49", () => {
  // crónica = 10 km/sem; aguda = 14 km → rácio ~1.40
  const runs = [
    makeRun(2, 7), makeRun(5, 7),   // 14 km aguda
    makeRun(9, 10), makeRun(16, 10), makeRun(23, 10), // +30 km fora dos 7 dias → total 44/4=11 crónica
  ];
  // rácio = 14 / (44/4) = 14/11 ≈ 1.27 → ainda seguro. Ajustar.
  const runs2 = [
    makeRun(2, 14),                   // 14 km aguda
    makeRun(9, 5), makeRun(16, 5), makeRun(23, 5), // 15 km fora dos 7 → total 29/4 = 7.25 crónica
  ];
  // rácio = 14 / 7.25 ≈ 1.93 → PERIGO. Vamos acertar.
  const runs3 = [
    makeRun(2, 13),                   // 13 km aguda
    makeRun(9, 4), makeRun(16, 4), makeRun(23, 4), makeRun(3, 2), // +10 km fora → total 23/4=5.75 ... 13/5.75=2.26 PERIGO
    // melhor: crónica ≈ 10 km/sem → 40 km total; aguda = 13,5 km → ratio 1.35
  ];
  const runs4 = [
    makeRun(2, 6), makeRun(4, 7),     // 13 km aguda (7 dias)
    makeRun(10, 9), makeRun(17, 9), makeRun(24, 9), // +27 km → total 40/4=10 crónica → ratio 1.3 (seguro)
  ];
  // Rácio 1.3 já é seguro. Para risco_acrescido preciso de 1.31-1.49.
  const runs5 = [
    makeRun(2, 7), makeRun(4, 7),     // 14 km aguda
    makeRun(10, 9), makeRun(17, 9), makeRun(24, 9), // +27 km → 41/4 = 10.25 crónica → ratio = 14/10.25 ≈ 1.37
  ];
  const r = computeACWR(runs5, TODAY_ACWR);
  assertEquals(r?.zone, "risco_acrescido(1,31-1,49)");
});

Deno.test("computeACWR zona destreino: aguda < 80% da crónica", () => {
  // crónica = 10 km/sem (40 km/4 sem); aguda = 7 km → ratio = 0.70 < 0.80
  const runs = [
    makeRun(2, 7),                    // 7 km aguda
    makeRun(10, 10), makeRun(17, 10), makeRun(24, 10), makeRun(27, 10), // 40 km → 10 km/sem crónica
  ];
  const r = computeACWR(runs, TODAY_ACWR);
  assertEquals(r?.zone, "possível_destreino(<0,80)");
});

// ─── Bloco 2.1-2.2-2.4 — doutrina no system prompt ───────────────────────────

Deno.test("o prompt inclui tabela de aumento semanal de volume por nível (Bloco 2.1)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "CARGA E PROGRESSÃO");
  assertStringIncludes(sys, "Iniciante: ≤5-10");
  assertStringIncludes(sys, "ACWR");
});

Deno.test("o prompt inclui as faixas de risco ACWR com limiar ≥1,50 para PERIGO", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "PERIGO ≥1,50");
  assertStringIncludes(sys, "0,80-1,30");
});

Deno.test("o prompt inclui doutrina de descarga por nível (Bloco 2.1 #3)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "DESCARGA");
  assertStringIncludes(sys, "corte de 20-30");
});

Deno.test("o prompt inclui regresso após pausa com regra 1:1 (Bloco 2.1 #5)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "REGRESSO APÓS PAUSA");
  assertStringIncludes(sys, "1:1");
});

Deno.test("o prompt inclui distribuição de intensidade 80/20 por nível (Bloco 2.2 #1)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "INTENSIDADE DE CORRIDA");
  assertStringIncludes(sys, "80/20");
  assertStringIncludes(sys, "80 % Z1/Z2 · 20 %");
});

Deno.test("o prompt proíbe recomendar 180 spm como universal (Bloco 2.4 #1)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "NÃO recomendar 180 spm como alvo universal");
  assertStringIncludes(sys, "155 spm");
});

// ─── Bloco 3 — computeGymMetrics ─────────────────────────────────────────────

const TODAY_GYM = "2026-08-11";

// Cria um GymSessionSummary mínimo com os campos necessários para os testes.
// deno-lint-ignore no-explicit-any
function makeGymRow(daysAgo: number, cats: string[], volume: number, highRepSets = 0): any {
  const d = new Date("2026-08-11T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return {
    date: d.toISOString().slice(0, 10),
    name: "Treino",
    kind: "forca",
    categories: cats,
    volume,
    sets: 4,
    highRepSets,
    durationSeconds: null,
    calories: null,
    avgHr: null,
    maxHr: null,
    exertion: null,
  };
}

Deno.test("computeGymMetrics devolve null sem sessões", () => {
  assertEquals(computeGymMetrics([], TODAY_GYM), null);
});

Deno.test("computeGymMetrics devolve null sem sessões de pernas", () => {
  const rows = [makeGymRow(2, ["Peito", "Costas"], 3000)];
  assertEquals(computeGymMetrics(rows, TODAY_GYM), null);
});

Deno.test("computeGymMetrics deteta spike de volume-carga ≥20% (RISCO ELEVADO)", () => {
  // crónica: 1000 kg/sem nas 4 semanas anteriores; semana atual: 1300 kg (+30%)
  const rows = [
    // 4 semanas anteriores (dias 8-35)
    makeGymRow(10, ["Pernas"], 1000),
    makeGymRow(17, ["Pernas"], 1000),
    makeGymRow(24, ["Pernas"], 1000),
    makeGymRow(31, ["Pernas"], 1000),
    // semana atual (últimos 7 dias)
    makeGymRow(3,  ["Pernas"], 1300),
  ];
  const result = computeGymMetrics(rows, TODAY_GYM);
  assertStringIncludes(result!, "RISCO ELEVADO");
  assertStringIncludes(result!, "VOLUME-CARGA PERNAS");
});

Deno.test("computeGymMetrics deteta spike de volume-carga 10-19% (risco acrescido)", () => {
  // crónica: 1000 kg/sem; semana atual: 1120 kg (+12%)
  const rows = [
    makeGymRow(10, ["Pernas"], 1000),
    makeGymRow(17, ["Pernas"], 1000),
    makeGymRow(24, ["Pernas"], 1000),
    makeGymRow(31, ["Pernas"], 1000),
    makeGymRow(3,  ["Pernas"], 1120),
  ];
  const result = computeGymMetrics(rows, TODAY_GYM);
  assertStringIncludes(result!, "risco acrescido");
});

Deno.test("computeGymMetrics não sinaliza quando o aumento está dentro dos limites", () => {
  // crónica: 1000 kg/sem; semana atual: 1080 kg (+8%) — abaixo dos 10%
  const rows = [
    makeGymRow(10, ["Pernas"], 1000),
    makeGymRow(17, ["Pernas"], 1000),
    makeGymRow(24, ["Pernas"], 1000),
    makeGymRow(31, ["Pernas"], 1000),
    makeGymRow(3,  ["Pernas"], 1080),
  ];
  assertEquals(computeGymMetrics(rows, TODAY_GYM), null);
});

Deno.test("computeGymMetrics deteta intervalo <48 h entre sessões de pernas", () => {
  // duas sessões de Pernas com 1 dia de diferença (24 h < 48 h)
  const rows = [
    makeGymRow(1, ["Pernas"], 500),
    makeGymRow(2, ["Pernas"], 500),
  ];
  const result = computeGymMetrics(rows, TODAY_GYM);
  assertStringIncludes(result!, "INTERVALO PERNAS");
  assertStringIncludes(result!, "24 h");
});

Deno.test("computeGymMetrics não sinaliza intervalo ≥48 h entre sessões de pernas", () => {
  // duas sessões separadas por 3 dias (72 h)
  const rows = [
    makeGymRow(1, ["Pernas"], 500),
    makeGymRow(4, ["Pernas"], 500),
  ];
  assertEquals(computeGymMetrics(rows, TODAY_GYM), null);
});

Deno.test("computeGymMetrics deteta séries longas (≥15 reps) em sessões de pernas", () => {
  const rows = [makeGymRow(3, ["Pernas"], 800, 3)]; // 3 séries com ≥15 reps
  const result = computeGymMetrics(rows, TODAY_GYM);
  assertStringIncludes(result!, "SÉRIES LONGAS PERNAS");
  assertStringIncludes(result!, "3 série(s)");
});

Deno.test("computeGymMetrics não sinaliza séries longas em sessões de não-pernas", () => {
  const rows = [makeGymRow(3, ["Peito"], 800, 5)];
  assertEquals(computeGymMetrics(rows, TODAY_GYM), null);
});

Deno.test("computeGymMetrics não sinaliza séries longas antigas (>14 dias)", () => {
  const rows = [makeGymRow(20, ["Pernas"], 800, 3)]; // 3 semanas atrás
  assertEquals(computeGymMetrics(rows, TODAY_GYM), null);
});

Deno.test("summariseSessions conta highRepSets corretamente", () => {
  const session = {
    date: "2026-08-10", name: "Pernas", kind: "forca", categories: ["Pernas"],
    duration_seconds: null, calories_kcal: null, avg_hr: null, max_hr: null, exertion: null,
    workout_session_sets: [
      { reps: 8,  weight: 80 },  // OK
      { reps: 15, weight: 40 },  // highRep
      { reps: 20, weight: 30 },  // highRep
      { reps: 5,  weight: 100 }, // OK
    ],
  };
  const [row] = summariseSessions([session]);
  assertEquals(row.highRepSets, 2);
  assertEquals(row.sets, 4);
});

// ─── Bloco 3 — doutrina no system prompt ─────────────────────────────────────

Deno.test("o prompt inclui doutrina de ginásio com grupos prioritários (Bloco 3 #3)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "GINÁSIO AO SERVIÇO DA CORRIDA");
  assertStringIncludes(sys, "tricípite sural");
  assertStringIncludes(sys, "glúteo médio");
});

Deno.test("o prompt inclui regra de faixas de repetições com aviso 15+ reps (Bloco 3 #10)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "15+ reps");
  assertStringIncludes(sys, "DESACONSELHADA para corredor");
});

Deno.test("o prompt inclui regra de interferência corrida+ginásio prescritiva (Bloco 3 #4)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "INTERFERÊNCIA CORRIDA+GINÁSIO");
  assertStringIncludes(sys, "≥24 h");
  assertStringIncludes(sys, "≥6-9 h");
});

Deno.test("o prompt inclui volume de manutenção em bloco de prova (Bloco 3 #8)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "VOLUME DE MANUTENÇÃO");
  assertStringIncludes(sys, "corta-se SÉRIES e REPS, nunca a carga");
});

Deno.test("o prompt inclui treino até à falha com custo de recuperação (Bloco 3 #11)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "TREINO ATÉ À FALHA");
  assertStringIncludes(sys, "RIR 2-4");
  assertStringIncludes(sys, "72-96 h");
});

// ─── Bloco 4.1 — buildNutritionTargets ───────────────────────────────────────

Deno.test("buildNutritionTargets: retorna null se peso ou altura ou idade em falta", () => {
  // Sem dados suficientes, a função não deve produzir linhas nem lançar erro.
  assertEquals(buildNutritionTargets({
    weightKg: null, heightCm: null, age: null, gender: null, level: null,
    restingHrBpm: null, waterGoalMl: null, proteinGoal: null, calorieGoal: null,
    weeklyVolumeKm: null,
  }), null);
});

Deno.test("buildNutritionTargets: calcula TMB e GETD com Mifflin-St Jeor (homem)", () => {
  // H 70 kg, 175 cm, 35 anos → TMB = (10×70)+(6,25×175)−(5×35)+5 = 700+1093,75−175+5 = 1623,75 ≈ 1624
  const out = buildNutritionTargets({
    weightKg: 70, heightCm: 175, age: 35, gender: "masculino", level: "medio",
    restingHrBpm: null, waterGoalMl: null, proteinGoal: null, calorieGoal: null,
    weeklyVolumeKm: null,
  });
  assertStringIncludes(out!, "1624 kcal/dia");
  assertStringIncludes(out!, "GETD estimado");
});

Deno.test("buildNutritionTargets: calcula TMB e GETD com Mifflin-St Jeor (mulher)", () => {
  // M 60 kg, 165 cm, 30 anos → TMB = (10×60)+(6,25×165)−(5×30)−161 = 600+1031,25−150−161 = 1320,25 ≈ 1320
  const out = buildNutritionTargets({
    weightKg: 60, heightCm: 165, age: 30, gender: "feminino", level: "basico",
    restingHrBpm: null, waterGoalMl: null, proteinGoal: null, calorieGoal: null,
    weeklyVolumeKm: null,
  });
  assertStringIncludes(out!, "1320 kcal/dia");
});

Deno.test("buildNutritionTargets: custo de corrida incluído no GETD quando weeklyVolumeKm > 0", () => {
  // 70 kg, 40 km/sem → custo = round(40×70/7) = round(400) = 400 kcal/dia
  const out = buildNutritionTargets({
    weightKg: 70, heightCm: 175, age: 35, gender: "masculino", level: "medio",
    restingHrBpm: null, waterGoalMl: null, proteinGoal: null, calorieGoal: null,
    weeklyVolumeKm: 40,
  });
  assertStringIncludes(out!, "400 kcal custo de corrida");
});

Deno.test("buildNutritionTargets: proteína recomendada para nível medio sem volume extra", () => {
  // medio manutenção 1,6-1,8 g/kg · 70 kg → 112-126 g/dia
  const out = buildNutritionTargets({
    weightKg: 70, heightCm: 175, age: 35, gender: "masculino", level: "medio",
    restingHrBpm: null, waterGoalMl: null, proteinGoal: null, calorieGoal: null,
    weeklyVolumeKm: null,
  });
  assertStringIncludes(out!, "112-126 g/dia");
});

Deno.test("buildNutritionTargets: bónus de proteína por volume >30 km/sem", () => {
  // 70 km/sem → (70-30)/20 * 0,15 = 0,30 (arred 0,3) → 1,9-2,1 g/kg · 70 kg = 133-147 g/dia
  const out = buildNutritionTargets({
    weightKg: 70, heightCm: 175, age: 35, gender: "masculino", level: "medio",
    restingHrBpm: null, waterGoalMl: null, proteinGoal: null, calorieGoal: null,
    weeklyVolumeKm: 70,
  });
  assertStringIncludes(out!, "+0.3 g/kg p/ volume");
});

Deno.test("buildNutritionTargets: alerta meta de proteína abaixo do mínimo", () => {
  const out = buildNutritionTargets({
    weightKg: 70, heightCm: 175, age: 35, gender: "masculino", level: "medio",
    restingHrBpm: null, waterGoalMl: null, proteinGoal: 80, calorieGoal: null,
    weeklyVolumeKm: null,
  });
  assertStringIncludes(out!, "abaixo do mínimo recomendado");
  assertStringIncludes(out!, "80 g");
});

Deno.test("buildNutritionTargets: hidratação base 30-40 ml/kg calculada a partir do peso", () => {
  // 70 kg → 2100-2800 ml/dia
  const out = buildNutritionTargets({
    weightKg: 70, heightCm: 175, age: 35, gender: "masculino", level: "medio",
    restingHrBpm: null, waterGoalMl: null, proteinGoal: null, calorieGoal: null,
    weeklyVolumeKm: null,
  });
  assertStringIncludes(out!, "2100-2800 ml/dia");
});

Deno.test("buildNutritionTargets: alerta meta de água abaixo do mínimo Bloco 4.1", () => {
  // meta 1500 ml < mínimo 2100 ml
  const out = buildNutritionTargets({
    weightKg: 70, heightCm: 175, age: 35, gender: "masculino", level: "medio",
    restingHrBpm: null, waterGoalMl: 1500, proteinGoal: null, calorieGoal: null,
    weeklyVolumeKm: null,
  });
  assertStringIncludes(out!, "abaixo do mínimo");
});

// ─── Bloco 4.2 — RED-S e FC de repouso ───────────────────────────────────────

Deno.test("buildNutritionTargets: flag RED-S quando resting_hr_bpm < 40", () => {
  const out = buildNutritionTargets({
    weightKg: 55, heightCm: 165, age: 28, gender: "feminino", level: "avancado",
    restingHrBpm: 37, waterGoalMl: null, proteinGoal: null, calorieGoal: null,
    weeklyVolumeKm: null,
  });
  assertStringIncludes(out!, "RED-S");
  assertStringIncludes(out!, "< 40 bpm");
});

Deno.test("buildNutritionTargets: sem flag RED-S quando resting_hr_bpm normal", () => {
  const out = buildNutritionTargets({
    weightKg: 70, heightCm: 175, age: 35, gender: "masculino", level: "medio",
    restingHrBpm: 55, waterGoalMl: null, proteinGoal: null, calorieGoal: null,
    weeklyVolumeKm: null,
  });
  assertEquals(out?.includes("RED-S") ?? false, false);
});

// ─── Bloco 4 — doutrina no system prompt ─────────────────────────────────────

Deno.test("o prompt inclui doutrina de proteína por nível com tabela (Bloco 4.1 #1)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "NUTRIÇÃO — BASE DIÁRIA");
  assertStringIncludes(sys, "PROTEÍNA (g/kg/dia)");
  assertStringIncludes(sys, "manutenção 1,2-1,4");
});

Deno.test("o prompt inclui hidratos variáveis por nível e tipo de dia (Bloco 4.1 #2)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "fuel for the work required");
  assertStringIncludes(sys, "HIDRATOS");
});

Deno.test("o prompt inclui GETD com fórmula Mifflin-St Jeor (Bloco 4.1 #4)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "Mifflin-St Jeor");
  assertStringIncludes(sys, "GETD");
});

Deno.test("o prompt inclui défice calórico máximo por nível com limite máximo (Bloco 4.1 #5)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "DÉFICE CALÓRICO MÁXIMO");
  assertStringIncludes(sys, "500 kcal/dia");
});

Deno.test("o prompt inclui doutrina RED-S com limiar EA e sinais clínicos (Bloco 4.2 #1)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "RED-S");
  assertStringIncludes(sys, "<30 (mantido");
  assertStringIncludes(sys, "FC em repouso <40");
});

Deno.test("o prompt inclui timing peri-treino Bloco 4.3 #1", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "PRÉ-TREINO");
  assertStringIncludes(sys, "PÓS-TREINO");
  assertStringIncludes(sys, "leucina");
});

Deno.test("o prompt inclui carb-loading para provas >90 min (Bloco 4.3 #3)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "CARB-LOADING");
  assertStringIncludes(sys, "10-12 g/kg/dia");
});

Deno.test("o prompt inclui hidratos por hora durante a prova (Bloco 4.3 #2)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "60-90 g/h");
  assertStringIncludes(sys, "fontes múltiplas");
});

Deno.test("o prompt inclui cafeína com dose e momento (Bloco 4.3 #5)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "CAFEÍNA");
  assertStringIncludes(sys, "3-6 mg/kg");
  assertStringIncludes(sys, "60 min antes");
});

// ─── nutritionTargetsLine entra no system prompt ──────────────────────────────

Deno.test("nutritionTargetsLine aparece no system prompt quando passada", () => {
  const line = "Targets nutricionais calculados (doutrina Bloco 4.1):\n- TMB estimada: 1624 kcal/dia";
  const sys = buildSystemInstruction(
    null,
    { ...BIO_BASE, dietary_restrictions: null, dietary_notes: null },
    line, null, "NUTRIÇÃO", "ÁGUA", null, null, null, null, null, null,
  );
  assertStringIncludes(sys, "TMB estimada: 1624 kcal/dia");
});

Deno.test("nutritionTargetsLine null não introduz linha em branco espúria", () => {
  const sys = buildSystemInstruction(
    null,
    { ...BIO_BASE, dietary_restrictions: null, dietary_notes: null },
    null, null, "NUTRIÇÃO", "ÁGUA", null, null, null, null, null, null,
  );
  // Não deve haver "undefined" ou "null" no prompt
  assertEquals(sys.includes("undefined"), false);
  assertEquals(sys.includes("null"), false);
});

// ─── Bloco 5 — computeBodyMetrics ────────────────────────────────────────────

function makeBA(assessed_at: string, opts: Partial<BodyAssessmentRow> = {}): BodyAssessmentRow {
  return {
    assessed_at,
    weight_kg: opts.weight_kg ?? null,
    body_fat_pct: opts.body_fat_pct ?? null,
    visceral_fat: opts.visceral_fat ?? null,
    body_water_pct: opts.body_water_pct ?? null,
    lean_body_mass_kg: opts.lean_body_mass_kg ?? null,
  };
}

Deno.test("computeBodyMetrics: retorna null se sem avaliações", () => {
  assertEquals(computeBodyMetrics([], null, "2026-08-11"), null);
});

Deno.test("computeBodyMetrics: peso mais recente aparece quando há só 1 medição", () => {
  const rows = [makeBA("2026-08-10T07:00:00Z", { weight_kg: 72.5 })];
  const out = computeBodyMetrics(rows, "masculino", "2026-08-11");
  assertStringIncludes(out!, "72.5 kg");
});

Deno.test("computeBodyMetrics: média de 7 dias quando há ≥2 medições recentes", () => {
  const rows = [
    makeBA("2026-08-11T07:00:00Z", { weight_kg: 71.0 }),
    makeBA("2026-08-09T07:00:00Z", { weight_kg: 73.0 }),
  ];
  const out = computeBodyMetrics(rows, "masculino", "2026-08-11");
  // média = (71+73)/2 = 72.0
  assertStringIncludes(out!, "72.0 kg");
  assertStringIncludes(out!, "2 medições");
});

Deno.test("computeBodyMetrics: flag queda de peso >1,5% em <72h (Bloco 5 #11)", () => {
  const rows = [
    makeBA("2026-08-11T07:00:00Z", { weight_kg: 68.0 }),
    makeBA("2026-08-09T07:00:00Z", { weight_kg: 71.0 }),
  ];
  // queda: (71-68)/71 = 4,2% em 48h → acima de 1,5%
  const out = computeBodyMetrics(rows, "masculino", "2026-08-11");
  assertStringIncludes(out!, "CORPO #11");
  assertStringIncludes(out!, "queda de peso");
});

Deno.test("computeBodyMetrics: sem flag para queda ≤1,5% (variação normal)", () => {
  const rows = [
    makeBA("2026-08-11T07:00:00Z", { weight_kg: 70.5 }),
    makeBA("2026-08-09T07:00:00Z", { weight_kg: 71.0 }),
  ];
  // queda: 0,7% — normal
  const out = computeBodyMetrics(rows, "masculino", "2026-08-11");
  assertEquals(out?.includes("CORPO #11") ?? false, false);
});

Deno.test("computeBodyMetrics: flag RED-S quando gordura corporal abaixo do piso masculino (6%)", () => {
  const rows = [makeBA("2026-08-10T07:00:00Z", { body_fat_pct: 4.5 })];
  const out = computeBodyMetrics(rows, "masculino", "2026-08-11");
  assertStringIncludes(out!, "CORPO #6 + RED-S");
  assertStringIncludes(out!, "piso fisiológico");
});

Deno.test("computeBodyMetrics: flag RED-S quando gordura corporal abaixo do piso feminino (14%)", () => {
  const rows = [makeBA("2026-08-10T07:00:00Z", { body_fat_pct: 12.0 })];
  const out = computeBodyMetrics(rows, "feminino", "2026-08-11");
  assertStringIncludes(out!, "CORPO #6 + RED-S");
});

Deno.test("computeBodyMetrics: sem flag RED-S quando gordura acima do piso", () => {
  const rows = [makeBA("2026-08-10T07:00:00Z", { body_fat_pct: 15.0 })];
  const out = computeBodyMetrics(rows, "masculino", "2026-08-11");
  assertEquals(out?.includes("CORPO #6") ?? false, false);
});

// Limiar alinhado com BF_ALARM_MEN/BF_ALARM_WOMEN (src/utils/biConstants.js) —
// o alarme dispara no valor mais conservador da faixa (8% H / 16% M), não no
// mais baixo (6%/14%), para o coach e o dashboard BI concordarem sempre.
Deno.test("computeBodyMetrics: flag RED-S no limiar conservador masculino (7%, entre 6% e 8%)", () => {
  const rows = [makeBA("2026-08-10T07:00:00Z", { body_fat_pct: 7.0 })];
  const out = computeBodyMetrics(rows, "masculino", "2026-08-11");
  assertStringIncludes(out!, "CORPO #6 + RED-S");
});

Deno.test("computeBodyMetrics: flag RED-S no limiar conservador feminino (15,5%, entre 14% e 16%)", () => {
  const rows = [makeBA("2026-08-10T07:00:00Z", { body_fat_pct: 15.5 })];
  const out = computeBodyMetrics(rows, "feminino", "2026-08-11");
  assertStringIncludes(out!, "CORPO #6 + RED-S");
});

Deno.test("computeBodyMetrics: sem flag RED-S mesmo no limiar exato (8% masculino, não é < 8)", () => {
  const rows = [makeBA("2026-08-10T07:00:00Z", { body_fat_pct: 8.0 })];
  const out = computeBodyMetrics(rows, "masculino", "2026-08-11");
  assertEquals(out?.includes("CORPO #6") ?? false, false);
});

Deno.test("computeBodyMetrics: flag risco elevado visceral_fat ≥15", () => {
  const rows = [makeBA("2026-08-10T07:00:00Z", { visceral_fat: 16 })];
  const out = computeBodyMetrics(rows, null, "2026-08-11");
  assertStringIncludes(out!, "RISCO ELEVADO");
  assertStringIncludes(out!, "CORPO #8");
});

Deno.test("computeBodyMetrics: flag alerta visceral_fat 10-14", () => {
  const rows = [makeBA("2026-08-10T07:00:00Z", { visceral_fat: 12 })];
  const out = computeBodyMetrics(rows, null, "2026-08-11");
  assertStringIncludes(out!, "alerta");
  assertStringIncludes(out!, "CORPO #8");
});

Deno.test("computeBodyMetrics: sem flag visceral_fat quando <10 (saudável)", () => {
  const rows = [makeBA("2026-08-10T07:00:00Z", { visceral_fat: 7 })];
  const out = computeBodyMetrics(rows, null, "2026-08-11");
  assertEquals(out?.includes("CORPO #8") ?? false, false);
});

Deno.test("computeBodyMetrics: lean_body_mass aparece com aviso de tendência", () => {
  const rows = [makeBA("2026-08-10T07:00:00Z", { lean_body_mass_kg: 58.2 })];
  const out = computeBodyMetrics(rows, null, "2026-08-11");
  assertStringIncludes(out!, "58.2 kg");
  assertStringIncludes(out!, "tendência");
});

Deno.test("computeBodyMetrics: muscle_mass_kg nunca aparece no output (não fiável)", () => {
  // A função não recebe muscle_mass_kg — verificamos que o output não a menciona
  const rows = [makeBA("2026-08-10T07:00:00Z", { lean_body_mass_kg: 58.0 })];
  const out = computeBodyMetrics(rows, null, "2026-08-11");
  assertEquals(out?.includes("muscle_mass") ?? false, false);
});

// ─── Bloco 5 — doutrina no system prompt ─────────────────────────────────────

Deno.test("o prompt inclui doutrina BIA com campos fiáveis e não fiáveis (Bloco 5 #1)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "COMPOSIÇÃO CORPORAL");
  assertStringIncludes(sys, "NÃO citar");
  assertStringIncludes(sys, "muscle_mass_kg");
  assertStringIncludes(sys, "lean_body_mass_kg");
});

Deno.test("o prompt inclui variação de peso e tendência 7-14 dias (Bloco 5 #2/#3)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "1,0-1,5 kg em 24-48h");
  assertStringIncludes(sys, "7-14 dias");
});

Deno.test("o prompt inclui piso RED-S de gordura corporal com limiar conservador (Bloco 5 #6)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "6-8%");
  assertStringIncludes(sys, "14-16%");
  assertStringIncludes(sys, "Piso RED-S");
});

Deno.test("o prompt inclui posição sobre peso de prova — proibido em iniciante/básico (Bloco 5 #7)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "NÃO promover");
  assertStringIncludes(sys, "15-30%");
  assertStringIncludes(sys, "PESO DE PROVA");
});

Deno.test("o prompt inclui tabela de ganho muscular por nível (Bloco 5 #5)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "GANHO DE MASSA MUSCULAR");
  assertStringIncludes(sys, "1,0-1,5 kg/mês");
  assertStringIncludes(sys, "Aragon");
});

Deno.test("o prompt inclui escala Renpho de gordura visceral (Bloco 5 #8)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "GORDURA VISCERAL");
  assertStringIncludes(sys, "RISCO ELEVADO");
  assertStringIncludes(sys, "≥15");
});

Deno.test("o prompt inclui sinais de sobretreino em corpo com queda de peso e água (Bloco 5 #11)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "SINAIS DE SOBRETREINO EM CORPO");
  assertStringIncludes(sys, "1,5-2,0% em 48-72h");
  assertStringIncludes(sys, "+5-7 bpm");
});

// ─── bodyMetricsLine entra no system prompt ───────────────────────────────────

Deno.test("bodyMetricsLine aparece no system prompt quando passada", () => {
  const line = "Avaliação corporal recente (Bloco 5):\n- Peso mais recente: 72.0 kg";
  const sys = buildSystemInstruction(
    null,
    { ...BIO_BASE, dietary_restrictions: null, dietary_notes: null },
    null, line, "NUTRIÇÃO", "ÁGUA", null, null, null, null, null, null,
  );
  assertStringIncludes(sys, "72.0 kg");
});

// ─── Bloco 6 — doutrina no system prompt ─────────────────────────────────────

Deno.test("o prompt inclui regra de défice zero a 21-28 dias de uma prova A (Bloco 6 #1)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "CONFLITO COMPOSIÇÃO CORPORAL vs. PROVA");
  assertStringIncludes(sys, "21-28 dias");
  assertStringIncludes(sys, "PROVA A");
  assertStringIncludes(sys, "défice calórico vai a ZERO");
});

Deno.test("o prompt inclui hierarquia de alarmes G1-G5 com ações (Bloco 6 #2)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "HIERARQUIA DE ALARMES");
  assertStringIncludes(sys, "G1 — RISCO VITAL");
  assertStringIncludes(sys, "dor torácica");
  assertStringIncludes(sys, "G3 — RED-S GRAVE");
  assertStringIncludes(sys, "G5 — LESÃO MÚSCULO-TENDINOSA");
});

Deno.test("o prompt inclui instrução de parar e encaminhar médico para G1 (Bloco 6 #2)", () => {
  const sys = sysCom(null, null);
  // O coach deve parar tudo ao ouvir sintomas cardíacos — verificamos que a
  // instrução "clearance médico" está presente (não só a menção dos sintomas).
  assertStringIncludes(sys, "clearance médico");
  assertStringIncludes(sys, "NÃO dar conselhos de treino");
});

Deno.test("o prompt inclui vocabulário por nível com proibição de acrónimos em iniciante (Bloco 6 #3)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "VOCABULÁRIO E QUANTIDADE DE INFORMAÇÃO");
  assertStringIncludes(sys, "1-2 recomendações");
  assertStringIncludes(sys, "ritmo de conversa");
  assertStringIncludes(sys, "PROIBIDO: VDOT");
});

Deno.test("o prompt inclui temas contraindicados por nível — lista por nível (Bloco 6 #4)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "TEMAS CONTRAINDICADOS POR NÍVEL");
  // Iniciante — proibir restrição calórica
  assertStringIncludes(sys, "peso de prova / restrição calórica");
  // Básico — proibir maratona sem base
  assertStringIncludes(sys, "propor maratona/ultra sem base");
  // Médio — proibir défice em fase de pico
  assertStringIncludes(sys, "défice calórico em fase de pico");
  // Avançado — não ignorar sinais biométricos
  assertStringIncludes(sys, "ignorar sinais biométricos persistentes");
});

Deno.test("o prompt inclui frequência de ajuste 7-14 dias com razão fisiológica (Bloco 6 #5)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "FREQUÊNCIA DE AJUSTE DO PLANO");
  // A janela já estava parcialmente no prompt (DURAÇÃO DO PLANO) — verificamos
  // que a nova secção Bloco 6 também a afirma e cita as fontes.
  assertStringIncludes(sys, "Verkhoshansky");
  assertStringIncludes(sys, "ruído de adaptação");
});

Deno.test("o prompt inclui micro-ajuste reativo apenas com sinal claro (Bloco 6 #5)", () => {
  const sys = sysCom(null, null);
  assertStringIncludes(sys, "Micro-ajuste reativo");
  assertStringIncludes(sys, "EVA ≥4/10");
  assertStringIncludes(sys, "+≥5 bpm");
});

// ─── Bloco 2.4 — summariseRuns: FC média (avg_heart_rate_bpm) ────────────────

// deno-lint-ignore no-explicit-any
function makeRunSummary(overrides: Record<string, unknown> = {}): unknown {
  return {
    date: "2026-08-10",
    kind: "treino",
    training_type: "rodagem",
    distance_km: 10,
    duration_seconds: 3600,
    cadence_spm: null,
    avg_heart_rate_bpm: null,
    ...overrides,
  };
}

Deno.test("summariseRuns: FC média aparece na linha quando avg_heart_rate_bpm registado", () => {
  const lines = summariseRuns([makeRunSummary({ avg_heart_rate_bpm: 148 })]);
  assertStringIncludes(lines[0], "FC média 148 bpm");
});

Deno.test("summariseRuns: sem FC média quando avg_heart_rate_bpm é null", () => {
  const lines = summariseRuns([makeRunSummary({ avg_heart_rate_bpm: null })]);
  assertEquals(lines[0].includes("FC média"), false);
});

Deno.test("summariseRuns: flag cadência<155 ainda funciona em conjunto com FC", () => {
  const lines = summariseRuns([makeRunSummary({ cadence_spm: 148, avg_heart_rate_bpm: 152 })]);
  assertStringIncludes(lines[0], "⚠cadência<155");
  assertStringIncludes(lines[0], "FC média 152 bpm");
});

Deno.test("summariseRuns: sem flag cadência quando cadence_spm ≥ 155", () => {
  const lines = summariseRuns([makeRunSummary({ cadence_spm: 162, avg_heart_rate_bpm: 140 })]);
  assertEquals(lines[0].includes("⚠cadência<155"), false);
  assertStringIncludes(lines[0], "162 spm");
  assertStringIncludes(lines[0], "FC média 140 bpm");
});
