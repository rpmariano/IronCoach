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
  // +1 to include today
  const daysElapsed = Math.max(1, differenceInDays(now, startDate) + 1);

  return { start, end, daysElapsed };
}

export function mealNutrients(meal) {
  let c = 0, p = 0, h = 0, f = 0;
  let micros = {
    fiber: 0, sugar: 0, sodium: 0, iron_mg: 0, calcium_mg: 0, vitamin_c_mg: 0, potassium_mg: 0
  };
  
  if (meal && meal.meal_items) {
    for (const item of meal.meal_items) {
      const q = (Number(item.quantity) || 0) / 100;
      c += (Number(item.food_item?.calories) || 0) * q;
      p += (Number(item.food_item?.protein) || 0) * q;
      h += (Number(item.food_item?.carbs) || 0) * q;
      f += (Number(item.food_item?.fat) || 0) * q;
      
      micros.fiber += (Number(item.food_item?.fiber) || 0) * q;
      micros.sugar += (Number(item.food_item?.sugar) || 0) * q;
      micros.sodium += (Number(item.food_item?.sodium) || 0) * q;
      micros.iron_mg += (Number(item.food_item?.iron_mg) || 0) * q;
      micros.calcium_mg += (Number(item.food_item?.calcium_mg) || 0) * q;
      micros.vitamin_c_mg += (Number(item.food_item?.vitamin_c_mg) || 0) * q;
      micros.potassium_mg += (Number(item.food_item?.potassium_mg) || 0) * q;
    }
  }
  return { calories: c, protein: p, carbs: h, fat: f, ...micros };
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
    'pequeno_almoco': 'Pequeno-almoço',
    'almoco': 'Almoço',
    'jantar': 'Jantar',
    'lanche': 'Lanche'
  };
  return labels[type] || 'Snack';
}
