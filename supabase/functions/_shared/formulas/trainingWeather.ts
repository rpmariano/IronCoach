// O tempo para os treinos — fórmula pura
// (specs/carol-omnisciencia-omnipresenca.md, ação 5.6, push B).
//
// A Carol só sabia o tempo da prova. Com a cidade de treino no perfil
// (profiles.training_*, geocodificada uma vez no Perfil), passa a saber o
// tempo à hora a que ele costuma treinar, hoje e amanhã — só quando há treino
// no plano, senão é conversa de café. A hora é a mediana das últimas corridas
// com hora marcada; sem isso, duas janelas (manhã e fim do dia).
//
// A tabela km a km não muda com o calor: é a régua única com o hub. A Carol
// diz o ajuste em palavras, como já faz com a prova.

import { heatLevel } from "./raceWeather.ts";

export interface HourlyTrainingForecast {
  time: string[];
  temperature_2m?: (number | null)[];
  apparent_temperature?: (number | null)[];
  precipitation_probability?: (number | null)[];
  wind_speed_10m?: (number | null)[];
}

/** Sem hora habitual, as duas janelas em que mais se treina. */
export const DEFAULT_TRAINING_HOURS = [8, 19];
/** Com menos corridas com hora do que isto, a mediana não diz nada. */
export const MIN_RUNS_FOR_HABIT = 3;

/** A hora a que ele costuma correr (mediana das horas de partida), ou as duas janelas. */
export function trainingHours(startTimes: Array<string | null | undefined> | null | undefined): number[] {
  const hours = (startTimes || [])
    .map((t) => (typeof t === "string" ? Number(t.slice(0, 2)) : NaN))
    .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)
    .sort((a, b) => a - b);
  if (hours.length < MIN_RUNS_FOR_HABIT) return [...DEFAULT_TRAINING_HOURS];
  const mid = Math.floor(hours.length / 2);
  return [hours.length % 2 ? hours[mid] : Math.round((hours[mid - 1] + hours[mid]) / 2)];
}

export interface TrainingHourWeather { hour: number; temp: number; apparent: number; rainProb: number | null; wind: number | null }

/** O tempo às horas pedidas, num dia da previsão. As horas que não estão lá ficam de fora. */
export function weatherAtHours(h: HourlyTrainingForecast, dateISO: string, hours: number[]): TrainingHourWeather[] {
  const out: TrainingHourWeather[] = [];
  for (const hour of hours) {
    const key = `${dateISO}T${String(hour).padStart(2, "0")}:00`;
    const i = (h.time || []).indexOf(key);
    const temp = i >= 0 ? h.temperature_2m?.[i] : null;
    if (i < 0 || typeof temp !== "number") continue;
    const apparent = h.apparent_temperature?.[i];
    const rain = h.precipitation_probability?.[i];
    const wind = h.wind_speed_10m?.[i];
    out.push({
      hour,
      temp: Math.round(temp),
      apparent: Math.round(typeof apparent === "number" ? apparent : temp),
      rainProb: typeof rain === "number" ? Math.round(rain) : null,
      wind: typeof wind === "number" ? Math.round(wind) : null,
    });
  }
  return out;
}

const HEAT_HINT: Record<string, string> = {
  fresco: "fresco",
  ameno: "bom para correr",
  morno: "já custa: bebe desde o início",
  calor: "calor: abranda e bebe mais",
  calor_forte: "calor forte: treina por esforço ou muda a hora",
};

export interface TrainingDay { date: string; label: "hoje" | "amanhã"; training: string; weather: TrainingHourWeather[] }

/** O bloco do prompt, ou null sem nenhum dia com tempo. */
export function buildTrainingWeatherContext(place: { city: string; altitudeM?: number | null }, days: TrainingDay[], habitual: boolean): string | null {
  const withWeather = days.filter((d) => d.weather.length);
  if (!withWeather.length) return null;
  const lines = withWeather.map((d) => {
    const at = d.weather.map((w) => {
      const rainy = w.rainProb !== null && w.rainProb >= 30;
      const windy = w.wind !== null && w.wind >= 25;
      const level = heatLevel(w.apparent);
      // "Bom para correr" com chuva ou vento na mesma linha contradizia-se:
      // no ameno, a chuva e o vento falam por si.
      const hint = level === "ameno" && (rainy || windy) ? null : HEAT_HINT[level];
      return `às ${String(w.hour).padStart(2, "0")}h ${w.temp} °C` +
        (w.apparent !== w.temp ? ` (sensação ${w.apparent} °C)` : "") +
        (rainy ? `, chuva ${w.rainProb}%` : "") +
        (windy ? `, vento ${w.wind} km/h` : "") +
        (hint ? ` — ${hint}` : "");
    }).join("; ");
    return `- ${d.label} (${d.training}): ${at}`;
  });
  const alt = typeof place.altitudeM === "number" && place.altitudeM >= 800 ? `, ${place.altitudeM} m de altitude` : "";
  return `TEMPO PARA OS TREINOS (${place.city}${alt} — previsão Open-Meteo, ${habitual ? "à hora a que ele costuma correr" : "de manhã e ao fim do dia: ainda não sei a hora a que ele corre"}):\n` +
    lines.join("\n") +
    `\nUsa-o para o conselho do treino em palavras — roupa, água, a hora, abrandar com calor. A tabela de ritmos não muda com o tempo. ` +
    `Não fales do tempo se não mudar nada; não inventes condições que não estão aqui.`;
}
