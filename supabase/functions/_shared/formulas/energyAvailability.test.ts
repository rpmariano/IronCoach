import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { computeEnergyAvailability } from "./energyAvailability.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./energyAvailability.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computeEnergyAvailability — ${name}`, () => {
    const result = computeEnergyAvailability(input.intake, input.exercise, input.leanMass);
    if (expect === null) {
      assertEquals(result, null);
    } else {
      assertAlmostEquals(result!.ea, expect.ea, 1e-6);
      assertEquals(result!.status, expect.status);
    }
  });
}
