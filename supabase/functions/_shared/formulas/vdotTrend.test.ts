import { assertEquals } from "jsr:@std/assert@1";
import { computeVdotTrend } from "./vdotTrend.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./vdotTrend.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeVdotTrend — ${name}`, () => {
    const result = computeVdotTrend(input.runs);
    assertEquals(result, expect);
  });
}

import { isTerrainPacedRun } from "./vdotTrend.ts";
import { withProjectedSplits } from "./bestPace.ts";

// 2026-11-01: o «VDOT 28,0» do Rui — o trail de 1-11 entrava pelo RPE 9.
Deno.test("isTerrainPacedRun: trail, técnico, subidas, prova de trail ou ≥ 25 m D+/km; o resto conta", () => {
  const r = (over: Record<string, unknown>) => ({ date: "2026-11-01", distance_km: 10, duration_seconds: 3000, ...over });
  assertEquals(isTerrainPacedRun(r({ training_type: "trail" })), true);
  assertEquals(isTerrainPacedRun(r({ training_type: "tecnico" })), true);
  assertEquals(isTerrainPacedRun(r({ training_type: "subidas" })), true);
  assertEquals(isTerrainPacedRun(r({ kind: "competicao", details: { race_type: "trail" } })), true);
  assertEquals(isTerrainPacedRun(r({ details: { elevation_gain_m: 250 } })), true); // 25 m/km: ondulado
  assertEquals(isTerrainPacedRun(r({ details: { elevation_gain_m: "499", race_type: null } })), true); // D+ como texto
  assertEquals(isTerrainPacedRun(r({ details: { elevation_gain_m: 249 } })), false); // rolante
  assertEquals(isTerrainPacedRun(r({ training_type: "intervalos", details: null })), false);
  assertEquals(isTerrainPacedRun(r({ details: { elevation_gain_m: "" } })), false); // sem D+: decide o tipo
});

Deno.test("o retrato da Carol projeta o D+ e a disciplina, e withProjectedSplits devolve-os em details", async () => {
  const row = { date: "2026-11-01", distance_km: 15.92, splits: null, elevation_gain_m: 499, race_type: null };
  assertEquals(withProjectedSplits(row).details, { splits: null, elevation_gain_m: 499, race_type: null });
  assertEquals(withProjectedSplits({ date: "x", splits: [] }).details, { splits: [] });
  const src = await Deno.readTextFile(new URL("../carolMemory.ts", import.meta.url));
  assertEquals(src.includes("elevation_gain_m:details->elevation_gain_m, race_type:details->>race_type"), true);
});
