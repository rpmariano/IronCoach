import { assertEquals } from "jsr:@std/assert@1";
import { computeWeightTrend } from "./weightTrend.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./weightTrend.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeWeightTrend — ${name}`, () => {
    const result = computeWeightTrend(input.rawPoints);
    assertEquals(result, expect);
  });
}
