import { assertEquals } from "jsr:@std/assert@1";
import { longRunGuide } from "./longRun.ts";

// Corrida 2.1 #4 (src/coach-knowledge/02-corrida-carga-progressao.md).

Deno.test("longRunGuide: a percentagem e o teto de cada nível", () => {
  assertEquals(longRunGuide({ experienceLevel: "iniciante" }).km, [10, 12]);
  assertEquals(longRunGuide({ experienceLevel: "basico" }).minutes, 120);
  assertEquals(longRunGuide({ experienceLevel: "medio" }).pct, [25, 30]);
  // Sem nível conhecido, o do iniciante (o mais conservador).
  assertEquals(longRunGuide({ experienceLevel: "desconhecido" }).km, [10, 12]);
});

Deno.test("longRunGuide: o avançado na maratona usa o teto de Pfitzinger", () => {
  assertEquals(longRunGuide({ experienceLevel: "avancado", distanceKm: 21.1 }).km, [30, 32]);
  const maratona = longRunGuide({ experienceLevel: "avancado", distanceKm: 42.195 });
  assertEquals(maratona.km, [35, 38]);
  assertEquals(maratona.minutes, 180);
});

Deno.test("longRunGuide: pelo volume do atleta, e por tempo em trail", () => {
  assertEquals(longRunGuide({ experienceLevel: "medio", weeklyVolumeKm: 40 }).byVolumeKm, 12);
  assertEquals(longRunGuide({ experienceLevel: "medio" }).byVolumeKm, null);
  assertEquals(longRunGuide({ experienceLevel: "medio", raceType: "trail" }).byTime, true);
});
