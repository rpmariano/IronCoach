import { assertEquals } from "jsr:@std/assert@1";
import { formatPaceMinKm, formatPaceFromDistance } from "./paceFormat.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./paceFormat.golden.json", import.meta.url)));

for (const { fn, name, input, expect } of golden) {
  Deno.test(`${fn} — ${name}`, () => {
    const result = fn === "formatPaceMinKm"
      ? formatPaceMinKm(input.secondsPerKm)
      : formatPaceFromDistance(input.distanceKm, input.durationSeconds);
    assertEquals(result, expect);
  });
}
