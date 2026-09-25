// O tempo para os treinos, pedido ao Open-Meteo (specs/carol-omnisciencia-
// omnipresenca.md, ação 5.6, push B). Gratuito e sem chave.
//
// Só com a cidade de treino no perfil (profiles.training_*, geocodificada
// uma vez no Perfil: aqui não se procura nada, vai-se direto às coordenadas)
// e só com treino no plano aceite hoje ou amanhã. Lê as suas próprias
// colunas do perfil, numa consulta à parte: se alguma coisa falhar, a Carol
// simplesmente não fala do tempo — nunca estraga a leitura do resto.
//
// Nunca rejeita: devolve o bloco ou null.

import { buildTrainingWeatherContext, trainingHours, weatherAtHours, type TrainingDay } from "./formulas/trainingWeather.ts";

const TIMEOUT_MS = 4000;

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

function lisbonHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", hour12: false }).format(now)) % 24;
}

// deno-lint-ignore no-explicit-any
function describeItem(i: any): string {
  if (i?.kind === "ginasio") return "ginásio";
  const km = Number(i?.target_distance_km);
  return `corrida${i?.training_type ? ` ${i.training_type}` : ""}${Number.isFinite(km) && km > 0 ? ` ${String(km).replace(".", ",")} km` : ""}`;
}

export async function fetchTrainingWeatherBlock(
  // deno-lint-ignore no-explicit-any
  sb: any,
  userId: string,
  todayISO: string,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<string | null> {
  try {
    const { data: place, error: placeErr } = await sb.from("profiles")
      .select("training_city, training_lat, training_lon, training_altitude_m")
      .eq("id", userId).maybeSingle();
    if (placeErr || place?.training_lat == null || place?.training_lon == null) return null;
    const lat = Number(place.training_lat);
    const lon = Number(place.training_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const tomorrow = addDays(todayISO, 1);
    const [{ data: items, error: itemsErr }, { data: runs }] = await Promise.all([
      sb.from("coach_plan_items")
        .select("planned_date, kind, training_type, target_distance_km, status, coach_plans!inner(status)")
        .eq("user_id", userId).eq("coach_plans.status", "aceite")
        .in("kind", ["corrida", "ginasio"])
        .gte("planned_date", todayISO).lte("planned_date", tomorrow),
      sb.from("runs").select("start_time").eq("user_id", userId)
        .not("start_time", "is", null).order("date", { ascending: false }).limit(10),
    ]);
    if (itemsErr) return null;
    // Só os treinos por fazer: o de hoje já feito não precisa de tempo.
    // deno-lint-ignore no-explicit-any
    const pending = (items || []).filter((i: any) => i && i.status !== "concluido" && i.status !== "cancelado");
    if (!pending.length) return null;

    const hours = trainingHours((runs || []).map((r: { start_time?: string | null }) => r.start_time ?? null));
    const habitual = hours.length === 1;
    const res = await fetchImpl(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m` +
        `&start_date=${todayISO}&end_date=${tomorrow}&timezone=auto`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.hourly) return null;

    // Hoje só as horas que ainda não passaram — na hora do sítio (a previsão
    // vem com timezone=auto), não na de Lisboa: nos Açores é menos uma.
    const offset = json.utc_offset_seconds;
    const hourNow = typeof offset === "number"
      ? new Date(now.getTime() + offset * 1000).getUTCHours()
      : lisbonHour(now);
    // A altitude do modelo de terreno da própria previsão. A da geocodificação
    // engana-se (a Covilhã vinha a 205 m, e está a 700 m); a do perfil só
    // conta quando a previsão não a trouxer.
    const altitudeM = typeof json.elevation === "number"
      ? Math.round(json.elevation)
      : (place.training_altitude_m ?? null);
    const days: TrainingDay[] = [];
    for (const [date, label] of [[todayISO, "hoje"], [tomorrow, "amanhã"]] as const) {
      // deno-lint-ignore no-explicit-any
      const dayItems = pending.filter((i: any) => String(i.planned_date).slice(0, 10) === date);
      if (!dayItems.length) continue;
      const dayHours = label === "hoje" ? hours.filter((h) => h >= hourNow) : hours;
      days.push({ date, label, training: dayItems.map(describeItem).join(" + "), weather: weatherAtHours(json.hourly, date, dayHours) });
    }
    return buildTrainingWeatherContext(
      { city: String(place.training_city || "").trim() || "o sítio onde treina", altitudeM },
      days,
      habitual,
    );
  } catch (e) {
    console.warn("trainingWeather: falhou", e);
    return null;
  }
}
