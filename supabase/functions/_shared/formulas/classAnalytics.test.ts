import { assertEquals } from "jsr:@std/assert@1";
import { computeClassAnalytics } from "./classAnalytics.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./classAnalytics.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeClassAnalytics — ${name}`, () => {
    const result = computeClassAnalytics(input.sessions, input.todayISO, input.range);
    assertEquals(result, expect);
  });
}
