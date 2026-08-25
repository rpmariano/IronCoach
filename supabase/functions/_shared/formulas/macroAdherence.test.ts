import { assertEquals } from "jsr:@std/assert@1";
import { computeMacroAdherence } from "./macroAdherence.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./macroAdherence.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeMacroAdherence — ${name}`, () => {
    const result = computeMacroAdherence(input.meals, input.profile, input.bodyAssessments, input.todayISO, input.range);
    assertEquals(result, expect);
  });
}
