import { assertEquals } from "jsr:@std/assert@1";
import { recordUsage, type UsageRow, usageRow, usageToRecord, userIdFromAuth, withUsageRecording } from "./usageRecorder.ts";
import { usageFromGemini } from "./geminiUsage.ts";

// Auditoria de custos de 2026-09-27: o consumo passa a ser gravado pelo
// servidor em ai_usage (ver o cabeçalho de usageRecorder.ts).

const UID = "6964f8a6-2e37-4bf2-b4fb-074da0009027";
function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.assinatura`;
}

Deno.test("userIdFromAuth: sub uuid do Bearer; nada para anon key ou lixo", () => {
  assertEquals(userIdFromAuth(`Bearer ${jwt({ sub: UID, role: "authenticated" })}`), UID);
  assertEquals(userIdFromAuth(`Bearer ${jwt({ role: "anon" })}`), null);
  assertEquals(userIdFromAuth("Bearer xpto"), null);
  assertEquals(userIdFromAuth(null), null);
});

Deno.test("usageRow: normaliza, limita a cache ao input e ignora consumo vazio", () => {
  assertEquals(usageRow("analyze-meal", UID, { input_tokens: 100, cached_tokens: 500, output_tokens: 10, thoughts_tokens: 7, calls: 2, model: "gemini-3.8-flash" }), {
    user_id: UID, function: "analyze-meal", model: "gemini-3.8-flash",
    input_tokens: 100, cached_tokens: 100, output_tokens: 10, thoughts_tokens: 7, calls: 2, source: "server",
  });
  assertEquals(usageRow("x", UID, { input_tokens: 0, output_tokens: 0, calls: 0 }), null);
  assertEquals(usageRow("x", UID, null), null);
  // Resposta sem `calls` conta como uma chamada.
  assertEquals(usageRow("x", null, { input_tokens: 5 })?.calls, 1);
});

Deno.test("recordUsage: uma falha a gravar nunca rejeita", async () => {
  await recordUsage("x", UID, { input_tokens: 1 }, () => Promise.reject(new Error("rede")));
  await recordUsage("x", UID, { input_tokens: 1 }, () => Promise.resolve({ error: "rls" }));
});

Deno.test("withUsageRecording: grava o usage da resposta e devolve-a intacta", async () => {
  const rows: UsageRow[] = [];
  const insert = (row: UsageRow) => { rows.push(row); return Promise.resolve({ error: null }); };
  const handler = withUsageRecording("coach-chat", () =>
    new Response(JSON.stringify({ reply: "olá", usage: { input_tokens: 10, output_tokens: 2, thoughts_tokens: 3, calls: 1 } }), {
      headers: { "Content-Type": "application/json" },
    }), insert);
  const res = await handler(new Request("http://x", { headers: { Authorization: `Bearer ${jwt({ sub: UID })}` } }));
  assertEquals(await res.json(), { reply: "olá", usage: { input_tokens: 10, output_tokens: 2, thoughts_tokens: 3, calls: 1 } });
  assertEquals(rows.length, 1);
  assertEquals(rows[0].user_id, UID);
  assertEquals(rows[0].function, "coach-chat");
});

Deno.test("withUsageRecording: sem usage, usage null ou resposta não-JSON não grava nada", async () => {
  const rows: UsageRow[] = [];
  const insert = (row: UsageRow) => { rows.push(row); return Promise.resolve({ error: null }); };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
  await withUsageRecording("f", () => json({ ok: true }), insert)(new Request("http://x"));
  await withUsageRecording("f", () => json({ usage: null }), insert)(new Request("http://x"));
  await withUsageRecording("f", () => json({ error: "x" }, 502), insert)(new Request("http://x"));
  const text = await withUsageRecording("f", () => new Response("ok"), insert)(new Request("http://x"));
  assertEquals(await text.text(), "ok");
  assertEquals(rows.length, 0);
});

Deno.test("recordUsage: chamadas de dois modelos (Flash de recurso) gravam uma linha por modelo", async () => {
  const rows: UsageRow[] = [];
  const insert = (r: UsageRow) => { rows.push(r); return Promise.resolve({ error: null }); };
  await recordUsage("analyze-meal", null, {
    input_tokens: 300, output_tokens: 30, cached_tokens: 0, thoughts_tokens: 0, calls: 2, model: "gemini-3.6-flash",
    by_model: {
      "gemini-3.8-flash": { input_tokens: 100, output_tokens: 10, cached_tokens: 0, thoughts_tokens: 0, calls: 1 },
      "gemini-3.6-flash": { input_tokens: 200, output_tokens: 20, cached_tokens: 0, thoughts_tokens: 0, calls: 1 },
    },
  }, insert);
  assertEquals(rows.map((r) => [r.model, r.input_tokens, r.calls]), [["gemini-3.8-flash", 100, 1], ["gemini-3.6-flash", 200, 1]]);
  // Um só modelo, ou by_model que não cobre todas as chamadas: a linha única de sempre.
  rows.length = 0;
  await recordUsage("analyze-meal", null, {
    input_tokens: 300, output_tokens: 30, calls: 2, model: "gemini-3.8-flash",
    by_model: { "gemini-3.8-flash": { input_tokens: 100, output_tokens: 10, cached_tokens: 0, thoughts_tokens: 0, calls: 1 } },
  }, insert);
  assertEquals(rows.map((r) => [r.model, r.input_tokens, r.calls]), [["gemini-3.8-flash", 300, 2]]);
});

Deno.test("recordUsage (revisão de 2026-11-14): as linhas de um mesmo pedido levam a mesma hora (a quota conta pedidos)", async () => {
  const rows: UsageRow[] = [];
  await recordUsage("coach-chat", UID, {
    input_tokens: 300, output_tokens: 0, calls: 2,
    by_model: { "gemini-3.8-flash": { input_tokens: 100, calls: 1 }, "gemini-3.6-flash": { input_tokens: 200, calls: 1 } },
  }, (r) => { rows.push(r); return Promise.resolve({ error: null }); });
  assertEquals(rows.length, 2);
  // deno-lint-ignore no-explicit-any
  const at = rows.map((r) => (r as any).created_at);
  assertEquals(typeof at[0], "string");
  assertEquals(at[0], at[1]);
});

// 2.ª auditoria de segurança (2026-11-14, M1): o consumo grava-se mesmo
// quando o pedido acaba em erro depois de chamar o Gemini.
const GEM = { usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 5 }, modelVersion: "gemini-x" };
const authReq = () => new Request("http://x", { headers: { Authorization: `Bearer ${jwt({ sub: UID })}` } });

Deno.test("withUsageRecording: erro depois do Gemini (resposta sem usage) grava o que se gastou", async () => {
  const rows: UsageRow[] = [];
  const insert = (row: UsageRow) => { rows.push(row); return Promise.resolve({ error: null }); };
  const handler = withUsageRecording("analyze-meal", async () => {
    await Promise.resolve();
    usageFromGemini(GEM);
    return new Response(JSON.stringify({ error: "formato inesperado" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }, insert);
  const res = await handler(authReq());
  assertEquals(res.status, 500);
  assertEquals(rows.length, 1);
  assertEquals([rows[0].user_id, rows[0].input_tokens, rows[0].output_tokens, rows[0].thoughts_tokens, rows[0].calls], [UID, 100, 20, 5, 1]);
});

Deno.test("withUsageRecording: o handler rebenta depois do Gemini — grava e deixa o erro seguir", async () => {
  const rows: UsageRow[] = [];
  const insert = (row: UsageRow) => { rows.push(row); return Promise.resolve({ error: null }); };
  const handler = withUsageRecording("analyze-diploma", async () => {
    usageFromGemini(GEM);
    await Promise.resolve();
    throw new Error("imagem em branco");
  }, insert);
  let thrown = false;
  try { await handler(authReq()); } catch { thrown = true; }
  assertEquals(thrown, true);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].function, "analyze-diploma");
});

Deno.test("withUsageRecording: a resposta com usage completo grava esse; pedidos paralelos não se misturam", async () => {
  const rows: UsageRow[] = [];
  const insert = (row: UsageRow) => { rows.push(row); return Promise.resolve({ error: null }); };
  const handler = withUsageRecording("f", async (req) => {
    const n = Number(new URL(req.url).searchParams.get("n"));
    for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 1)); usageFromGemini(GEM); }
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  }, insert);
  const h = (n: number) => handler(new Request(`http://x/?n=${n}`, { headers: { Authorization: `Bearer ${jwt({ sub: UID })}` } }));
  await Promise.all([h(1), h(3)]);
  assertEquals(rows.map((r) => r.calls).sort(), [1, 3]);
  // Nada fora de um pedido (cron, testes): usageFromGemini continua puro.
  assertEquals(usageFromGemini(GEM).calls, 1);
});

Deno.test("usageToRecord: o que a resposta diz, a menos que o pedido tenha gasto mais", () => {
  const sink = usageFromGemini(GEM);
  assertEquals(usageToRecord(null, sink), sink);
  assertEquals(usageToRecord({ input_tokens: 500, output_tokens: 1, calls: 2 }, sink), { input_tokens: 500, output_tokens: 1, calls: 2 });
  assertEquals(usageToRecord({ input_tokens: 1, calls: 1 }, sink), sink);
  assertEquals(usageToRecord(null, null), null);
});
