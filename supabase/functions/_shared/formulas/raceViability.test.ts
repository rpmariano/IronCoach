import { assertEquals } from "jsr:@std/assert@1";
import { computeRecentWeeklyVolume, assessRaceViability, knownWeeklyVolume, levelReferenceWeeklyKm } from "./raceViability.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./raceViability.golden.json", import.meta.url)));

for (const { fn, name, input, expect } of golden) {
  Deno.test(`${fn} — ${name}`, () => {
    if (fn === "recentWeeklyVolume") {
      assertEquals(computeRecentWeeklyVolume(input.runs, input.todayISO, input.weeks), expect);
    } else {
      assertEquals(assessRaceViability(input), expect);
    }
  });
}

// ── O volume que a app conhece e o de referência do nível (2026-09-24) ─────
Deno.test("knownWeeklyVolume: com corridas em só 2 das 4 semanas não há volume (o caso do Rui)", () => {
  const runs = [{ date: "2026-09-13", distance_km: 10.11 }, { date: "2026-09-21", distance_km: 7.01 }, { date: "2026-09-24", distance_km: 5.03 }];
  assertEquals(knownWeeklyVolume(runs, "2026-09-24"), null);
});

Deno.test("knownWeeklyVolume: com histórico é a média das 4 semanas", () => {
  const runs = [{ date: "2026-09-01", distance_km: 20 }, { date: "2026-09-08", distance_km: 20 }, { date: "2026-09-15", distance_km: 20 }, { date: "2026-09-22", distance_km: 20 }];
  assertEquals(knownWeeklyVolume(runs, "2026-09-24"), 20);
});

Deno.test("levelReferenceWeeklyKm: parte do limite inferior do nível; o mínimo da prova é o alvo", () => {
  assertEquals(levelReferenceWeeklyKm("medio", 10), { start: 40, range: [40, 60], target: 35, category: "10k" });
  assertEquals(levelReferenceWeeklyKm("medio", 21.0975), { start: 40, range: [40, 60], target: 45, category: "meia" });
  // O caso da revisão: um iniciante com uma maratona parte de 15, não de 35.
  assertEquals(levelReferenceWeeklyKm("iniciante", 42.195), { start: 15, range: [15, 25], target: 35, category: "maratona" });
  // Sem prova, só a partida.
  assertEquals(levelReferenceWeeklyKm("basico", null), { start: 25, range: [25, 40], target: null, category: null });
  assertEquals(levelReferenceWeeklyKm(null, 10), null);
});
