import { assertEquals } from "jsr:@std/assert@1";
import { computeWeightTrend } from "./weightTrend.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./weightTrend.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeWeightTrend — ${name}`, () => {
    const result = computeWeightTrend(input.rawPoints);
    assertEquals(result, expect);
  });
}

// C1/C2 (2026-10-04): sem pesagens que cheguem, a fórmula não inventa um 0
// nem um "estavel" — taxa e tendência ficam null e os consumidores dizem o
// que falta. Invariante verificado sobre todos os casos do golden.
Deno.test("computeWeightTrend — sem dados suficientes, weeklyRate e trend são null (nunca 0)", () => {
  for (const { expect } of golden) {
    if (expect === null) continue;
    if (!expect.sufficient) {
      assertEquals(expect.weeklyRate, null);
      assertEquals(expect.trend, null);
    } else {
      assertEquals(expect.pointsInWindow >= 3 && expect.spanDays >= 10, true);
    }
  }
});
