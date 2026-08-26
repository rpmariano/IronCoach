// Contrapartida Deno de src/utils/acwr.spec.js — mesmo vetor dourado
// (acwr.golden.json), runtime diferente. Ver
// specs/formulas-centralizacao.md §3.6.
import { assertEquals, assertAlmostEquals } from "jsr:@std/assert@1";
import { computeAcwr, classifyAcwrZone, ACWR_DANGER, ACWR_SAFE_MAX, ACWR_UNDER_TRAINING } from "./acwr.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./acwr.golden.json", import.meta.url)));

for (const { input, expect } of golden) {
  Deno.test(`computeAcwr acuteKm=${input.acuteKm} chronicWeeklyKm=${input.chronicWeeklyKm} → ratio=${expect.ratio} zone=${expect.zone}`, () => {
    const { ratio, zone } = computeAcwr(input.acuteKm, input.chronicWeeklyKm);
    if (expect.ratio === null) {
      assertEquals(ratio, null);
    } else {
      assertAlmostEquals(ratio as number, expect.ratio, 1e-6);
    }
    assertEquals(zone, expect.zone);
  });
}

Deno.test("classifyAcwrZone respeita os intervalos semi-abertos da doutrina (P0-2)", () => {
  assertEquals(classifyAcwrZone(ACWR_UNDER_TRAINING), "safe"); // 0.80 é safe
  assertEquals(classifyAcwrZone(ACWR_UNDER_TRAINING - 0.01), "undertrained");
  assertEquals(classifyAcwrZone(ACWR_SAFE_MAX), "safe"); // 1.30 é safe
  assertEquals(classifyAcwrZone(ACWR_SAFE_MAX + 0.01), "caution");
  assertEquals(classifyAcwrZone(ACWR_DANGER), "caution"); // 1.50 é caution
  assertEquals(classifyAcwrZone(ACWR_DANGER + 0.01), "danger");
});
