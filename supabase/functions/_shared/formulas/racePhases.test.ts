import { assertEquals } from "jsr:@std/assert@1";
import { computePhaseWindows, resolvePhaseState } from "./racePhases.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./racePhases.golden.json", import.meta.url)));

for (const { fn, name, input, expect } of golden) {
  Deno.test(`${fn} — ${name}`, () => {
    const result = fn === "computePhaseWindows"
      ? computePhaseWindows(input.totalWeeks, input.taperWeeks, input.planStartISO)
      : resolvePhaseState(input.trainingStatus, input.todayISO, input.startDateStr, input.endDateStr, input.effectiveStartISO);
    assertEquals(result, expect);
  });
}
