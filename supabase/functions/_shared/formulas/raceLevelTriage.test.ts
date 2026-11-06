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

// Bug #113 (2026-11-06): «Porque a Carol sugere a nível avançado?» — o 10 km
// de estrada de 08-11 media-se pelo tempo em pé (doutrina de trail).
import { bandWeeklyKm } from "./raceLevelTriage.ts";

const RUI = [ // as corridas do Rui de 16-10 a 01-11 (BD, 2026-11-06)
  { date: "2026-10-16", distance_km: 6.04, duration_seconds: 2206, elevation_gain_m: 25 },
  { date: "2026-10-20", distance_km: 5.02, duration_seconds: 1837, elevation_gain_m: null },
  { date: "2026-10-23", distance_km: 4.08, duration_seconds: 1591, elevation_gain_m: 33 },
  { date: "2026-10-25", distance_km: 10.12, duration_seconds: 2969, elevation_gain_m: 14 },
  { date: "2026-10-28", distance_km: 5.12, duration_seconds: 1660, elevation_gain_m: 44 },
  { date: "2026-10-30", distance_km: 6.08, duration_seconds: 2013, elevation_gain_m: 64 },
  { date: "2026-11-01", distance_km: 15.92, duration_seconds: 6664, elevation_gain_m: 499 },
];

Deno.test("bug #113: um 10 km de estrada mede-se pelos km (MIN_VOLUME_KM), não pelo tempo em pé", () => {
  const base = { runs: RUI, todayISO: "2026-11-06", raceTimeSecondsPrevisto: 2931, raceElevationM: 0 };
  // Antes (sem a disciplina): 1h51 na 2.ª semana mais alta / 49 min previstos = 227% → Avançado.
  const antes = assessRaceLevelTriage(base);
  assertEquals([antes.level, antes.axis], ["avancado", "tempo"]);
  // Estrada: 15,9 km na 2.ª semana mais alta — nos 10 km, Iniciante vai de 15 a 25 km.
  const estrada = assessRaceLevelTriage({ ...base, raceType: "estrada", raceDistanceKm: 10 });
  assertEquals([estrada.level, estrada.axis, estrada.peakWeeklyKm], ["iniciante", "km", 15.9]);
  // Trail: continua pelo tempo em pé e pelo D+.
  const trail = assessRaceLevelTriage({ ...base, raceType: "trail", raceDistanceKm: 21.0975, raceElevationM: 866, raceTimeSecondsPrevisto: 9585 });
  assertEquals(trail.axis, "tempo");
});

Deno.test("bandWeeklyKm: os pisos de MIN_VOLUME_KM por distância; abaixo do de Iniciante fica Iniciante", () => {
  assertEquals([bandWeeklyKm(10, 10), bandWeeklyKm(25, 10), bandWeeklyKm(35, 10), bandWeeklyKm(45, 10)], ["iniciante", "basico", "medio", "avancado"]);
  assertEquals([bandWeeklyKm(34.9, 21.0975), bandWeeklyKm(35, 21.0975), bandWeeklyKm(60, 21.0975)], ["iniciante", "basico", "avancado"]);
  assertEquals([bandWeeklyKm(null, 10), bandWeeklyKm(20, null)], [null, null]);
});
