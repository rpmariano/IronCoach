import { assertEquals } from "jsr:@std/assert@1";
import { computeItemNutrients, computeMealNutrients } from "./mealNutrients.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./mealNutrients.golden.json", import.meta.url)));

for (const { name, fn, input, expect } of golden) {
  Deno.test(`mealNutrients — ${name}`, () => {
    const result = fn === "item" ? computeItemNutrients(input.item) : computeMealNutrients(input.meal);
    assertEquals(result, expect);
  });
}
