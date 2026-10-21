import { assert, assertEquals } from "jsr:@std/assert@1";
import { maybeOpenPlanAdaptation } from "./adaptation.ts";
import { computePlanExecution } from "../_shared/formulas/planExecution.ts";

const RX = { blocks: [
  { type: "forca", name: "Prensa", sets: 2, reps: 10 },
  { type: "forca", name: "Seletor de pernas", sets: 2, reps: 12 },
] };
const SETS = [
  { exercise_name: "Prensa", set_index: 0, reps: 10, weight: 80 },
  { exercise_name: "Prensa", set_index: 1, reps: 10, weight: 80 },
];
const PLAN = "8f0c3b1e-1111-4222-8333-944455556666";
const exec = computePlanExecution({ prescription: RX, sessionDate: "2026-10-23", sets: SETS })!;
const ARGS = { userId: "u1", sessionId: "s2", sessionDate: "2026-10-23", rpe: 6, exec, item: { id: "i2", planId: PLAN }, todayISO: "2026-10-23" };

/** Um cliente falso: cada tabela responde com o que lhe é dado, e regista os updates. */
// deno-lint-ignore no-explicit-any
function mockSb(db: Record<string, any>) {
  // deno-lint-ignore no-explicit-any
  const calls = { updates: [] as any[], likes: [] as string[] };
  const sb = {
    from: (table: string) => {
      // deno-lint-ignore no-explicit-any
      let payload: any = null;
      // deno-lint-ignore no-explicit-any
      const q: any = {
        select: () => q, eq: () => q, not: () => q, in: () => q, lt: () => q, order: () => q, limit: () => q, or: () => q,
        like: (_k: string, v: string) => { calls.likes.push(v); return q; },
        // deno-lint-ignore no-explicit-any
        update: (p: any) => { payload = p; return q; },
        maybeSingle: () => Promise.resolve({ data: db[table] ?? null, error: null }),
        // deno-lint-ignore no-explicit-any
        then: (res: any) => {
          if (payload) { calls.updates.push({ table, payload }); return Promise.resolve({ data: db[`${table}:update`] ?? [{ id: "u1" }], error: null }).then(res); }
          return Promise.resolve({ data: db[`${table}:list`] ?? db[table] ?? [], error: null }).then(res);
        },
      };
      return q;
    },
  };
  return { sb, calls };
}

const PRIOR = {
  coach_plans: { id: PLAN, status: "aceite" },
  profiles: { coach_intervention_status: "resolved" },
  "coach_plan_items:list": [{ id: "i1", prescription: RX, completion_source: "plano", completed_session_id: "s1" }],
  "workout_sessions:list": [{ id: "s1", date: "2026-10-20", exertion: null, exercises_meta: null, workout_session_sets: SETS }],
  "coach_interventions:list": [],
};

Deno.test("maybeOpenPlanAdaptation: o mesmo exercício de fora duas vezes abre [adaptacao] com a assinatura do plano e da semana", async () => {
  const { sb, calls } = mockSb(PRIOR);
  const reason = await maybeOpenPlanAdaptation(sb, ARGS);
  assert(reason?.startsWith(`[adaptacao] ref=${PLAN}|2026-10-19.`));
  assertEquals(calls.likes, [`[adaptacao] ref=${PLAN}|2026-10-19%`]);
  const up = calls.updates.find((u) => u.table === "profiles")!;
  assertEquals(up.payload.coach_intervention_status, "needed");
  assertEquals(up.payload.coach_intervention_origin, "gym");
  assertEquals(up.payload.coach_intervention_reason, reason);
});

Deno.test("maybeOpenPlanAdaptation: já houve uma adaptação deste plano esta semana — não abre outra", async () => {
  const { sb, calls } = mockSb({ ...PRIOR, "coach_interventions:list": [{ id: "x" }] });
  assertEquals(await maybeOpenPlanAdaptation(sb, ARGS), null);
  assertEquals(calls.updates.length, 0);
});

Deno.test("maybeOpenPlanAdaptation: outro assunto por resolver, plano não aceite ou sem exec — nada", async () => {
  for (const db of [
    { ...PRIOR, profiles: { coach_intervention_status: "needed" } },
    { ...PRIOR, coach_plans: { id: PLAN, status: "proposto" } },
  ]) {
    const { sb, calls } = mockSb(db);
    assertEquals(await maybeOpenPlanAdaptation(sb, ARGS), null);
    assertEquals(calls.updates.length, 0);
  }
  const { sb } = mockSb(PRIOR);
  assertEquals(await maybeOpenPlanAdaptation(sb, { ...ARGS, exec: null }), null);
  assertEquals(await maybeOpenPlanAdaptation(sb, { ...ARGS, item: { id: "i2", planId: null } }), null);
});

Deno.test("maybeOpenPlanAdaptation: só uma vez de fora (sem treino anterior) não abre", async () => {
  const { sb, calls } = mockSb({ ...PRIOR, "coach_plan_items:list": [], "workout_sessions:list": [] });
  assertEquals(await maybeOpenPlanAdaptation(sb, ARGS), null);
  assertEquals(calls.updates.length, 0);
});

Deno.test("maybeOpenPlanAdaptation: o perfil mudou entretanto (update condicional sem linhas) devolve null", async () => {
  const { sb } = mockSb({ ...PRIOR, "profiles:update": [] });
  assertEquals(await maybeOpenPlanAdaptation(sb, ARGS), null);
});

Deno.test("maybeOpenPlanAdaptation: um erro da base de dados não rebenta o registo", async () => {
  const sb = { from: () => { throw new Error("boom"); } };
  assertEquals(await maybeOpenPlanAdaptation(sb, ARGS), null);
});
