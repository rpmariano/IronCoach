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
