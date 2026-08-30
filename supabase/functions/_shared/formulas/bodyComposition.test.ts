import { assertEquals } from "jsr:@std/assert@1";
import { classifyVisceralFat } from "./bodyComposition.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./bodyComposition.golden.json", import.meta.url)));

for (const { input, expect } of golden) {
  Deno.test(`classifyVisceralFat vf=${input.vf} → ${expect}`, () => {
    assertEquals(classifyVisceralFat(input.vf), expect);
  });
}
