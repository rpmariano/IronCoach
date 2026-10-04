// Disponibilidade Energética (EA) diária ao longo de uma janela — deteção
// de RED-S. EA = (kcal ingeridas − kcal gasto de exercício) / massa magra.
//
// @contexto Migrado de src/utils/biEngine.js calculateEnergyAvailability
// (specs/formulas-checklist.md Fase E). A fórmula pontual (um dia) já vive
// em energyAvailability.ts (T1) desde a Fase C, com a limitação de doutrina
// documentada aí (massa magra por BIA); este módulo só faz a agregação por
// dia + janela, que continuava só no frontend.

import { computeMealNutrients, type MealLike } from "./mealNutrients.ts";
import { computeEnergyAvailability, type EnergyAvailabilityStatus } from "./energyAvailability.ts";
import { RUNNING_COST_KCAL_PER_KG_KM } from "./tdee.ts";
import { filterByRelativeDateRange } from "./relativeDateRange.ts";

// Sem `calories_kcal` registado numa sessão de ginásio, assume-se este
// custo — mesmo valor de fallback do biEngine.js original.
const GYM_SESSION_FALLBACK_KCAL = 200;
// "Em risco" = pelo menos estes dias 'critical' na janela — mesmo limiar
// de src/utils/biConstants.js EA_CRITICAL_DURATION_DAYS.
const EA_CRITICAL_DURATION_DAYS = 5;

export interface MealForEA extends MealLike {
  date: string;
}
export interface RunForEA {
  date: string;
  distance_km?: number | null;
}
export interface GymSessionForEA {
  date: string;
  calories_kcal?: number | null;
}
export interface BodyAssessmentForEA {
  date: string;
  weight_kg?: number | null;
  lean_body_mass_kg?: number | null;
  body_fat_pct?: number | null;
}

export interface DailyEA {
  date: string;
  ea: number;
  status: EnergyAvailabilityStatus;
  intake: number;
  exercise: number;
}

// Origem da massa magra usada no divisor — o ecrã e a Carol têm de poder
// dizer "estimada" / "por omissão" em vez de apresentar 55 kg como medido.
// 'medida' = lean_body_mass_kg da avaliação; 'estimada' = peso × (1 − %
// gordura) da avaliação; 'omissao' = sem avaliação utilizável (55 kg fixos,
// ou peso sem % de gordura com 20% assumidos).
export type LeanMassSource = "medida" | "estimada" | "omissao";

export interface EnergyAvailabilityWindow {
  // Só dias COM refeições registadas (N4, 2026-10-04): um dia só com treino
  // não tem ingestão conhecida e não pode entrar como 0 kcal.
  daily: DailyEA[];
  average: number;
  isAtRisk: boolean;
  daysAtRisk: number;
  leanMass: number;
  leanMassSource: LeanMassSource;
  // Dias com treino e SEM refeições registadas — ficam fora de `daily`, da
  // média e das contagens; contados à parte para o ecrã dizer "N dias de
  // treino sem refeições registadas não entram".
  daysWithoutMeals: number;
  daysWithoutMealsDates: string[];
}

export function computeEnergyAvailabilityWindow(
  meals: MealForEA[],
  bodyAssessments: BodyAssessmentForEA[],
  runs: RunForEA[],
  gymSessions: GymSessionForEA[],
  todayISO: string,
  range: string,
): EnergyAvailabilityWindow {
  const filteredMeals = filterByRelativeDateRange(meals, todayISO, range);
  const filteredRuns = filterByRelativeDateRange(runs, todayISO, range);
  const filteredGym = filterByRelativeDateRange(gymSessions, todayISO, range);

  const sortedBody = bodyAssessments?.length
    ? [...bodyAssessments].sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const latest = sortedBody[0];
  // Valor de recurso mantido (55 kg / 20% gordura) para não partir a Carol,
  // mas a origem é exposta em `leanMassSource` (N4, 2026-10-04): antes caía
  // em silêncio e a EA parecia medida.
  let leanMass: number;
  let leanMassSource: LeanMassSource;
  if (latest?.lean_body_mass_kg) {
    leanMass = latest.lean_body_mass_kg;
    leanMassSource = "medida";
  } else if (latest?.weight_kg && latest.body_fat_pct != null) {
    leanMass = latest.weight_kg * (1 - latest.body_fat_pct / 100);
    leanMassSource = "estimada";
  } else if (latest?.weight_kg) {
    leanMass = latest.weight_kg * (1 - 20 / 100);
    leanMassSource = "omissao";
  } else {
    leanMass = 55;
    leanMassSource = "omissao";
  }
  const weight = latest?.weight_kg || 70;

  const days: Record<string, { intake: number; exercise: number; hasMeals: boolean }> = {};
  const addDay = (date: string) => { if (!days[date]) days[date] = { intake: 0, exercise: 0, hasMeals: false }; };

  for (const meal of filteredMeals) {
    addDay(meal.date);
    days[meal.date].hasMeals = true;
    days[meal.date].intake += computeMealNutrients(meal).calories;
  }
  for (const run of filteredRuns) {
    addDay(run.date);
    days[run.date].exercise += (run.distance_km || 0) * weight * RUNNING_COST_KCAL_PER_KG_KM;
  }
  for (const session of filteredGym) {
    addDay(session.date);
    days[session.date].exercise += session.calories_kcal || GYM_SESSION_FALLBACK_KCAL;
  }

  // N4 (2026-10-04): só entram dias com refeições registadas (a energia
  // gasta nesses dias continua a contar). Dia de treino sem refeições = não
  // sabemos quanto comeu, não 0 kcal — ficava EA negativa/'critical' e
  // disparava o falso RED-S (inclusive hoje, antes de registar o almoço).
  const daysWithoutMealsDates = Object.entries(days)
    .filter(([, d]) => !d.hasMeals && d.exercise > 0)
    .map(([date]) => date)
    .sort();

  const daily: DailyEA[] = Object.entries(days)
    .filter(([, d]) => d.hasMeals)
    .map(([date, d]) => {
      const result = computeEnergyAvailability(d.intake, d.exercise, leanMass);
      const ea = result?.ea ?? 0;
      const status = result?.status ?? "optimal";
      return { date, ea: Math.round(ea * 10) / 10, status, intake: Math.round(d.intake), exercise: Math.round(d.exercise) };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const average = daily.length > 0 ? Math.round((daily.reduce((s, d) => s + d.ea, 0) / daily.length) * 10) / 10 : 0;
  const daysAtRisk = daily.filter((d) => d.status === "critical").length;
  const isAtRisk = daysAtRisk >= EA_CRITICAL_DURATION_DAYS;

  return {
    daily, average, isAtRisk, daysAtRisk, leanMass, leanMassSource,
    daysWithoutMeals: daysWithoutMealsDates.length, daysWithoutMealsDates,
  };
}
