import { assertEquals } from "jsr:@std/assert@1";
import { computeMaxHR, computeKarvonenZones, computePctMaxZones, resolveMaxHR, resolveHrZones, zoneOf } from "./heartRateZones.ts";

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

for (const { name, input, expect } of golden.resolveMaxHR) {
  Deno.test(`resolveMaxHR — ${name}`, () => {
    assertEquals(resolveMaxHR(input.age, input.observed), expect);
  });
}

// zoneOf usa as zonas Karvonen do vetor "karvonen" acima (maxHR 187, FC repouso 60).
for (const { name, input, expect } of golden.zoneOf) {
  Deno.test(`zoneOf — ${name}`, () => {
    assertEquals(zoneOf(input.bpm, golden.karvonen[0].expect), expect);
  });
}

for (const { name, input, expect } of golden.resolveHrZones) {
  Deno.test(`resolveHrZones — ${name}`, () => {
    assertEquals(resolveHrZones(input.maxHRBpm, input.restingHrBpm).method, expect.method);
  });
}
