import { assertEquals } from "jsr:@std/assert@1";
import { computeTrainingDistribution } from "./trainingDistribution.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./trainingDistribution.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeTrainingDistribution — ${name}`, () => {
    const result = computeTrainingDistribution(input.runs, input.level);
    assertEquals(result, expect);
  });
}
