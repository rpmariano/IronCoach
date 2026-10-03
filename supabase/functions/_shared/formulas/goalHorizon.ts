// T1 — O horizonte dos objetivos corporais: até quando, e o ritmo semanal a
// que essa data obriga, verificado contra o ritmo seguro. Fórmula pura.
//
// @contexto Bug #46 (2026-10-01): «a Carol tem de indicar qual o intervalo
// temporal para os objetivos, pois isso influencia o plano a apresentar,
// tendo em conta as provas. Quando interrogada tem de saber esclarecer o
// racional e ajustar.» Até aqui os objetivos corporais eram só números, sem
// data: "74 kg" tanto podia ser daqui a 4 semanas (perigoso) como a 6 meses.
//
// @doutrina weightLossRate.ts — perda ≤0,7 (iniciante/básico), ≤0,5 (médio),
//   ≤0,4 (avançado) % do peso por semana. Vale para o peso e para a massa
//   gorda (doutrina coach-chat "RITMO DE PERDA DE GORDURA": ≤0,7%/semana).
// @doutrina coach-chat "GANHO DE MASSA MUSCULAR — ritmo realista (Aragon &
//   Schoenfeld 2013)" — o limite SUPERIOR de cada gama, kg/mês por nível e
//   género (é um teto de realismo, não de segurança: acima dele o objetivo
//   não se cumpre, não faz mal).
// @doutrina coach-chat Bloco 6 #1 — «a partir de 21-28 dias antes do início
//   do taper de uma PROVA A, o défice calórico vai a ZERO». Aqui 28: o
//   limite conservador, como taper.ts usa o superior de cada gama. Até à
//   prova não há défice; depois dela volta a contar.
//
// Ganhar peso, ou baixar músculo/massa magra, não tem teto na doutrina — não
// se verifica (não se inventa um).

import { MAX_WEIGHT_LOSS_PCT_WEEK } from "./weightLossRate.ts";
import { getTaperDays } from "./taper.ts";
import { isPrincipalRace } from "./mainRace.ts";

export const MUSCLE_GAIN_MAX_KG_MONTH: Record<string, { M: number; F: number }> = {
  iniciante: { M: 1.5, F: 0.75 },
  basico: { M: 1.0, F: 0.5 },
  medio: { M: 0.5, F: 0.25 },
  avancado: { M: 0.25, F: 0.1 },
};
const DEFAULT_LOSS_PCT = 0.7;
const WEEKS_PER_MONTH = 52 / 12;

/** Dias sem défice antes do início do taper de uma prova A (Bloco 6 #1). */
export const DEFICIT_STOP_DAYS_BEFORE_TAPER = 28;
/** Um horizonte mais curto do que isto não é um objetivo, é uma semana. */
export const MIN_HORIZON_DAYS = 14;
/** Dois anos: mais do que isto já não é um objetivo, é uma intenção. */
export const MAX_HORIZON_DAYS = 730;

export interface HorizonRace {
  name?: string | null;
  date: string;
  distance_km?: number | string | null;
  race_priority?: string | null;
  race_type?: string | null;
  experience_level?: string | null;
}

export interface BodyNow {
  weight_kg?: number | string | null;
  body_fat_pct?: number | string | null;
  muscle_mass_kg?: number | string | null;
  lean_body_mass_kg?: number | string | null;
}

export interface BodyGoals {
  goal_weight_kg?: number | string | null;
  goal_body_fat_pct?: number | string | null;
  goal_muscle_mass_kg?: number | string | null;
  goal_lean_body_mass_kg?: number | string | null;
}

export type HorizonGoalKey = "goal_weight_kg" | "goal_body_fat_pct" | "goal_muscle_mass_kg" | "goal_lean_body_mass_kg";

export interface HorizonCheck {
  goal: HorizonGoalKey;
  label: string;
  /** perder (peso, massa gorda) ou ganhar (músculo, massa magra). */
  direction: "perder" | "ganhar";
  /** kg a perder ou a ganhar (na massa gorda, kg de gordura). */
  amountKg: number;
  /** Semanas em que o ritmo se conta: nas perdas, só as de défice. */
  weeks: number;
  perWeekKg: number;
  limitPerWeekKg: number;
  /** Nas perdas, o mesmo em % do peso atual — é assim que a doutrina fala. */
  pctPerWeek: number | null;
  limitPct: number | null;
  ok: boolean;
}

export interface NoDeficitWindow {
  race: string | null;
  raceDate: string;
  /** Primeiro dia sem défice (28 dias antes do início do taper). */
  from: string;
  /** O dia da prova. */
  to: string;
}

export interface HorizonResult {
  targetDate: string;
  /** Dias de hoje até à data-alvo. */
  days: number;
  weeks: number;
  /** Semanas fora das janelas sem défice — as que contam para perder. */
  deficitWeeks: number;
  /** Janelas sem défice que caem dentro do horizonte. */
  windows: NoDeficitWindow[];
  checks: HorizonCheck[];
  /** Objetivos sem medição atual para comparar (não se verificam). */
  unchecked: HorizonGoalKey[];
  /** Fora de [MIN_HORIZON_DAYS, MAX_HORIZON_DAYS]. */
  outOfRange: boolean;
  ok: boolean;
}

const LABELS: Record<HorizonGoalKey, string> = {
  goal_weight_kg: "peso",
  goal_body_fat_pct: "massa gorda",
  goal_muscle_mass_kg: "massa muscular",
  goal_lean_body_mass_kg: "massa magra",
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const DAY_MS = 86400000;
const toMs = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
export const addDaysISO = (iso: string, days: number): string =>
  new Date(toMs(iso) + days * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (fromISO: string, toISO: string): number =>
  Math.round((toMs(toISO) - toMs(fromISO)) / DAY_MS);

const round2 = (n: number) => Math.round(n * 100) / 100;

/** As janelas sem défice das provas A entre hoje e a data-alvo. Uma prova
 *  já passada não conta; uma janela que começa antes de hoje começa hoje; uma
 *  janela inteira dentro de outra não acrescenta nada e sai (duas provas A
 *  seguidas mostravam-se como duas janelas sobrepostas). */
export function noDeficitWindows(today: string, targetDate: string, races: HorizonRace[] | null | undefined, level: string | null | undefined): NoDeficitWindow[] {
  const all = (races || [])
    .filter((r) => r?.date && isPrincipalRace(r) && r.date.slice(0, 10) > today)
    .map((r) => {
      const raceDate = r.date.slice(0, 10);
      const taper = getTaperDays(num(r.distance_km), "a", r.experience_level || level || "iniciante", r.race_type || "estrada");
      const from = addDaysISO(raceDate, -(taper + DEFICIT_STOP_DAYS_BEFORE_TAPER));
      return { race: r.name ?? null, raceDate, from: from < today ? today : from, to: raceDate };
    })
    .filter((w) => w.from <= targetDate)
    .sort((a, b) => a.from.localeCompare(b.from) || b.to.localeCompare(a.to));
  return all.filter((w, i) => !all.some((o, j) => j < i && o.from <= w.from && o.to >= w.to));
}

/** Dias de hoje (exclusive) até à data-alvo (inclusive) fora das janelas. */
function deficitDays(today: string, targetDate: string, windows: NoDeficitWindow[]): number {
  let total = daysBetween(today, targetDate);
  let coveredUntil = today; // último dia já descontado
  for (const w of windows) {
    const from = w.from > coveredUntil ? w.from : addDaysISO(coveredUntil, 1);
    const to = w.to < targetDate ? w.to : targetDate;
    if (to >= from) {
      total -= daysBetween(from, to) + 1;
      coveredUntil = to;
    }
  }
  return Math.max(0, total);
}

export interface HorizonInput {
  today: string;
  targetDate: string;
  now: BodyNow | null | undefined;
  goals: BodyGoals;
  level?: string | null;
  gender?: string | null;
  races?: HorizonRace[] | null;
}

export function evaluateGoalHorizon(input: HorizonInput): HorizonResult {
  const { today, targetDate, now, goals, level, gender, races } = input;
  const days = daysBetween(today, targetDate);
  const outOfRange = days < MIN_HORIZON_DAYS || days > MAX_HORIZON_DAYS;
  const windows = noDeficitWindows(today, targetDate, races, level);
  const deficitWeeks = deficitDays(today, targetDate, windows) / 7;
  const weeks = Math.max(0, days) / 7;

  const lossPct = MAX_WEIGHT_LOSS_PCT_WEEK[level as keyof typeof MAX_WEIGHT_LOSS_PCT_WEEK] ?? DEFAULT_LOSS_PCT;
  const sex = String(gender || "").toUpperCase().startsWith("F") ? "F" : "M";
  const gainMonth = (MUSCLE_GAIN_MAX_KG_MONTH[level as string] ?? MUSCLE_GAIN_MAX_KG_MONTH.iniciante)[sex];
  const gainWeek = gainMonth / WEEKS_PER_MONTH;

  const weight = num(now?.weight_kg);
  const checks: HorizonCheck[] = [];
  const unchecked: HorizonGoalKey[] = [];

  const loss = (goal: HorizonGoalKey, amountKg: number) => {
    const limitPerWeekKg = (weight! * lossPct) / 100;
    const perWeekKg = deficitWeeks > 0 ? amountKg / deficitWeeks : Infinity;
    checks.push({
      goal, label: LABELS[goal], direction: "perder", amountKg: round2(amountKg), weeks: round2(deficitWeeks),
      perWeekKg: round2(perWeekKg), limitPerWeekKg: round2(limitPerWeekKg),
      pctPerWeek: Number.isFinite(perWeekKg) ? round2((perWeekKg / weight!) * 100) : null, limitPct: lossPct,
      ok: perWeekKg <= limitPerWeekKg + 1e-9,
    });
  };
  const gain = (goal: HorizonGoalKey, amountKg: number) => {
    const perWeekKg = weeks > 0 ? amountKg / weeks : Infinity;
    checks.push({
      goal, label: LABELS[goal], direction: "ganhar", amountKg: round2(amountKg), weeks: round2(weeks),
      perWeekKg: round2(perWeekKg), limitPerWeekKg: round2(gainWeek), pctPerWeek: null, limitPct: null,
      ok: perWeekKg <= gainWeek + 1e-9,
    });
  };

  // Peso: só a descida tem teto.
  const goalWeight = num(goals.goal_weight_kg);
  if (goalWeight !== null) {
    if (weight === null) unchecked.push("goal_weight_kg");
    else if (goalWeight < weight) loss("goal_weight_kg", weight - goalWeight);
  }

  // Massa gorda: os kg de gordura a perder. Com peso-alvo, a gordura no
  // fim é a desse peso; sem ele, a massa magra fica como está.
  const goalBf = num(goals.goal_body_fat_pct);
  const bf = num(now?.body_fat_pct);
  if (goalBf !== null) {
    if (weight === null || bf === null) unchecked.push("goal_body_fat_pct");
    else if (goalBf < bf && goalBf < 100) {
      const endWeight = goalWeight ?? (weight * (1 - bf / 100)) / (1 - goalBf / 100);
      const fatLoss = (weight * bf) / 100 - (endWeight * goalBf) / 100;
      if (fatLoss > 0) loss("goal_body_fat_pct", fatLoss);
    }
  }

  // Músculo e massa magra: só a subida tem teto.
  for (const [goal, cur] of [["goal_muscle_mass_kg", now?.muscle_mass_kg], ["goal_lean_body_mass_kg", now?.lean_body_mass_kg]] as const) {
    const target = num(goals[goal]);
    if (target === null) continue;
    const current = num(cur);
    if (current === null) unchecked.push(goal);
    else if (target > current) gain(goal, target - current);
  }

  return {
    targetDate, days, weeks: round2(weeks), deficitWeeks: round2(deficitWeeks), windows, checks, unchecked, outOfRange,
    ok: !outOfRange && checks.every((c) => c.ok),
  };
}

/** A data mais cedo, a partir de hoje + MIN_HORIZON_DAYS, em que todos os
 *  ritmos ficam dentro do limite — o que a Carol propõe em vez de uma data
 *  recusada. null se nem a dois anos chega. */
export function earliestFeasibleDate(input: Omit<HorizonInput, "targetDate">): string | null {
  for (let d = MIN_HORIZON_DAYS; d <= MAX_HORIZON_DAYS; d++) {
    const targetDate = addDaysISO(input.today, d);
    if (evaluateGoalHorizon({ ...input, targetDate }).ok) return targetDate;
  }
  return null;
}
