import { assertEquals } from "jsr:@std/assert@1";
import { computeMuscleGroupVolume } from "./muscleGroupVolume.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./muscleGroupVolume.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeMuscleGroupVolume — ${name}`, () => {
    const result = computeMuscleGroupVolume(input.sessions, input.todayISO, input.range);
    assertEquals(result, expect);
  });
}
