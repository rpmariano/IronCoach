import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { weightFactor, wearStatus } from "./shoes.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./shoes.golden.json", import.meta.url)));

for (const { name, input, expect } of golden.weightFactor) {
  Deno.test(`weightFactor — ${name}`, () => {
    assertAlmostEquals(weightFactor(input), expect, 1e-6);
  });
}

for (const { name, input, expect } of golden.wearStatus) {
  Deno.test(`wearStatus — ${name}`, () => {
    assertEquals(wearStatus(input.shoe, input.runs, input.weightKg), expect);
  });
}
