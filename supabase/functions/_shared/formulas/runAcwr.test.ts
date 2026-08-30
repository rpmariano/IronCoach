import { assertEquals } from "jsr:@std/assert@1";
import { computeRunAcwr } from "./runAcwr.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./runAcwr.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeRunAcwr — ${name}`, () => {
    assertEquals(computeRunAcwr(input.runs, input.todayISO), expect);
  });
}
