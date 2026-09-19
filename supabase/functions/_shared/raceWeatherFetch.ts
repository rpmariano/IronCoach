// A previsão do tempo da prova, pedida ao Open-Meteo (ação 4.2 de
// specs/carol-omnisciencia-omnipresenca.md). Gratuito e sem chave.
//
// Só nos últimos 7 dias antes da prova (antes disso a previsão vale pouco) e
// só com o local preenchido — as provas não têm coordenadas, só o nome do
// sítio ("Lisboa"), por isso primeiro procura-o em Portugal e, se não o
// encontrar, em qualquer país. Nada fica guardado: é uma previsão, e a de
// amanhã é melhor do que a de hoje.
//
// Nunca rejeita: sem rede, sem local, sem resultado, devolve null e a Carol
// simplesmente não fala do tempo.

import { buildRaceWeatherContext, DEFAULT_START, expectedDurationMin, summarizeRaceWeather } from "./formulas/raceWeather.ts";

export const WEATHER_WINDOW_DAYS = 7;
const TIMEOUT_MS = 4000;

// deno-lint-ignore no-explicit-any
async function getJson(fetchImpl: typeof fetch, url: string): Promise<any | null> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;
  return await res.json();
}

async function geocode(fetchImpl: typeof fetch, place: string): Promise<{ latitude: number; longitude: number } | null> {
  const base = `https://geocoding-api.open-meteo.com/v1/search?count=1&language=pt&format=json&name=${encodeURIComponent(place)}`;
  for (const url of [`${base}&countryCode=PT`, base]) {
    const json = await getJson(fetchImpl, url);
    const hit = json?.results?.[0];
    if (hit && Number.isFinite(hit.latitude) && Number.isFinite(hit.longitude)) return { latitude: hit.latitude, longitude: hit.longitude };
  }
  return null;
}

export async function fetchRaceWeatherContext(
  race: { name?: string | null; date?: string | null; location?: string | null; start_time?: string | null; target_time_seconds?: number | null; distance_km?: number | string | null } | null | undefined,
  todayISO: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const date = typeof race?.date === "string" ? race.date.slice(0, 10) : null;
    const place = (race?.location || "").trim();
    if (!date || !place) return null;
    const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayISO}T00:00:00Z`)) / 86400000);
    if (days < 0 || days > WEATHER_WINDOW_DAYS) return null;

    const coords = await geocode(fetchImpl, place);
    if (!coords) return null;
    const forecast = await getJson(fetchImpl,
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}` +
      `&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,wind_speed_10m` +
      `&start_date=${date}&end_date=${date}&timezone=Europe%2FLisbon`);
    if (!forecast?.hourly) return null;

    const start = race?.start_time ? String(race.start_time).slice(0, 5) : DEFAULT_START;
    const summary = summarizeRaceWeather(forecast.hourly, date, start, expectedDurationMin(race?.target_time_seconds, race?.distance_km));
    if (!summary) return null;
    return buildRaceWeatherContext(
      { name: race?.name ?? null, date, location: place },
      summary,
      { startTime: !race?.start_time, duration: !(Number(race?.target_time_seconds) > 0) },
    );
  } catch (e) {
    console.warn("raceWeather: previsão falhou", e);
    return null;
  }
}
