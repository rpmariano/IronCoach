import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  getTaperDays,
  getTaperWeeks,
  isSeriesIntent,
  SERIES_INTENTS,
  TAPER_DAYS_BY_SERIES_INTENT,
  taperCategoryFor,
} from "./taper.ts";
import { PRE_RACE_EASY_DAYS } from "./vocabulary.ts";

const golden = JSON.parse(await Deno.readTextFile(new URL("./taper.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`taper — ${name}`, () => {
    const { distanceKm, racePriority, experienceLevel, raceType } = input;
    assertEquals(getTaperDays(distanceKm, racePriority, experienceLevel, raceType), expect.days);
    assertEquals(getTaperWeeks(distanceKm, racePriority, experienceLevel, raceType), expect.weeks);
  });
}

// ── Jornadas: a afinação por intenção (specs/trofeu.md §5, Fase 2) ─────────
// Os casos de cima correm sem o 5.º argumento e ficam iguais aos de antes;
// os de baixo passam-no (golden próprio, para o de cima não mudar).

const seriesGolden = JSON.parse(await Deno.readTextFile(new URL("./taperSeriesIntent.golden.json", import.meta.url)));

for (const { name, input, expect } of seriesGolden) {
  Deno.test(`taper por intenção — ${name}`, () => {
    const { distanceKm, racePriority, experienceLevel, raceType, seriesIntent } = input;
    assertEquals(getTaperDays(distanceKm, racePriority, experienceLevel, raceType, seriesIntent), expect.days);
    assertEquals(getTaperWeeks(distanceKm, racePriority, experienceLevel, raceType, seriesIntent), expect.weeks);
  });
}

Deno.test("taper por intenção — sem intenção (ou com uma que não serve) é igual a hoje em todos os casos antigos", () => {
  for (const { input, expect } of golden) {
    const { distanceKm, racePriority, experienceLevel, raceType } = input;
    for (const none of [undefined, null, "", "xyz", "toString", "__proto__"]) {
      assertEquals(getTaperDays(distanceKm, racePriority, experienceLevel, raceType, none), expect.days);
      assertEquals(getTaperWeeks(distanceKm, racePriority, experienceLevel, raceType, none), expect.weeks);
    }
    // Numa principal a intenção nunca conta (uma jornada promovida leva o taper A).
    if (racePriority === "a") {
      for (const intent of SERIES_INTENTS) {
        assertEquals(getTaperDays(distanceKm, racePriority, experienceLevel, raceType, intent), expect.days);
      }
    }
  }
});

Deno.test("taper por intenção — dentro dos 2-4 dias B/C (#1) e nunca menos do que PRE_RACE_EASY_DAYS", () => {
  for (const intent of SERIES_INTENTS) {
    const days = getTaperDays(10, "b", "iniciante", "estrada", intent);
    assert(days >= PRE_RACE_EASY_DAYS && days <= 4, `${intent}: ${days}`);
    assertEquals(days, Math.max(PRE_RACE_EASY_DAYS, TAPER_DAYS_BY_SERIES_INTENT[intent]));
  }
  assertEquals(Object.keys(TAPER_DAYS_BY_SERIES_INTENT).sort(), [...SERIES_INTENTS].sort());
});

Deno.test("isSeriesIntent — só os quatro papéis, nada herdado do Object", () => {
  for (const intent of SERIES_INTENTS) assert(isSeriesIntent(intent));
  for (const v of ["toString", "constructor", "__proto__", "hasOwnProperty", "Atacar", "", null, undefined, 3, {}]) {
    assert(!isSeriesIntent(v), String(v));
  }
});

Deno.test("taperCategoryFor — exportada sem mudar: trail e ultra são ultra_trail; sem distância, 10k", () => {
  assertEquals(taperCategoryFor(15, "trail"), "ultra_trail");
  assertEquals(taperCategoryFor(80, "estrada"), "ultra_trail");
  assertEquals(taperCategoryFor(21.1, "estrada"), "meia");
  assertEquals(taperCategoryFor(null, null), "10k");
});
