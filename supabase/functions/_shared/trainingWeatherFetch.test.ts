import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { fetchTrainingWeatherBlock } from "./trainingWeatherFetch.ts";

// 5.6, push B: o tempo para os treinos, só com cidade no perfil e treino no plano.

const TODAY = "2026-09-25";
// 10:00 em Lisboa (UTC+1): as 08h de hoje já passaram, as 19h não.
const NOW = new Date("2026-09-25T09:00:00Z");

/** Um cliente falso: cada tabela devolve o que se lhe der, por qualquer cadeia de filtros. */
// deno-lint-ignore no-explicit-any
function fakeSb(tables: Record<string, { data: any; error?: any }>) {
  // deno-lint-ignore no-explicit-any
  const chain = (result: any): any => {
    // deno-lint-ignore no-explicit-any
    const c: any = new Proxy({}, {
      get(_t, prop) {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve(result);
        if (prop === "maybeSingle") return () => Promise.resolve(result);
        return () => c;
      },
    });
    return c;
  };
  return { from: (t: string) => chain(tables[t] ?? { data: null }) };
}

const forecast = {
  hourly: {
    time: ["2026-09-25T08:00", "2026-09-25T19:00", "2026-09-26T08:00", "2026-09-26T19:00"],
    temperature_2m: [17, 27, 16, 22], apparent_temperature: [17, 29, 16, 22],
    precipitation_probability: [0, 0, 70, 10], wind_speed_10m: [5, 10, 10, 10],
  },
};

function fakeFetch(body: unknown = forecast) {
  const calls: string[] = [];
  const impl = ((url: string) => {
    calls.push(url);
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const place = { training_city: "Lisboa, Portugal", training_lat: 38.72, training_lon: -9.14, training_altitude_m: 45 };
const items = [
  { planned_date: "2026-09-25", kind: "corrida", training_type: "contínuo", target_distance_km: 8, status: "pendente" },
  { planned_date: "2026-09-26", kind: "corrida", training_type: "fácil", target_distance_km: 6, status: "pendente" },
];

Deno.test("fetchTrainingWeatherBlock: com cidade e treino no plano, o tempo às horas que ainda contam", async () => {
  const { impl, calls } = fakeFetch();
  const text = (await fetchTrainingWeatherBlock(
    fakeSb({ profiles: { data: place }, coach_plan_items: { data: items }, runs: { data: [] } }),
    "u1", TODAY, impl, NOW,
  ))!;
  assertStringIncludes(calls[0], "latitude=38.72&longitude=-9.14");
  assertStringIncludes(calls[0], "start_date=2026-09-25&end_date=2026-09-26");
  // Hoje: só as 19h (as 08h já passaram). Amanhã: as duas janelas.
  assertStringIncludes(text, "- hoje (corrida contínuo 8 km): às 19h 27 °C (sensação 29 °C) — calor: abranda e bebe mais");
  assertStringIncludes(text, "- amanhã (corrida fácil 6 km): às 08h 16 °C, chuva 70%; às 19h 22 °C — já custa");
  assertEquals(text.includes("às 08h 17 °C"), false);
});

Deno.test("fetchTrainingWeatherBlock: sem cidade, sem corrida por fazer, ou com erro — nada, e sem pedir o tempo", async () => {
  const { impl, calls } = fakeFetch();
  assertEquals(await fetchTrainingWeatherBlock(fakeSb({ profiles: { data: { training_lat: null } } }), "u1", TODAY, impl, NOW), null);
  // O ginásio é dentro de portas: sozinho no plano, não pede o tempo.
  assertEquals(await fetchTrainingWeatherBlock(
    fakeSb({ profiles: { data: place }, coach_plan_items: { data: [{ planned_date: TODAY, kind: "ginasio", status: "pendente" }] }, runs: { data: [] } }),
    "u1", TODAY, impl, NOW,
  ), null);
  assertEquals(await fetchTrainingWeatherBlock(
    fakeSb({ profiles: { data: place }, coach_plan_items: { data: [{ ...items[0], status: "concluido" }] }, runs: { data: [] } }),
    "u1", TODAY, impl, NOW,
  ), null);
  // A migration por aplicar: a coluna não existe e a leitura falha — nada rebenta.
  assertEquals(await fetchTrainingWeatherBlock(fakeSb({ profiles: { data: null, error: { message: "column does not exist" } } }), "u1", TODAY, impl, NOW), null);
  assertEquals(calls.length, 0);
});

Deno.test("fetchTrainingWeatherBlock: a hora e a altitude são as do sítio, como a previsão as dá", async () => {
  // Nos Açores (UTC−1), às 09:00 UTC são 08h: o treino das 08h de hoje ainda conta.
  // A altitude do terreno (1200 m) vence a do perfil (45 m).
  const { impl } = fakeFetch({ ...forecast, utc_offset_seconds: -3600, elevation: 1200 });
  const text = (await fetchTrainingWeatherBlock(
    fakeSb({ profiles: { data: place }, coach_plan_items: { data: [items[0]] }, runs: { data: [] } }),
    "u1", TODAY, impl, NOW,
  ))!;
  assertStringIncludes(text, "(Lisboa, Portugal, 1200 m de altitude");
  assertStringIncludes(text, "- hoje (corrida contínuo 8 km): às 08h 17 °C");
});

Deno.test("fetchTrainingWeatherBlock: com a hora habitual (mediana das corridas), só essa hora", async () => {
  const { impl } = fakeFetch();
  const text = (await fetchTrainingWeatherBlock(
    fakeSb({
      profiles: { data: place },
      coach_plan_items: { data: [items[1]] },
      runs: { data: [{ start_time: "19:05:00" }, { start_time: "18:40:00" }, { start_time: "19:20:00" }] },
    }),
    "u1", TODAY, impl, NOW,
  ))!;
  assertStringIncludes(text, "à hora a que ele costuma correr");
  assertStringIncludes(text, "- amanhã (corrida fácil 6 km): às 19h 22 °C — já custa");
  assertEquals(text.includes("às 08h"), false);
});
