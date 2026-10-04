import { assertEquals } from "jsr:@std/assert@1";
import { computeCrossMetrics } from "./crossMetrics.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./crossMetrics.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeCrossMetrics — ${name}`, () => {
    const result = computeCrossMetrics(input.runs, input.gymSessions, input.bodyAssessments, input.todayISO, input.range);
    assertEquals(result, expect);
  });
}

// O6 (2026-10-04): o RPE só existe quando foi registado — nunca 5 por
// omissão nem 0 numa semana sem corridas.
Deno.test("computeCrossMetrics — O6: nenhuma semana tem RPE inventado (5 ou 0) sem RPE registado", () => {
  const r = computeCrossMetrics(
    [{ date: "2026-08-12", distance_km: 8, duration_seconds: 2400 }],
    [{ date: "2026-08-12", workout_session_sets: [{ reps: 10, weight: 50 }] }, { date: "2026-08-19", workout_session_sets: [{ reps: 10, weight: 50 }] }],
    [],
    "2026-08-25",
    "mes",
  );
  assertEquals(r.gymLoadVsRunRPE.map((p) => p.runRPE), [null, null]);
});
