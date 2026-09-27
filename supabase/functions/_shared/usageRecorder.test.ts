import { assertEquals } from "jsr:@std/assert@1";
import { recordUsage, type UsageRow, usageRow, userIdFromAuth, withUsageRecording } from "./usageRecorder.ts";

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
