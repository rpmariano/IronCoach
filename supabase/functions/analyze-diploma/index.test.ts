import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { normalizeDiplomaReading, parseClockToSeconds, readingHasAnything, buildDiplomaPrompt } from "./index.ts";

/* Calibrado com o diploma real da Corrida do Tejo 2026 (lastlap): dois
   tempos no mesmo diploma, classificação geral e no escalão sem o nome do
   escalão, e a passagem aos 5 km. */

Deno.test("parseClockToSeconds: hh:mm:ss e mm:ss; lixo dá null", () => {
  assertEquals(parseClockToSeconds("00:51:27"), 3087);
  assertEquals(parseClockToSeconds("51:27"), 3087);
  assertEquals(parseClockToSeconds("1:53:42"), 6822);
  assertEquals(parseClockToSeconds("00:00:00"), null);
  assertEquals(parseClockToSeconds("51.27"), null);
  assertEquals(parseClockToSeconds("00:61:00"), null);
  assertEquals(parseClockToSeconds(3087), null);
});

Deno.test("normalizeDiplomaReading: o diploma da Corrida do Tejo", () => {
  const r = normalizeDiplomaReading({
    athlete_name: "RUI MARIANO",
    race_name: "Corrida do Tejo",
    race_date: "2026-09-13",
    chip_time: "00:51:27",
    gun_time: "00:51:51",
    position: 1668,
    age_group: null,
    age_group_position: 226,
    gender_position: null,
    participants: null,
    bib_number: null,
    splits: [{ km: 5, time: "00:25:15" }],
  });
  assertEquals(r.chip_time_seconds, 3087);
  assertEquals(r.gun_time_seconds, 3111);
  assertEquals(r.position, 1668);
  assertEquals(r.age_group_position, 226);
  assertEquals(r.age_group, null);
  assertEquals(r.gender_position, null);
  assertEquals(r.splits, [{ km: 5, seconds: 1515 }]);
  assertEquals(r.race_date, "2026-09-13");
  assertEquals(readingHasAnything(r), true);
});

Deno.test("normalizeDiplomaReading: aguenta números como texto, dorsal numérico, parciais tortos e datas inválidas", () => {
  const r = normalizeDiplomaReading({
    position: "1.668", age_group_position: "226.º", participants: "0", bib_number: 1234, race_date: "13/09/2026",
    splits: [{ km: "10", time: "00:51:27" }, { km: 5, time: "25:15" }, { km: 0, time: "1:00" }, { km: 3, time: "x" }],
  });
  assertEquals(r.position, 1668);
  assertEquals(r.age_group_position, 226);
  assertEquals(r.participants, null);
  assertEquals(r.bib_number, "1234");
  assertEquals(r.race_date, null);
  assertEquals(r.splits, [{ km: 5, seconds: 1515 }, { km: 10, seconds: 3087 }]);
  assertEquals(readingHasAnything(normalizeDiplomaReading({})), false);
});

Deno.test("buildDiplomaPrompt: distingue chip de bruto e não inventa", () => {
  const p = buildDiplomaPrompt();
  assertStringIncludes(p, "chip_time");
  assertStringIncludes(p, "gun_time");
  assertStringIncludes(p, "nunca inventes");
  assertStringIncludes(p, "Tempo km5");
});
