import { assertEquals } from "jsr:@std/assert@1";
import { computeCalendarWeeklyVolume } from "./weeklyVolume.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./weeklyVolume.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeCalendarWeeklyVolume — ${name}`, () => {
    const result = computeCalendarWeeklyVolume(input.runs, input.todayISO);
    assertEquals(result, expect);
  });
}
