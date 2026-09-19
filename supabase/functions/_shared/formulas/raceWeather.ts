// A meteorologia da prova — fórmula pura (specs/carol-omnisciencia-
// omnipresenca.md, ação 4.2).
//
// A Carol preparava a véspera e o plano do dia sem saber se ia estar calor,
// chuva ou vento. Isto resume a previsão horária do Open-Meteo para as horas
// em que o atleta vai estar a correr (da partida até ao fim previsto) e
// escreve o bloco do prompt, com as regras de ajuste.
//
// @doutrina Calor: o ritmo sustentável cai com a temperatura aparente — a
// partir de ~20 °C o custo sobe de forma visível, acima de ~25 °C é preciso
// abrandar e beber mais, acima de ~30 °C o objetivo de tempo deixa de ser
// realista (ACSM, "Exertional Heat Illness", 2023; Ely et al., 2007). Os
// intervalos abaixo são a régua da app, não um cálculo fisiológico.

export interface HourlyForecast {
  time: string[];                              // "2026-09-20T09:00"
  temperature_2m?: (number | null)[];
  apparent_temperature?: (number | null)[];
  relative_humidity_2m?: (number | null)[];
  precipitation_probability?: (number | null)[];
  wind_speed_10m?: (number | null)[];
}

export interface RaceWeatherSummary {
  fromHour: string;          // "09:00"
  toHour: string;            // "11:00"
  tempMin: number;
  tempMax: number;
  apparentMax: number;
  humidityAvg: number | null;
  rainProbMax: number | null;
  windMax: number | null;
}

export const DEFAULT_START = "09:00";
/** Sem objetivo de tempo, o fim previsto sai de um ritmo prudente. */
const FALLBACK_PACE_MIN_PER_KM = 6.5;

function hourOf(hhmm: string): number {
  const [h] = hhmm.split(":").map(Number);
  return Number.isFinite(h) ? h : 9;
}

function vals(list: (number | null)[] | undefined, idx: number[]): number[] {
  if (!list) return [];
  return idx.map((i) => list[i]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

/** Quanto tempo o atleta vai estar a correr, em minutos. */
export function expectedDurationMin(targetSeconds: number | null | undefined, distanceKm: number | string | null | undefined): number {
  const t = Number(targetSeconds);
  if (Number.isFinite(t) && t > 0) return t / 60;
  const d = Number(distanceKm);
  if (Number.isFinite(d) && d > 0) return d * FALLBACK_PACE_MIN_PER_KM;
  return 60;
}

/** As horas da prova na previsão horária. null se o dia não estiver lá. */
export function summarizeRaceWeather(h: HourlyForecast, dateISO: string, startHHMM: string, durationMin: number): RaceWeatherSummary | null {
  const start = hourOf(startHHMM);
  const end = Math.min(23, start + Math.max(1, Math.ceil(durationMin / 60)) - 1);
  const idx: number[] = [];
  (h.time || []).forEach((t, i) => {
    if (typeof t !== "string" || !t.startsWith(dateISO)) return;
    const hour = Number(t.slice(11, 13));
    if (hour >= start && hour <= end) idx.push(i);
  });
  const temps = vals(h.temperature_2m, idx);
  if (!temps.length) return null;
  const apparent = vals(h.apparent_temperature, idx);
  const hum = vals(h.relative_humidity_2m, idx);
  const rain = vals(h.precipitation_probability, idx);
  const wind = vals(h.wind_speed_10m, idx);
  const round = (n: number) => Math.round(n);
  return {
    fromHour: `${String(start).padStart(2, "0")}:00`,
    toHour: `${String(end + 1).padStart(2, "0")}:00`,
    tempMin: round(Math.min(...temps)),
    tempMax: round(Math.max(...temps)),
    apparentMax: round(Math.max(...(apparent.length ? apparent : temps))),
    humidityAvg: hum.length ? round(hum.reduce((a, b) => a + b, 0) / hum.length) : null,
    rainProbMax: rain.length ? round(Math.max(...rain)) : null,
    windMax: wind.length ? round(Math.max(...wind)) : null,
  };
}

export type HeatLevel = "fresco" | "ameno" | "morno" | "calor" | "calor_forte";

export function heatLevel(apparentMax: number): HeatLevel {
  if (apparentMax < 12) return "fresco";
  if (apparentMax < 20) return "ameno";
  if (apparentMax < 25) return "morno";
  if (apparentMax < 30) return "calor";
  return "calor_forte";
}

const HEAT_ADVICE: Record<HeatLevel, string> = {
  fresco: "Fresco: bom para correr; aquecimento mais longo e roupa para a espera antes da partida.",
  ameno: "Condições boas para o ritmo planeado.",
  morno: "Já custa: conta com o ritmo 1 a 3% mais lento para o mesmo esforço, e bebe desde o início.",
  calor: "Calor a sério: abranda 3 a 6% face ao plano, parte conservador, bebe em todos os abastecimentos e junta sal.",
  calor_forte: "Calor forte: o objetivo de tempo deixa de ser realista. Corre por esforço, não pelo relógio, e para se aparecerem tonturas ou arrepios.",
};

/** O bloco do prompt. `assumed` diz o que não se sabia (hora, duração). */
export function buildRaceWeatherContext(
  race: { name?: string | null; date: string; location?: string | null },
  s: RaceWeatherSummary,
  assumed: { startTime: boolean; duration: boolean },
): string {
  const level = heatLevel(s.apparentMax);
  const lines = [
    `- Entre as ${s.fromHour} e as ${s.toHour}: ${s.tempMin === s.tempMax ? `${s.tempMin} °C` : `${s.tempMin} a ${s.tempMax} °C`}` +
      (s.apparentMax !== s.tempMax ? ` (sensação até ${s.apparentMax} °C)` : "") +
      (s.humidityAvg !== null ? `, humidade ${s.humidityAvg}%` : ""),
  ];
  if (s.rainProbMax !== null) lines.push(`- Chuva: ${s.rainProbMax}% de probabilidade${s.rainProbMax >= 60 ? " — conta com ela (meias e ténis que não fazem bolhas molhados, vaselina)" : ""}`);
  if (s.windMax !== null) lines.push(`- Vento: até ${s.windMax} km/h${s.windMax >= 25 ? " — forte: nos troços contra o vento, corre em grupo e aceita perder segundos" : ""}`);
  lines.push(`- ${HEAT_ADVICE[level]}`);
  const notes = [
    assumed.startTime ? `sem hora de partida, assumi as ${DEFAULT_START}` : null,
    assumed.duration ? "sem objetivo de tempo, a duração é uma estimativa" : null,
  ].filter(Boolean);
  return `METEOROLOGIA DA PROVA (${race.name || "prova"}, ${race.date}${race.location ? `, ${race.location}` : ""} — previsão Open-Meteo${notes.length ? `; ${notes.join("; ")}` : ""}):\n` +
    lines.join("\n") +
    `\nÉ uma previsão: muda de dia para dia, e a mais fiável é a da véspera. Usa-a no plano do dia, na véspera e na prontidão; ` +
    `se ela mudar o ritmo, diz porquê com o número. Não inventes condições que não estão aqui.`;
}
