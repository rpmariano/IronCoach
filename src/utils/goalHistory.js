import { classifyCalorieCompliance } from '@formulas/nutritionCompliance.ts';
import { mealNutrients } from './nutrition';

/* O objetivo de um dia passado e se foi atingido (bug #51, 2026-10-02): «se
   quiser saber qual era o objetivo de calorias ou outro macro, no dia de
   ontem, e saber se atingi objetivos, não temos como saber».

   O histórico vem de profile_goal_history (migração 20261003224956): cada linha é
   um estado dos cinco objetivos e a partir de quando vale. O objetivo de um
   dia é o da última linha que começou até ao fim desse dia, em hora de
   Lisboa — mudar os objetivos às 14h vale para o dia inteiro. */

/** Os mesmos valores por omissão de @formulas/macroAdherence.ts. */
export const DAY_GOAL_DEFAULTS = { calorie_goal: 2000, protein_goal: 150, carbs_goal: 200, fat_goal: 70, water_goal_ml: 2000 };
const GOAL_KEYS = Object.keys(DAY_GOAL_DEFAULTS);

const lisbonDate = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date(ts));

const pick = (src) => Object.fromEntries(GOAL_KEYS.map((k) => {
  const n = Number(src?.[k]);
  return [k, Number.isFinite(n) && n > 0 ? n : DAY_GOAL_DEFAULTS[k]];
}));

/**
 * Os objetivos que valiam em `dayISO`.
 *   { goals, estimated }
 * `estimated` quando o dia cai antes de haver histórico de verdade: na linha
 * 'inicial' (o ponto de partida que a migração estimou com os valores de
 * hoje) ou antes da primeira linha. Sem histórico nenhum (ainda a carregar,
 * ou no modo demo), valem os objetivos atuais do perfil, sem aviso.
 */
export function goalsForDay(history, dayISO, profile) {
  const rows = [...(history || [])]
    .filter((r) => r?.valid_from)
    .sort((a, b) => String(a.valid_from).localeCompare(String(b.valid_from)));
  if (!rows.length) return { goals: pick(profile), estimated: false };
  let row = null;
  for (const r of rows) {
    if (lisbonDate(r.valid_from) <= dayISO) row = r;
    else break;
  }
  if (!row) return { goals: pick(rows[0]), estimated: true };
  return { goals: pick(row), estimated: row.source === 'inicial' };
}

/* Atingido ou não. Calorias, hidratos e gordura têm a mesma régua do resto
   da app (@formulas/nutritionCompliance.ts: 90-115% é dentro); proteína e
   água não têm teto — passar do objetivo não é falhar. */
const NO_CEILING = new Set(['protein', 'water']);

function statusFor(key, value, target, hasRecord) {
  if (!hasRecord) return 'sem_registo';
  const pct = target > 0 ? (value / target) * 100 : 0;
  if (NO_CEILING.has(key)) return pct >= 90 ? 'ok' : 'abaixo';
  const zone = classifyCalorieCompliance(pct);
  if (zone === 'ok') return 'ok';
  if (zone === 'over') return 'acima';
  return 'abaixo';
}

const ROWS = [
  { key: 'calories', goalKey: 'calorie_goal', label: 'Calorias', unit: 'kcal' },
  { key: 'protein', goalKey: 'protein_goal', label: 'Proteína', unit: 'g' },
  { key: 'carbs', goalKey: 'carbs_goal', label: 'Hidratos', unit: 'g' },
  { key: 'fat', goalKey: 'fat_goal', label: 'Gordura', unit: 'g' },
];

/**
 * O dia: o comido (e bebido) contra o objetivo desse dia.
 *   [{ key, label, unit, value, target, pct, status }]
 * status: 'ok' | 'abaixo' | 'acima' | 'sem_registo'.
 */
export function dayNutritionSummary({ meals, waterLogs, dayISO, goals }) {
  const dayMeals = (meals || []).filter((m) => m?.date === dayISO);
  const totals = dayMeals.reduce((acc, m) => {
    const n = mealNutrients(m);
    for (const r of ROWS) acc[r.key] += n[r.key] || 0;
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  const dayWater = (waterLogs || []).filter((w) => w?.date === dayISO);
  const waterMl = dayWater.reduce((s, w) => s + (Number(w.amount_ml) || 0), 0);

  const rows = ROWS.map((r) => {
    const value = Math.round(totals[r.key]);
    const target = goals[r.goalKey];
    return { key: r.key, label: r.label, unit: r.unit, value, target, pct: target > 0 ? Math.round((value / target) * 100) : null, status: statusFor(r.key, value, target, dayMeals.length > 0) };
  });
  const waterTarget = goals.water_goal_ml;
  rows.push({
    key: 'water', label: 'Água', unit: 'ml', value: waterMl, target: waterTarget,
    pct: waterTarget > 0 ? Math.round((waterMl / waterTarget) * 100) : null,
    status: statusFor('water', waterMl, waterTarget, dayWater.length > 0),
  });
  return rows;
}

/** As macros que o plano aceite sugeria para o dia (coach_plan_items.meal_macros),
 *  ou null. A sugestão mais recente ganha, como em homeModels.mealsForDay. */
export function planMacrosForDay({ coachPlans, coachPlanItems, dayISO }) {
  const accepted = new Set((coachPlans || []).filter((p) => p?.status === 'aceite').map((p) => p.id));
  const item = (coachPlanItems || [])
    .filter((i) => i && accepted.has(i.plan_id) && i.planned_date === dayISO && i.status !== 'cancelado' && i.meal_macros?.kcal)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0];
  if (!item) return null;
  const m = item.meal_macros;
  const r = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
  return { kcal: r(m.kcal), protein: r(m.protein_g), carbs: r(m.carbs_g), fat: r(m.fat_g) };
}
