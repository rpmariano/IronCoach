import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  attemptTimeoutMs, GEMINI_BUSY_FALLBACK_MODEL, GEMINI_CREDITS_STATUS, GEMINI_FALLBACK_MODEL, GEMINI_FALLBACK_RESERVE_MS, GEMINI_MODEL,
  geminiHeaders, geminiUrl, geminiWithFallback, primaryDeadline, thinkingConfig, withBusyFallback,
} from "./geminiModel.ts";
import { EXTRACTION_BUDGET_MS, fetchGeminiWithTimeout, hasTimeFor } from "./geminiFetch.ts";

// ── O prazo repartido (revisão de fa525453 — o incidente de 29-10) ─────────
Deno.test("primaryDeadline: o principal deixa a reserva ao de recurso; num prazo curto, metade; sem prazo, sem limite", () => {
  const now = 1_000_000;
  // Um prazo longo (90 s): o de recurso fica com os 25 s da reserva.
  assertEquals(primaryDeadline(now + 90000, now), now + 90000 - GEMINI_FALLBACK_RESERVE_MS);
  // A leitura de prints (60 s): 38% = 22,8 s para o de recurso, 37,2 s para o principal.
  assertEquals(primaryDeadline(now + EXTRACTION_BUDGET_MS, now), now + 37200);
  // As sapatilhas (30 s) e o resumo depois da preparação (~30 s): 62% para o principal (revisão de 70ccd43f).
  assertEquals(primaryDeadline(now + 30000, now), now + 18600);
  // Curto demais para dois: o principal fica com tudo.
  assertEquals(primaryDeadline(now + 12000, now), now + 12000);
  assertEquals(primaryDeadline(Number.POSITIVE_INFINITY, now), Number.POSITIVE_INFINITY);
  assertEquals(attemptTimeoutMs(40000, now + 15000, now), 15000);
  assertEquals(attemptTimeoutMs(10000, now + 15000, now), 10000);
  assertEquals(attemptTimeoutMs(10000, now - 5, now), 1000);
});

Deno.test("geminiWithFallback: «sem resposta» chega ao de recurso — o principal corre com o prazo reduzido", async () => {
  const deadline = Date.now() + EXTRACTION_BUDGET_MS;
  const seen: { model: string; d: number }[] = [];
  const send = (model: string, _t: boolean, d: number) => {
    seen.push({ model, d });
    return model === GEMINI_MODEL ? Promise.reject(new Error("Não consegui responder a tempo.")) : Promise.resolve(new Response("{}"));
  };
  assertEquals((await geminiWithFallback(send, deadline)).status, 200);
  assertEquals(seen.map((s) => s.model), [GEMINI_MODEL, GEMINI_BUSY_FALLBACK_MODEL]);
  assert(seen[0].d <= deadline - 8000, "o principal com a reserva tirada");
  assertEquals(seen[1].d, deadline);
  // E com o prazo reduzido o principal acaba a tempo: ainda cabe uma tentativa no de recurso.
  assert(hasTimeFor(deadline, seen[0].d));
});

Deno.test("fetchGeminiWithTimeout + withBusyFallback: um principal pendurado é cortado no prazo dele e o de recurso responde", async () => {
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = ((url: string, opts: RequestInit) => {
    calls.push(String(url));
    if (String(url).includes(GEMINI_MODEL)) {
      // Pendurado: só acaba quando o cortam.
      return new Promise((_r, reject) => opts.signal?.addEventListener("abort", () => reject(new DOMException("abort", "AbortError"))));
    }
    return Promise.resolve(new Response("{}"));
  }) as typeof fetch;
  try {
    const t0 = Date.now();
    const deadline = t0 + 22000; // reserva = 38% (8,4 s) → o principal corta aos ~13,6 s
    const res = await withBusyFallback((m, d) => fetchGeminiWithTimeout(geminiUrl(m), {}, 40000, 1, d), GEMINI_MODEL, deadline);
    assertEquals(res.status, 200);
    assertEquals(calls.length, 2);
    assert(calls[1].includes(GEMINI_BUSY_FALLBACK_MODEL));
    assert(Date.now() - t0 < 17000, `demorou ${Date.now() - t0} ms`);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("geminiWithFallback: o alias do 404 só dentro do prazo, e o aviso diz o modelo que respondeu", async () => {
  const past = Date.now() - 1;
  const r = recorder([new Response("gone", { status: 404 }), new Response("{}")]);
  assertEquals((await geminiWithFallback(r.send, past)).status, 404);
  assertEquals(r.calls.length, 1);
  // O de recurso deu o 404: o aviso nomeia-o, não o principal.
  const warns: string[] = [];
  const realWarn = console.warn;
  console.warn = (...a: unknown[]) => { warns.push(a.join(" ")); };
  try {
    const r2 = recorder([new Response("ocupado", { status: 503 }), new Response("gone", { status: 404 }), new Response("{}")]);
    assertEquals((await geminiWithFallback(r2.send)).status, 200);
  } finally {
    console.warn = realWarn;
  }
  assert(warns.some((w) => w.startsWith(`[gemini] fallback: ${GEMINI_BUSY_FALLBACK_MODEL} respondeu 404`)), warns.join("\n"));
});

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

// Incidente de 29-10-2026: 503 três vezes e um pedido pendurado no 3.8 — o
// analyze-meal acabou em 502. Agora ocupado/sem resposta cai noutro Flash.
Deno.test("geminiWithFallback: 429/5xx caem uma vez no Flash de recurso (com thinking)", async () => {
  for (const status of [429, 500, 502, 503, 504]) {
    const r = recorder([new Response("ocupado", { status }), new Response("{}", { status: 200 })]);
    assertEquals((await geminiWithFallback(r.send)).status, 200);
    assertEquals(r.calls, [{ model: GEMINI_MODEL, withThinking: true }, { model: GEMINI_BUSY_FALLBACK_MODEL, withThinking: true }]);
  }
  // O de recurso também ocupado: devolve-se o erro dele, sem terceira tentativa.
  const both = recorder([new Response("ocupado", { status: 503 }), new Response("ocupado", { status: 503 })]);
  assertEquals((await geminiWithFallback(both.send)).status, 503);
  assertEquals(both.calls.length, 2);
});

Deno.test("geminiWithFallback: sem resposta (tempo/rede) também cai no Flash de recurso", async () => {
  const calls: string[] = [];
  const send = (model: string) => {
    calls.push(model);
    return model === GEMINI_MODEL ? Promise.reject(new Error("Não consegui responder a tempo.")) : Promise.resolve(new Response("{}"));
  };
  assertEquals((await geminiWithFallback(send)).status, 200);
  assertEquals(calls, [GEMINI_MODEL, GEMINI_BUSY_FALLBACK_MODEL]);
});

Deno.test("geminiWithFallback: o 402 (créditos esgotados) nunca muda de modelo", async () => {
  const r = recorder([new Response('{"error":{"code":402,"message":"Your prepayment credits are depleted."}}', { status: GEMINI_CREDITS_STATUS })]);
  assertEquals((await geminiWithFallback(r.send)).status, 402);
  assertEquals(r.calls.length, 1);
});

Deno.test("geminiWithFallback: sem tempo antes do prazo, não cai — devolve o erro ou relança", async () => {
  const past = Date.now() - 1;
  const r = recorder([new Response("ocupado", { status: 503 }), new Response("{}")]);
  assertEquals((await geminiWithFallback(r.send, past)).status, 503);
  assertEquals(r.calls.length, 1);
  await assertRejects(() => geminiWithFallback(() => Promise.reject(new Error("tempo")), past), Error, "tempo");
});

Deno.test("geminiWithFallback: o de recurso recusa o thinking → alias sem ele", async () => {
  const r = recorder([
    new Response("ocupado", { status: 503 }),
    new Response('{"error":{"message":"Unknown name \\"thinkingLevel\\""}}', { status: 400 }),
    new Response("{}"),
  ]);
  assertEquals((await geminiWithFallback(r.send)).status, 200);
  assertEquals(r.calls, [
    { model: GEMINI_MODEL, withThinking: true },
    { model: GEMINI_BUSY_FALLBACK_MODEL, withThinking: true },
    { model: GEMINI_FALLBACK_MODEL, withThinking: false },
  ]);
});

Deno.test("withBusyFallback: o coach-chat (alias) cai no Flash de recurso; o próprio de recurso não repete", async () => {
  const calls: string[] = [];
  const send = (m: string) => { calls.push(m); return Promise.resolve(new Response("", { status: calls.length === 1 ? 503 : 200 })); };
  assertEquals((await withBusyFallback(send, "gemini-flash-latest")).status, 200);
  assertEquals(calls, ["gemini-flash-latest", GEMINI_BUSY_FALLBACK_MODEL]);
  const self: string[] = [];
  await withBusyFallback((m) => { self.push(m); return Promise.resolve(new Response("", { status: 503 })); }, GEMINI_BUSY_FALLBACK_MODEL);
  assertEquals(self, [GEMINI_BUSY_FALLBACK_MODEL]);
});

Deno.test("GEMINI_BUSY_FALLBACK_MODEL: um Flash (não Lite), diferente do principal", () => {
  assert(/^gemini-[\d.]+-flash$/.test(GEMINI_BUSY_FALLBACK_MODEL) && (GEMINI_BUSY_FALLBACK_MODEL as string) !== GEMINI_MODEL);
});

Deno.test("thinkingConfig e geminiUrl", () => {
  assertEquals(thinkingConfig("low", true), { thinkingConfig: { thinkingLevel: "low" } });
  assertEquals(thinkingConfig("low", false), {});
  // A chave nunca vai na URL (acabava nos logs num erro de rede).
  assertEquals(geminiUrl("m"), "https://generativelanguage.googleapis.com/v1beta/models/m:generateContent");
  assertEquals(geminiHeaders("k"), { "Content-Type": "application/json", "x-goog-api-key": "k" });
});
