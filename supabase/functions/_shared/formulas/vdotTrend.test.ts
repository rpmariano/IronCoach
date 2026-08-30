import { assertEquals } from "jsr:@std/assert@1";
import { computeVdotTrend } from "./vdotTrend.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./vdotTrend.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeVdotTrend — ${name}`, () => {
    const result = computeVdotTrend(input.runs);
    assertEquals(result, expect);
  });
}
