import { assertEquals } from "jsr:@std/assert@1";
import { computeEnergyAvailabilityWindow } from "./energyAvailabilityWindow.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./energyAvailabilityWindow.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeEnergyAvailabilityWindow — ${name}`, () => {
    const result = computeEnergyAvailabilityWindow(
      input.meals,
      input.bodyAssessments,
      input.runs,
      input.gymSessions,
      input.todayISO,
      input.range,
    );
    assertEquals(result, expect);
  });
}
