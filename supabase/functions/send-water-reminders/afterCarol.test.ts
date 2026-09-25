import { assertEquals } from "jsr:@std/assert@1";
import { CAROL_QUIET_MINUTES, carolQuietSince, usersQuietAfterCarol } from "./afterCarol.ts";

// P.10: nos 30 minutos a seguir a uma notificação da Carol, a água espera.

const NOW = Date.parse("2026-09-24T10:30:00Z");

Deno.test("afterCarol: só quem a Carol notificou nos últimos 30 minutos", () => {
  const quiet = usersQuietAfterCarol([
    { user_id: "a", sent_at: "2026-09-24T10:07:00Z" }, // há 23 min
    { user_id: "b", sent_at: "2026-09-24T09:59:00Z" }, // há 31 min
    { user_id: "c", sent_at: "2026-09-24T10:00:00Z" }, // há 30 min, em cima do limite
    { user_id: null, sent_at: "2026-09-24T10:20:00Z" },
    { user_id: "d", sent_at: null },
  ], NOW);
  assertEquals([...quiet].sort(), ["a", "c"]);
  assertEquals(usersQuietAfterCarol(null, NOW).size, 0);
});

Deno.test("afterCarol: o corte da consulta é o mesmo intervalo", () => {
  assertEquals(CAROL_QUIET_MINUTES, 30);
  assertEquals(carolQuietSince(NOW), "2026-09-24T10:00:00.000Z");
});
