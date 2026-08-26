import { assertEquals } from "jsr:@std/assert@1";
import { computeSessionVolumeKg } from "./sessionVolumeKg.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./sessionVolumeKg.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeSessionVolumeKg — ${name}`, () => {
    assertEquals(computeSessionVolumeKg(input.session), expect);
  });
}
