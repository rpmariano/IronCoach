import { assertEquals } from "jsr:@std/assert@1";
import { computePhaseEvaluation } from "./racePhaseEvaluation.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./racePhaseEvaluation.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computePhaseEvaluation — ${name}`, () => {
    assertEquals(computePhaseEvaluation(input), expect);
  });
}
