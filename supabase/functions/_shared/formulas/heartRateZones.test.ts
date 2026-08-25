import { assertEquals } from "jsr:@std/assert@1";
import { computeMaxHR, computeKarvonenZones, computePctMaxZones } from "./heartRateZones.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./heartRateZones.golden.json", import.meta.url)));

for (const { name, input, expect } of golden.maxHR) {
  Deno.test(`computeMaxHR — ${name}`, () => {
    assertEquals(computeMaxHR(input.age), expect);
  });
}

for (const { name, input, expect } of golden.karvonen) {
  Deno.test(`computeKarvonenZones — ${name}`, () => {
    assertEquals(computeKarvonenZones(input.maxHR, input.restingHR), expect);
  });
}

for (const { name, input, expect } of golden.pctMax) {
  Deno.test(`computePctMaxZones — ${name}`, () => {
    assertEquals(computePctMaxZones(input.maxHR), expect);
  });
}
