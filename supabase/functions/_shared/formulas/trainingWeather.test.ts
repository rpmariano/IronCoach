import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildTrainingWeatherContext, trainingHours, weatherAtHours, DEFAULT_TRAINING_HOURS } from "./trainingWeather.ts";
import { assertCarolVoice } from "../carolTone.ts";

// 5.6, push B: o tempo para os treinos, à hora a que ele costuma correr.

Deno.test("trainingHours: a mediana das horas de partida; com poucas, as duas janelas", () => {
  assertEquals(trainingHours(["07:10:00", "07:40:00", "19:00:00"]), [7]);
  assertEquals(trainingHours(["07:10", "08:00", "18:30", "19:15"]), [13]);
  assertEquals(trainingHours(["07:10", null, "banana"]), DEFAULT_TRAINING_HOURS);
  assertEquals(trainingHours(null), DEFAULT_TRAINING_HOURS);
});

const hourly = {
  time: ["2026-09-25T08:00", "2026-09-25T19:00", "2026-09-26T08:00", "2026-09-26T19:00"],
  temperature_2m: [17, 27, 16, 31], apparent_temperature: [17, 29, 15, 33],
  precipitation_probability: [10, 5, 60, 0], wind_speed_10m: [8, 12, 30, 10],
};

Deno.test("weatherAtHours: só as horas pedidas desse dia", () => {
  assertEquals(weatherAtHours(hourly, "2026-09-25", [19]), [{ hour: 19, temp: 27, apparent: 29, rainProb: 5, wind: 12 }]);
  assertEquals(weatherAtHours(hourly, "2026-09-25", [12]), []);
});

Deno.test("buildTrainingWeatherContext: hoje e amanhã, com o treino do plano, o que muda e nada de tabela", () => {
  const ctx = buildTrainingWeatherContext({ city: "Lisboa, Portugal", altitudeM: 45 }, [
    { date: "2026-09-25", label: "hoje", training: "corrida contínuo 8 km", weather: weatherAtHours(hourly, "2026-09-25", DEFAULT_TRAINING_HOURS) },
    { date: "2026-09-26", label: "amanhã", training: "corrida fácil 6 km", weather: weatherAtHours(hourly, "2026-09-26", DEFAULT_TRAINING_HOURS) },
  ], false)!;
  assertStringIncludes(ctx, "TEMPO PARA OS TREINOS (Lisboa, Portugal — previsão Open-Meteo, de manhã e ao fim do dia");
  assertStringIncludes(ctx, "- hoje (corrida contínuo 8 km): às 08h 17 °C — bom para correr; às 19h 27 °C (sensação 29 °C) — calor: abranda e bebe mais");
  assertStringIncludes(ctx, "- amanhã (corrida fácil 6 km): às 08h 16 °C (sensação 15 °C), chuva 60%, vento 30 km/h; às 19h 31 °C (sensação 33 °C) — calor forte");
  assertStringIncludes(ctx, "A tabela de ritmos não muda com o tempo.");
  assertCarolVoice(ctx.split("\n").pop()!);
});

Deno.test("buildTrainingWeatherContext: a altitude só conta a partir dos 800 m; sem tempo, nada", () => {
  const alto = buildTrainingWeatherContext({ city: "Covilhã, Portugal", altitudeM: 1200 }, [
    { date: "2026-09-25", label: "hoje", training: "corrida", weather: weatherAtHours(hourly, "2026-09-25", [8]) },
  ], true)!;
  assertStringIncludes(alto, "(Covilhã, Portugal, 1200 m de altitude — previsão Open-Meteo, à hora a que ele costuma correr)");
  assertEquals(buildTrainingWeatherContext({ city: "Lisboa" }, [{ date: "2026-09-25", label: "hoje", training: "corrida", weather: [] }], true), null);
});
