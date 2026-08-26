// Totais de nutrientes (macros + micronutrientes) sobre um período
// CALENDÁRIO — "hoje", "esta semana" (segunda a hoje) ou "este mês" (dia 1
// a hoje) — usado pelos KPIs de topo do NutritionDashboard.
//
// @contexto Migrado de src/utils/nutrition.js rangeBounds/rangeTotals
// (specs/formulas-checklist.md Fase E). NOTA IMPORTANTE: este NÃO é o
// mesmo conceito de "período" de relativeDateRange.ts (janela ROLANTE de N
// dias/meses a contar de hoje, usada por calculateMacroAdherence/
// calculateEnergyAvailability/volumeLoad/muscleGroupVolume/classAnalytics).
// Aqui "semana" = desde a segunda-feira desta semana até hoje (duração
// variável, 1-7 dias); "mês" = desde o dia 1 do mês corrente até hoje. São
// dois vocabulários de período genuinamente diferentes que já coexistiam
// no código antes desta fase — mantidos separados aqui de propósito, não
// unificados, para não mudar o que nenhum dos dois dashboards mostra.
// BUG DE PARIDADE corrigido ao migrar (2026-08-25, decisão do utilizador):
// ver o comentário em mealNutrients.ts — ferro/cálcio/vitamina C/potássio
// mostravam sempre 0.

import { computeMealNutrients, type MealLike } from "./mealNutrients.ts";

export type CalendarRangeKey = "hoje" | "semana" | "mes";

export interface MealForTotals extends MealLike {
  date: string;
}

export interface NutrientRangeTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  iron_mg: number;
  calcium_mg: number;
  vitamin_c_mg: number;
  potassium_mg: number;
}

function mondayOfWeek(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00Z");
  const dow = d.getUTCDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

function firstOfMonth(dateISO: string): string {
  return dateISO.slice(0, 7) + "-01";
}

/** Início (inclusivo) do período de calendário que contém `todayISO`. */
export function calendarRangeStartISO(todayISO: string, range: string): string {
  if (range === "semana") return mondayOfWeek(todayISO);
  if (range === "mes") return firstOfMonth(todayISO);
  return todayISO; // "hoje" (e qualquer chave desconhecida) — só o próprio dia
}

export function computeNutrientRangeTotals(
  meals: MealForTotals[],
  todayISO: string,
  range: string,
): NutrientRangeTotals {
  const start = calendarRangeStartISO(todayISO, range);
  const end = todayISO;

  const totals: NutrientRangeTotals = {
    calories: 0, protein: 0, carbs: 0, fat: 0,
    fiber: 0, sugar: 0, sodium: 0,
    iron_mg: 0, calcium_mg: 0, vitamin_c_mg: 0, potassium_mg: 0,
  };

  for (const m of meals) {
    if (m.date >= start && m.date <= end) {
      const n = computeMealNutrients(m);
      totals.calories += n.calories;
      totals.protein += n.protein;
      totals.carbs += n.carbs;
      totals.fat += n.fat;
      totals.fiber += n.fiber;
      totals.sugar += n.sugar;
      totals.sodium += n.sodium;
      totals.iron_mg += n.iron_mg;
      totals.calcium_mg += n.calcium_mg;
      totals.vitamin_c_mg += n.vitamin_c_mg;
      totals.potassium_mg += n.potassium_mg;
    }
  }

  return totals;
}
