import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { computeBestPace, timeToDistance, withProjectedSplits } from "./bestPace.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./bestPace.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeBestPace — ${name}`, () => {
    const result = computeBestPace(input.runs, input.targetKm);
    assertEquals(result, expect);
  });
}

Deno.test("timeToDistance: o acumulado até ao km D pelas voltas; o parcial curto conta pelos metros que tem", () => {
  const lap = (km: number, s: number) => ({ distance_km: km, time_seconds: s });
  assertEquals(timeToDistance([lap(1, 300), lap(1, 300), lap(0.3, 60)], 2), 600);
  assertEquals(timeToDistance([lap(1, 300), lap(0.3, 60)], 2), null);
  assertEquals(timeToDistance([lap(2, 600), lap(2, 500)], 3), 850);
  // Revisão de 2026-11-01: o «Rest» parado (0 km, com tempo) soma o tempo; uma
  // volta com distância e sem tempo deixa o acumulado por saber; uma sem nada ignora-se.
  assertEquals(timeToDistance([lap(1, 300), lap(0, 90), lap(1, 300), lap(1, 300)], 3), 990);
  assertEquals(timeToDistance([lap(1, 300), { distance_km: null, time_seconds: 60 }, lap(1, 300), lap(1, 300)], 3), 960);
  assertEquals(timeToDistance([lap(1, 300), { distance_km: 1, time_seconds: null }, lap(1, 300), lap(1, 300)], 3), null);
  assertEquals(timeToDistance([{ distance_km: null, time_seconds: null }, lap(0, 0), lap(1, 300), lap(1, 300), lap(1, 300)], 3), 900);
  assertEquals(timeToDistance(null, 5), null);
});

Deno.test("withProjectedSplits: a projeção splits:details->splits chega a details.splits", () => {
  const row = { date: "2026-10-25", distance_km: 10.12, duration_seconds: 2969, splits: [{ distance_km: 1, time_seconds: 267 }] };
  assertEquals(withProjectedSplits(row), { date: "2026-10-25", distance_km: 10.12, duration_seconds: 2969, details: { splits: [{ distance_km: 1, time_seconds: 267 }] } });
  assertEquals(withProjectedSplits({ date: "x", splits: null }).details, { splits: null });
});

Deno.test("as consultas do retrato e dos recordes projetam splits:details->splits e passam por withProjectedSplits", async () => {
  for (const f of ["../carolMemory.ts", "../../analyze-run/index.ts"]) {
    const src = await Deno.readTextFile(new URL(f, import.meta.url));
    assertStringIncludes(src, "splits:details->splits");
    assertStringIncludes(src, "withProjectedSplits(r)");
    assertEquals(src.includes("details:details->splits\""), false);
  }
});
