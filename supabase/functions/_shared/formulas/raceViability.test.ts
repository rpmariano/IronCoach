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

Deno.test("levelReferenceWeeklyKm: o mínimo da doutrina para o nível e a distância da prova", () => {
  assertEquals(levelReferenceWeeklyKm("medio", 10), { km: 35, category: "10k" });
  assertEquals(levelReferenceWeeklyKm("medio", 21.0975), { km: 45, category: "meia" });
  // Sem prova, a referência de 10 km.
  assertEquals(levelReferenceWeeklyKm("iniciante", null), { km: 15, category: "10k" });
  assertEquals(levelReferenceWeeklyKm(null, 10), null);
});
