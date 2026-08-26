import { assertEquals } from "jsr:@std/assert@1";
import { computeRecentWeeklyVolume, assessRaceViability } from "./raceViability.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./raceViability.golden.json", import.meta.url)));

for (const { fn, name, input, expect } of golden) {
  Deno.test(`${fn} — ${name}`, () => {
    if (fn === "recentWeeklyVolume") {
      assertEquals(computeRecentWeeklyVolume(input.runs, input.todayISO, input.weeks), expect);
    } else {
      assertEquals(assessRaceViability(input), expect);
    }
  });
}
