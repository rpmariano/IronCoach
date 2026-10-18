import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { FREE_WORKOUT_NOTE, parsePlanLink, planExecutionPromptSection, resolvePlanExecution } from "./planLink.ts";
import { computePlanExecution, executionNote } from "../_shared/formulas/planExecution.ts";

const RX = { blocks: [
  { type: "forca", name: "Seletor de pernas", sets: 3, reps: 12 },
  { type: "forca", name: "Extensões de pernas", sets: 3, reps: 12 },
  { type: "cardio", name: "Bicicleta", duration_min: 20 },
] };
const SETS = [
  { exercise_name: "Extensões de pernas", set_index: 0, reps: 12, weight: 40 },
  { exercise_name: "Extensões de pernas", set_index: 1, reps: 12, weight: 40 },
  { exercise_name: "Extensões de pernas", set_index: 2, reps: 12, weight: 40 },
  { exercise_name: "Bicicleta", set_index: 0, duration_seconds: 1200 },
];
const UUID = "123e4567-e89b-12d3-a456-426614174000";
const BASE = { userId: "u1", sessionId: "s1", sessionDate: "2026-10-18", sets: SETS, meta: null, recent: [] };

Deno.test("parsePlanLink: só um uuid e uma origem válida", () => {
  assertEquals(parsePlanLink({ plan_item_id: UUID, completion_source: "auto" }), { itemId: UUID, source: "auto" });
  assertEquals(parsePlanLink({ plan_item_id: "x'; drop", completion_source: "outra" }), { itemId: null, source: null });
  assertEquals(parsePlanLink(null), { itemId: null, source: null });
});

Deno.test("executionNote: o treino livre reconhece-se e diz o que ficou de fora", () => {
  const exec = computePlanExecution({ prescription: RX, completionSource: "auto", sessionDate: "2026-10-18", sets: SETS })!;
  assertEquals(executionNote(exec), "Treino livre, contado como o treino do plano. 2 de 3 exercícios cumpridos. ficou de fora: Seletor de pernas.");
  assertEquals(executionNote(null), null);
  const plano = computePlanExecution({ prescription: RX, completionSource: "plano", sessionDate: "2026-10-18", sets: SETS })!;
  assertEquals(executionNote(plano)!.startsWith("2 de 3"), true);
});

Deno.test("planExecutionPromptSection: o treino livre manda reconhecê-lo e nunca alterar o plano; vazio sem prescrição", () => {
  const auto = planExecutionPromptSection(computePlanExecution({ prescription: RX, completionSource: "auto", sessionDate: "2026-10-18", sets: SETS }));
  assertStringIncludes(auto, "PLANEADO VS FEITO (registado como treino livre");
  assertStringIncludes(auto, "Seletor de pernas — ficou de fora");
  assertStringIncludes(auto, "PRIMEIRA frase");
  assertStringIncludes(auto, "NÃO alteres tu o plano");
  assertStringIncludes(auto, "Nunca digas que prescreveste uma carga em kg");
  const plano = planExecutionPromptSection(computePlanExecution({ prescription: RX, completionSource: "plano", sessionDate: "2026-10-18", sets: SETS }));
  assertEquals(plano.includes("REGISTADO COMO LIVRE"), false);
  assertEquals(planExecutionPromptSection(null), "");
});

// deno-lint-ignore no-explicit-any
function mockSb(items: Record<string, any>) {
  // deno-lint-ignore no-explicit-any
  const calls = { updates: [] as any[] };
  const sb = {
    from: (_t: string) => ({
      select: (_c: string) => {
        // deno-lint-ignore no-explicit-any
        const f: Record<string, any> = {};
        const q = {
          eq: (k: string, v: unknown) => { f[k] = v; return q; },
          maybeSingle: () => Promise.resolve({ data: f.id ? items[f.id] ?? null : (f.completed_session_id ? items["by-session"] ?? null : null), error: null }),
        };
        return q;
      },
      // deno-lint-ignore no-explicit-any
      update: (payload: any) => ({ eq: (_k: string, id: string) => ({ eq: () => { calls.updates.push({ id, payload }); return Promise.resolve({ error: null }); } }) }),
    }),
  };
  return { sb, calls };
}

Deno.test("resolvePlanExecution: acha o item pelo plan_item_id, calcula e grava a execution_note", async () => {
  const { sb, calls } = mockSb({ [UUID]: { id: UUID, prescription: RX, completion_source: null, status: "pendente" } });
  const { exec, autoLinked } = await resolvePlanExecution(sb, { ...BASE, link: { itemId: UUID, source: "auto" } });
  assertEquals(autoLinked, true);
  assertEquals(exec?.autoLinked, true);
  assertEquals(calls.updates.length, 1);
  assertStringIncludes(calls.updates[0].payload.execution_note, "ficou de fora: Seletor de pernas");
});

Deno.test("resolvePlanExecution: numa edição acha o item ligado à sessão; sem prescrição devolve null e não grava", async () => {
  const a = mockSb({ "by-session": { id: "i2", prescription: RX, completion_source: "plano", status: "concluido", completed_session_id: "s1" } });
  const { exec } = await resolvePlanExecution(a.sb, { ...BASE, link: { itemId: null, source: null } });
  assertEquals(exec?.completionSource, "plano");
  const b = mockSb({ [UUID]: { id: UUID, prescription: null, status: "pendente" } });
  assertEquals(await resolvePlanExecution(b.sb, { ...BASE, link: { itemId: UUID, source: "plano" } }), { exec: null, autoLinked: false });
  assertEquals(b.calls.updates.length, 0);
});

Deno.test("resolvePlanExecution: usa as sessões anteriores para a carga face à última vez", async () => {
  const { sb } = mockSb({ [UUID]: { id: UUID, prescription: RX, status: "pendente" } });
  const { exec } = await resolvePlanExecution(sb, {
    ...BASE, link: { itemId: UUID, source: "plano" },
    recent: [{ date: "2026-10-11", workout_session_sets: [{ exercise_name: "Extensões de pernas", reps: 12, weight: 35 }] }],
  });
  assertEquals(exec?.blocks[1].loadDeltaKg, 5);
});

Deno.test("resolvePlanExecution: um erro da base de dados não rebenta o registo", async () => {
  const sb = { from: () => { throw new Error("rede"); } };
  assertEquals(await resolvePlanExecution(sb, { ...BASE, sets: [], link: { itemId: UUID, source: null } }), { exec: null, autoLinked: false });
});

Deno.test("resolvePlanExecution: treino livre sem prescrição (ou numa aula) reconhece-se e grava a nota mínima", async () => {
  const semRx = mockSb({ [UUID]: { id: UUID, prescription: null, status: "pendente" } });
  assertEquals(await resolvePlanExecution(semRx.sb, { ...BASE, link: { itemId: UUID, source: "auto" } }), { exec: null, autoLinked: true });
  assertEquals(semRx.calls.updates[0].payload.execution_note, FREE_WORKOUT_NOTE);

  const aula = mockSb({ [UUID]: { id: UUID, prescription: RX, status: "pendente" } });
  assertEquals(await resolvePlanExecution(aula.sb, { ...BASE, kind: "aula", link: { itemId: UUID, source: "auto" } }), { exec: null, autoLinked: true });
  assertEquals(aula.calls.updates[0].payload.execution_note, FREE_WORKOUT_NOTE);
});

Deno.test("planExecutionPromptSection: sem prescrição mas treino livre, a frase de reconhecimento entra na mesma", () => {
  const text = planExecutionPromptSection(null, true);
  assertStringIncludes(text, "ESTE TREINO FOI REGISTADO COMO LIVRE");
  assertStringIncludes(text, "NÃO alteres tu o plano");
  assertEquals(planExecutionPromptSection(null, false), "");
});

Deno.test("resolvePlanExecution: um item cancelado ou concluído por outra sessão não se usa nem se reescreve (N3)", async () => {
  for (const item of [
    { id: UUID, prescription: RX, status: "cancelado" },
    { id: UUID, prescription: RX, status: "concluido", completed_session_id: "outra" },
  ]) {
    const { sb, calls } = mockSb({ [UUID]: item });
    assertEquals(await resolvePlanExecution(sb, { ...BASE, link: { itemId: UUID, source: "plano" } }), { exec: null, autoLinked: false });
    assertEquals(calls.updates.length, 0);
  }
  // Já ligado a esta mesma sessão (uma reanálise): conta.
  const { sb } = mockSb({ [UUID]: { id: UUID, prescription: RX, status: "concluido", completed_session_id: "s1" } });
  assertEquals((await resolvePlanExecution(sb, { ...BASE, link: { itemId: UUID, source: "plano" } })).exec?.completionSource, "plano");
});
