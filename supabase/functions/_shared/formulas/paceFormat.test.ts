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

Deno.test("formatPaceMinKm — nunca «:60», em todo o intervalo de 2:00 a 12:00 ao décimo de segundo", () => {
  for (let t = 1200; t <= 7200; t++) {
    const out = formatPaceMinKm(t / 10);
    assertEquals(/^\d+:[0-5]\d$/.test(out), true, `${t / 10} → ${out}`);
  }
});
