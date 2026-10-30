import { assert, assertEquals } from "jsr:@std/assert@1";
import { afterResponse, type CircuitState, type GeminiCircuit, NO_CIRCUIT, safeCheck } from "./geminiCircuit.ts";
import { GEMINI_BUSY_FALLBACK_MODEL, GEMINI_MODEL, withBusyFallback } from "./geminiModel.ts";

// O disjuntor do principal (30-10-2026): um estado falso, injetado.
function fakeCircuit(state: CircuitState) {
  const records: { model: string; ok: boolean }[] = [];
  const checks: string[] = [];
  const circuit: GeminiCircuit = {
    check: (model) => { checks.push(model); return Promise.resolve(state); },
    record: (model, ok) => { records.push({ model, ok }); return Promise.resolve(); },
  };
  return { circuit, records, checks };
}

function sender(statusByModel: Record<string, number | "throw">) {
  const calls: { model: string; d: number }[] = [];
  const send = (model: string, d: number) => {
    calls.push({ model, d });
    const s = statusByModel[model] ?? 200;
    return s === "throw" ? Promise.reject(new Error("Não consegui responder a tempo.")) : Promise.resolve(new Response("{}", { status: s }));
  };
  return { calls, send };
}

Deno.test("disjuntor aberto: nem se chama o principal — o recurso vai logo, com o prazo inteiro", async () => {
  const { circuit, records } = fakeCircuit("open");
  const s = sender({});
  const deadline = Date.now() + 60000;
  assertEquals((await withBusyFallback(s.send, GEMINI_MODEL, deadline, GEMINI_BUSY_FALLBACK_MODEL, circuit)).status, 200);
  assertEquals(s.calls.map((c) => c.model), [GEMINI_BUSY_FALLBACK_MODEL]);
  assertEquals(s.calls[0].d, deadline);
  assertEquals(records, []); // o recurso não conta para o disjuntor do principal
});

Deno.test("disjuntor fechado: o principal regista falha (503, sem resposta) ou sucesso (200, e também 400 — não é carga)", async () => {
  for (const [status, ok] of [[503, false], ["throw", false], [429, false], [200, true], [400, true]] as const) {
    const { circuit, records } = fakeCircuit("closed");
    const s = sender({ [GEMINI_MODEL]: status });
    await withBusyFallback(s.send, GEMINI_MODEL, Date.now() + 60000, GEMINI_BUSY_FALLBACK_MODEL, circuit);
    assertEquals(records, [{ model: GEMINI_MODEL, ok }], String(status));
    assertEquals(s.calls[0].model, GEMINI_MODEL);
  }
});

Deno.test("disjuntor meio-aberto (probe): este pedido testa o principal e regista o resultado", async () => {
  const { circuit, records } = fakeCircuit("probe");
  const s = sender({});
  await withBusyFallback(s.send, GEMINI_MODEL, Date.now() + 60000, GEMINI_BUSY_FALLBACK_MODEL, circuit);
  assertEquals(s.calls.map((c) => c.model), [GEMINI_MODEL]);
  assertEquals(records, [{ model: GEMINI_MODEL, ok: true }]);
});

Deno.test("disjuntor sem base (erro ou lento): comporta-se como fechado", async () => {
  const broken: GeminiCircuit = { check: () => Promise.reject(new Error("db")), record: () => Promise.reject(new Error("db")) };
  const s = sender({});
  assertEquals((await withBusyFallback(s.send, GEMINI_MODEL, Date.now() + 60000, GEMINI_BUSY_FALLBACK_MODEL, broken)).status, 200);
  assertEquals(s.calls.map((c) => c.model), [GEMINI_MODEL]);
  const slow: GeminiCircuit = { check: () => new Promise(() => {}), record: () => Promise.resolve() };
  const t0 = Date.now();
  assertEquals(await safeCheck(slow, GEMINI_MODEL, 50), "closed");
  assert(Date.now() - t0 < 1000);
});

Deno.test("disjuntor: com o principal igual ao recurso não se consulta; sem configuração, NO_CIRCUIT fica fechado", async () => {
  const { circuit, checks } = fakeCircuit("open");
  const s = sender({});
  await withBusyFallback(s.send, GEMINI_BUSY_FALLBACK_MODEL, Date.now() + 60000, GEMINI_BUSY_FALLBACK_MODEL, circuit);
  assertEquals(checks, []);
  assertEquals(s.calls.map((c) => c.model), [GEMINI_BUSY_FALLBACK_MODEL]);
  assertEquals(await NO_CIRCUIT.check("x"), "closed");
});

Deno.test("afterResponse (R3 de 5612ec2d): sem waitUntil, um registo pendurado não segura a resposta", async () => {
  const t0 = Date.now();
  const outcome = await Promise.race([
    afterResponse(new Promise(() => {}), 50).then(() => "voltou"),
    new Promise((r) => setTimeout(() => r("pendurado"), 1000)),
  ]);
  assertEquals(outcome, "voltou");
  assert(Date.now() - t0 < 1000);
});
