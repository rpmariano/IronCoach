import { foodKey } from '@formulas/foodKey.ts';
import { supabase, invokeEdgeFunctionWithTimeout } from '../lib/supabase';
import { ANALYZE_TIMEOUT_MS } from '../lib/edgeTimeouts';

/* A despensa na app (bugs #48/#52, fase C): o Armário do Perfil e as
   sugestões ao escrever no registo da refeição. As regras de quando um
   alimento entra e de como a Carol o usa vivem no servidor
   (supabase/functions/analyze-meal/pantry.ts); aqui só se lê, procura,
   sugere e grava o que o atleta muda à mão. */

export { foodKey };

const NUTRIENTS = [
  'calories_per_100g', 'protein_per_100g', 'carbs_per_100g', 'fat_per_100g',
  'fiber_per_100g', 'sugar_per_100g', 'sodium_per_100g', 'iron_mg_per_100g',
  'calcium_mg_per_100g', 'vitamin_c_mg_per_100g', 'potassium_mg_per_100g',
];
/** Os quatro que o atleta vê e pode ajustar. */
export const EDITABLE_NUTRIENTS = [
  { key: 'calories_per_100g', label: 'kcal' },
  { key: 'protein_per_100g', label: 'proteína g' },
  { key: 'carbs_per_100g', label: 'hidratos g' },
  { key: 'fat_per_100g', label: 'gordura g' },
];

/* O teclado português escreve "3,5": Number("3,5") é NaN e gravava-se 0
   (revisão pré-master). */
export const toNumber = (v) => Number(String(v ?? '').trim().replace(',', '.'));
const round1 = (n) => Math.round(toNumber(n) * 10) / 10;

/** "1 fatia, 40 g" · "170 g" · "" */
export function portionText(food) {
  const g = Number(food?.portion_grams);
  const grams = Number.isFinite(g) && g > 0 ? `${Math.round(g)} g` : '';
  return [food?.portion_label, grams].filter(Boolean).join(', ');
}

/** A linha de baixo de um alimento: porção e energia por 100 g. */
export function foodSubline(food) {
  const kcal = Math.round(Number(food?.calories_per_100g) || 0);
  return [portionText(food), `${kcal} kcal/100 g`].filter(Boolean).join(' · ');
}

/** Já está na despensa? A Carol conhece-o e não o volta a analisar. */
export function isKnownFood(name, foods) {
  const k = foodKey(name);
  return !!k && (foods || []).some((f) => f.name_key === k);
}

/**
 * As sugestões enquanto se escreve: alimentos da despensa em que cada
 * palavra escrita começa uma palavra do nome ("io gr" → "Iogurte grego 0%"),
 * os mais usados primeiro. A partir de 2 letras.
 */
export function pantrySuggestions(query, foods, limit = 5) {
  const words = foodKey(query).split(' ').filter(Boolean);
  if (!words.length || foodKey(query).length < 2) return [];
  return (foods || [])
    .filter((f) => {
      const nameWords = String(f.name_key || '').split(' ');
      return words.every((w) => nameWords.some((nw) => nw.startsWith(w)));
    })
    .sort((a, b) => (b.times_seen || 0) - (a.times_seen || 0))
    .slice(0, limit);
}

/**
 * "O que costumas comer ao pequeno-almoço": os alimentos da despensa que
 * aparecem pelo menos 2 vezes nas refeições desse tipo dos últimos 90 dias.
 */
export function habitualsForMealType({ meals, foods, mealType, today, days = 90, limit = 3 }) {
  if (!mealType || !today) return [];
  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - days);
  const sinceISO = since.toISOString().slice(0, 10);
  const byKey = new Map((foods || []).map((f) => [f.name_key, f]));
  const counts = new Map();
  for (const m of meals || []) {
    if (m?.meal_type !== mealType || !m.date || m.date < sinceISO || m.date > today) continue;
    const seen = new Set();
    for (const it of m.meal_items || []) {
      const k = foodKey(it?.name);
      if (!byKey.has(k) || seen.has(k)) continue;
      seen.add(k);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => byKey.get(k));
}

/** O que diz cada regra de cozinha, por baixo do valor. */
export function ruleInfo(rule) {
  if (rule?.status === 'varia') return 'Varia de vez para vez — continuo a perguntar';
  if (rule?.source === 'manual') return 'Escrito por ti';
  if (rule?.source === 'resposta') return `Respondeste ${rule.confirmations} vezes igual`;
  return `Das tuas observações · ${rule?.confirmations ?? 1}×`;
}

/** As regras que aparecem no Armário: as que ela já usa, ou que variam. */
export function visibleRules(rules) {
  return (rules || []).filter((r) => r.status === 'confirmado' || r.status === 'varia' || r.source === 'manual');
}

// ── Pedidos ───────────────────────────────────────────────────────────────

/** A Carol confirma um alimento novo: por descrição, ou por fotos do rótulo. */
export async function confirmPantryFood({ description = null, images = [] }) {
  const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-meal', {
    body: { mode: 'pantry_food', description, images, mime_type: 'image/jpeg' },
  }, ANALYZE_TIMEOUT_MS);
  if (error) throw new Error(error);
  if (data?.error) throw new Error(data.error);
  return data.food;
}

/**
 * Grava um alimento na despensa. `confirmed` é o que a Carol devolveu (ou o
 * que estava gravado, a editar): se o atleta mudou algum valor, fica
 * `edited_by_athlete` — ela passa a usar o dele e não o reescreve.
 */
export async function savePantryFood({ userId, values, confirmed, existing = null, source = 'manual' }) {
  const changed = !confirmed || EDITABLE_NUTRIENTS.some(({ key }) => round1(values[key]) !== round1(confirmed[key]))
    || toNumber(values.portion_grams) !== toNumber(confirmed.portion_grams);
  const row = {
    user_id: userId,
    name: String(values.name || '').trim().slice(0, 120),
    name_key: foodKey(values.name),
    portion_grams: toNumber(values.portion_grams) > 0 ? toNumber(values.portion_grams) : null,
    portion_label: String(values.portion_label || '').trim().slice(0, 40) || null,
    ...Object.fromEntries(NUTRIENTS.map((k) => [k, Math.max(0, toNumber(values[k] ?? confirmed?.[k] ?? 0) || 0)])),
    in_pantry: true,
    edited_by_athlete: (existing?.edited_by_athlete ?? false) || (existing ? changed : changed && !!confirmed),
    updated_at: new Date().toISOString(),
  };
  if (!row.name_key) throw new Error('Dá um nome ao alimento.');
  if (existing?.id) {
    const { data, error } = await supabase.from('athlete_foods').update(row).eq('id', existing.id).select().single();
    if (error) throw new Error(error.code === '23505' ? 'Já tens um alimento com esse nome na despensa.' : error.message);
    return data;
  }
  // Já vista numa refeição (fora da despensa)? Entra, sem perder as vezes
  // que já apareceu nem de onde veio (revisão pré-master).
  const { data: prev } = await supabase.from('athlete_foods')
    .select('id, times_seen, source, in_pantry').eq('user_id', userId).eq('name_key', row.name_key).maybeSingle();
  // Já está na despensa: não se escreve por cima sem ele ver o que lá está.
  if (prev?.in_pantry) throw new Error('Já tens este alimento na despensa — abre-o lá para o ajustar.');
  const { data, error } = await supabase.from('athlete_foods')
    .upsert({ ...row, source: prev?.source && prev.source !== 'refeicao' ? prev.source : source, times_seen: prev?.times_seen ?? 0 }, { onConflict: 'user_id,name_key' })
    .select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deletePantryFood(id) {
  const { error } = await supabase.from('athlete_foods').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Uma regra escrita à mão: confirmada logo, e só o atleta a muda. */
export async function saveFoodRule({ userId, topic, value, existing = null }) {
  const t = String(topic || '').trim().slice(0, 40);
  const v = String(value || '').trim().slice(0, 60);
  if (!foodKey(t) || !foodKey(v)) throw new Error('Escreve o que é e como o fazes.');
  const row = {
    user_id: userId, topic: t, topic_key: foodKey(t), value: v, value_key: foodKey(v),
    confirmations: Math.max(2, existing?.confirmations ?? 0), status: 'confirmado', source: 'manual',
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('athlete_food_rules').upsert(row, { onConflict: 'user_id,topic_key' }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteFoodRule(id) {
  const { error } = await supabase.from('athlete_food_rules').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
