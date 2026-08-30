import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { computeBMR, computeTDEE } from "./tdee.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./tdee.golden.json", import.meta.url)));

for (const { name, input, expect } of golden.bmr) {
  Deno.test(`computeBMR — ${name}`, () => {
    assertAlmostEquals(computeBMR(input.weightKg, input.heightCm, input.age, input.isFemale), expect, 1e-6);
  });
}

for (const { name, input, expect } of golden.tdee) {
  Deno.test(`computeTDEE — ${name}`, () => {
    assertEquals(computeTDEE(input.bmr, input.weeklyVolumeKm, input.weightKg), expect);
  });
}
