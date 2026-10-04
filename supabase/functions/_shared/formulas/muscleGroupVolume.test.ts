import { assertEquals } from "jsr:@std/assert@1";
import { computeMuscleGroupVolume, computeMuscleGroupVolumeDetailed } from "./muscleGroupVolume.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./muscleGroupVolume.golden.json", import.meta.url)));

for (const { name, input, expect, expectMultiGroupSessions } of golden) {
  Deno.test(`computeMuscleGroupVolume — ${name}`, () => {
    const result = computeMuscleGroupVolume(input.sessions, input.todayISO, input.range);
    assertEquals(result, expect);
    // G1: a variante detalhada diz quantas sessões com vários grupos ficaram de fora.
    const detailed = computeMuscleGroupVolumeDetailed(input.sessions, input.todayISO, input.range);
    assertEquals(detailed.groups, expect);
    assertEquals(detailed.multiGroupSessions, expectMultiGroupSessions);
  });
}
