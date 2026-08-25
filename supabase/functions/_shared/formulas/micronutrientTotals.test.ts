import { assertEquals } from "jsr:@std/assert@1";
import { computeNutrientRangeTotals } from "./micronutrientTotals.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./micronutrientTotals.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeNutrientRangeTotals — ${name}`, () => {
    assertEquals(computeNutrientRangeTotals(input.meals, input.todayISO, input.range), expect);
  });
}
