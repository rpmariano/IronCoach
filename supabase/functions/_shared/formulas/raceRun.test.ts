import { assertEquals } from "jsr:@std/assert@1";
import { oldestRun, pickRaceRun } from "./raceRun.ts";

/* A corrida de uma prova: a mesma em qualquer ordem da lista (2026-09-29).
   Antes ganhava a primeira, e a ordem não é fixa — a chave do balanço
   (`race_after:<prova>:<corrida>`) trocava entre recargas e dispositivos. */

const DAY = "2026-09-13";
const race = (over: Record<string, unknown> = {}) => ({ id: "r1", status: "concluida", date: DAY, ...over });
const rev = <T>(list: T[]) => [...list].reverse();

Deno.test("pickRaceRun: duas ligadas à prova — a mais antiga, em qualquer ordem", () => {
  const a = { id: "b-id", race_id: "r1", created_at: "2026-09-13T10:00:00+00:00" };
  const b = { id: "a-id", race_id: "r1", created_at: "2026-09-13T11:00:00+00:00" };
  assertEquals(pickRaceRun([a, b], race())?.id, "b-id");
  assertEquals(pickRaceRun([b, a], race())?.id, "b-id");
});

Deno.test("pickRaceRun: a mesma hora de criação desempata pelo id", () => {
  const at = "2026-09-13T10:00:00+00:00";
  const list = [{ id: "z", race_id: "r1", created_at: at }, { id: "m", race_id: "r1", created_at: at }];
  assertEquals(pickRaceRun(list, race())?.id, "m");
  assertEquals(pickRaceRun(rev(list), race())?.id, "m");
});

Deno.test("pickRaceRun: sem created_at fica para o fim", () => {
  const list = [{ id: "a", race_id: "r1" }, { id: "b", race_id: "r1", created_at: "2026-09-13T12:00:00+00:00" }];
  assertEquals(pickRaceRun(list, race())?.id, "b");
  assertEquals(pickRaceRun(rev(list), race())?.id, "b");
});

Deno.test("pickRaceRun: a ligada manda sobre a competição por data, mesmo mais antiga", () => {
  const porData = { id: "velha", kind: "competicao", date: DAY, created_at: "2026-09-13T08:00:00+00:00" };
  const ligada = { id: "ligada", race_id: "r1", kind: "competicao", date: DAY, created_at: "2026-09-13T12:00:00+00:00" };
  assertEquals(pickRaceRun([porData, ligada], race())?.id, "ligada");
});

Deno.test("pickRaceRun: por data só numa prova concluída; com duas, a mais antiga", () => {
  const x = { id: "x", kind: "competicao", date: DAY, created_at: "2026-09-13T12:00:00+00:00" };
  const y = { id: "y", kind: "competicao", date: DAY, created_at: "2026-09-13T09:00:00+00:00" };
  assertEquals(pickRaceRun([x, y], race())?.id, "y");
  assertEquals(pickRaceRun([y, x], race())?.id, "y");
  assertEquals(pickRaceRun([x, y], race({ status: "agendada" })), null);
  // Um treino no mesmo dia não é a prova.
  assertEquals(pickRaceRun([{ id: "t", kind: "treino", date: DAY }], race()), null);
});

Deno.test("pickRaceRun: sem prova ou sem corridas, null", () => {
  assertEquals(pickRaceRun([{ id: "a", race_id: "r1" }], null), null);
  assertEquals(pickRaceRun(null, race()), null);
});

Deno.test("oldestRun: lista vazia dá null", () => {
  assertEquals(oldestRun([]), null);
});
