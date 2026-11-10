import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { fetchLoadProfileRaces, loadProfileContextLine, loadProfileRevertReason } from "./loadProfileContext.ts";
import type { LoadVolumeState } from "./formulas/loadProfile.ts";

const BASE: LoadVolumeState = {
  state: "conflito", race: { id: "meia", name: "Meia dos Descobrimentos", date: "2026-11-29" }, profile: "prudente", chosen: false,
  acuteKm: 23.1, ratio: 1.31, safeLimitKm: 28.4, limits: { prudente: 28.4, mais_volume: 30.8 },
  currentWeeklyKm: 19.1, recommendedWeeklyKm: 35, projectedWeeklyKm: 21.2, loadAlert: true, volumeBelow: true, reverted: null,
};

Deno.test("loadProfileContextLine: conflito por escolher — as duas opções, a pergunta, e só grava quando ele disser", () => {
  const s = loadProfileContextLine(BASE, "2026-11-09");
  assertStringIncludes(s, "PERFIL DE CARGA para «Meia dos Descobrimentos» (29 nov): Prudente (por escolher — vale Prudente)");
  assertStringIncludes(s, "CONFLITO: a carga destes 7 dias (23,1 km, ACWR 1,31) já pede cautela");
  assertStringIncludes(s, "(19,1 km/semana; pede 35)");
  assertStringIncludes(s, "Prudente: a semana fica até 28,4 km e a prova é para completar; Mais volume: até 30,8 km");
  assertStringIncludes(s, "e pergunta qual prefere");
  assertStringIncludes(s, "só a gravas (update_race_event com load_profile) quando ele a disser");
});

Deno.test("loadProfileContextLine: perfil escolhido — nunca o contradizer; volta a Prudente dita uma vez", () => {
  const more = loadProfileContextLine({ ...BASE, state: "perfil", profile: "mais_volume", chosen: true, safeLimitKm: 30.8 }, "2026-11-09");
  assertStringIncludes(more, "Mais volume, escolhido pelo atleta — limite seguro destes 7 dias: 30,8 km");
  assertStringIncludes(more, "nunca a contradigas");
  assertStringIncludes(more, "até +15 km sobre a média das 3 anteriores");
  assertEquals(more.includes("CONFLITO"), false);
  const prud = loadProfileContextLine({ ...BASE, state: "perfil", chosen: true }, "2026-11-09");
  assertStringIncludes(prud, "nem que faz poucos km para a prova: com Prudente, a prova é para completar.");
  const rev = loadProfileContextLine({ ...BASE, state: "perfil", chosen: true, reverted: { at: "2026-11-08T07:00:00Z", reason: "dor" } }, "2026-11-09");
  assertStringIncludes(rev, "Voltou de Mais volume a Prudente sozinho em 8 nov (uma dor registada). Se ainda não lho disseste, diz-lho uma vez");
  // Passados 7 dias, já não.
  assertEquals(loadProfileContextLine({ ...BASE, state: "perfil", chosen: true, reverted: { at: "2026-10-30T07:00:00Z", reason: "dor" } }, "2026-11-09").includes("Voltou"), false);
  assertEquals(loadProfileContextLine({ ...BASE, race: null }, "2026-11-09"), "");
  assertStringIncludes(loadProfileRevertReason("Meia", "rpe_alto"), "[perfil] O perfil de carga de «Meia» voltou de Mais volume a Prudente sozinho: RPE 9 ou mais");
});

Deno.test("fetchLoadProfileRaces: sem a migration (coluna em falta) ou numa falha, [] — tudo Prudente", async () => {
  const sb = (result: unknown) => ({
    from: () => {
      // deno-lint-ignore no-explicit-any
      const c: any = { select: () => c, eq: () => c, gte: () => c, order: () => c, limit: () => Promise.resolve(result) };
      return c;
    },
  });
  assertEquals(await fetchLoadProfileRaces(sb({ data: null, error: { message: 'column race_events.load_profile does not exist' } }), "u1", "2026-11-09"), []);
  assertEquals(await fetchLoadProfileRaces(sb({ data: [{ id: "a", date: "2026-11-29", distance_km: 21 }], error: null }), "u1", "2026-11-09"), [{ id: "a", date: "2026-11-29", distance_km: 21 }]);
  assertEquals(await fetchLoadProfileRaces({ from: () => { throw new Error("rede"); } }, "u1", "2026-11-09"), []);
});
