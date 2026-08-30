import { assertEquals } from "jsr:@std/assert@1";
import { classifyCalorieCompliance } from "./nutritionCompliance.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./nutritionCompliance.golden.json", import.meta.url)));

for (const { input, expect } of golden) {
  Deno.test(`classifyCalorieCompliance pct=${input} → ${expect}`, () => {
    assertEquals(classifyCalorieCompliance(input), expect);
  });
}
