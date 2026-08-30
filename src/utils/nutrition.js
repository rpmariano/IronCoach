import { computeItemNutrients, computeMealNutrients } from '@formulas/mealNutrients.ts';
import { computeNutrientRangeTotals } from '@formulas/micronutrientTotals.ts';
import { todayISO } from '../lib/utils';

export const MACROS = [
  { key: 'calories', goalKey: 'calorie_goal', label: 'Calorias', unit: 'kcal', color: '#dd3c4f' },
  { key: 'protein', goalKey: 'protein_goal', label: 'Proteína', unit: 'g', color: '#3c6cdd' },
  { key: 'carbs', goalKey: 'carbs_goal', label: 'Hidratos', unit: 'g', color: '#8b8118' },
  { key: 'fat', goalKey: 'fat_goal', label: 'Gordura', unit: 'g', color: '#dd3cb7' },
];

export const MICROS = [
  { key: 'fiber', label: 'Fibra', unit: 'g' },
  { key: 'sugar', label: 'Açúcar', unit: 'g' },
  { key: 'sodium', label: 'Sódio', unit: 'mg' },
  { key: 'iron_mg', label: 'Ferro', unit: 'mg' },
  { key: 'calcium_mg', label: 'Cálcio', unit: 'mg' },
  { key: 'vitamin_c_mg', label: 'Vit. C', unit: 'mg' },
  { key: 'potassium_mg', label: 'Potássio', unit: 'mg' },
];

// rangeBounds() removida (Fase E) — sem consumidor fora de rangeTotals(),
// que passou a delegar em @formulas/micronutrientTotals.ts.

// Delegam em @formulas/mealNutrients.ts (T1.5) — única implementação,
// partilhada com a Carol (specs/formulas-checklist.md Fase E). Ganharam
// ferro/cálcio/vitamina C/potássio no resultado (antes nunca calculados,
// mesmo com as colunas *_per_100g gravadas — bug corrigido nessa migração);
// os consumidores existentes só liam calories/protein/carbs/fat e não
// quebram com as chaves novas.
export function itemNutrients(item) {
  return computeItemNutrients(item);
}

export function mealNutrients(meal) {
  return computeMealNutrients(meal);
}

/* Um dia "de carga" — tem um item do plano de treino de corrida longa nesse
   dia (concluído ou ainda pendente). A doutrina completa (specs/
   coach-investigacao.md, Bloco 4.1) calcula a meta exata por g/kg de peso e
   por volume — depende do motor de doutrina em src/coach-knowledge/, ainda
   por construir. Este é o heurístico mínimo que já resolve o essencial: não
   marcar 'over' um dia em que o atleta comeu mais porque tinha um longão do
   plano nesse dia — o que seria penalizar visualmente o que o próprio coach
   recomendou. Considera só o próprio dia; a extensão à véspera (carga de
   hidratos pré-longo) fica para quando o motor de doutrina existir. */
export function planAffectsDay(planItems, dateStr) {
  return (planItems || []).some(item => {
    if (item.status === 'cancelado') return false;
    if (item.kind !== 'corrida') return false;
    const relevantDate = item.status === 'concluido' ? item.actual_date : item.planned_date;
    if (relevantDate !== dateStr) return false;
    const isLong = item.training_type === 'longo' || (Number(item.target_distance_km) || 0) >= 15;
    return isLong;
  });
}

/* Estado nutricional de um dia no calendário: 'none' sem refeições, 'ok' com as
   metas cumpridas, 'over' caso contrário. A proteína é a única macro em que o
   problema é ficar ABAIXO da meta — nas outras três o problema é excedê-la.
   `planItems` é opcional — sem ele, o comportamento é exatamente o de antes. */
export function dayNutrientStatus(meals, dateStr, profile, planItems) {
  const dayMeals = (meals || []).filter(m => m.date === dateStr);
  if (dayMeals.length === 0) return 'none';

  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  dayMeals.forEach(meal => {
    const n = mealNutrients(meal);
    totals.calories += n.calories;
    totals.protein += n.protein;
    totals.carbs += n.carbs;
    totals.fat += n.fat;
  });

  const p = profile || {};
  const highLoadDay = planAffectsDay(planItems, dateStr);
  // Sem meta definida, a macro nunca conta como excedida (Infinity). Num dia
  // de longão do plano, calorias e hidratos também nunca contam como
  // excedidos — ver planAffectsDay acima.
  const exceededCapped = ['calories', 'carbs', 'fat'].some(key => {
    if (highLoadDay && (key === 'calories' || key === 'carbs')) return false;
    const goalKey = MACROS.find(m => m.key === key).goalKey;
    return totals[key] > (Number(p[goalKey]) || Infinity);
  });
  const proteinMet = totals.protein >= (Number(p.protein_goal) || 0);
  return (!exceededCapped && proteinMet) ? 'ok' : 'over';
}

// Objetivo de água atingido nesse dia — soma dos registos >= meta diária.
export function dayWaterGoalMet(waterLogs, dateStr, profile) {
  const dayLogs = (waterLogs || []).filter(w => w.date === dateStr);
  if (dayLogs.length === 0) return false;
  const total = dayLogs.reduce((sum, w) => sum + (Number(w.amount_ml) || 0), 0);
  return total >= (Number(profile?.water_goal_ml) || 2000);
}

// Delega em @formulas/micronutrientTotals.ts (T1.5) — única implementação,
// partilhada com a Carol. `rangeStr` mantém a mesma semântica de sempre
// ('semana' = desde segunda-feira, 'mes' = desde o dia 1, qualquer outra
// coisa = só hoje) — é um período de CALENDÁRIO, distinto do período
// rolante de `filterByDateRange` (biEngine.js); ver o comentário em
// micronutrientTotals.ts.
export function rangeTotals(meals, rangeStr) {
  return computeNutrientRangeTotals(meals, todayISO(), rangeStr);
}

export function mealTypeLabel(type) {
  const labels = {
    'pequeno-almoco': 'Pequeno-Almoço',
    'lanche-manha': 'Lanche da Manhã',
    'almoco': 'Almoço',
    'lanche': 'Lanche da Tarde',
    'jantar': 'Jantar',
    'ceia': 'Ceia'
  };
  return labels[type] || 'Refeição';
}
