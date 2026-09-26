import { assertEquals } from "jsr:@std/assert@1";
import { focusRace, isPrincipalRace, nextPrincipalRace, nextRaceByDate, pickRaceOfDay, raceOfTheMoment, racePriorityOf, racesBeforeFocus, selectRaces, withPrincipal } from "./mainRace.ts";

/* A prova principal (2026-09-26, Fase 0 do Troféu): a próxima 'a' manda no
   objetivo; as provas de treino e as jornadas continuam a ser provas. */

const TODAY = "2026-10-01";
const r = (id: string, date: string, race_priority: string | null = "a", status = "agendada") => ({ id, date, race_priority, status });

Deno.test("racePriorityOf: sem prioridade conta como principal (o default da coluna)", () => {
  assertEquals(racePriorityOf({ race_priority: null }), "a");
  assertEquals(racePriorityOf({}), "a");
  assertEquals(racePriorityOf({ race_priority: "x" }), "a");
  assertEquals(racePriorityOf({ race_priority: "c" }), "c");
  assertEquals(isPrincipalRace({ race_priority: "b" }), false);
});

Deno.test("focusRace: a próxima principal passa à frente das provas de treino mais próximas", () => {
  const races = [r("j1", "2026-10-05", "c"), r("t1", "2026-10-12", "b"), r("m", "2026-11-15", "a")];
  assertEquals(nextRaceByDate(races, TODAY)?.id, "j1");
  assertEquals(nextPrincipalRace(races, TODAY)?.id, "m");
  assertEquals(focusRace(races, TODAY)?.id, "m");
  // Sem principal à frente, a próxima por data.
  assertEquals(focusRace([r("j1", "2026-10-05", "c"), r("t1", "2026-10-12", "b")], TODAY)?.id, "j1");
  // Passadas e concluídas não contam; hoje conta.
  assertEquals(focusRace([r("old", "2026-09-20"), r("done", "2026-10-01", "a", "concluida"), r("hoje", "2026-10-01", "b")], TODAY)?.id, "hoje");
  assertEquals(focusRace([], TODAY), null);
  assertEquals(focusRace(null, TODAY), null);
});

Deno.test("pickRaceOfDay: a principal do dia, e entre iguais pelo id", () => {
  assertEquals(pickRaceOfDay([r("z", TODAY, "c"), r("y", TODAY, "a"), r("x", "2026-10-02", "a")], TODAY)?.id, "y");
  assertEquals(pickRaceOfDay([r("b2", TODAY, "b"), r("b1", TODAY, "b")], TODAY)?.id, "b1");
  assertEquals(pickRaceOfDay([r("x", "2026-10-02")], TODAY), null);
});

Deno.test("withPrincipal: junta a principal que ficou fora do limite, sem repetir, por data", () => {
  const primeiras = [r("j1", "2026-10-05", "c"), r("j2", "2026-10-12", "c"), r("j3", "2026-10-19", "c")];
  const principal = r("m", "2026-12-06");
  assertEquals(withPrincipal(primeiras, principal).map((x) => x.id), ["j1", "j2", "j3", "m"]);
  assertEquals(withPrincipal([...primeiras, principal], principal).map((x) => x.id), ["j1", "j2", "j3", "m"]);
  assertEquals(withPrincipal(primeiras, null).map((x) => x.id), ["j1", "j2", "j3"]);
});

Deno.test("raceOfTheMoment: a prova de hoje ou de amanhã, principal ou não; fora disso, o objetivo", () => {
  const principal = r("m", "2026-11-15");
  assertEquals(raceOfTheMoment([r("t", "2026-10-02", "c"), principal], TODAY)?.id, "t");
  assertEquals(raceOfTheMoment([r("t", TODAY, "b"), principal], TODAY)?.id, "t");
  assertEquals(raceOfTheMoment([r("t", "2026-10-03", "c"), principal], TODAY)?.id, "m");
  assertEquals(raceOfTheMoment([r("t", "2026-10-03", "c")], TODAY)?.id, "t");
});

Deno.test("racesBeforeFocus: as provas de preparação que vêm antes da principal", () => {
  const races = [r("j1", "2026-10-05", "c"), r("t1", "2026-10-12", "b"), r("m", "2026-11-15"), r("depois", "2026-12-01", "c")];
  assertEquals(racesBeforeFocus(races, TODAY).map((x) => x.id), ["j1", "t1"]);
  assertEquals(racesBeforeFocus([r("m", "2026-11-15")], TODAY), []);
  // Sem principal, o objetivo é a mais próxima: nada antes dela.
  assertEquals(racesBeforeFocus([r("j1", "2026-10-05", "c"), r("t1", "2026-10-12", "b")], TODAY), []);
});

// Revisão da Fase 0 (2026-09-26): uma prova no MESMO dia do objetivo não é
// "preparação a caminho dele" — nem outra 'a', nem uma b/c.
Deno.test("racesBeforeFocus: as provas do próprio dia do objetivo não contam como antes dele", () => {
  const races = [r("t1", "2026-10-12", "b"), r("m1", "2026-11-15"), r("m2", "2026-11-15"), r("c1", "2026-11-15", "c")];
  assertEquals(racesBeforeFocus(races, TODAY).map((x) => x.id), ["t1"]);
});

/* selectRaces (2026-09-26, revisão da Fase 0): a seleção que o coach-chat e o
   coach-daily-summary fazem sobre as duas leituras de race_events — as N
   primeiras por data e a próxima principal à parte. */
Deno.test("selectRaces: a principal fora do limite de 3/5 entra e é o objetivo", () => {
  const first = [r("c1", "2026-10-03", "c"), r("c2", "2026-10-10", "c"), r("b1", "2026-10-17", "b")];
  const principal = r("m", "2026-12-06");
  const sel = selectRaces(first, principal, TODAY);
  assertEquals(sel.upcoming.map((x) => x.id), ["c1", "c2", "b1", "m"]);
  assertEquals(sel.focus?.id, "m");
  assertEquals(sel.nearest?.id, "c1");
  assertEquals(sel.before.map((x) => x.id), ["c1", "c2", "b1"]);
  // A 2 dias, c1 ainda não é "o momento": é o objetivo.
  assertEquals(sel.moment?.id, "m");
});

Deno.test("selectRaces: prova b amanhã com a principal a 60 dias — véspera e meteorologia da de amanhã", () => {
  const first = [r("b1", "2026-10-02", "b")];
  const principal = r("m", "2026-11-30");
  const sel = selectRaces(first, principal, TODAY);
  assertEquals(sel.focus?.id, "m");
  assertEquals(sel.nearest?.id, "b1");
  assertEquals(sel.moment?.id, "b1");
  assertEquals(sel.before.map((x) => x.id), ["b1"]);
});

Deno.test("selectRaces: sem principal, o objetivo é a mais próxima e não há nada antes dela", () => {
  const first = [r("c1", "2026-10-05", "c"), r("b1", "2026-10-12", "b")];
  const sel = selectRaces(first, null, TODAY);
  assertEquals(sel.upcoming.map((x) => x.id), ["c1", "b1"]);
  assertEquals(sel.focus?.id, "c1");
  assertEquals(sel.nearest?.id, "c1");
  assertEquals(sel.before, []);
});

Deno.test("selectRaces: a principal já presente nas primeiras não se repete; uma de hoje concluída não é a próxima", () => {
  const first = [r("hoje", TODAY, "b", "concluida"), r("m", "2026-10-20")];
  const sel = selectRaces(first, r("m", "2026-10-20"), TODAY);
  assertEquals(sel.upcoming.map((x) => x.id), ["hoje", "m"]);
  assertEquals(sel.nearest?.id, "m");
  assertEquals(sel.focus?.id, "m");
  assertEquals(sel.moment?.id, "m");
});
