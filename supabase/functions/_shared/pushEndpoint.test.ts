import { assertEquals } from "jsr:@std/assert@1";
import {
  isAllowedPushEndpoint,
  isValidPushKey,
  MAX_PUSH_SUBSCRIPTIONS_PER_USER,
  pushSubscriptionsToPrune,
} from "./pushEndpoint.ts";

Deno.test("isAllowedPushEndpoint: aceita os serviços de push dos browsers", () => {
  for (const ok of [
    "https://fcm.googleapis.com/fcm/send/abc:APA91b-xyz",
    "https://web.push.apple.com/QGx1c2VyLXRva2Vu",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAAA",
    "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA%3d",
    "https://FCM.googleapis.com/fcm/send/abc",
  ]) assertEquals(isAllowedPushEndpoint(ok), true, ok);
});

Deno.test("isAllowedPushEndpoint: recusa o resto (http, outros hosts, truques no URL)", () => {
  for (const bad of [
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://evil.example.com/fcm/send/abc",
    "https://fcm.googleapis.com.evil.com/x",
    "https://evilfcm.googleapis.com/x",
    "https://push.apple.com/x", // só subdomínios
    "https://notify.windows.com/x",
    "https://evilpush.apple.com/x",
    "https://fcm.googleapis.com@evil.com/x",
    "https://fcm.googleapis.com:8443/x",
    "https://fcm.googleapis.com:443/x",
    "https://fcm.googleapis.com", // sem caminho
    "https://fcm.googleapis.com\\@evil.com/x",
    "https://fcm.googleapis.com/x y",
    "https://169.254.169.254/latest",
    "https://fcm.googleapis.com/" + "a".repeat(3000),
    "",
    null,
    42,
  ]) assertEquals(isAllowedPushEndpoint(bad), false, String(bad).slice(0, 60));
});

Deno.test("isValidPushKey: texto não vazio e curto", () => {
  assertEquals(isValidPushKey("BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U"), true);
  assertEquals(isValidPushKey(""), false);
  assertEquals(isValidPushKey("a".repeat(300)), false);
  assertEquals(isValidPushKey(undefined), false);
});

const row = (n: number, endpoint = `https://fcm.googleapis.com/${n}`) => ({
  id: `id-${n}`,
  endpoint,
  created_at: new Date(Date.UTC(2026, 10, 1, n)).toISOString(),
});

Deno.test("pushSubscriptionsToPrune: até ao máximo não apaga nada", () => {
  const rows = Array.from({ length: MAX_PUSH_SUBSCRIPTIONS_PER_USER }, (_, i) => row(i));
  assertEquals(pushSubscriptionsToPrune(rows, rows[0].endpoint), []);
});

Deno.test("pushSubscriptionsToPrune: acima do máximo apaga as mais antigas, nunca a nova", () => {
  // 12 linhas; a "nova" é a de índice 0 (a mais antiga por data, de propósito).
  const rows = Array.from({ length: 12 }, (_, i) => row(i)).reverse();
  const pruned = pushSubscriptionsToPrune(rows, "https://fcm.googleapis.com/0");
  assertEquals(pruned.sort(), ["id-1", "id-2"]);
  assertEquals(rows.length - pruned.length, MAX_PUSH_SUBSCRIPTIONS_PER_USER);
});

Deno.test("pushSubscriptionsToPrune: sem data conta como a mais antiga", () => {
  const rows = [...Array.from({ length: 3 }, (_, i) => row(i)), { id: "sem-data", endpoint: "x", created_at: null }];
  assertEquals(pushSubscriptionsToPrune(rows, "https://fcm.googleapis.com/2", 3), ["sem-data"]);
});
