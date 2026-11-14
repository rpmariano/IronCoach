import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  checkGeminiQuota, evaluateGeminiQuota, GEMINI_QUOTA_REQUESTS_PER_HOUR, GEMINI_QUOTA_TOKENS_PER_DAY, geminiQuotaBody, geminiQuotaNotice,
  quotaReplayCandidate,
} from "./geminiQuota.ts";

const NOW = Date.parse("2026-11-13T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;

Deno.test("evaluateGeminiQuota: abaixo dos limites passa", () => {
  const rows = Array.from({ length: 14 }, (_, i) => ({ created_at: ago(i * MIN), input_tokens: 20_000, output_tokens: 1_000 }));
  assertEquals(evaluateGeminiQuota(rows, NOW), { ok: true });
  assertEquals(evaluateGeminiQuota([], NOW), { ok: true });
});

Deno.test("evaluateGeminiQuota: 60 pedidos na última hora — 429 por hora, com quando voltar", () => {
  const rows = Array.from({ length: GEMINI_QUOTA_REQUESTS_PER_HOUR }, (_, i) => ({ created_at: ago(i * 30_000), input_tokens: 100 }));
  const r = evaluateGeminiQuota(rows, NOW);
  assertEquals(r.ok, false);
  if (r.ok) return;
  assertEquals(r.window, "hora");
  // O mais antigo é de há 29,5 min: volta a haver lugar daqui a 30,5 min.
  assertEquals(r.retryAfterSeconds, 1830);
  assertStringIncludes(geminiQuotaBody(r).error, "Tenta outra vez daqui a 31 minutos.");
  // O formato do 429 que o Frontend lê (96d76655): error + scope + retry_after_minutes.
  const body = geminiQuotaBody(r);
  assertEquals([body.scope, body.quota, body.retry_after_seconds, body.retry_after_minutes], ["hour", "hora", 1830, 31]);
  // Pedidos de há mais de uma hora não contam.
  assertEquals(evaluateGeminiQuota(rows.map((x) => ({ ...x, created_at: ago(61 * MIN) })), NOW), { ok: true });
});

Deno.test("evaluateGeminiQuota: 4 M tokens em 24 h — 429 por dia; o que tem mais de 24 h não conta", () => {
  const big = (ms: number) => ({ created_at: ago(ms), input_tokens: 1_000_000, output_tokens: 0, thoughts_tokens: 0 });
  const rows = [big(20 * 60 * MIN), big(10 * 60 * MIN), big(5 * 60 * MIN), big(60 * MIN)];
  const r = evaluateGeminiQuota(rows, NOW);
  assertEquals(r.ok === false && r.window, "dia");
  assertEquals(geminiQuotaBody(r as never).error, "Por hoje já chegámos ao limite do que consigo analisar. Amanhã continuo contigo.");
  assertEquals(geminiQuotaBody(r as never).scope, "day");
  // O de há 20 h sai da janela daqui a 4 h: aí fica abaixo do teto.
  assertEquals((r as { retryAfterSeconds: number }).retryAfterSeconds, 4 * 3600);
  assertEquals(evaluateGeminiQuota([big(25 * 60 * MIN), ...rows.slice(1)], NOW), { ok: true });
  assertEquals(GEMINI_QUOTA_TOKENS_PER_DAY, 4_000_000);
});

// deno-lint-ignore no-explicit-any
function fakeDb(opts: { admin?: boolean; rows?: any[]; error?: string }) {
  return {
    from: (t: string) => {
      // deno-lint-ignore no-explicit-any
      const c: any = { select: () => c, eq: () => c, gte: () => c, order: () => c };
      c.maybeSingle = () => Promise.resolve({ data: { is_admin: !!opts.admin }, error: null });
      c.limit = () => Promise.resolve(opts.error ? { data: null, error: { message: opts.error } } : { data: opts.rows ?? [], error: null });
      return t ? c : c;
    },
  };
}

Deno.test("checkGeminiQuota: o admin não tem limite; uma falha a ler deixa passar", async () => {
  const rows = Array.from({ length: 80 }, (_, i) => ({ created_at: ago(i * 10_000), input_tokens: 10 }));
  assertEquals((await checkGeminiQuota("u1", { db: fakeDb({ rows }), nowMs: NOW })).ok, false);
  assertEquals(await checkGeminiQuota("u1", { db: fakeDb({ rows, admin: true }), nowMs: NOW }), { ok: true });
  assertEquals(await checkGeminiQuota("u1", { db: fakeDb({ error: "rede" }), nowMs: NOW }), { ok: true });
  assertEquals(await checkGeminiQuota("u1", { db: { from: () => { throw new Error("x"); } }, nowMs: NOW }), { ok: true });
});

Deno.test("a quota está em todas as funções que chamam o Gemini a pedido do atleta", async () => {
  for (const f of ["coach-chat", "analyze-meal", "analyze-gym", "analyze-run", "analyze-body", "analyze-diploma", "enrich-race-event", "estimate-shoe-lifespan", "coach-daily-summary"]) {
    const src = await Deno.readTextFile(new URL(`../${f}/index.ts`, import.meta.url));
    assertStringIncludes(src, "jsonResponse(geminiQuotaBody(geminiQuota), 429)", f);
  }
  // Nas analyze-* (revisão de 4003c2f4): 429 antes de qualquer Gemini, menos um
  // candidato a reenvio — e, depois do replay, incondicional.
  for (const [f, idf] of [["analyze-meal", "meal_id"], ["analyze-gym", "session_id"], ["analyze-run", "run_id"], ["analyze-body", "assessment_id"]]) {
    const src = await Deno.readTextFile(new URL(`../${f}/index.ts`, import.meta.url));
    const early = src.indexOf(`if (!geminiQuota.ok && !quotaReplayCandidate(body, "${idf}")) return jsonResponse(geminiQuotaBody(geminiQuota), 429);`);
    const replayAt = src.indexOf("const alreadySaved = ");
    const late = src.indexOf("if (!geminiQuota.ok) return jsonResponse(geminiQuotaBody(geminiQuota), 429);", replayAt);
    assertEquals(early > 0 && early < replayAt && late > replayAt, true, f);
    // Nenhuma chamada ao Gemini antes do 429 de cima (os modos vêm depois dele).
    assertEquals(src.indexOf('body.mode === "preview"') > early, true, f);
  }
});

Deno.test("evaluateGeminiQuota (revisão de 2026-11-14): as linhas de um mesmo pedido (Flash de recurso) contam como um", () => {
  const at = (i: number) => ago(i * 30_000);
  // 59 pedidos, cada um com duas linhas (um por modelo, a mesma hora): ainda passa.
  const rows = Array.from({ length: GEMINI_QUOTA_REQUESTS_PER_HOUR - 1 }, (_, i) => [
    { created_at: at(i), function: "coach-chat", input_tokens: 10 },
    { created_at: at(i), function: "coach-chat", input_tokens: 10 },
  ]).flat();
  assertEquals(evaluateGeminiQuota(rows, NOW), { ok: true });
  // O 60.º pedido fecha.
  assertEquals(evaluateGeminiQuota([...rows, { created_at: ago(1), function: "analyze-meal", input_tokens: 10 }], NOW).ok, false);
});

Deno.test("quotaReplayCandidate (revisão de 4003c2f4): um id reutilizado com mode ou com o id de um registo não salta a quota", () => {
  const cid = "11111111-2222-4333-8444-555555555555";
  // Com a quota passada, estes levam 429 antes de qualquer Gemini.
  assertEquals(quotaReplayCandidate({ mode: "preview", client_request_id: cid }, "meal_id"), false);
  assertEquals(quotaReplayCandidate({ mode: "answer", meal_id: "m1", client_request_id: cid }, "meal_id"), false);
  assertEquals(quotaReplayCandidate({ mode: "pantry_food", client_request_id: cid }, "meal_id"), false);
  assertEquals(quotaReplayCandidate({ meal_id: "m1", client_request_id: cid }, "meal_id"), false);
  assertEquals(quotaReplayCandidate({ run_id: "r1", client_request_id: cid }, "run_id"), false);
  assertEquals(quotaReplayCandidate({ session_id: "s1", client_request_id: cid }, "session_id"), false);
  assertEquals(quotaReplayCandidate({ assessment_id: "a1", client_request_id: cid }, "assessment_id"), false);
  assertEquals(quotaReplayCandidate({}, "meal_id"), false);
  // Só um registo novo com client_request_id (com fotos, ou manual) segue até ao replay.
  assertEquals(quotaReplayCandidate({ client_request_id: cid }, "meal_id"), true);
  assertEquals(quotaReplayCandidate({ mode: "manual", client_request_id: cid }, "run_id"), true);
});

Deno.test("geminiQuotaNotice: o aviso do resumo do dia com a quota passada (200 com o resumo de hoje)", () => {
  const r = evaluateGeminiQuota(Array.from({ length: GEMINI_QUOTA_REQUESTS_PER_HOUR }, (_, i) => ({ created_at: ago(i * 30_000), input_tokens: 1 })), NOW);
  assertEquals(geminiQuotaNotice(r as never), {
    quota: "hour", quota_message: "Fizeste muitos pedidos seguidos e preciso de uma pausa. Tenta outra vez daqui a 31 minutos.", retry_after_minutes: 31,
  });
});
