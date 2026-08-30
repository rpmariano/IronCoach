import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { assessWeightLossRate } from "./weightLossRate.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./weightLossRate.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`assessWeightLossRate — ${name}`, () => {
    const result = assessWeightLossRate(input.weeklyRateKg, input.currentWeightKg, input.experienceLevel);
    if (expect === null) {
      assertEquals(result, null);
    } else {
      assertAlmostEquals(result!.lossPct, expect.lossPct, 1e-6);
      assertEquals(result!.maxPct, expect.maxPct);
      assertEquals(result!.isTooFast, expect.isTooFast);
    }
  });
}
