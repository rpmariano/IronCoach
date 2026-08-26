import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { predictRaceTime, calculateVDOT, calculateEquivalentFlatKm } from "./racePrediction.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./racePrediction.golden.json", import.meta.url)));

for (const { name, input, expect } of golden.riegel) {
  Deno.test(`predictRaceTime — ${name}`, () => {
    const result = predictRaceTime(input.runs, input.targetDistanceKm, input.experienceLevel);
    assertAlmostEquals(result.predictedSeconds, expect.predictedSeconds, 1e-6);
    assertAlmostEquals(result.predictedPace, expect.predictedPace, 1e-6);
    assertEquals(result.confidence, expect.confidence);
    assertEquals(result.basedOn, expect.basedOn);
  });
}

for (const { name, input, expect } of golden.vdot) {
  Deno.test(`calculateVDOT — ${name}`, () => {
    assertEquals(calculateVDOT(input.distanceKm, input.timeSeconds), expect);
  });
}

for (const { name, input, expect } of golden.equivalentFlatKm) {
  Deno.test(`calculateEquivalentFlatKm — ${name}`, () => {
    assertEquals(calculateEquivalentFlatKm(input.distanceKm, input.elevationGainM, input.raceType), expect);
  });
}
