import { assertEquals } from "jsr:@std/assert@1";
import { computeGymVolumeLoad } from "./volumeLoad.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./volumeLoad.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeGymVolumeLoad — ${name}`, () => {
    const result = computeGymVolumeLoad(input.sessions, input.todayISO, input.range);
    assertEquals(result, expect);
  });
}
