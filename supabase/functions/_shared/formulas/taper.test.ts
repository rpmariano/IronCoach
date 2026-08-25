import { assertEquals } from "jsr:@std/assert@1";
import { getTaperDays, getTaperWeeks } from "./taper.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./taper.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`taper — ${name}`, () => {
    const { distanceKm, racePriority, experienceLevel, raceType } = input;
    assertEquals(getTaperDays(distanceKm, racePriority, experienceLevel, raceType), expect.days);
    assertEquals(getTaperWeeks(distanceKm, racePriority, experienceLevel, raceType), expect.weeks);
  });
}
