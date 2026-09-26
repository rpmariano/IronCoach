import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { fetchFrameRace, frameRaceSentence } from "./frameRace.ts";

/* A prova que enquadra as análises (2026-09-26, Fase 0 do Troféu): a próxima
   principal quando existe, senão a próxima. */

// Um cliente falso que devolve uma resposta por chamada, pela ordem, e regista os filtros.
function fakeSb(responses: Array<{ data?: unknown; error?: unknown }>) {
  const filters: string[][] = [];
  let i = 0;
  return {
    filters,
    from(_table: string) {
      const mine: string[] = [];
      filters.push(mine);
      const result = responses[i++] ?? { data: [] };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "order", "limit"]) {
        chain[m] = (...args: unknown[]) => {
          mine.push(`${m}:${args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(",")}`);
          return chain;
        };
      }
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: result.data ?? null, error: result.error ?? null });
      return chain;
    },
  };
}

const jornada = { id: "j1", name: "Jornada de Carcavelos", date: "2026-10-04", distance_km: 10, race_priority: "c" };
const maratona = { id: "m1", name: "Maratona de Lisboa", date: "2026-10-11", distance_km: 42.195, race_priority: "a" };

Deno.test("fetchFrameRace: a principal ganha à prova de treino mais próxima", async () => {
  const sb = fakeSb([{ data: [maratona] }, { data: [jornada, maratona] }]);
  assertEquals((await fetchFrameRace(sb, "u1", "2026-10-01"))?.id, "m1");
  // A primeira leitura é só das principais; as duas só das agendadas.
  assertEquals(sb.filters[0].includes("eq:race_priority,a"), true);
  assertEquals(sb.filters.every((f) => f.includes("eq:status,agendada")), true);
});

Deno.test("fetchFrameRace: sem principal, a próxima; sem nada (ou com erro), null", async () => {
  assertEquals((await fetchFrameRace(fakeSb([{ data: [] }, { data: [jornada] }]), "u1", "2026-10-01"))?.id, "j1");
  assertEquals(await fetchFrameRace(fakeSb([{ data: [] }, { data: [] }]), "u1", "2026-10-01"), null);
  assertEquals(await fetchFrameRace(fakeSb([{ error: { message: "boom" } }, { error: { message: "boom" } }]), "u1", "2026-10-01"), null);
});

Deno.test("frameRaceSentence: nome, data, distância e se é a principal", () => {
  assertEquals(frameRaceSentence(maratona), `A prova de referência é "Maratona de Lisboa" (2026-10-11, 42,2 km), a próxima prova principal.`);
  // Até duas casas: nada de "21,0975 km" no prompt.
  assertStringIncludes(frameRaceSentence({ ...maratona, distance_km: 21.0975 }), "(2026-10-11, 21,1 km)");
  assertStringIncludes(frameRaceSentence({ ...jornada, distance_km: 1.609 }), "(2026-10-04, 1,61 km)");
  assertStringIncludes(frameRaceSentence({ ...jornada, distance_km: "7,4" }), "(2026-10-04, 7,4 km)");
  assertEquals(frameRaceSentence(jornada), `A prova de referência é "Jornada de Carcavelos" (2026-10-04, 10 km).`);
  assertStringIncludes(frameRaceSentence({ ...jornada, name: null, distance_km: null }), `"a prova" (2026-10-04)`);
  assertEquals(frameRaceSentence(null), "");
});
