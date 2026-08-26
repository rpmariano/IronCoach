import { assertEquals } from "jsr:@std/assert@1";
import { getRecoveryDaysAfterRace } from "./recovery.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./recovery.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`getRecoveryDaysAfterRace — ${name}`, () => {
    assertEquals(getRecoveryDaysAfterRace(input.distanceKm, input.experienceLevel), expect);
  });
}
