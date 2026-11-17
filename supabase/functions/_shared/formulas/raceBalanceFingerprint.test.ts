import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { raceBalanceFingerprint } from "./raceBalanceFingerprint.ts";

Deno.test("raceBalanceFingerprint: muda com o tempo, a distância, o objetivo e o tipo — e só com eles", () => {
  const base = { official_seconds: 4980, distance_km: 10.97, target_seconds: 3400, race_type: "trail", predicted_seconds: 3206, name: "X" };
  const fp = raceBalanceFingerprint(base);
  assertEquals(fp, "v1|4980|10.97|3400|trail");
  for (const change of [{ official_seconds: 83 }, { distance_km: 10 }, { target_seconds: 3300 }, { race_type: "estrada" }, { target_seconds: null }]) {
    assertNotEquals(raceBalanceFingerprint({ ...base, ...change }), fp, JSON.stringify(change));
  }
  assertEquals(raceBalanceFingerprint({ ...base, predicted_seconds: 3000, name: "Y" }), fp);
  assertEquals(raceBalanceFingerprint({ ...base, distance_km: "10.970" }), fp);
  assertEquals(raceBalanceFingerprint(null), null);
});
