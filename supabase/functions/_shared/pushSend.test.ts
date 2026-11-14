import { assertEquals, assertInstanceOf, assertRejects } from "jsr:@std/assert@1";
import { isGonePushError, PushTimeoutError, sendToAllWithTimeout, withTimeout } from "./pushSend.ts";

// Um envio que nunca responde (o serviço de push pendurado).
const never = () => new Promise<never>(() => {});

Deno.test("withTimeout: devolve o resultado quando chega a tempo", async () => {
  assertEquals(await withTimeout(Promise.resolve("ok"), 50), "ok");
});

Deno.test("withTimeout: rejeita com PushTimeoutError quando não chega", async () => {
  await assertRejects(() => withTimeout(never(), 20), PushTimeoutError);
});

Deno.test("withTimeout: o erro do envio passa tal como veio", async () => {
  const err = Object.assign(new Error("Gone"), { statusCode: 410 });
  await assertRejects(() => withTimeout(Promise.reject(err), 50), Error, "Gone");
});

Deno.test("sendToAllWithTimeout: um envio pendurado ou falhado não impede os outros", async () => {
  const gone = Object.assign(new Error("Gone"), { statusCode: 410 });
  const sent: string[] = [];
  const t0 = Date.now();
  const results = await sendToAllWithTimeout(["lento", "ok-1", "morto", "lanca", "ok-2"], (sub) => {
    if (sub === "lento") return never();
    if (sub === "morto") return Promise.reject(gone);
    if (sub === "lanca") throw new Error("síncrono");
    sent.push(sub);
    return Promise.resolve();
  }, 30);
  // Em paralelo: o total é ~um prazo, não um por subscrição.
  assertEquals(Date.now() - t0 < 1000, true);
  assertEquals(sent, ["ok-1", "ok-2"]);
  assertEquals(results.map((r) => [r.sub, r.ok]), [
    ["lento", false], ["ok-1", true], ["morto", false], ["lanca", false], ["ok-2", true],
  ]);
  const failed = results.filter((r) => !r.ok) as { sub: string; error: unknown }[];
  assertInstanceOf(failed[0].error, PushTimeoutError);
  assertEquals(isGonePushError(failed[1].error), true);
  assertEquals(isGonePushError(failed[0].error), false);
  assertEquals(isGonePushError(failed[2].error), false);
});

Deno.test("isGonePushError: só 404 e 410", () => {
  assertEquals(isGonePushError({ statusCode: 404 }), true);
  assertEquals(isGonePushError({ statusCode: 410 }), true);
  assertEquals(isGonePushError({ statusCode: 429 }), false);
  assertEquals(isGonePushError(null), false);
});
