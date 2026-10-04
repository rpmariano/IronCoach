// Nutrição por PERÍODO de calendário (fase 4 da Evolução, 2026-10-04).
//
// @contexto specs/evolucao-2026-10/plano.md §3 "Nutrição — implementar o
// mock-up" e erros N1, N2, N3, N5, N6, N7 de erros-verificados.md.
//
// Funções NOVAS, ao lado das que a Carol já usa (computeMacroAdherence,
// computeEnergyAvailabilityWindow, computeNutrientRangeTotals…) — essas não
// mudam de comportamento. Aqui vive a régua dos separadores de período:
//   - só os dias que o chamador passa (os dias FECHADOS do período — hoje
//     nunca entra, R2/N1); a lista de dias vem de calendarPeriod.ts;
//   - o objetivo de CADA dia (histórico de objetivos, F3/N5) — o chamador dá
//     `goalsFor(dia)`, o resolvedor de src/utils/goalHistory.js;
//   - UMA só régua de estado (N7): 90–115% do objetivo é "dentro"; proteína e
//     água não têm teto (passar do objetivo não é falhar). É a mesma régua da
//     vista Dia (goalHistory.js statusFor) e de nutritionCompliance.ts (90 /
//     115); antes havia três (85/115 no veredicto, 80 nos hidratos, a régua
//     calórica também na proteína dos KPIs).
//
// Puro (sem datas do relógio, sem store): o ecrã e, um dia, a Carol podem ler
// os mesmos números.

import { computeMealNutrients, type MealLike } from "./mealNutrients.ts";
import {
  computeEnergyAvailability,
  EA_CRITICAL,
  type EnergyAvailabilityStatus,
} from "./energyAvailability.ts";
import { RUNNING_COST_KCAL_PER_KG_KM } from "./tdee.ts";
import {
  CALORIE_COMPLIANCE_OK_MIN,
  CALORIE_COMPLIANCE_OVER_MIN,
} from "./nutritionCompliance.ts";

// ---------------------------------------------------------------------------
// Chaves, objetivos e a régua única
// ---------------------------------------------------------------------------

export type NutritionKey = "calories" | "protein" | "carbs" | "fat" | "water";
export type MacroStatus = "ok" | "below" | "above";

/** As cinco linhas do resumo do mock-up, por esta ordem. */
export const NUTRITION_KEYS: NutritionKey[] = ["calories", "protein", "carbs", "fat", "water"];

/** Coluna do objetivo de cada chave (profile / profile_goal_history). */
export const GOAL_KEY: Record<NutritionKey, keyof NutritionGoals> = {
  calories: "calorie_goal",
  protein: "protein_goal",
  carbs: "carbs_goal",
  fat: "fat_goal",
  water: "water_goal_ml",
};

/** Proteína e água não têm teto — passar do objetivo não é falhar (N7). */
export const NO_CEILING_KEYS: ReadonlySet<NutritionKey> = new Set<NutritionKey>(["protein", "water"]);

export interface NutritionGoals {
  calorie_goal: number;
  protein_goal: number;
  carbs_goal: number;
  fat_goal: number;
  water_goal_ml: number;
}

export interface DayGoals {
  goals: NutritionGoals;
  /** O dia é anterior ao histórico de objetivos (3 out 2026): aproximado. */
  estimated: boolean;
}

export interface MacroClass {
  /** % exata do objetivo (null sem objetivo ou sem valor). */
  pct: number | null;
  /** % inteira para mostrar, sempre coerente com o estado (ver abaixo). */
  pctLabel: number | null;
  status: MacroStatus | null;
}

/**
 * Estado de um valor contra o objetivo — a régua única (N7, 2026-10-04).
 *   proteína/água: ≥ 90% "ok", abaixo "below" (sem teto);
 *   calorias/hidratos/gordura: 90–115% "ok", > 115% "above", < 90% "below".
 * Os limites são os de nutritionCompliance.ts (90 e "mais de 115"), sobre a %
 * EXATA — como a vista Dia (goalHistory.js), para o mesmo dia nunca ter dois
 * estados. `pctLabel` arredonda sem contradizer a palavra: 89,6% fica "89%"
 * (Abaixo) e 115,3% fica "116%" (Acima), em vez de "Abaixo · 90%".
 * Sem objetivo (≤ 0) ou sem valor: sem estado.
 */
export function classifyMacroDay(
  key: NutritionKey,
  value: number | null | undefined,
  target: number | null | undefined,
): MacroClass {
  const v = Number(value);
  const t = Number(target);
  if (value == null || !Number.isFinite(v) || !(t > 0)) return { pct: null, pctLabel: null, status: null };
  // (v × 100) / t e não (v / t) × 100: 2160/2400 dá 90 certo, não 90,000…01.
  const pct = (v * 100) / t;
  let status: MacroStatus;
  if (NO_CEILING_KEYS.has(key)) status = pct >= CALORIE_COMPLIANCE_OK_MIN ? "ok" : "below";
  else if (pct > CALORIE_COMPLIANCE_OVER_MIN) status = "above";
  else if (pct >= CALORIE_COMPLIANCE_OK_MIN) status = "ok";
  else status = "below";
  let pctLabel = Math.round(pct);
  if (status === "below") pctLabel = Math.min(pctLabel, CALORIE_COMPLIANCE_OK_MIN - 1);
  if (status === "above") pctLabel = Math.max(pctLabel, CALORIE_COMPLIANCE_OVER_MIN + 1);
  return { pct, pctLabel, status };
}

// ---------------------------------------------------------------------------
// Linhas diárias
// ---------------------------------------------------------------------------

export interface MealForPeriod extends MealLike {
  date: string;
}
export interface WaterLogForPeriod {
  date: string;
  amount_ml?: number | null;
}

export interface DailyNutritionRow {
  date: string;
  /** Há refeições registadas nesse dia. */
  hasMeals: boolean;
  /** Há registos de água nesse dia. */
  hasWater: boolean;
  /** kcal / g / ml do dia, arredondados como na vista Dia; null sem registo. */
  values: Record<NutritionKey, number | null>;
  goals: NutritionGoals;
  estimated: boolean;
  status: Record<NutritionKey, MacroClass>;
}

const NO_CLASS: MacroClass = { pct: null, pctLabel: null, status: null };

/**
 * Uma linha por dia de `days` (normalmente closedDaysOf(...) — só dias
 * fechados): o comido e bebido nesse dia contra o objetivo DESSE dia
 * (`goalsFor`, F3/N5). Um dia sem refeições tem os macros a null (não 0 —
 * "não sei o que comeste" não é "comeste zero", N3); sem registos de água, a
 * água a null.
 */
export function dailyNutritionRows({
  meals,
  waterLogs,
  days,
  goalsFor,
}: {
  meals: MealForPeriod[] | null | undefined;
  waterLogs: WaterLogForPeriod[] | null | undefined;
  days: string[];
  goalsFor: (dayISO: string) => DayGoals;
}): DailyNutritionRow[] {
  const wanted = new Set(days);
  const food = new Map<string, { calories: number; protein: number; carbs: number; fat: number }>();
  for (const m of meals || []) {
    const d = typeof m?.date === "string" ? m.date.slice(0, 10) : null;
    if (!d || !wanted.has(d)) continue;
    const n = computeMealNutrients(m);
    const acc = food.get(d) || { calories: 0, protein: 0, carbs: 0, fat: 0 };
    acc.calories += n.calories;
    acc.protein += n.protein;
    acc.carbs += n.carbs;
    acc.fat += n.fat;
    food.set(d, acc);
  }
  const water = new Map<string, number>();
  for (const w of waterLogs || []) {
    const d = typeof w?.date === "string" ? w.date.slice(0, 10) : null;
    if (!d || !wanted.has(d)) continue;
    water.set(d, (water.get(d) || 0) + (Number(w.amount_ml) || 0));
  }

  return days.map((date) => {
    const { goals, estimated } = goalsFor(date);
    const f = food.get(date);
    const w = water.get(date);
    const values: Record<NutritionKey, number | null> = {
      calories: f ? Math.round(f.calories) : null,
      protein: f ? Math.round(f.protein) : null,
      carbs: f ? Math.round(f.carbs) : null,
      fat: f ? Math.round(f.fat) : null,
      water: w != null ? Math.round(w) : null,
    };
    const status = {} as Record<NutritionKey, MacroClass>;
    for (const k of NUTRITION_KEYS) {
      status[k] = values[k] == null ? NO_CLASS : classifyMacroDay(k, values[k], goals[GOAL_KEY[k]]);
    }
    return { date, hasMeals: !!f, hasWater: w != null, values, goals, estimated, status };
  });
}

/** O dia tem registo para esta chave (refeições para os macros, água para a água). */
export function hasRecord(row: DailyNutritionRow, key: NutritionKey): boolean {
  return key === "water" ? row.hasWater : row.hasMeals;
}

// ---------------------------------------------------------------------------
// Resumo do período (as 5 linhas do mock-up)
// ---------------------------------------------------------------------------

export interface MacroSummary {
  key: NutritionKey;
  /** Média por dia registado (null sem dias, ou água abaixo do mínimo). */
  avg: number | null;
  /** Dias com registo desta chave. */
  nDays: number;
  /** Média dos objetivos desses dias (o objetivo de cada dia, F3). */
  goal: number | null;
  pct: number | null;
  pctLabel: number | null;
  status: MacroStatus | null;
  daysInGoal: number;
  daysBelow: number;
  daysAbove: number;
  /** Água com menos de `minWaterDays` dias: "2 dias, poucos para média". */
  tooFew: boolean;
}

export interface NutritionPeriodSummary {
  /** Dias com refeições (o denominador do "Média por dia registado"). */
  nDays: number;
  waterDays: number;
  byKey: Record<NutritionKey, MacroSummary>;
  /** Calorias E proteína no objetivo no mesmo dia: "em k de n dias". */
  both: { k: number; n: number };
  /** Algum dia com registo tem objetivos aproximados (anterior a 3 out). */
  approxGoals: boolean;
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/**
 * Médias por dia REGISTADO (R3) contra o objetivo de cada dia, estado com a
 * régua única e "dias no objetivo X de N" (R4). A água só tem média a partir
 * de `minWaterDays` dias com registo (R6).
 */
export function summarizeNutritionPeriod(
  rows: DailyNutritionRow[],
  { minWaterDays = 3 }: { minWaterDays?: number } = {},
): NutritionPeriodSummary {
  const byKey = {} as Record<NutritionKey, MacroSummary>;
  for (const key of NUTRITION_KEYS) {
    const withRec = rows.filter((r) => hasRecord(r, key) && r.values[key] != null);
    const nDays = withRec.length;
    const tooFew = key === "water" && nDays > 0 && nDays < minWaterDays;
    const avgRaw = mean(withRec.map((r) => r.values[key] as number));
    const goalRaw = mean(withRec.map((r) => Number(r.goals[GOAL_KEY[key]]) || 0));
    const avg = tooFew ? null : avgRaw;
    const goal = goalRaw != null && goalRaw > 0 ? goalRaw : null;
    const cls = avg == null ? NO_CLASS : classifyMacroDay(key, avg, goal);
    byKey[key] = {
      key,
      avg,
      nDays,
      goal,
      pct: cls.pct,
      pctLabel: cls.pctLabel,
      status: cls.status,
      daysInGoal: withRec.filter((r) => r.status[key].status === "ok").length,
      daysBelow: withRec.filter((r) => r.status[key].status === "below").length,
      daysAbove: withRec.filter((r) => r.status[key].status === "above").length,
      tooFew,
    };
  }
  const mealDays = rows.filter((r) => r.hasMeals);
  const both = {
    k: mealDays.filter((r) => r.status.calories.status === "ok" && r.status.protein.status === "ok").length,
    n: mealDays.length,
  };
  return {
    nDays: mealDays.length,
    waterDays: rows.filter((r) => r.hasWater).length,
    byKey,
    both,
    approxGoals: rows.some((r) => r.estimated && (r.hasMeals || r.hasWater)),
  };
}

// ---------------------------------------------------------------------------
// Dias de treino
// ---------------------------------------------------------------------------

export interface RunForPeriod {
  date: string;
  distance_km?: number | null;
}
export interface GymSessionForPeriod {
  date: string;
  kind?: string | null;
  calories_kcal?: number | null;
}

export interface DayTraining {
  runs: number;
  runKm: number;
  /** Sessões de ginásio (força). */
  gym: number;
  /** Aulas (kind 'aula'). */
  classes: number;
}

/** O treino de cada dia de `days` que teve alguma corrida ou sessão de ginásio. */
export function trainingByDay(
  { runs, gymSessions }: { runs?: RunForPeriod[] | null; gymSessions?: GymSessionForPeriod[] | null },
  days: string[],
): Map<string, DayTraining> {
  const wanted = new Set(days);
  const out = new Map<string, DayTraining>();
  const get = (d: string) => {
    let t = out.get(d);
    if (!t) {
      t = { runs: 0, runKm: 0, gym: 0, classes: 0 };
      out.set(d, t);
    }
    return t;
  };
  for (const r of runs || []) {
    const d = typeof r?.date === "string" ? r.date.slice(0, 10) : null;
    if (!d || !wanted.has(d)) continue;
    const t = get(d);
    t.runs += 1;
    t.runKm += Number(r.distance_km) || 0;
  }
  for (const s of gymSessions || []) {
    const d = typeof s?.date === "string" ? s.date.slice(0, 10) : null;
    if (!d || !wanted.has(d)) continue;
    const t = get(d);
    if (s.kind === "aula") t.classes += 1;
    else t.gym += 1;
  }
  return out;
}

/** Os dias de `days` com algum treino (corrida ou ginásio). */
export function trainingDaySet(
  input: { runs?: RunForPeriod[] | null; gymSessions?: GymSessionForPeriod[] | null },
  days: string[],
): Set<string> {
  return new Set(trainingByDay(input, days).keys());
}

// ---------------------------------------------------------------------------
// Comer para treinar
// ---------------------------------------------------------------------------

/** "Comeste menos nos dias de treino" só com uma diferença que se note. */
export const LESS_ON_TRAINING_MIN_KCAL = 50;
/** …e com pelo menos isto de dias em cada lado. */
export const LESS_ON_TRAINING_MIN_DAYS = 2;

export interface EatingForTraining {
  /** Há dias fechados que cheguem (`minClosed`). */
  enough: boolean;
  closedDays: number;
  minClosed: number;
  withTraining: { nDays: number; avgKcal: number | null; belowDays: string[] };
  withoutTraining: { nDays: number; avgKcal: number | null };
  /** Média dos objetivos de calorias dos dias com refeições. */
  goalKcal: number | null;
  /** Comeu menos nos dias de treino do que nos de descanso. */
  lessOnTraining: boolean;
}

/**
 * kcal/dia com e sem treino, só em dias fechados COM refeições (um dia de
 * treino sem refeições não é um dia em que se comeu 0, N4). `rows` são os dias
 * fechados do período (com e sem refeições): `enough` = rows.length ≥
 * minClosed (o mock-up: 7 no mês, 14 no trimestre). `belowDays` são os dias de
 * treino com as calorias abaixo do objetivo desse dia.
 */
export function eatingForTraining(
  rows: DailyNutritionRow[],
  trainingDays: Set<string>,
  { minClosed = 0 }: { minClosed?: number } = {},
): EatingForTraining {
  const meals = rows.filter((r) => r.hasMeals && r.values.calories != null);
  const withT = meals.filter((r) => trainingDays.has(r.date));
  const withoutT = meals.filter((r) => !trainingDays.has(r.date));
  const kcal = (xs: DailyNutritionRow[]) => mean(xs.map((r) => r.values.calories as number));
  const goal = mean(meals.map((r) => Number(r.goals.calorie_goal) || 0));
  const a = kcal(withT);
  const b = kcal(withoutT);
  return {
    enough: rows.length >= minClosed,
    closedDays: rows.length,
    minClosed,
    withTraining: {
      nDays: withT.length,
      avgKcal: a,
      belowDays: withT.filter((r) => r.status.calories.status === "below").map((r) => r.date),
    },
    withoutTraining: { nDays: withoutT.length, avgKcal: b },
    goalKcal: goal != null && goal > 0 ? goal : null,
    lessOnTraining: a != null && b != null
      && withT.length >= LESS_ON_TRAINING_MIN_DAYS && withoutT.length >= LESS_ON_TRAINING_MIN_DAYS
      && b - a >= LESS_ON_TRAINING_MIN_KCAL,
  };
}

// ---------------------------------------------------------------------------
// Disponibilidade energética por dia (só dias fechados COM refeições)
// ---------------------------------------------------------------------------

export interface BodyAssessmentForPeriod {
  date: string;
  weight_kg?: number | null;
  lean_body_mass_kg?: number | null;
  body_fat_pct?: number | null;
}

export type LeanMassSource = "medida" | "estimada" | "omissao";

export interface LeanMassAsOf {
  leanMass: number;
  source: LeanMassSource;
  /** Data da avaliação usada (null sem avaliação). */
  assessmentDate: string | null;
  /** Peso usado no gasto da corrida (null = 70 kg por omissão). */
  weightKg: number | null;
}

// Os mesmos valores de recurso de energyAvailabilityWindow.ts (55 kg de massa
// magra, 20% de gordura, 70 kg de peso, 200 kcal por sessão de ginásio sem
// calorias) — cópia de propósito: aquele ficheiro é da Carol e não se mexe.
const LEAN_MASS_FALLBACK_KG = 55;
const FAT_PCT_FALLBACK = 20;
const WEIGHT_FALLBACK_KG = 70;
const GYM_SESSION_FALLBACK_KCAL = 200;

/**
 * A massa magra que vale para um período: a avaliação mais recente até
 * `asOfISO` (o último dia do período); se só há avaliações depois, a primeira
 * delas (a mais próxima que se conhece). Mesma escada da Carol: massa magra
 * medida → peso × (1 − gordura) → peso × 0,8 → 55 kg, com a origem à vista
 * (o ecrã diz "estimada"/"por omissão" em vez de a apresentar como medida).
 */
export function leanMassAsOf(
  bodyAssessments: BodyAssessmentForPeriod[] | null | undefined,
  asOfISO: string | null,
): LeanMassAsOf {
  const list = (bodyAssessments || [])
    .filter((a) => a && typeof a.date === "string")
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  let pick: BodyAssessmentForPeriod | undefined;
  if (asOfISO) {
    for (const a of list) {
      if (a.date.slice(0, 10) <= asOfISO) pick = a;
      else break;
    }
  }
  if (!pick) pick = asOfISO ? list[0] : list[list.length - 1];
  const weight = pick?.weight_kg && pick.weight_kg > 0 ? pick.weight_kg : null;
  const date = pick ? pick.date.slice(0, 10) : null;
  if (pick?.lean_body_mass_kg && pick.lean_body_mass_kg > 0) {
    return { leanMass: pick.lean_body_mass_kg, source: "medida", assessmentDate: date, weightKg: weight };
  }
  if (weight && pick?.body_fat_pct != null) {
    return { leanMass: weight * (1 - pick.body_fat_pct / 100), source: "estimada", assessmentDate: date, weightKg: weight };
  }
  if (weight) {
    return { leanMass: weight * (1 - FAT_PCT_FALLBACK / 100), source: "omissao", assessmentDate: date, weightKg: weight };
  }
  return { leanMass: LEAN_MASS_FALLBACK_KG, source: "omissao", assessmentDate: date, weightKg: null };
}

export interface DayEnergyAvailability {
  date: string;
  ea: number;
  status: EnergyAvailabilityStatus;
  intake: number;
  exercise: number;
  training: boolean;
}

export interface PeriodEnergyAvailability {
  /** Só dias com refeições, por ordem. */
  daily: DayEnergyAvailability[];
  nDays: number;
  /** Média de `daily` (null sem dias). */
  average: number | null;
  /** Dias de treino com EA abaixo de 30 (risco de RED-S nesse dia). */
  lowTrainingDays: { date: string; ea: number }[];
  /** Dias de treino SEM refeições — ficam de fora, contados à parte. */
  trainingDaysWithoutMeals: number;
  leanMass: number;
  leanMassSource: LeanMassSource;
  leanMassDate: string | null;
  /** O gasto da corrida usou 70 kg por omissão (sem peso registado). */
  weightFallback: boolean;
}

/**
 * EA = (kcal comidas − kcal de treino) / massa magra, dia a dia, com a fórmula
 * de energyAvailability.ts — só nos dias de `days` (os fechados) que têm
 * refeições (N4: um dia de treino sem refeições não é EA negativa). O gasto:
 * corrida = km × peso × 1 kcal/kg/km (tdee.ts); ginásio = calorias da sessão
 * ou 200 kcal — como a Carol.
 */
export function energyAvailabilityForDays({
  meals,
  runs,
  gymSessions,
  bodyAssessments,
  days,
}: {
  meals: MealForPeriod[] | null | undefined;
  runs?: RunForPeriod[] | null;
  gymSessions?: GymSessionForPeriod[] | null;
  bodyAssessments?: BodyAssessmentForPeriod[] | null;
  days: string[];
}): PeriodEnergyAvailability {
  const sorted = [...days].sort();
  const lm = leanMassAsOf(bodyAssessments, sorted.length ? sorted[sorted.length - 1] : null);
  const weight = lm.weightKg ?? WEIGHT_FALLBACK_KG;
  const wanted = new Set(sorted);

  const intake = new Map<string, number>();
  for (const m of meals || []) {
    const d = typeof m?.date === "string" ? m.date.slice(0, 10) : null;
    if (!d || !wanted.has(d)) continue;
    intake.set(d, (intake.get(d) || 0) + computeMealNutrients(m).calories);
  }
  const exercise = new Map<string, number>();
  const trained = new Set<string>();
  for (const r of runs || []) {
    const d = typeof r?.date === "string" ? r.date.slice(0, 10) : null;
    if (!d || !wanted.has(d)) continue;
    trained.add(d);
    exercise.set(d, (exercise.get(d) || 0) + (Number(r.distance_km) || 0) * weight * RUNNING_COST_KCAL_PER_KG_KM);
  }
  for (const s of gymSessions || []) {
    const d = typeof s?.date === "string" ? s.date.slice(0, 10) : null;
    if (!d || !wanted.has(d)) continue;
    trained.add(d);
    exercise.set(d, (exercise.get(d) || 0) + (Number(s.calories_kcal) || GYM_SESSION_FALLBACK_KCAL));
  }

  const daily: DayEnergyAvailability[] = [];
  for (const d of sorted) {
    if (!intake.has(d)) continue;
    const ex = exercise.get(d) || 0;
    const res = computeEnergyAvailability(intake.get(d) as number, ex, lm.leanMass);
    if (!res) continue;
    daily.push({
      date: d,
      ea: Math.round(res.ea * 10) / 10,
      status: res.status,
      intake: Math.round(intake.get(d) as number),
      exercise: Math.round(ex),
      training: trained.has(d),
    });
  }
  const avg = mean(daily.map((x) => x.ea));
  return {
    daily,
    nDays: daily.length,
    average: avg == null ? null : Math.round(avg * 10) / 10,
    lowTrainingDays: daily.filter((x) => x.training && x.ea < EA_CRITICAL).map((x) => ({ date: x.date, ea: x.ea })),
    trainingDaysWithoutMeals: [...trained].filter((d) => !intake.has(d)).length,
    leanMass: Math.round(lm.leanMass * 10) / 10,
    leanMassSource: lm.source,
    leanMassDate: lm.assessmentDate,
    weightFallback: lm.weightKg == null,
  };
}

// ---------------------------------------------------------------------------
// Micronutrientes — média por dia (N2)
// ---------------------------------------------------------------------------

export type MicroKey = "fiber" | "sugar" | "sodium" | "iron_mg" | "calcium_mg" | "vitamin_c_mg" | "potassium_mg";
export const MICRO_KEYS: MicroKey[] = ["fiber", "sugar", "sodium", "iron_mg", "calcium_mg", "vitamin_c_mg", "potassium_mg"];

/**
 * Média POR DIA com refeições dos micronutrientes, nos dias de `days` (N2:
 * antes era a SOMA do mês civil em qualquer período, com a chave interna
 * "· 6meses" no título). São mínimos: hoje a análise grava 0 quando o alimento
 * não traz o valor (D6), por isso um 0 conta como zero.
 */
export function micronutrientAverages(
  meals: MealForPeriod[] | null | undefined,
  days: string[],
): { nDays: number; avg: Record<MicroKey, number> | null } {
  const wanted = new Set(days);
  const totals = Object.fromEntries(MICRO_KEYS.map((k) => [k, 0])) as Record<MicroKey, number>;
  const seen = new Set<string>();
  for (const m of meals || []) {
    const d = typeof m?.date === "string" ? m.date.slice(0, 10) : null;
    if (!d || !wanted.has(d)) continue;
    seen.add(d);
    const n = computeMealNutrients(m);
    for (const k of MICRO_KEYS) totals[k] += Number(n[k]) || 0;
  }
  if (seen.size === 0) return { nDays: 0, avg: null };
  const avg = Object.fromEntries(MICRO_KEYS.map((k) => [k, totals[k] / seen.size])) as Record<MicroKey, number>;
  return { nDays: seen.size, avg };
}
