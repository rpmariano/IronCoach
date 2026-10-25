import { assertEquals } from "jsr:@std/assert@1";
import { FakeFoodsDb } from "../analyze-meal/foodsTestkit.ts";
import { currentPlanResume, fetchPlanResumeInput } from "./planResumeData.ts";

// O leitor partilhado do tick e do coach-chat (A5): os mesmos dados, a mesma decisão.
const U = "u1";
const MSG_ID = "7cd927d8-4e21-4e49-b86d-0c86985cc812";
const NOW = Date.parse("2026-10-27T10:00:00Z");
const TODAY = "2026-10-27";

function world() {
  const db = new FakeFoodsDb();
  db.tables.coach_messages = [
    { id: "old", user_id: U, role: "model", created_at: "2026-10-20T10:00:00Z", plan_continuation: { from: "2026-10-27", to: "2026-11-02", part: 2, of: 2, until: "2026-11-02" } },
    { id: MSG_ID, user_id: U, role: "model", created_at: "2026-10-25T20:43:16Z", plan_continuation: { from: "2026-11-02", to: "2026-11-08", part: 2, of: 5, until: "2026-11-29" } },
    { id: "m-u", user_id: U, role: "user", created_at: "2026-10-26T09:00:00Z", content: "Como correu a minha semana?", plan_continuation: null },
    // De outro atleta: não conta.
    { id: "x", user_id: "u2", role: "model", created_at: "2026-10-26T20:00:00Z", plan_continuation: { from: "2026-11-02", to: "2026-11-08", part: 2, of: 2, until: "2026-11-08" } },
  ];
  db.tables.coach_plans = [
    // A parte 1, gravada no mesmo turno que a mensagem, e aceite.
    { id: "p1", user_id: U, status: "aceite", created_at: "2026-10-25T20:43:10Z", period_start: "2026-10-26", period_end: "2026-11-01" },
  ];
  db.tables.coach_plan_items = [
    { id: "i1", plan_id: "p1", planned_date: "2026-10-28", kind: "corrida", status: "pendente" },
    { id: "i2", plan_id: "p1", planned_date: "2026-10-30", kind: "descanso", status: "pendente" },
  ];
  db.tables.race_events = [{ id: "r1", user_id: U, name: "Meia de Lisboa", date: "2026-11-29", status: "agendada" }];
  return db;
}

Deno.test("fetchPlanResumeInput: a última mensagem com continuação, os aceites desde a cadeia, a prova agendada", async () => {
  const input = (await fetchPlanResumeInput(world(), U))!;
  assertEquals(input.lastContinuation?.id, MSG_ID);
  assertEquals([input.pendingTrainingPlans, input.plansCreatedAfter, input.continuationPlanStatus, input.raceName], [0, 0, "aceite", "Meia de Lisboa"]);
  assertEquals(input.acceptedItems.map((i) => i.planned_date), ["2026-10-28", "2026-10-30"]);
  const c = (await currentPlanResume(world(), U, NOW, TODAY))!;
  assertEquals([c.key, c.resume.applied, c.resume.raceName], [`plan_resume:${MSG_ID}`, true, "Meia de Lisboa"]);
});

Deno.test("fetchPlanResumeInput: a cadeia recusada e um plano criado depois calam a retoma (B1); a prova concluída não dá nome", async () => {
  const refused = world();
  refused.tables.coach_plans[0].status = "recusado";
  assertEquals(await currentPlanResume(refused, U, NOW, TODAY), null);
  const later = world();
  later.tables.coach_plans.push({ id: "p9", user_id: U, status: "recusado", created_at: "2026-10-26T12:00:00Z", period_start: "2026-11-02", period_end: "2026-11-08" });
  assertEquals(await currentPlanResume(later, U, NOW, TODAY), null);
  const done = world();
  done.tables.race_events[0].status = "concluida";
  assertEquals((await fetchPlanResumeInput(done, U))!.raceName, null);
});

Deno.test("fetchPlanResumeInput: sem continuação, ou com uma leitura falhada, null (não se retoma na dúvida)", async () => {
  const empty = new FakeFoodsDb();
  empty.tables.coach_messages = [];
  assertEquals(await fetchPlanResumeInput(empty, U), null);
  const warn = console.warn;
  console.warn = () => {};
  try {
    assertEquals(await fetchPlanResumeInput({ from: () => { throw new Error("rede"); } }, U), null);
  } finally {
    console.warn = warn;
  }
});
