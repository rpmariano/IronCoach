import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildRaceWeatherContext, expectedDurationMin, heatLevel, summarizeRaceWeather } from "./raceWeather.ts";

const hourly = {
  time: ["2026-09-20T08:00", "2026-09-20T09:00", "2026-09-20T10:00", "2026-09-20T11:00", "2026-09-20T12:00", "2026-09-21T09:00"],
  temperature_2m: [16, 18, 21, 24, 27, 10],
  apparent_temperature: [16, 19, 23, 26, 29, 9],
  relative_humidity_2m: [80, 70, 60, 50, 40, 90],
  precipitation_probability: [0, 10, 20, 70, 5, 100],
  wind_speed_10m: [5, 10, 28, 12, 8, 40],
};

Deno.test("expectedDurationMin: o objetivo, senão a distância a 6,5 min/km, senão uma hora", () => {
  assertEquals(expectedDurationMin(6300, 21.1), 105);
  assertEquals(expectedDurationMin(null, 10), 65);
  assertEquals(expectedDurationMin(null, null), 60);
});

Deno.test("summarizeRaceWeather: só as horas da prova, desse dia", () => {
  // Partida às 9h, 2h40 de prova: 9h, 10h e 11h.
  assertEquals(summarizeRaceWeather(hourly, "2026-09-20", "09:00:00", 160), {
    fromHour: "09:00", toHour: "12:00", tempMin: 18, tempMax: 24, apparentMax: 26,
    humidityAvg: 60, rainProbMax: 70, rainMm: null, windMax: 28,
  });
  // Uma prova curta: só a hora da partida.
  assertEquals(summarizeRaceWeather(hourly, "2026-09-20", "08:00", 30)?.toHour, "09:00");
  // Um dia que não está na previsão.
  assertEquals(summarizeRaceWeather(hourly, "2026-09-25", "09:00", 60), null);
});

Deno.test("heatLevel: a régua da temperatura aparente", () => {
  assertEquals(heatLevel(10), "fresco");
  assertEquals(heatLevel(18), "ameno");
  assertEquals(heatLevel(22), "morno");
  assertEquals(heatLevel(27), "calor");
  assertEquals(heatLevel(31), "calor_forte");
});

Deno.test("buildRaceWeatherContext: números, chuva e vento fortes, o conselho do calor e o que foi assumido", () => {
  const s = summarizeRaceWeather(hourly, "2026-09-20", "09:00", 160)!;
  const text = buildRaceWeatherContext({ name: "Meia de Lisboa", date: "2026-09-20", location: "Lisboa" }, s, { startTime: true, duration: false });
  assertStringIncludes(text, "METEOROLOGIA DA PROVA (Meia de Lisboa, 2026-09-20, Lisboa — previsão Open-Meteo; sem hora de partida, assumi as 09:00)");
  assertStringIncludes(text, "- Entre as 09:00 e as 12:00: 18 a 24 °C (sensação até 26 °C), humidade 60%");
  assertStringIncludes(text, "- Chuva: 70% de probabilidade — conta com ela");
  assertStringIncludes(text, "- Vento: até 28 km/h — forte");
  assertStringIncludes(text, "abranda 3 a 6%");
  assertStringIncludes(text, "Não inventes condições");
  // Sem chuva nem vento fortes, sem os avisos.
  const calm = buildRaceWeatherContext({ date: "2026-09-20" }, { ...s, rainProbMax: 10, windMax: 8, apparentMax: 15, tempMax: 15, tempMin: 12 }, { startTime: false, duration: false });
  assert(!calm.includes("conta com ela"));
  assert(!calm.includes("forte:"));
  assertStringIncludes(calm, "Condições boas");
});
