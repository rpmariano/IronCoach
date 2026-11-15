import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import {
  formatRaceSeconds, isPlausibleRaceSeconds, likelyIntendedRaceSeconds, parseRaceDuration, raceBalanceFingerprint,
  suspectRaceTimeQuestion,
} from "./raceTime.ts";

// O caso de 2026-11-15: trail de 10,97 km, objetivo 56:40, previsão 53:26.
const CASO = { distanceKm: 10.97, targetSeconds: 3400, predictedSeconds: 3206 };

Deno.test("isPlausibleRaceSeconds: 2:40/km e metade do objetivo ou da previsão", () => {
  assertEquals(isPlausibleRaceSeconds(83, CASO), false); // «1:23» lido como mm:ss
  assertEquals(isPlausibleRaceSeconds(4980, CASO), true);
  assertEquals(isPlausibleRaceSeconds(1600, { distanceKm: 10 }), true); // 2:40/km certinho
  assertEquals(isPlausibleRaceSeconds(1599, { distanceKm: 10 }), false);
  assertEquals(isPlausibleRaceSeconds(1699, { targetSeconds: 3400 }), false); // menos de metade do objetivo
  assertEquals(isPlausibleRaceSeconds(1700, { targetSeconds: 3400 }), true);
  assertEquals(isPlausibleRaceSeconds(1700, { predictedSeconds: 3500 }), false); // menos de metade da previsão
  assertEquals(isPlausibleRaceSeconds(55 * 60, { distanceKm: 1 }), true); // um quilómetro vertical
  assertEquals(isPlausibleRaceSeconds(3 * 3600, { distanceKm: 1 }), false);
  assertEquals(isPlausibleRaceSeconds(83), true); // sem nada com que comparar não se julga
  assertEquals(isPlausibleRaceSeconds(0, CASO), false);
  assertEquals(isPlausibleRaceSeconds("x", CASO), false);
});

Deno.test("a pergunta de confirmação e o tempo que ele queria dizer", () => {
  assertEquals(likelyIntendedRaceSeconds(83, CASO), 4980);
  assertEquals(likelyIntendedRaceSeconds(4980, CASO), null);
  assertEquals(suspectRaceTimeQuestion(83, CASO), "1:23 parece minutos — querias dizer 1:23:00?");
  // 0:30 numa meia: nem como minutos nem como horas (30 h) é possível — pergunta sem palpite.
  assertEquals(suspectRaceTimeQuestion(30, { distanceKm: 21.1 }), "0:30 não bate certo com esta prova — confirmas o tempo?");
  assertEquals(formatRaceSeconds(4980), "1:23:00");
  assertEquals(formatRaceSeconds(83), "1:23");
});

Deno.test("parseRaceDuration: «a:b» é mm:ss, a não ser que só h:mm faça sentido", () => {
  assertEquals(parseRaceDuration("1:23", CASO), 4980);
  assertEquals(parseRaceDuration("52:30", { distanceKm: 10 }), 3150);
  assertEquals(parseRaceDuration("1:23", {}), 83); // sem contexto, a leitura de sempre
  assertEquals(parseRaceDuration("1:23:00", CASO), 4980);
  assertEquals(parseRaceDuration("47", { distanceKm: 10 }), 2820);
  assertEquals(parseRaceDuration("47m", { distanceKm: 10 }), 2820);
  assertEquals(parseRaceDuration("", CASO), null);
  assertEquals(parseRaceDuration("1h23", CASO), null);
});

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
