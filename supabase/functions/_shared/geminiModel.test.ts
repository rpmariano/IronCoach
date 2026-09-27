import { assertEquals } from "jsr:@std/assert@1";
import { GEMINI_FALLBACK_MODEL, GEMINI_MODEL, geminiUrl, geminiWithFallback, thinkingConfig } from "./geminiModel.ts";

// Modelo fixo com rede (auditoria de custos de 2026-09-27) — ver o
// cabeçalho de geminiModel.ts.

function recorder(responses: Response[]) {
  const calls: { model: string; withThinking: boolean }[] = [];
  const send = (model: string, withThinking: boolean) => {
    calls.push({ model, withThinking });
    return Promise.resolve(responses[Math.min(calls.length - 1, responses.length - 1)]);
  };
  return { calls, send };
}

Deno.test("geminiWithFallback: 200 no modelo fixo não repete", async () => {
  const r = recorder([new Response("{}", { status: 200 })]);
  const res = await geminiWithFallback(r.send);
  assertEquals(res.status, 200);
  assertEquals(r.calls, [{ model: GEMINI_MODEL, withThinking: true }]);
});

Deno.test("geminiWithFallback: 404 (modelo descontinuado) repete no alias sem thinking", async () => {
  const r = recorder([new Response("no longer available", { status: 404 }), new Response("{}", { status: 200 })]);
  const res = await geminiWithFallback(r.send);
  assertEquals(res.status, 200);
  assertEquals(r.calls, [{ model: GEMINI_MODEL, withThinking: true }, { model: GEMINI_FALLBACK_MODEL, withThinking: false }]);
});

Deno.test("geminiWithFallback: 400 por causa do thinking repete; outro 400 não", async () => {
  const bad = recorder([new Response('{"error":{"message":"Unknown name \\"thinkingLevel\\""}}', { status: 400 }), new Response("{}")]);
  const budget = recorder([new Response('{"error":{"message":"thinking_budget is not supported"}}', { status: 400 }), new Response("{}")]);
  assertEquals((await geminiWithFallback(budget.send)).status, 200);
  const vague = recorder([new Response('{"error":{"message":"stop thinking about it"}}', { status: 400 })]);
  assertEquals((await geminiWithFallback(vague.send)).status, 400);
  assertEquals((await geminiWithFallback(bad.send)).status, 200);
  assertEquals(bad.calls.length, 2);

  const other = recorder([new Response('{"error":{"message":"invalid image"}}', { status: 400 })]);
  assertEquals((await geminiWithFallback(other.send)).status, 400);
  assertEquals(other.calls.length, 1);
});

Deno.test("geminiWithFallback: 429/503 não mudam de modelo (quem chama decide)", async () => {
  for (const status of [429, 503]) {
    const r = recorder([new Response("ocupado", { status })]);
    assertEquals((await geminiWithFallback(r.send)).status, status);
    assertEquals(r.calls.length, 1);
  }
});

Deno.test("thinkingConfig e geminiUrl", () => {
  assertEquals(thinkingConfig("minimal", true), { thinkingConfig: { thinkingLevel: "minimal" } });
  assertEquals(thinkingConfig("low", false), {});
  assertEquals(geminiUrl("m", "k"), "https://generativelanguage.googleapis.com/v1beta/models/m:generateContent?key=k");
});
