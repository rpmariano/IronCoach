import { assert, assertEquals } from "jsr:@std/assert@1";
import { CHAT_PRIMARY_MODEL, chatAttemptMs, createChatModelRouter } from "./index.ts";
import { GEMINI_BUSY_FALLBACK_MODEL, GEMINI_FALLBACK_MODEL, GEMINI_MODEL } from "../_shared/geminiModel.ts";

// Incidente de 30-10-2026, 09:50: o principal do chat (então o alias
// gemini-flash-latest) ficou pendurado 98 s; o 3.6 deu 400; a rede do esquema
// repetiu a ronda 0 — e essa repetição voltou ao principal pendurado até aos
// 125 s. Ninguém recebeu resposta.

Deno.test("chat: o principal é o modelo fixo, não o alias flash-latest", () => {
  assertEquals(CHAT_PRIMARY_MODEL, GEMINI_MODEL);
  assert((CHAT_PRIMARY_MODEL as string) !== GEMINI_FALLBACK_MODEL);
});

Deno.test("chat: depois de cair no recurso, as chamadas seguintes do pedido ficam no recurso — nunca voltam ao principal pendurado", async () => {
  const calls: string[] = [];
  const send = (model: string) => {
    calls.push(model);
    if (model === CHAT_PRIMARY_MODEL) return Promise.reject(new Error("Não consegui responder a tempo."));
    return Promise.resolve(new Response('{"error":{"code":400}}', { status: 400 }));
  };
  const router = createChatModelRouter();
  const deadline = Date.now() + 125000;
  assertEquals((await router.send(send, deadline)).status, 400);
  assertEquals(router.onFallback, true);
  // A repetição sem o esquema (round--) e as rondas seguintes: no mesmo modelo.
  assertEquals((await router.send(send, deadline)).status, 400);
  assertEquals((await router.send(send, deadline)).status, 400);
  assertEquals(calls, [CHAT_PRIMARY_MODEL, GEMINI_BUSY_FALLBACK_MODEL, GEMINI_BUSY_FALLBACK_MODEL, GEMINI_BUSY_FALLBACK_MODEL]);
});

Deno.test("chat: sem cair no recurso, todas as rondas no principal; o alias só num 404", async () => {
  const calls: string[] = [];
  const ok = (model: string) => { calls.push(model); return Promise.resolve(new Response("{}")); };
  const router = createChatModelRouter();
  await router.send(ok, Date.now() + 60000);
  await router.send(ok, Date.now() + 60000);
  assertEquals(calls, [CHAT_PRIMARY_MODEL, CHAT_PRIMARY_MODEL]);
  assertEquals(router.onFallback, false);

  const gone: string[] = [];
  const r404 = (model: string) => {
    gone.push(model);
    return Promise.resolve(new Response("", { status: model === CHAT_PRIMARY_MODEL ? 404 : 200 }));
  };
  const router2 = createChatModelRouter();
  assertEquals((await router2.send(r404, Date.now() + 60000)).status, 200);
  assertEquals(gone, [CHAT_PRIMARY_MODEL, GEMINI_FALLBACK_MODEL]);
  // Um 503 ou um 400 nunca vão para o alias.
  const busy: string[] = [];
  const r503 = (model: string) => { busy.push(model); return Promise.resolve(new Response("", { status: 503 })); };
  await createChatModelRouter().send(r503, Date.now() + 60000);
  assert(!busy.includes(GEMINI_FALLBACK_MODEL), busy.join());
});

Deno.test("chat: uma ronda que não é de plano não espera 100 s pelo principal", () => {
  assert(chatAttemptMs(false) <= 60000);
  assertEquals(chatAttemptMs(true), 100000);
});

Deno.test("chat: o alias só num 404 da 1.ª chamada — numa ronda seguinte, um 404 não leva as thoughtSignature para outro modelo (R1 de 8715a0b0)", async () => {
  const calls: string[] = [];
  let n = 0;
  const send = (model: string) => {
    calls.push(model);
    n++;
    return Promise.resolve(new Response("", { status: n === 1 ? 200 : 404 }));
  };
  const router = createChatModelRouter();
  assertEquals((await router.send(send, Date.now() + 60000)).status, 200);
  assertEquals((await router.send(send, Date.now() + 60000)).status, 404);
  assertEquals(calls, [CHAT_PRIMARY_MODEL, CHAT_PRIMARY_MODEL]);
});

Deno.test("legenda da prova: tem a rede do 404 (geminiWithFallback), já que o modelo do chat deixou de ser o alias (R2 de 8715a0b0)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const start = src.indexOf("async function generateRaceCaption(");
  const body = src.slice(start, src.indexOf("\n}", start));
  assert(body.includes("geminiWithFallback("), body.slice(0, 300));
  assert(!body.includes("withBusyFallback("), "sem a rede do 404");
});

// R3 de 8715a0b0: o 400 do 3.6 com o pedido real do Rui. A sonda passou com a
// config do chat; o histórico dele tem turnos «model» seguidos (as mensagens
// por iniciativa da Carol: …UMMUMMMU…). Junta-se cada sequência do mesmo papel
// num só turno — válido em qualquer modelo — e regista-se a forma do pedido.
import { describeRequestShape, normalizeChatContents } from "./index.ts";

Deno.test("normalizeChatContents: turnos seguidos do mesmo papel juntam-se num só; nada se perde", () => {
  const t = (role: string, text: string) => ({ role, parts: [{ text }] });
  const out = normalizeChatContents([t("user", "u1"), t("model", "m1"), t("model", "m2"), t("model", "m3"), t("user", "u2"), t("user", "u3")]);
  assertEquals(out.map((c) => c.role), ["user", "model", "user"]);
  assertEquals(out[1].parts, [{ text: "m1" }, { text: "m2" }, { text: "m3" }]);
  assertEquals(out[2].parts, [{ text: "u2" }, { text: "u3" }]);
  // A começar por «model»: uma abertura do atleta antes, para o 1.º turno ser dele.
  const m0 = normalizeChatContents([t("model", "olá"), t("user", "u")]);
  assertEquals(m0.map((c) => c.role), ["user", "model", "user"]);
  // Textos vazios não vão (uma parte vazia é um 400 genérico).
  assertEquals(normalizeChatContents([t("user", "a"), t("model", ""), t("user", "b")]).map((c) => c.role), ["user"]);
});

Deno.test("describeRequestShape: a forma do pedido, sem texto nenhum do atleta", () => {
  const contents = [
    { role: "user", parts: [{ text: "SEGREDO do atleta" }] },
    { role: "model", parts: [{ functionCall: { name: "x", args: {} }, thoughtSignature: "abc" }] },
    { role: "user", parts: [{ functionResponse: { name: "x", response: {} } }, { inline_data: { mime_type: "image/jpeg", data: "AAA" } }] },
  ];
  const s = describeRequestShape("gemini-3.6-flash", "SISTEMA", contents, [{ functionDeclarations: [] }]);
  assertEquals(s.model, "gemini-3.6-flash");
  assertEquals(s.contents, 3);
  assertEquals(s.roles, "UMU");
  assertEquals([s.thoughtSignatures, s.functionCalls, s.functionResponses, s.inlineData], [1, 1, 1, 1]);
  assertEquals(s.maxSameRoleRun, 1);
  assert(s.bytes.system > 0 && s.bytes.contents > 0 && s.bytes.tools > 0);
  assert(!JSON.stringify(s).includes("SEGREDO") && !JSON.stringify(s).includes("SISTEMA"));
});
