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

export interface EnergyAvailabilityWindow {
  daily: DailyEA[];
  average: number;
  isAtRisk: boolean;
  daysAtRisk: number;
  leanMass: number;
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
  const leanMass = latest?.lean_body_mass_kg
    || (latest?.weight_kg ? latest.weight_kg * (1 - (latest.body_fat_pct ?? 20) / 100) : 0)
    || 55;
  const weight = latest?.weight_kg || 70;

  const days: Record<string, { intake: number; exercise: number }> = {};
  const addDay = (date: string) => { if (!days[date]) days[date] = { intake: 0, exercise: 0 }; };

  for (const meal of filteredMeals) {
    addDay(meal.date);
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

  const daily: DailyEA[] = Object.entries(days)
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

  return { daily, average, isAtRisk, daysAtRisk, leanMass };
}
