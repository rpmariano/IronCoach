import { assertEquals } from "jsr:@std/assert@1";
import { computeCrossMetrics } from "./crossMetrics.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./crossMetrics.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeCrossMetrics — ${name}`, () => {
    const result = computeCrossMetrics(input.runs, input.gymSessions, input.bodyAssessments, input.todayISO, input.range);
    assertEquals(result, expect);
  });
}
