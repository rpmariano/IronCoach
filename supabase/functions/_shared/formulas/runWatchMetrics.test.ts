import { assertEquals } from "jsr:@std/assert@1";
import { computeRunWatchMetrics } from "./runWatchMetrics.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./runWatchMetrics.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeRunWatchMetrics — ${name}`, () => {
    const result = computeRunWatchMetrics(input.runs);
    assertEquals(result, expect);
  });
}
