import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { computeRaceEve, describeRaceEveShort, describeRaceDayShort, minutesOfDay, clock } from "./raceEve.ts";

Deno.test("computeRaceEve: partida às 09:00 e 70 kg — as horas e as gramas da véspera", () => {
  const eve = computeRaceEve({ startTime: "09:00:00", weightKg: 70, plannedFinishSeconds: 6720 });
  assertEquals(eve.schedule, {
    start: "09:00", wake: "06:00", bed: "22:00", screensOff: "21:00", dinnerBy: "19:30",
    breakfast: "06:15", waterFrom: "05:00", waterUntil: "08:15", arrival: "08:00", warmup: "08:35",
  });
  assertEquals(eve.dinnerCarbsG, { low: 140, high: 280 });
  assertEquals(eve.dinnerProteinG, { low: 21, high: 28 });
  assertEquals(eve.breakfastCarbsG, { low: 70, high: 140 });
  assertEquals(eve.preRaceWaterMl, { low: 350, high: 490 });
  assertEquals(eve.dayWaterL, { low: 2.1, high: 2.8 });
  assertEquals(eve.longRace, true);
  assertEquals(eve.carbLoading, { low: 700, high: 840 });
});

Deno.test("computeRaceEve: sem hora não há horário; sem peso não há gramas; prova curta sem carga", () => {
  const eve = computeRaceEve({ startTime: null, weightKg: "", plannedFinishSeconds: 2820 });
  assertEquals(eve.schedule, null);
  assertEquals(eve.dinnerCarbsG, null);
  assertEquals(eve.carbLoading, null);
  assertEquals(eve.longRace, false);
  assertEquals(computeRaceEve({ startTime: "25:00" }).schedule, null);
  assertEquals(minutesOfDay("07:30"), 450);
  assertEquals(clock(-30), "23:30");
});

Deno.test("as frases curtas do Início: véspera e dia, com e sem hora", () => {
  const eve = computeRaceEve({ startTime: "09:00", weightKg: 70 });
  assertEquals(
    describeRaceEveShort(eve, "Corrida do Tejo", 10),
    "Amanhã é Corrida do Tejo, 10 km, partida às 09:00: jantar até às 19:30 (140-280 g de hidratos), deitar às 22:00, acordar às 06:00, pequeno-almoço às 06:15, chegada às 08:00.",
  );
  assertStringIncludes(describeRaceEveShort(computeRaceEve({}), "Corrida do Tejo", null), "Sem hora de partida marcada");
  assertEquals(
    describeRaceDayShort(eve, "Corrida do Tejo", "4.42"),
    "Hoje é Corrida do Tejo, partida às 09:00: pequeno-almoço às 06:15, água até às 08:15, chegada às 08:00, aquecimento às 08:35. Primeiro km a 4.42.",
  );
  assertStringIncludes(describeRaceDayShort(computeRaceEve({}), "X", null), "2 h 45 antes da partida");
});
