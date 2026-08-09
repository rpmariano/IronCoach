import { startOfDay, startOfWeek, startOfMonth, format, differenceInDays } from 'date-fns';

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

export function rangeBounds(rangeStr) {
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  let startDate = now;

  if (rangeStr === 'semana') {
    startDate = startOfWeek(now, { weekStartsOn: 1 });
  } else if (rangeStr === 'mes') {
    startDate = startOfMonth(now);
  } else {
    startDate = startOfDay(now);
  }

  const start = format(startDate, 'yyyy-MM-dd');
  const end = today;
  const daysElapsed = Math.max(1, differenceInDays(now, startDate) + 1);

  return { start, end, daysElapsed };
}

export function itemNutrients(item) {
  if (!item) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
  
  // Direct macros on item if present
  if (
    (item.calories !== undefined && item.calories !== null && Number(item.calories) > 0) ||
    (item.protein !== undefined && item.protein !== null && Number(item.protein) > 0) ||
    (item.carbs !== undefined && item.carbs !== null && Number(item.carbs) > 0) ||
    (item.fat !== undefined && item.fat !== null && Number(item.fat) > 0)
  ) {
    return {
      calories: Number(item.calories) || 0,
      protein: Number(item.protein) || 0,
      carbs: Number(item.carbs) || 0,
      fat: Number(item.fat) || 0,
      fiber: Number(item.fiber) || 0,
      sugar: Number(item.sugar) || 0,
      sodium: Number(item.sodium) || 0,
    };
  }

  // Per 100g scaling fallback
  const grams = Number(item.quantity_grams ?? item.amount_g ?? item.quantity ?? 100);
  const factor = grams / 100;

  const cal100 = Number(item.calories_per_100g ?? item.food_item?.calories ?? item.calories_100g ?? 0);
  const prot100 = Number(item.protein_per_100g ?? item.food_item?.protein ?? item.protein_100g ?? 0);
  const carbs100 = Number(item.carbs_per_100g ?? item.food_item?.carbs ?? item.carbs_100g ?? 0);
  const fat100 = Number(item.fat_per_100g ?? item.food_item?.fat ?? item.fat_100g ?? 0);

  return {
    calories: factor * cal100,
    protein: factor * prot100,
    carbs: factor * carbs100,
    fat: factor * fat100,
    fiber: factor * Number(item.fiber_per_100g ?? item.food_item?.fiber ?? 0),
    sugar: factor * Number(item.sugar_per_100g ?? item.food_item?.sugar ?? 0),
    sodium: factor * Number(item.sodium_per_100g ?? item.food_item?.sodium ?? 0),
  };
}

export function mealNutrients(meal) {
  const total = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 };
  
  const items = meal?.meal_items || [];
  if (items.length > 0) {
    items.forEach(item => {
      const n = itemNutrients(item);
      total.calories += n.calories;
      total.protein += n.protein;
      total.carbs += n.carbs;
      total.fat += n.fat;
      total.fiber += n.fiber || 0;
      total.sugar += n.sugar || 0;
      total.sodium += n.sodium || 0;
    });
  } else {
    total.calories = Number(meal?.calories) || 0;
    total.protein = Number(meal?.protein) || 0;
    total.carbs = Number(meal?.carbs) || 0;
    total.fat = Number(meal?.fat) || 0;
  }
  
  return total;
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

export function rangeTotals(meals, rangeStr) {
  const { start, end } = rangeBounds(rangeStr);
  let c = 0, p = 0, h = 0, f = 0;
  let micros = {
    fiber: 0, sugar: 0, sodium: 0, iron_mg: 0, calcium_mg: 0, vitamin_c_mg: 0, potassium_mg: 0
  };
  
  for (const m of meals) {
    if (m.date >= start && m.date <= end) {
      const n = mealNutrients(m);
      c += n.calories;
      p += n.protein;
      h += n.carbs;
      f += n.fat;
      
      micros.fiber += n.fiber || 0;
      micros.sugar += n.sugar || 0;
      micros.sodium += n.sodium || 0;
      micros.iron_mg += n.iron_mg || 0;
      micros.calcium_mg += n.calcium_mg || 0;
      micros.vitamin_c_mg += n.vitamin_c_mg || 0;
      micros.potassium_mg += n.potassium_mg || 0;
    }
  }
  
  return { calories: c, protein: p, carbs: h, fat: f, ...micros };
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
