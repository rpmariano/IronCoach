// A véspera e a manhã da prova — fórmula pura, partilhada pelo cartão do
// Início (via @formulas), pelo coach-chat e pelo coach-daily-summary
// (specs/plano-de-prova.md, "A véspera e a hora"). Uma régua só: as horas
// e as gramas que a Carol diz no chat são as que o Início mostra.
//
// @doutrina src/coach-knowledge/04-nutricao-treino-prova.md (#1 antes do
// treino, #3 carga de hidratos), 04-nutricao-base-diaria.md (#6 água).

export interface RaceEveInput {
  startTime?: string | null;      // "09:00" ou "09:00:00" (hora local); null = desconhecida
  weightKg?: number | string | null;
  plannedFinishSeconds?: number | null; // decide a carga de hidratos (> 90 min)
  distanceKm?: number | string | null;  // recurso: sem tempo previsto, meia ou mais é prova longa
}

export interface Range { low: number; high: number }

export interface RaceEveSchedule {
  start: string;      // "09:00"
  wake: string;       // 3 h antes
  bed: string;        // 8 h antes de acordar
  screensOff: string; // 1 h antes de deitar
  dinnerBy: string;   // 2 h 30 antes de deitar
  breakfast: string;  // 2 h 45 antes da partida
  waterFrom: string;  // 4 h antes
  waterUntil: string; // 45 min antes
  arrival: string;    // 60 min antes
  warmup: string;     // 25 min antes
}

export interface RaceEve {
  schedule: RaceEveSchedule | null; // null sem hora de partida
  weightKg: number | null;
  sleepHours: { target: number; min: number };
  dinnerCarbsG: Range | null;       // 2-4 g/kg (null sem peso)
  dinnerProteinG: Range | null;     // 0,3-0,4 g/kg
  breakfastCarbsG: Range | null;    // 1-2 g/kg
  preRaceWaterMl: Range | null;     // 5-7 ml/kg nas 4 h antes
  dayWaterL: Range | null;          // 30-40 ml/kg
  carbLoading: Range | null;        // 10-12 g/kg/dia, só > 90 min
  longRace: boolean;
}

export const SLEEP_TARGET_H = 8;
export const SLEEP_MIN_H = 7;
export const WAKE_BEFORE_MIN = 180;
export const BREAKFAST_BEFORE_MIN = 165;
export const ARRIVAL_BEFORE_MIN = 60;
export const WARMUP_BEFORE_MIN = 25;
export const LONG_RACE_SECONDS = 90 * 60;

export function hhmm(t: unknown): string {
  return typeof t === "string" ? t.slice(0, 5) : "";
}

export function minutesOfDay(t: unknown): number | null {
  const v = hhmm(t);
  const m = /^(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

export function clock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function perKg(weightKg: number | null, low: number, high: number, round = 1): Range | null {
  if (!weightKg) return null;
  const r = (v: number) => Math.round(v * round) / round;
  return { low: r(weightKg * low), high: r(weightKg * high) };
}

export function computeRaceEve(input: RaceEveInput): RaceEve {
  const w = input.weightKg != null ? Number(String(input.weightKg).replace(",", ".")) : NaN;
  const weightKg = Number.isFinite(w) && w > 0 ? w : null;
  const start = minutesOfDay(input.startTime);
  let schedule: RaceEveSchedule | null = null;
  if (start != null) {
    const wake = start - WAKE_BEFORE_MIN;
    const bed = wake - SLEEP_TARGET_H * 60;
    schedule = {
      start: clock(start),
      wake: clock(wake),
      bed: clock(bed),
      screensOff: clock(bed - 60),
      dinnerBy: clock(bed - 150),
      breakfast: clock(start - BREAKFAST_BEFORE_MIN),
      waterFrom: clock(start - 240),
      waterUntil: clock(start - 45),
      arrival: clock(start - ARRIVAL_BEFORE_MIN),
      warmup: clock(start - WARMUP_BEFORE_MIN),
    };
  }
  const dist = input.distanceKm != null ? Number(String(input.distanceKm).replace(",", ".")) : NaN;
  const longRace = input.plannedFinishSeconds != null && input.plannedFinishSeconds > 0
    ? input.plannedFinishSeconds > LONG_RACE_SECONDS
    : Number.isFinite(dist) && dist > 15;
  return {
    schedule,
    weightKg,
    sleepHours: { target: SLEEP_TARGET_H, min: SLEEP_MIN_H },
    dinnerCarbsG: perKg(weightKg, 2, 4),
    dinnerProteinG: perKg(weightKg, 0.3, 0.4),
    breakfastCarbsG: perKg(weightKg, 1, 2),
    preRaceWaterMl: perKg(weightKg, 5, 7),
    dayWaterL: perKg(weightKg, 0.03, 0.04, 10),
    carbLoading: longRace ? perKg(weightKg, 10, 12) : null,
    longRace,
  };
}

/** Uma frase curta para o cartão do Início na véspera: horas se as houver,
 *  senão o pedido da hora. */
export function describeRaceEveShort(eve: RaceEve, raceName: string, distanceKm: number | null): string {
  const name = raceName || "a prova";
  const dist = distanceKm ? `, ${distanceKm} km` : "";
  if (!eve.schedule) {
    return `Amanhã é ${name}${dist}. Sem hora de partida marcada não consigo dar horas: marca-a na prova. Jantar de hidratos complexos, pouca fibra, e 8 h de sono.`;
  }
  const s = eve.schedule;
  const carbs = eve.dinnerCarbsG ? ` (${eve.dinnerCarbsG.low}-${eve.dinnerCarbsG.high} g de hidratos)` : "";
  return `Amanhã é ${name}${dist}, partida às ${s.start}: jantar até às ${s.dinnerBy}${carbs}, deitar às ${s.bed}, acordar às ${s.wake}, pequeno-almoço às ${s.breakfast}, chegada às ${s.arrival}.`;
}

/** Uma frase curta para o cartão do Início no dia da prova. */
export function describeRaceDayShort(eve: RaceEve, raceName: string, firstKmPaceLabel: string | null): string {
  const name = raceName || "a prova";
  const pace = firstKmPaceLabel ? ` Primeiro km a ${firstKmPaceLabel}.` : "";
  if (!eve.schedule) return `Hoje é ${name}. Pequeno-almoço 2 h 45 antes da partida, água aos goles até 45 min antes.${pace}`;
  const s = eve.schedule;
  return `Hoje é ${name}, partida às ${s.start}: pequeno-almoço às ${s.breakfast}, água até às ${s.waterUntil}, chegada às ${s.arrival}, aquecimento às ${s.warmup}.${pace}`;
}
