// Dias com o registo de refeições completo ou parcial — inferido, sem botão.
//
// @contexto Nutrição, opção B do Rui (2026-11-01): o botão «dia incompleto»
// (tabela nutrition_incomplete_days) sai e passa a haver inferência
// automática. Há atletas que registam tudo e outros que registam de vez em
// quando, mais focados no exercício: as médias têm de ser honestas (um dia
// com só o pequeno-almoço não é um dia em que se comeu 400 kcal), a Carol
// coerente com o ecrã, e o atleta ocasional deixado em paz.
//
// Duas funções, usadas pelo cliente e pelo servidor (@formulas):
//   · mealLoggingProfile — como este atleta regista, pelos últimos 28 dias
//     fechados: 'completo' ou 'ocasional', e a mediana de kcal dos dias cheios;
//   · dayCompleteness — um dia fechado é 'completo' ou 'parcial' (hoje é
//     sempre 'em_curso').
// Puro: sem relógio (o chamador dá `todayISO`), sem store.

import { computeMealNutrients, type MealLike } from "./mealNutrients.ts";

export interface MealForCompleteness extends MealLike {
  date: string;
  meal_type?: string | null;
}

export type DayCompleteness = "completo" | "parcial" | "em_curso";
export type MealLoggingKind = "completo" | "ocasional";

/** As três refeições principais (meals.meal_type). Os lanches e a ceia não contam. */
export const MAIN_MEAL_TYPES = ["pequeno-almoco", "almoco", "jantar"] as const;

/** Os dias fechados que dizem como o atleta regista: hoje−28 .. ontem. */
export const MEAL_PROFILE_DAYS = 28;

/** Um dia «cheio»: as 3 refeições principais registadas. A mediana de kcal
 *  destes dias é a régua do que este atleta come num dia registado por inteiro. */
export const FULL_DAY_MIN_MAIN_MEALS = 3;

/** Perfil 'completo': pelo menos 70% dos dias (desde o primeiro registo na
 *  janela até ontem) têm o registo completo (dayCompleteness). Abaixo,
 *  'ocasional'. Conta-se o dia COMPLETO e não o dia «cheio» (as 3 principais):
 *  com os cheios, o Rui — que regista quase todos os dias mas às vezes salta o
 *  pequeno-almoço — dava 16 de 28 (57%), ocasional; com os completos dá 21 de
 *  28 (75%). Os dias cheios servem para a mediana. */
export const COMPLETE_PROFILE_MIN_FULL_SHARE = 0.7;

/** Dias cheios precisos para a mediana valer; com menos, cai-se na regra fixa. */
export const PROFILE_MIN_FULL_DAYS = 3;

/** Dias de janela (do primeiro registo até ontem) para o perfil ser
 *  histórico a sério (`hasHistory`); com menos é um palpite, à vista. */
export const PROFILE_MIN_SPAN_DAYS = 7;

/** Com mediana, num dia SEM as 3 principais: parcial abaixo de 50% dela… */
export const PARTIAL_VS_MEDIAN_SHARE = 0.5;

/** Sem mediana (regra fixa): parcial com menos de 2 das 3 principais… */
export const FIXED_MIN_MAIN_MEALS = 2;
/** …ou abaixo de 50% do objetivo calórico do dia… */
export const FIXED_MIN_TARGET_SHARE = 0.5;
/** …ou com uma só refeição. */
export const FIXED_MIN_MEALS = 2;

export interface MealLoggingProfile {
  kind: MealLoggingKind;
  /** A janela (do primeiro dia com registo até ontem) tem pelo menos
   *  PROFILE_MIN_SPAN_DAYS dias: o perfil diz alguma coisa. */
  hasHistory: boolean;
  /** Mediana de kcal dos dias cheios; null com menos de PROFILE_MIN_FULL_DAYS. */
  fullDayMedianKcal: number | null;
  /** Dias com as 3 principais (os da mediana). */
  fullDays: number;
  /** Dias com o registo completo (dayCompleteness, com a mediana). */
  completeDays: number;
  /** Dias com alguma refeição. */
  loggedDays: number;
  /** Dias da janela, do primeiro registo até ontem (0 sem registos). */
  spanDays: number;
  /** completeDays / spanDays (null sem registos) — decide o `kind`. */
  completeDaysShare: number | null;
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetweenISO(laterISO: string, earlierISO: string): number {
  return Math.round((Date.parse(laterISO + "T00:00:00Z") - Date.parse(earlierISO + "T00:00:00Z")) / 86400000);
}

/** O primeiro dia de refeições de que o perfil precisa (hoje−28). */
export function mealProfileStartISO(todayISO: string): string {
  return addDaysISO(todayISO, -MEAL_PROFILE_DAYS);
}

interface DayAgg {
  kcal: number;
  meals: number;
  types: Set<string>;
}

/** As refeições por dia: kcal, quantas, e os tipos. */
function byDay(meals: MealForCompleteness[] | null | undefined): Map<string, DayAgg> {
  const out = new Map<string, DayAgg>();
  for (const m of meals || []) {
    const d = typeof m?.date === "string" ? m.date.slice(0, 10) : null;
    if (!d) continue;
    const a = out.get(d) || { kcal: 0, meals: 0, types: new Set<string>() };
    a.kcal += computeMealNutrients(m).calories;
    a.meals += 1;
    if (m.meal_type) a.types.add(m.meal_type);
    out.set(d, a);
  }
  return out;
}

const mainCount = (types: Set<string>): number => MAIN_MEAL_TYPES.filter((t) => types.has(t)).length;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}

/**
 * Como o atleta regista, pelos dias fechados hoje−28 .. ontem (o resto de
 * `meals` é ignorado — pode passar-se uma lista maior). A mediana vem dos
 * dias cheios; o `kind` da fração de dias COMPLETOS (dayCompleteness com essa
 * mediana, ou com a regra fixa e `calorieTarget` sem ela) desde o primeiro
 * registo na janela: 'completo' a partir de 70%, senão 'ocasional' — também
 * sem registo nenhum na janela (não há nada a cobrar).
 */
export function mealLoggingProfile(
  meals: MealForCompleteness[] | null | undefined,
  todayISO: string,
  // Um número, ou o objetivo de cada dia (goalHistory.ts, calorieGoalResolver).
  calorieTarget: number | null | ((dayISO: string) => number | null | undefined) = null,
): MealLoggingProfile {
  const start = mealProfileStartISO(todayISO);
  const yesterday = addDaysISO(todayISO, -1);
  const inWindow = (meals || []).filter((m) => typeof m?.date === "string" && m.date.slice(0, 10) >= start && m.date.slice(0, 10) <= yesterday);
  const days = [...byDay(inWindow).entries()];
  if (!days.length) {
    return {
      kind: "ocasional", hasHistory: false, fullDayMedianKcal: null,
      fullDays: 0, completeDays: 0, loggedDays: 0, spanDays: 0, completeDaysShare: null,
    };
  }
  const first = days.map(([d]) => d).sort()[0];
  const spanDays = daysBetweenISO(yesterday, first) + 1;
  const full = days.filter(([, a]) => mainCount(a.types) >= FULL_DAY_MIN_MAIN_MEALS);
  const fullDayMedianKcal = full.length >= PROFILE_MIN_FULL_DAYS ? Math.round(median(full.map(([, a]) => a.kcal)) as number) : null;
  const states = daysCompleteness(inWindow, days.map(([d]) => d), { calorieTarget, profile: { fullDayMedianKcal }, todayISO });
  const completeDays = [...states.values()].filter((s) => s === "completo").length;
  const share = completeDays / spanDays;
  return {
    kind: share >= COMPLETE_PROFILE_MIN_FULL_SHARE ? "completo" : "ocasional",
    hasHistory: spanDays >= PROFILE_MIN_SPAN_DAYS,
    fullDayMedianKcal,
    fullDays: full.length,
    completeDays,
    loggedDays: days.length,
    spanDays,
    completeDaysShare: Math.round(share * 1000) / 1000,
  };
}

export interface DayCompletenessOptions {
  /** O dia em causa e hoje: um dia que não é anterior a hoje é 'em_curso'. */
  dayISO?: string;
  todayISO?: string;
}

/**
 * Um dia fechado tem o registo completo ou parcial.
 *   Com as 3 principais registadas (pequeno-almoço, almoço e jantar): sempre
 *   completo, por pouco que tenha comido — decisão do Rui (2026-11-01, RED-S):
 *   um dia de treino com as 3 refeições e pouca energia tem de dar o alerta,
 *   não sair da conta como "parcial".
 *   Sem elas, com mediana dos dias cheios (o histórico do atleta): parcial sem
 *   almoço e sem jantar, ou abaixo de 50% da mediana.
 *   Sem elas e sem mediana (regra fixa): parcial com menos de 2 das 3
 *   principais, ou uma só refeição, ou abaixo de 50% do objetivo calórico.
 * Um dia sem refeições é parcial. Com `dayISO`/`todayISO`, hoje (ou depois)
 * é 'em_curso' — nunca se julga um dia que ainda não acabou.
 */
export function dayCompleteness(
  dayMeals: MealForCompleteness[] | null | undefined,
  calorieTarget: number | null | undefined,
  profile: Pick<MealLoggingProfile, "fullDayMedianKcal"> | null | undefined,
  opts: DayCompletenessOptions = {},
): DayCompleteness {
  if (opts.dayISO && opts.todayISO && opts.dayISO.slice(0, 10) >= opts.todayISO.slice(0, 10)) return "em_curso";
  const list = dayMeals || [];
  if (!list.length) return "parcial";
  let kcal = 0;
  const types = new Set<string>();
  for (const m of list) {
    kcal += computeMealNutrients(m).calories;
    if (m?.meal_type) types.add(m.meal_type);
  }
  if (mainCount(types) >= FULL_DAY_MIN_MAIN_MEALS) return "completo";
  const med = profile?.fullDayMedianKcal;
  if (med != null && med > 0) {
    if (!types.has("almoco") && !types.has("jantar")) return "parcial";
    return kcal < PARTIAL_VS_MEDIAN_SHARE * med ? "parcial" : "completo";
  }
  if (mainCount(types) < FIXED_MIN_MAIN_MEALS || list.length < FIXED_MIN_MEALS) return "parcial";
  const target = Number(calorieTarget);
  if (target > 0 && kcal < FIXED_MIN_TARGET_SHARE * target) return "parcial";
  return "completo";
}

/**
 * O estado de cada dia de `days`, de uma vez: as refeições agrupadas por dia
 * e julgadas com o mesmo perfil. `calorieTarget` é um número ou o objetivo de
 * cada dia (o histórico de objetivos do cliente).
 */
export function daysCompleteness(
  meals: MealForCompleteness[] | null | undefined,
  days: string[],
  {
    calorieTarget,
    profile,
    todayISO,
  }: {
    calorieTarget?: number | null | ((dayISO: string) => number | null | undefined);
    profile: Pick<MealLoggingProfile, "fullDayMedianKcal"> | null | undefined;
    todayISO: string;
  },
): Map<string, DayCompleteness> {
  const grouped = new Map<string, MealForCompleteness[]>();
  for (const m of meals || []) {
    const d = typeof m?.date === "string" ? m.date.slice(0, 10) : null;
    if (!d) continue;
    const arr = grouped.get(d) || [];
    arr.push(m);
    grouped.set(d, arr);
  }
  const out = new Map<string, DayCompleteness>();
  for (const day of days) {
    const target = typeof calorieTarget === "function" ? calorieTarget(day) : calorieTarget;
    out.set(day, dayCompleteness(grouped.get(day), target, profile, { dayISO: day, todayISO }));
  }
  return out;
}

/** Só as refeições dos dias com o registo completo, entre `days`. */
export function mealsOfCompleteDays<T extends MealForCompleteness>(
  meals: T[] | null | undefined,
  states: Map<string, DayCompleteness>,
): T[] {
  return (meals || []).filter((m) => typeof m?.date === "string" && states.get(m.date.slice(0, 10)) === "completo");
}
