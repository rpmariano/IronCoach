import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { aggregateMealsByDate, runGetNutritionHistory, summariseSessions, formatSessionLine, runGetGymHistory, runProposeTrainingPlan, runUpdateGoals, runSaveMealSuggestions, buildSystemInstruction, buildPlanContext, computeACWR } from "./index.ts";

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
    "NUTRIÇÃO", "ÁGUA", null, null, null, null, null,
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

function makeGoalsSb(opts: { authorized?: boolean; profileError?: any; updateError?: any } = {}) {
  const calls: { updates: any[] } = { updates: [] };
  const sb = {
    from: (table: string) => {
      if (table !== "profiles") throw new Error(`tabela inesperada: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve(
              opts.profileError
                ? { data: null, error: opts.profileError }
                : { data: { coach_can_set_nutrition_goals: opts.authorized ?? true }, error: null },
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

Deno.test("recusa escrever sem autorização, mesmo com valores válidos", async () => {
  const { sb, calls } = makeGoalsSb({ authorized: false });
  const result = await runUpdateGoals(sb, "user-1", { protein_goal: 150 });
  assertStringIncludes(result, "não autorizou");
  assertEquals(calls.updates.length, 0);
});

Deno.test("com autorização, grava a proteína e marca a origem", async () => {
  const { sb, calls } = makeGoalsSb({ authorized: true });
  const result = await runUpdateGoals(sb, "user-1", { protein_goal: 150.4 });
  assertStringIncludes(result, "Metas atualizadas");
  assertEquals(calls.updates[0].protein_goal, 150); // arredondado
  assertEquals(calls.updates[0].protein_goal_set_by_coach, true);
  assertEquals(calls.updates[0].fat_goal, undefined); // não mexe no que não foi pedido
});

Deno.test("grava proteína e gordura ao mesmo tempo", async () => {
  const { sb, calls } = makeGoalsSb({ authorized: true });
  await runUpdateGoals(sb, "user-1", { protein_goal: 140, fat_goal: 70 });
  assertEquals(calls.updates[0].protein_goal, 140);
  assertEquals(calls.updates[0].fat_goal, 70);
  assertEquals(calls.updates[0].fat_goal_set_by_coach, true);
});

Deno.test("aceita calorie_goal e carbs_goal — todos os macros são agora editáveis pelo Coach", async () => {
  const { sb, calls } = makeGoalsSb({ authorized: true });
  await runUpdateGoals(sb, "user-1", { calorie_goal: 2200, carbs_goal: 300 });
  assertEquals(calls.updates[0].calorie_goal, 2200);
  assertEquals(calls.updates[0].calorie_goal_set_by_coach, true);
  assertEquals(calls.updates[0].carbs_goal, 300);
  assertEquals(calls.updates[0].carbs_goal_set_by_coach, true);
});

Deno.test("aceita water_goal_ml e objetivos corporais", async () => {
  const { sb, calls } = makeGoalsSb({ authorized: true });
  await runUpdateGoals(sb, "user-1", { water_goal_ml: 2500, goal_weight_kg: 70.5, goal_body_fat_pct: 15 });
  assertEquals(calls.updates[0].water_goal_ml, 2500);
  assertEquals(calls.updates[0].water_goal_set_by_coach, true);
  assertEquals(calls.updates[0].goal_weight_kg, 70.5);
  assertEquals(calls.updates[0].goal_weight_set_by_coach, true);
  assertEquals(calls.updates[0].goal_body_fat_pct, 15);
  assertEquals(calls.updates[0].goal_body_fat_set_by_coach, true);
});

Deno.test("rejeita sem gravar quando nenhum campo é dado", async () => {
  const { sb, calls } = makeGoalsSb({ authorized: true });
  const result = await runUpdateGoals(sb, "user-1", {});
  assertStringIncludes(result, "Erro");
  assertEquals(calls.updates.length, 0);
});

Deno.test("rejeita um valor fora do intervalo plausível (proteína 900g)", async () => {
  const { sb, calls } = makeGoalsSb({ authorized: true });
  const result = await runUpdateGoals(sb, "user-1", { protein_goal: 900 });
  assertStringIncludes(result, "Erro");
  assertEquals(calls.updates.length, 0);
});

Deno.test("rejeita um valor negativo ou zero (gordura 0g)", async () => {
  const { sb, calls } = makeGoalsSb({ authorized: true });
  const result = await runUpdateGoals(sb, "user-1", { fat_goal: 0 });
  assertStringIncludes(result, "Erro");
  assertEquals(calls.updates.length, 0);
});

Deno.test("propaga o erro se a leitura do perfil falhar", async () => {
  const { sb, calls } = makeGoalsSb({ profileError: { message: "timeout" } });
  const result = await runUpdateGoals(sb, "user-1", { protein_goal: 150 });
  assertStringIncludes(result, "timeout");
  assertEquals(calls.updates.length, 0);
});

Deno.test("propaga o erro se a escrita falhar", async () => {
  const { sb } = makeGoalsSb({ authorized: true, updateError: { message: "conflito" } });
  const result = await runUpdateGoals(sb, "user-1", { protein_goal: 150 });
  assertStringIncludes(result, "conflito");
});

// ─── autorização no system prompt ────────────────────────────────────────

Deno.test("sem autorização, o prompt diz ao modelo para não tentar a ferramenta", () => {
  const sys = sysCom(null, null); // BIO_BASE tem coach_can_set_nutrition_goals: false
  assertStringIncludes(sys, "NÃO uses a ferramenta update_goals");
});

Deno.test("com autorização, o prompt convida o modelo a usar a ferramenta com fluxo de 2 passos", () => {
  const sys = buildSystemInstruction(
    null,
    { ...BIO_BASE, coach_can_set_nutrition_goals: true },
    "NUTRIÇÃO", "ÁGUA", null, null, null, null, null,
  );
  assertStringIncludes(sys, "autorizou-te a escrever metas");
  assertStringIncludes(sys, "Queres que atualize agora");
  assertEquals(sys.includes("NÃO uses a ferramenta update_goals"), false);
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

Deno.test("save_meal_suggestions: grava no item existente do plano ativo", async () => {
  const { sb, calls } = makeMealsSb({
    activePlan: { id: "plan-1", period_start: "2026-08-10", period_end: "2026-08-17" },
    existingItem: { id: "item-1" },
  });
  const result = await runSaveMealSuggestions(sb, "u1", {
    suggestions: [{ date: "2026-08-12", meal: "Frango com arroz" }],
  });
  assertStringIncludes(result, "2026-08-12");
  assertStringIncludes(result, "gravadas");
  assertEquals(calls.updates[0].meal_suggestion, "Frango com arroz");
});

Deno.test("save_meal_suggestions: cria item descanso quando não existe item no plano ativo para esse dia", async () => {
  const { sb, calls } = makeMealsSb({
    activePlan: { id: "plan-1", period_start: "2026-08-10", period_end: "2026-08-17" },
    existingItem: null,
  });
  const result = await runSaveMealSuggestions(sb, "u1", {
    suggestions: [{ date: "2026-08-13", meal: "Salmão com batata doce" }],
  });
  assertStringIncludes(result, "gravadas");
  const inserted = calls.inserts.find((i: any) => i.day === "2026-08-13");
  assertEquals(inserted?.kind, "descanso");
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
  const inserted = calls.inserts.find((i: any) => i.day === "2026-08-20");
  assertEquals(inserted?.kind, "descanso");
  assertEquals(inserted?.meal_suggestion, "Pasta pré-corrida");
});

Deno.test("save_meal_suggestions: sem plano ativo cria plano proposto", async () => {
  const { sb, calls } = makeMealsSb({ activePlan: null });
  const result = await runSaveMealSuggestions(sb, "u1", {
    suggestions: [{ date: "2026-08-15", meal: "Ovos mexidos com tosta" }],
  });
  assertStringIncludes(result, "gravadas");
  const inserted = calls.inserts.find((i: any) => i.day === "2026-08-15");
  assertEquals(inserted?.kind, "descanso");
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
