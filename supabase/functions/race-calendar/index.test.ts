import { assertEquals } from "jsr:@std/assert@1";
import { handler, LINK_TTL_SECONDS, signRaceLink, verifyRaceLink } from "./index.ts";

const SECRET = "segredo-de-teste";
const ID = "0b7c3f5e-1a2b-4c3d-8e9f-001122334455";
const NOW = 1_790_000_000;

Deno.test("verifyRaceLink: a assinatura certa dentro do prazo passa", async () => {
  const exp = NOW + LINK_TTL_SECONDS;
  const sig = await signRaceLink(SECRET, ID, exp);
  assertEquals(await verifyRaceLink(SECRET, { id: ID, exp: String(exp), sig }, NOW), "ok");
});

Deno.test("verifyRaceLink: link fora do prazo é 'expired', não 'invalid'", async () => {
  const exp = NOW - 1;
  const sig = await signRaceLink(SECRET, ID, exp);
  assertEquals(await verifyRaceLink(SECRET, { id: ID, exp: String(exp), sig }, NOW), "expired");
});

Deno.test("verifyRaceLink: mudar a prova, o prazo ou a chave invalida a assinatura", async () => {
  const exp = NOW + 60;
  const sig = await signRaceLink(SECRET, ID, exp);
  const outraProva = "0b7c3f5e-1a2b-4c3d-8e9f-001122334456";
  assertEquals(await verifyRaceLink(SECRET, { id: outraProva, exp: String(exp), sig }, NOW), "invalid");
  assertEquals(await verifyRaceLink(SECRET, { id: ID, exp: String(exp + 3600), sig }, NOW), "invalid");
  assertEquals(await verifyRaceLink("outra-chave", { id: ID, exp: String(exp), sig }, NOW), "invalid");
});

Deno.test("verifyRaceLink: parâmetros em falta ou malformados", async () => {
  assertEquals(await verifyRaceLink(SECRET, { id: null, exp: "1", sig: "x" }, NOW), "invalid");
  assertEquals(await verifyRaceLink(SECRET, { id: "nao-e-uuid", exp: "1", sig: "x" }, NOW), "invalid");
  assertEquals(await verifyRaceLink(SECRET, { id: ID, exp: "abc", sig: "x" }, NOW), "invalid");
  assertEquals(await verifyRaceLink(SECRET, { id: ID, exp: "1", sig: null }, NOW), "invalid");
});

Deno.test("handler: GET sem assinatura é recusado antes de tocar na BD; POST sem sessão dá 401", async () => {
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SECRET);
  const get = await handler(new Request(`https://x.supabase.co/functions/v1/race-calendar?id=${ID}&exp=1&sig=00`));
  assertEquals(get.status, 403);
  await get.body?.cancel();
  const post = await handler(new Request("https://x.supabase.co/functions/v1/race-calendar", { method: "POST", body: "{}" }));
  assertEquals(post.status, 401);
  await post.body?.cancel();
  const put = await handler(new Request("https://x.supabase.co/functions/v1/race-calendar", { method: "PUT" }));
  assertEquals(put.status, 405);
  await put.body?.cancel();
});
