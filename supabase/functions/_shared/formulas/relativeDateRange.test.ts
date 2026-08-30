import { assertEquals } from "jsr:@std/assert@1";
import { relativeRangeCutoffISO } from "./relativeDateRange.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./relativeDateRange.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`relativeRangeCutoffISO — ${name}`, () => {
    assertEquals(relativeRangeCutoffISO(input.todayISO, input.range), expect);
  });
}
