import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { fetchRaceWeatherContext, fetchRaceWeatherObserved } from "./raceWeatherFetch.ts";

const TODAY = "2026-09-18";
const race = { name: "Meia de Lisboa", date: "2026-09-20", location: "Lisboa", start_time: "09:00:00", target_time_seconds: 6300, distance_km: 21.1 };

/** Um fetch falso que responde por padrão de URL e regista os pedidos. */
function fakeFetch(routes: Array<[RegExp, unknown]>) {
  const calls: string[] = [];
  const impl = ((url: string) => {
    calls.push(url);
    const hit = routes.find(([re]) => re.test(url));
    return Promise.resolve({ ok: !!hit, status: hit ? 200 : 404, json: () => Promise.resolve(hit?.[1] ?? {}) } as Response);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const forecast = {
  hourly: {
    time: ["2026-09-20T09:00", "2026-09-20T10:00"],
    temperature_2m: [18, 22], apparent_temperature: [19, 24], relative_humidity_2m: [70, 60],
    precipitation_probability: [10, 20], wind_speed_10m: [10, 12],
  },
};

Deno.test("fetchRaceWeatherContext: procura o local, pede o dia da prova e devolve o bloco", async () => {
  const { impl, calls } = fakeFetch([
    [/geocoding.*countryCode=PT/, { results: [{ latitude: 38.72, longitude: -9.14 }] }],
    [/api\.open-meteo\.com\/v1\/forecast/, forecast],
  ]);
  const text = await fetchRaceWeatherContext(race, TODAY, impl);
  assertStringIncludes(text!, "METEOROLOGIA DA PROVA (Meia de Lisboa, 2026-09-20, Lisboa");
  assertStringIncludes(text!, "Entre as 09:00 e as 11:00: 18 a 22 °C (sensação até 24 °C)");
  assertEquals(calls.length, 2);
  assertStringIncludes(calls[1], "start_date=2026-09-20&end_date=2026-09-20");
});

Deno.test("fetchRaceWeatherContext: sem resultado em Portugal, procura em qualquer país", async () => {
  const { impl, calls } = fakeFetch([
    [/geocoding.*countryCode=PT/, { results: [] }],
    [/geocoding/, { results: [{ latitude: 41.39, longitude: 2.17 }] }],
    [/forecast/, forecast],
  ]);
  const text = await fetchRaceWeatherContext({ ...race, location: "Barcelona" }, TODAY, impl);
  assertStringIncludes(text!, "Barcelona");
  assertEquals(calls.length, 3);
});

Deno.test("fetchRaceWeatherContext: fora da janela, sem local, sem rede ou sem previsão, é null", async () => {
  const none = fakeFetch([]).impl;
  assertEquals(await fetchRaceWeatherContext({ ...race, date: "2026-10-04" }, TODAY, none), null);   // a 16 dias
  assertEquals(await fetchRaceWeatherContext({ ...race, date: "2026-09-17" }, TODAY, none), null);   // já passou
  assertEquals(await fetchRaceWeatherContext({ ...race, location: "" }, TODAY, none), null);
  assertEquals(await fetchRaceWeatherContext(null, TODAY, none), null);
  assertEquals(await fetchRaceWeatherContext(race, TODAY, none), null);                              // local não encontrado
  const throws = (() => Promise.reject(new Error("rede"))) as unknown as typeof fetch;
  assertEquals(await fetchRaceWeatherContext(race, TODAY, throws), null);
});

// ── 5.6: o tempo que esteve, no balanço ─────────────────────────────────────

const observed = {
  hourly: {
    time: ["2026-09-20T09:00", "2026-09-20T10:00"],
    temperature_2m: [24, 28], apparent_temperature: [25, 30], relative_humidity_2m: [55, 45],
    precipitation: [0, 0.4], wind_speed_10m: [8, 14],
  },
};

Deno.test("fetchRaceWeatherObserved: depois da prova, pede a chuva que caiu e nunca lhe chama previsão", async () => {
  const { impl, calls } = fakeFetch([
    [/geocoding.*countryCode=PT/, { results: [{ latitude: 38.72, longitude: -9.14 }] }],
    [/api\.open-meteo\.com\/v1\/forecast/, observed],
  ]);
  // Dois dias depois da prova.
  const text = (await fetchRaceWeatherObserved(race, "2026-09-22", impl))!;
  assertStringIncludes(text, "O TEMPO QUE ESTEVE NA PROVA (Meia de Lisboa, 2026-09-20, Lisboa");
  assertStringIncludes(text, "Entre as 09:00 e as 11:00: 24 a 28 °C (sensação até 30 °C), humidade 50%");
  assertStringIncludes(text, "- Chuva: 0,4 mm nessas horas");
  assertStringIncludes(text, "Calor forte: o objetivo de tempo não era realista");
  assertEquals(/previs/i.test(text), false);
  assertStringIncludes(calls[1], "precipitation,");
  assertEquals(calls[1].includes("precipitation_probability"), false);
});

Deno.test("fetchRaceWeatherObserved: só do dia da prova até 7 dias depois", async () => {
  const { impl, calls } = fakeFetch([
    [/geocoding/, { results: [{ latitude: 38.72, longitude: -9.14 }] }],
    [/api\.open-meteo\.com\/v1\/forecast/, observed],
  ]);
  assertEquals(await fetchRaceWeatherObserved(race, "2026-09-18", impl), null); // ainda não foi
  assertEquals(await fetchRaceWeatherObserved(race, "2026-09-28", impl), null); // há 8 dias
  assertEquals(calls.length, 0);
  // E a previsão continua a não servir para depois da prova.
  assertEquals(await fetchRaceWeatherContext(race, "2026-09-22", impl), null);
});
