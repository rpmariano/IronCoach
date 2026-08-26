import { assertEquals, assertAlmostEquals } from "jsr:@std/assert@1";
import {
  getRecommendedPrepWeeks,
  getEffectiveDistanceKm,
  resolveExperienceLevel,
  getRacePrediction,
} from "./racePlanning.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./racePlanning.golden.json", import.meta.url)));

for (const { fn, name, input, expect } of golden) {
  Deno.test(`${fn} — ${name}`, () => {
    switch (fn) {
      case "getRecommendedPrepWeeks":
        assertEquals(getRecommendedPrepWeeks(input.distanceKm, input.experienceLevel), expect);
        break;
      case "getEffectiveDistanceKm":
        assertEquals(getEffectiveDistanceKm(input.race), expect);
        break;
      case "resolveExperienceLevel":
        assertEquals(resolveExperienceLevel(input.race, input.profile), expect);
        break;
      case "getRacePrediction": {
        const result = getRacePrediction(input.race, input.profile, input.runs);
        assertAlmostEquals(result.predictedSeconds, expect.predictedSeconds, 1e-6);
        assertAlmostEquals(result.predictedPace, expect.predictedPace, 1e-6);
        assertAlmostEquals(result.predictedPaceReal, expect.predictedPaceReal, 1e-6);
        assertEquals(result.confidence, expect.confidence);
        assertEquals(result.basedOn, expect.basedOn);
        assertEquals(result.effectiveDistanceKm, expect.effectiveDistanceKm);
        assertEquals(result.realDistanceKm, expect.realDistanceKm);
        assertEquals(result.experienceLevel, expect.experienceLevel);
        break;
      }
    }
  });
}
