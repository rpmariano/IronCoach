import { assertEquals } from "jsr:@std/assert@1";
import { computeBestPace } from "./bestPace.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./bestPace.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeBestPace — ${name}`, () => {
    const result = computeBestPace(input.runs, input.targetKm);
    assertEquals(result, expect);
  });
}
