import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { computeRaceEve, describeRaceEveShort, describeRaceDayShort, minutesOfDay, clock, noiteDoHorario } from "./raceEve.ts";

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
  // sem tempo previsto, a distância decide: meia é longa, 10 km não
  assertEquals(computeRaceEve({ weightKg: 70, distanceKm: 21.1 }).carbLoading, { low: 700, high: 840 });
  assertEquals(computeRaceEve({ weightKg: 70, distanceKm: 10 }).carbLoading, null);
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
  // Sem "agora" conhecido, ou "agora" antes do jantar: o horário inteiro, como sempre.
  assertEquals(
    describeRaceEveShort(eve, "Corrida do Tejo", 10, minutesOfDay("15:00")),
    "Amanhã é dia de prova: Corrida do Tejo, 10 km, partida às 09:00: jantar até às 19:30 (140-280 g de hidratos), deitar às 22:00, acordar às 06:00, pequeno-almoço às 06:15, chegada às 08:00.",
  );
  assertEquals(
    describeRaceDayShort(eve, "Corrida do Tejo", "4.42"),
    "Hoje é Corrida do Tejo, partida às 09:00: pequeno-almoço às 06:15, água até às 08:15, chegada às 08:00, aquecimento às 08:35. O teu plano km a km está no hub da prova: arrancas a 4.42.",
  );
  assertStringIncludes(describeRaceDayShort(computeRaceEve({}), "X", null), "2 h 45 antes da partida");
  assertStringIncludes(describeRaceDayShort(computeRaceEve({}), "X", null), "Marca o objetivo de tempo");
});

/* Revisão de 2026-09-26: às 22:40 da véspera, o jantar e a hora de deitar já
   passaram — o que há a dizer é que se deite, não repetir um horário morto.
   `nowMinutes` são os minutos desde a meia-noite de Lisboa da véspera. */
Deno.test("describeRaceEveShort: depois do jantar e depois de deitar, só os passos por vir", () => {
  const eve = computeRaceEve({ startTime: "09:00:00", weightKg: 70, plannedFinishSeconds: 6720 });
  assertEquals(
    describeRaceEveShort(eve, "Corrida do Tejo", 10, minutesOfDay("20:40")),
    "Amanhã é dia de prova: Corrida do Tejo, 10 km, partida às 09:00: cama às 22:00, acordar às 06:00.",
  );
  assertEquals(
    describeRaceEveShort(eve, "Corrida do Tejo", 10, minutesOfDay("22:40")),
    "Amanhã é dia de prova: Corrida do Tejo, 10 km, partida às 09:00. Deita-te já: acordas às 06:00.",
  );
});

/* Uma partida ao fim da tarde ou à noite (uma São Silvestre às 20:00): o
   horário calculado por computeRaceEve (3 h de acordar antes da partida, 8 h
   de sono antes disso) dava "jantar até às 06:30, deitar às 09:00" — do
   PRÓPRIO dia da prova, ditas como se fossem da véspera. A noite é sempre a
   de sempre; as horas que restam são as do dia da prova. */
Deno.test("describeRaceEveShort: uma partida ao fim da tarde não dá o jantar nem o deitar do dia seguinte", () => {
  const eve = computeRaceEve({ startTime: "20:00:00", weightKg: 70, distanceKm: 10 });
  assertEquals(noiteDoHorario(eve.schedule!), false);
  assertEquals(
    describeRaceEveShort(eve, "São Silvestre", 10, minutesOfDay("15:00")),
    "Amanhã é dia de prova: São Silvestre, 10 km, partida às 20:00. Jantar de hidratos complexos (140-280 g), pouca fibra, e 8 h de sono. Antes da partida, comes às 17:15 e chegas às 19:00.",
  );
  // A partir das 21h, "esta noite" — já não faz sentido falar do jantar.
  assertEquals(
    describeRaceEveShort(eve, "São Silvestre", 10, minutesOfDay("22:00")),
    "Amanhã é dia de prova: São Silvestre, 10 km, partida às 20:00. Esta noite, 8 h de sono. Antes da partida, comes às 17:15 e chegas às 19:00.",
  );
});

Deno.test("noiteDoHorario: partida de manhã tem a noite da véspera; ao fim da tarde, não", () => {
  const manha = computeRaceEve({ startTime: "09:00:00" });
  const tarde = computeRaceEve({ startTime: "20:00:00" });
  assertEquals(noiteDoHorario(manha.schedule!), true);
  assertEquals(noiteDoHorario(tarde.schedule!), false);
});

/* Revisão de 2026-09-26: às 13:00 do dia da prova, acabada mas por registar,
   dava ainda "pequeno-almoço às 06:15, aquecimento às 08:35". Depois da
   partida mais o tempo previsto (ou 3 h sem ele), pede-se o registo.
   `nowMinutes` são os minutos desde a meia-noite de Lisboa do dia da prova. */
Deno.test("describeRaceDayShort: depois da prova, o registo e o balanço em vez do horário pré-prova", () => {
  const eve = computeRaceEve({ startTime: "09:00:00", weightKg: 70 });
  const jaFoi = "A prova de hoje já foi. Regista-a e fazemos o balanço.";
  // Com tempo previsto (48 min): acaba às 09:48.
  assertEquals(describeRaceDayShort(eve, "Corrida do Tejo", "4.42", minutesOfDay("13:00"), 2880), jaFoi);
  assertEquals(describeRaceDayShort(eve, "Corrida do Tejo", "4.42", minutesOfDay("09:48"), 2880), jaFoi);
  assertEquals(describeRaceDayShort(eve, "Corrida do Tejo", "4.42", minutesOfDay("09:47"), 2880).includes("já foi"), false);
  // Sem tempo previsto: 3 h depois da partida.
  assertEquals(describeRaceDayShort(eve, "Corrida do Tejo", null, minutesOfDay("11:59")).includes("já foi"), false);
  assertEquals(describeRaceDayShort(eve, "Corrida do Tejo", null, minutesOfDay("12:00")), jaFoi);
  // Antes da partida, o horário como sempre.
  assertEquals(
    describeRaceDayShort(eve, "Corrida do Tejo", "4.42", minutesOfDay("06:00"), 2880),
    "Hoje é Corrida do Tejo, partida às 09:00: pequeno-almoço às 06:15, água até às 08:15, chegada às 08:00, aquecimento às 08:35. O teu plano km a km está no hub da prova: arrancas a 4.42.",
  );
  // Sem "agora" conhecido, ou sem hora de partida, nada muda.
  assertStringIncludes(describeRaceDayShort(eve, "Corrida do Tejo", "4.42", null, 2880), "pequeno-almoço às 06:15");
  assertStringIncludes(describeRaceDayShort(computeRaceEve({}), "X", null, minutesOfDay("23:00")), "2 h 45 antes da partida");
  // Uma partida à noite (22:00 + 3 h) acaba depois da meia-noite: nunca "já foi" no próprio dia.
  const noite = computeRaceEve({ startTime: "22:00:00" });
  assertEquals(describeRaceDayShort(noite, "São Silvestre", null, minutesOfDay("23:59")).includes("já foi"), false);
});
