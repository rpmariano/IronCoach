// Nutrientes de um item de refeição / de uma refeição inteira, com o
// fallback de 3 níveis que o P0-6 original identificou como necessário:
// macros diretos no item → *_per_100g escalado pela quantidade →
// food_item.* (import legado) → *_100g (nome alternativo de coluna).
//
// @contexto Migrado de src/utils/nutrition.js itemNutrients/mealNutrients
// (specs/formulas-checklist.md Fase E, P0-6). Sem este fallback, uma
// refeição gravada via `food_item.calories` (em vez de `calories_per_100g`)
// contava 0 kcal — o P0-6 original da auditoria.
//
// BUG DE PARIDADE corrigido ao migrar (2026-08-25, decisão do utilizador):
// o original nunca calculava ferro/cálcio/vitamina C/potássio — só
// devolvia calories/protein/carbs/fat/fiber/sugar/sodium — apesar de
// `rangeTotals` (nutrition.js) já tentar somar `n.iron_mg`/`n.calcium_mg`/
// `n.vitamin_c_mg`/`n.potassium_mg` do resultado (sempre `undefined`,
// mascarado por `|| 0`). Os totais destes 4 micronutrientes no
// NutritionDashboard mostravam sempre 0, apesar de as colunas
// `meal_items.iron_mg_per_100g` etc. existirem e serem gravadas. Corrigido
// aqui, seguindo o mesmo padrão de fallback dos outros micronutrientes.

export interface MealItemLike {
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  fiber?: number | null;
  sugar?: number | null;
  sodium?: number | null;
  iron_mg?: number | null;
  calcium_mg?: number | null;
  vitamin_c_mg?: number | null;
  potassium_mg?: number | null;
  quantity_grams?: number | null;
  amount_g?: number | null;
  quantity?: number | null;
  calories_per_100g?: number | null;
  protein_per_100g?: number | null;
  carbs_per_100g?: number | null;
  fat_per_100g?: number | null;
  fiber_per_100g?: number | null;
  sugar_per_100g?: number | null;
  sodium_per_100g?: number | null;
  iron_mg_per_100g?: number | null;
  calcium_mg_per_100g?: number | null;
  vitamin_c_mg_per_100g?: number | null;
  potassium_mg_per_100g?: number | null;
  calories_100g?: number | null;
  protein_100g?: number | null;
  carbs_100g?: number | null;
  fat_100g?: number | null;
  // deno-lint-ignore no-explicit-any
  food_item?: Record<string, any> | null;
}

export interface MealLike {
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  meal_items?: MealItemLike[] | null;
}

export interface NutrientTotals {
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

const EMPTY: NutrientTotals = {
  calories: 0, protein: 0, carbs: 0, fat: 0,
  fiber: 0, sugar: 0, sodium: 0,
  iron_mg: 0, calcium_mg: 0, vitamin_c_mg: 0, potassium_mg: 0,
};

export function computeItemNutrients(item: MealItemLike | null | undefined): NutrientTotals {
  if (!item) return { ...EMPTY };

  const hasDirectMacro =
    (item.calories != null && Number(item.calories) > 0) ||
    (item.protein != null && Number(item.protein) > 0) ||
    (item.carbs != null && Number(item.carbs) > 0) ||
    (item.fat != null && Number(item.fat) > 0);

  if (hasDirectMacro) {
    return {
      calories: Number(item.calories) || 0,
      protein: Number(item.protein) || 0,
      carbs: Number(item.carbs) || 0,
      fat: Number(item.fat) || 0,
      fiber: Number(item.fiber) || 0,
      sugar: Number(item.sugar) || 0,
      sodium: Number(item.sodium) || 0,
      iron_mg: Number(item.iron_mg) || 0,
      calcium_mg: Number(item.calcium_mg) || 0,
      vitamin_c_mg: Number(item.vitamin_c_mg) || 0,
      potassium_mg: Number(item.potassium_mg) || 0,
    };
  }

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
    iron_mg: factor * Number(item.iron_mg_per_100g ?? item.food_item?.iron_mg ?? 0),
    calcium_mg: factor * Number(item.calcium_mg_per_100g ?? item.food_item?.calcium_mg ?? 0),
    vitamin_c_mg: factor * Number(item.vitamin_c_mg_per_100g ?? item.food_item?.vitamin_c_mg ?? 0),
    potassium_mg: factor * Number(item.potassium_mg_per_100g ?? item.food_item?.potassium_mg ?? 0),
  };
}

export function computeMealNutrients(meal: MealLike | null | undefined): NutrientTotals {
  const total: NutrientTotals = { ...EMPTY };
  const items = meal?.meal_items || [];

  if (items.length > 0) {
    for (const item of items) {
      const n = computeItemNutrients(item);
      total.calories += n.calories;
      total.protein += n.protein;
      total.carbs += n.carbs;
      total.fat += n.fat;
      total.fiber += n.fiber;
      total.sugar += n.sugar;
      total.sodium += n.sodium;
      total.iron_mg += n.iron_mg;
      total.calcium_mg += n.calcium_mg;
      total.vitamin_c_mg += n.vitamin_c_mg;
      total.potassium_mg += n.potassium_mg;
    }
  } else {
    total.calories = Number(meal?.calories) || 0;
    total.protein = Number(meal?.protein) || 0;
    total.carbs = Number(meal?.carbs) || 0;
    total.fat = Number(meal?.fat) || 0;
  }

  return total;
}
