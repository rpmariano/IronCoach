import { assertEquals } from "jsr:@std/assert@1";
import { computeReadinessIndex } from "./readinessIndex.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./readinessIndex.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeReadinessIndex — ${name}`, () => {
    const result = computeReadinessIndex(
      input.runs,
      input.meals,
      input.bodyAssessments,
      input.gymSessions,
      input.profile,
      input.todayISO,
      input.nextRace,
    );
    assertEquals(result, expect);
  });
}
