import { assertAlmostEquals } from "jsr:@std/assert@1";
import { estimate1RM } from "./epley.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./epley.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`estimate1RM — ${name}`, () => {
    assertAlmostEquals(estimate1RM(input.weight, input.reps), expect, 1e-6);
  });
}
