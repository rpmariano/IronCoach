import { assertEquals } from "jsr:@std/assert@1";
import { computeCompositionTrend } from "./compositionTrend.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./compositionTrend.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeCompositionTrend — ${name}`, () => {
    assertEquals(computeCompositionTrend(input.bodyAssessments), expect);
  });
}
