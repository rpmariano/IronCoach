// Aderência real às macros a partir das refeições registadas: médias
// diárias em g/kg de peso corporal e % de cumprimento face aos objetivos.
//
// @contexto Migrado de src/utils/biEngine.js calculateMacroAdherence
// (specs/formulas-checklist.md Fase E, resolve o P0-6 original — usa
// computeMealNutrients em vez de somar `*_per_100g` diretamente).

import { computeMealNutrients, type MealLike } from "./mealNutrients.ts";
import { filterByRelativeDateRange } from "./relativeDateRange.ts";

export interface MacroTarget {
  actual_g_per_kg: number;
  actual_g: number;
  target: number;
  compliance_pct: number;
}

export interface DailyMacroBreakdown {
  date: string;
  protein: number;
  carbs: number;
  fat: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
}

export interface MacroAdherence {
  protein: MacroTarget;
  carbs: MacroTarget;
  fat: MacroTarget;
  calories: { actual: number; target: number; compliance_pct: number };
  weight: number;
  dailyBreakdown: DailyMacroBreakdown[];
}

export interface MealForAdherence extends MealLike {
  date: string;
}

export interface ProfileForAdherence {
  weight_kg?: number | null;
  calorie_goal?: number | null;
  protein_goal?: number | null;
  carbs_goal?: number | null;
  fat_goal?: number | null;
}

export interface BodyAssessmentForAdherence {
  date: string;
  weight_kg?: number | null;
}

const DEFAULT_WEIGHT_KG = 70;
const DEFAULT_CALORIE_GOAL = 2000;
const DEFAULT_PROTEIN_GOAL = 150;
const DEFAULT_CARBS_GOAL = 200;
const DEFAULT_FAT_GOAL = 70;

export function computeMacroAdherence(
  meals: MealForAdherence[],
  profile: ProfileForAdherence | null,
  bodyAssessments: BodyAssessmentForAdherence[],
  todayISO: string,
  range: string,
): MacroAdherence | null {
  const filtered = filterByRelativeDateRange(meals, todayISO, range);
  if (filtered.length === 0) return null;

  const sortedBody = bodyAssessments?.length
    ? [...bodyAssessments].sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const weight = sortedBody[0]?.weight_kg || profile?.weight_kg || DEFAULT_WEIGHT_KG;

  const dailyTotals: Record<string, { cal: number; prot: number; carbs: number; fat: number }> = {};
  for (const meal of filtered) {
    const day = meal.date;
    if (!dailyTotals[day]) dailyTotals[day] = { cal: 0, prot: 0, carbs: 0, fat: 0 };
    const n = computeMealNutrients(meal);
    dailyTotals[day].cal += n.calories;
    dailyTotals[day].prot += n.protein;
    dailyTotals[day].carbs += n.carbs;
    dailyTotals[day].fat += n.fat;
  }

  const days = Object.values(dailyTotals);
  const numDays = days.length || 1;
  const avgCal = days.reduce((s, d) => s + d.cal, 0) / numDays;
  const avgProt = days.reduce((s, d) => s + d.prot, 0) / numDays;
  const avgCarbs = days.reduce((s, d) => s + d.carbs, 0) / numDays;
  const avgFat = days.reduce((s, d) => s + d.fat, 0) / numDays;

  const protPerKg = Math.round((avgProt / weight) * 10) / 10;
  const carbsPerKg = Math.round((avgCarbs / weight) * 10) / 10;
  const fatPerKg = Math.round((avgFat / weight) * 10) / 10;

  const calTarget = profile?.calorie_goal || DEFAULT_CALORIE_GOAL;
  const protTarget = profile?.protein_goal || DEFAULT_PROTEIN_GOAL;
  const carbsTarget = profile?.carbs_goal || DEFAULT_CARBS_GOAL;
  const fatTarget = profile?.fat_goal || DEFAULT_FAT_GOAL;

  return {
    protein: { actual_g_per_kg: protPerKg, actual_g: Math.round(avgProt), target: protTarget, compliance_pct: Math.round((avgProt / protTarget) * 100) },
    carbs: { actual_g_per_kg: carbsPerKg, actual_g: Math.round(avgCarbs), target: carbsTarget, compliance_pct: Math.round((avgCarbs / carbsTarget) * 100) },
    fat: { actual_g_per_kg: fatPerKg, actual_g: Math.round(avgFat), target: fatTarget, compliance_pct: Math.round((avgFat / fatTarget) * 100) },
    calories: { actual: Math.round(avgCal), target: calTarget, compliance_pct: Math.round((avgCal / calTarget) * 100) },
    weight,
    dailyBreakdown: Object.entries(dailyTotals)
      .map(([date, totals]) => ({
        date,
        protein: Math.round((totals.prot / weight) * 10) / 10,
        carbs: Math.round((totals.carbs / weight) * 10) / 10,
        fat: Math.round((totals.fat / weight) * 10) / 10,
        proteinTarget: protTarget / weight,
        carbsTarget: carbsTarget / weight,
        fatTarget: fatTarget / weight,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
