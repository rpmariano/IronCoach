// Vetor dourado — mesmo padrão de raceViability.test.ts. A contrapartida
// Vite vive em src/utils/raceLevelTriage.spec.js, lendo o MESMO
// raceLevelTriage.golden.json (garantia barata de que Deno e Vite
// concordam, ver specs/formulas-centralizacao.md §3.6).
import { assertEquals } from "jsr:@std/assert@1";
import {
  bandTimeOnFeet,
  bandElevation,
  assessRaceLevelTriage,
  minLevel,
} from "./raceLevelTriage.ts";

const golden = JSON.parse(
  await Deno.readTextFile(new URL("./raceLevelTriage.golden.json", import.meta.url)),
);

for (const { fn, name, input, expect } of golden) {
  Deno.test(`${fn} — ${name}`, () => {
    if (fn === "bandTimeOnFeet") {
      assertEquals(bandTimeOnFeet(input.weeklySeconds, input.raceTimeSecondsPrevisto), expect);
    } else if (fn === "bandElevation") {
      assertEquals(bandElevation(input.weeklyElevationM, input.raceElevationM), expect);
    } else if (fn === "assessRaceLevelTriage") {
      assertEquals(assessRaceLevelTriage(input), expect);
    } else {
      throw new Error(`fn desconhecida no vetor dourado: ${fn}`);
    }
  });
}

Deno.test("minLevel devolve sempre o mais baixo dos dois, em qualquer ordem", () => {
  assertEquals(minLevel("avancado", "sub_iniciante"), "sub_iniciante");
  assertEquals(minLevel("sub_iniciante", "avancado"), "sub_iniciante");
  assertEquals(minLevel("medio", "basico"), "basico");
  assertEquals(minLevel("iniciante", "iniciante"), "iniciante");
});

// Limiar exato "menos de 3 semanas com dados" — a golden cobre 4 (avalia) e
// 1 (não avalia); falta o corte em si, 2 vs. 3.
Deno.test("assessRaceLevelTriage: exatamente 2 semanas com dados ainda não é avaliável", () => {
  const r = assessRaceLevelTriage({
    todayISO: "2026-08-27",
    raceTimeSecondsPrevisto: 4000,
    raceElevationM: 500,
    runs: [
      { date: "2026-08-25", duration_seconds: 5000, elevation_gain_m: 500 },
      { date: "2026-08-18", duration_seconds: 4800, elevation_gain_m: 480 },
    ],
  });
  assertEquals(r.weeksWithData, 2);
  assertEquals(r.level, null);
});

Deno.test("assessRaceLevelTriage: exatamente 3 semanas com dados já é avaliável", () => {
  const r = assessRaceLevelTriage({
    todayISO: "2026-08-27",
    raceTimeSecondsPrevisto: 4000,
    raceElevationM: 500,
    runs: [
      { date: "2026-08-25", duration_seconds: 5000, elevation_gain_m: 500 },
      { date: "2026-08-18", duration_seconds: 4800, elevation_gain_m: 480 },
      { date: "2026-08-11", duration_seconds: 4700, elevation_gain_m: 470 },
    ],
  });
  assertEquals(r.weeksWithData, 3);
  assertEquals(r.level !== null, true);
});
