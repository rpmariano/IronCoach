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
/* Os micronutrientes da despensa (2026-10-05). Espelha a regra de
   supabase/functions/analyze-meal/pantry.ts ("Os micronutrientes da
   despensa"; migração 20261005100000_pantry_micronutrients_nullable) — a
   Edge Function não pode importar daqui nem nós de lá; mudar uma, mudar a
   outra. Por micronutriente: null → por confirmar; > 0 → dado; 0 → dado só
   se a linha foi escrita por código que grava null no que não sabe
   (micros_checked_at = updated_at), senão é um 0 antigo, por confirmar. */
export const MICRO_COLUMNS = [
  'fiber_per_100g', 'sugar_per_100g', 'sodium_per_100g', 'iron_mg_per_100g',
  'calcium_mg_per_100g', 'vitamin_c_mg_per_100g', 'potassium_mg_per_100g',
];
/** Em palavras, pela ordem de MICRO_COLUMNS. */
const MICRO_WORDS = {
  fiber_per_100g: 'fibra', sugar_per_100g: 'açúcar', sodium_per_100g: 'sódio', iron_mg_per_100g: 'ferro',
  calcium_mg_per_100g: 'cálcio', vitamin_c_mg_per_100g: 'vitamina C', potassium_mg_per_100g: 'potássio',
};

/** Um micronutriente como número ≥ 0, ou null ("não sei"). Atenção a
    Number(null) = 0: null/vazio ficam null antes de converter. */
export function microOrNull(v) {
  if (v == null || (typeof v === 'string' && !v.trim())) return null;
  const n = typeof v === 'number' ? v : toNumber(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const sameInstant = (a, b) => {
  if (a == null || b == null) return false;
  const ta = Date.parse(String(a));
  return Number.isFinite(ta) && ta === Date.parse(String(b));
};

/** Os zeros desta linha da despensa são dados? */
export const microsTrusted = (food) => sameInstant(food?.micros_checked_at, food?.updated_at);

/** O que a despensa sabe deste micronutriente, ou null (por confirmar). */
export function pantryMicro(food, k) {
  const v = microOrNull(food?.[k]);
  return v === 0 && !microsTrusted(food) ? null : v;
}

/** Os micronutrientes por confirmar, em palavras ("fibra", "ferro"…).
    `fresh`: valores acabados de vir da Carol (modo pantry_food) — aí um 0 é
    dela, é dado. */
export function missingMicroWords(food, { fresh = false } = {}) {
  return MICRO_COLUMNS
    .filter((k) => (fresh ? microOrNull(food?.[k]) : pantryMicro(food, k)) == null)
    .map((k) => MICRO_WORDS[k]);
}

/** Completo: com os sete micronutrientes dados. Só uma refeição destes (sem
    fotos, sem perguntas da Carol em aberto) se regista sem o modelo — quem
    decide é o servidor (splitKnownWritten); aqui só se diz ao atleta. */
export const isPantryComplete = (food) => !!food && missingMicroWords(food).length === 0;

/** "fibra" · "fibra e ferro" · "fibra, ferro e potássio" */
export const listWords = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} e ${words[words.length - 1]}`);

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

/* Hábitos de quantidade (fase C dos #58/#66, 2026-10-17): o tema é
   "<alimento> · quantidade" — é assim que analyze-meal os grava
   (pantry.ts, parseQuestions). No Armário mostram-se à parte, só com o nome
   do alimento. */
export const QUANTITY_SUFFIX = ' · quantidade';

/** É um hábito de quantidade ("manteiga · quantidade")? */
// Também o plural e a forma antiga "quantidade de manteiga" — a mesma regra
// de isQuantityTopic em supabase/functions/analyze-meal/pantry.ts.
export function isQuantityRule(rule) {
  const t = String(rule?.topic || '');
  return /quantidades?\s*$/i.test(t) || /^\s*quantidades?\b/i.test(t);
}

/** O tema para mostrar: "manteiga · quantidade" e "quantidade de manteiga" → "manteiga". */
export function ruleLabel(rule) {
  const topic = String(rule?.topic || '');
  return topic
    .replace(/\s*·?\s*quantidades?\s*$/i, '')
    // "dos"/"das" antes de "do"/"da": senão "quantidade dos ovos" dava "s ovos".
    .replace(/^\s*quantidades?\s+(?:(?:dos|das|de|do|da)\b\s*)?/i, '')
    .trim() || topic;
}

/* Bug #74: os temas que só dizem o ingrediente ou o gesto. A mesma lista de
   GENERIC_TOPICS em supabase/functions/analyze-meal/pantry.ts — mudar uma é
   mudar a outra. */
const GENERIC_TOPICS = new Set([
  'tempero', 'temperos', 'azeite', 'oleo', 'manteiga', 'molho', 'molhos', 'gordura', 'sal', 'acucar', 'natas',
  'porcao', 'fritura',
]);

/** Um hábito de preparação aprendido sem dizer o prato ("tempero", "molho")?
 *  A Carol já não o usa (isDishlessHabit em analyze-meal/pantry.ts, a mesma
 *  regra) — o Armário diz isso. Não contam os escritos pelo atleta (foi ele
 *  que disse que valem para tudo) nem os de quantidade ("manteiga ·
 *  quantidade" é da própria manteiga). */
export function isDishlessRule(rule) {
  if (!rule || rule.source === 'manual' || rule.status !== 'confirmado' || isQuantityRule(rule)) return false;
  const core = String(rule.topic || '')
    .replace(/\bquantidades?\b/gi, ' ')
    .replace(/[·:]/g, ' ')
    .replace(/^\s*(?:de|do|da|dos|das)\s+/i, '');
  return GENERIC_TOPICS.has(foodKey(core));
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
  const nowISO = new Date().toISOString();
  /* Micronutrientes (2026-10-05): o atleta não os ajusta. A editar, ficam os
     que a despensa sabe (um 0 antigo, ambíguo, passa a null — por
     confirmar); um alimento novo leva os que a Carol deu, e null nos que não
     deu. Nunca um 0 inventado. A linha fica marcada (micros_checked_at =
     updated_at): a partir daqui os zeros dela são dados. */
  const micros = Object.fromEntries(MICRO_COLUMNS.map((k) => [
    k, existing ? pantryMicro(existing, k) : microOrNull(confirmed?.[k]),
  ]));
  const row = {
    user_id: userId,
    name: String(values.name || '').trim().slice(0, 120),
    name_key: foodKey(values.name),
    portion_grams: toNumber(values.portion_grams) > 0 ? toNumber(values.portion_grams) : null,
    portion_label: String(values.portion_label || '').trim().slice(0, 40) || null,
    ...Object.fromEntries(NUTRIENTS.filter((k) => !MICRO_COLUMNS.includes(k))
      .map((k) => [k, Math.max(0, toNumber(values[k] ?? confirmed?.[k] ?? 0) || 0)])),
    ...micros,
    in_pantry: true,
    edited_by_athlete: (existing?.edited_by_athlete ?? false) || (existing ? changed : changed && !!confirmed),
    micros_checked_at: nowISO,
    updated_at: nowISO,
  };
  if (!row.name_key) throw new Error('Dá um nome ao alimento.');
  if (existing?.id) {
    const { data, error } = await supabase.from('athlete_foods').update(row).eq('id', existing.id).select().single();
    if (error) throw new Error(error.code === '23505' ? 'Já tens um alimento com esse nome na despensa.' : error.message);
    return data;
  }
  // Já vista numa refeição (fora da despensa)? Entra, sem perder as vezes
  // que já apareceu nem de onde veio (revisão pré-master).
  const { data: prev, error: prevError } = await supabase.from('athlete_foods')
    .select('id, times_seen, source, in_pantry').eq('user_id', userId).eq('name_key', row.name_key).maybeSingle();
  // Sem esta leitura não se sabe se escreve por cima — não grava às cegas.
  if (prevError) throw new Error('Não foi possível confirmar a despensa. Tenta novamente.');
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

// ── Refeições predefinidas (bug #63, fase D, 2026-10-17) ─────────────────
// specs/carol-quantidades-habitos-refeicoes.md §5. Tabela
// athlete_meal_templates: os itens guardam-se pelo NOME e as gramas — é
// pelo nome que a analyze-meal reconhece um alimento da despensa e o regista
// sem estimativa (pantry.ts, splitKnownWritten).

/** Os itens de uma refeição predefinida, limpos: nome, gramas (> 0 ou null). */
export function templateItems(template) {
  return (Array.isArray(template?.items) ? template.items : [])
    .map((it) => ({
      food_id: it?.food_id ?? null,
      name: String(it?.name ?? '').trim().slice(0, 120),
      grams: toNumber(it?.grams) > 0 ? Math.round(toNumber(it.grams)) : null,
    }))
    .filter((it) => it.name);
}

/** kcal e proteína da refeição pelos valores da despensa — só dos alimentos
 *  que lá estão e têm gramas; `known` diz quantos foram contados. */
export function templateTotals(template, foods) {
  const byKey = new Map((foods || []).map((f) => [f.name_key, f]));
  let kcal = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let known = 0;
  const items = templateItems(template);
  for (const it of items) {
    const f = byKey.get(foodKey(it.name));
    const grams = it.grams ?? (Number(f?.portion_grams) > 0 ? Number(f.portion_grams) : null);
    if (!f || !grams) continue;
    kcal += (Number(f.calories_per_100g) || 0) * grams / 100;
    protein += (Number(f.protein_per_100g) || 0) * grams / 100;
    carbs += (Number(f.carbs_per_100g) || 0) * grams / 100;
    fat += (Number(f.fat_per_100g) || 0) * grams / 100;
    known += 1;
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  return { kcal: Math.round(kcal), protein: r1(protein), carbs: r1(carbs), fat: r1(fat), known, total: items.length };
}

/** As refeições para o registo: as deste tipo primeiro, depois as mais usadas. */
export function templatesForMealType(templates, mealType) {
  return [...(templates || [])].sort((a, b) =>
    (Number(b.default_meal_type === mealType) - Number(a.default_meal_type === mealType))
    || ((b.times_used || 0) - (a.times_used || 0))
    || String(a.name).localeCompare(String(b.name), 'pt'));
}

export async function saveMealTemplate({ userId, values, existing = null }) {
  const name = String(values?.name || '').trim().slice(0, 60);
  const items = templateItems({ items: values?.items });
  if (!foodKey(name)) throw new Error('Dá um nome à refeição.');
  if (!items.length) throw new Error('Junta pelo menos um alimento.');
  const row = {
    name, name_key: foodKey(name), default_meal_type: values?.default_meal_type || null,
    items, updated_at: new Date().toISOString(),
  };
  // A editar não se manda user_id: com o perfil ainda por carregar ia a null
  // e o update falhava (revisão pré-master). A RLS já prende a linha ao dono.
  const q = existing?.id
    ? supabase.from('athlete_meal_templates').update(row).eq('id', existing.id)
    : supabase.from('athlete_meal_templates').insert({ ...row, user_id: userId });
  const { data, error } = await q.select().single();
  if (error) throw new Error(error.code === '23505' ? 'Já tens uma refeição com esse nome.' : error.message);
  return data;
}

export async function deleteMealTemplate(id) {
  const { error } = await supabase.from('athlete_meal_templates').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Conta mais uma vez que foi usada — best-effort, nunca rejeita. Devolve
 *  o valor novo, para quem chama o pôr no store: sem isso, dois usos na mesma
 *  sessão partiam do mesmo número e o segundo perdia-se (revisão pré-master). */
export async function markMealTemplateUsed(template) {
  const times_used = (template?.times_used || 0) + 1;
  try {
    const res = await supabase.from('athlete_meal_templates')
      .update({ times_used, last_used_at: new Date().toISOString() })
      .eq('id', template.id);
    if (res?.error) throw res.error;
    return times_used;
  } catch (e) {
    // Não gravou: null, e o store fica como a base de dados (revisão pré-master).
    console.warn('Refeição predefinida por contar', e);
    return null;
  }
}

/** O nome sugerido para guardar uma refeição registada: o tipo e o 1.º
 *  alimento ("Almoço · Arroz basmati") — só "Almoço" colidia logo à segunda
 *  vez (nome único por atleta). */
export function suggestedTemplateName(typeLabel, items) {
  const first = templateItems({ items })[0]?.name;
  const full = [typeLabel, first].filter(Boolean).join(' · ');
  if (full.length <= 60) return full;
  // Corta numa palavra inteira, nunca a meio de um nome.
  const cut = full.slice(0, 60);
  const tidy = (s) => s.replace(/[\s·]+$/, '');
  // A palavra acaba mesmo no limite: cabe toda.
  if (full[60] === ' ') return tidy(cut);
  const space = cut.lastIndexOf(' ');
  // Um alimento de uma palavra só, comprida: o único espaço é o do " · " —
  // cortar aí deixava só o tipo. Corta-se a palavra a direito.
  const sep = typeLabel ? `${typeLabel} ·`.length : -1;
  if (space <= sep) return tidy(cut);
  return tidy(cut.slice(0, space));
}

/* Bug #75 (2026-10-20): o peso habitual de um alimento — um hábito de
   quantidade confirmado ("arroz branco cozido · quantidade: 150 g", duas
   vezes o mesmo peso) ganha à porção da despensa. Devolve { grams, habitual }:
   habitual=true quando vem do hábito. */
export function foodDefaultGrams(food, rules) {
  const key = String(food?.name_key || foodKey(food?.name));
  const candidates = (rules || []).filter((r) => r?.status === 'confirmado' && isQuantityRule(r));
  // O igual exato primeiro; o prefixo só quando o tema foi cortado (27 letras).
  const rule = candidates.find((r) => foodKey(ruleLabel(r)) === key)
    || candidates.find((r) => {
      const label = foodKey(ruleLabel(r));
      return String(ruleLabel(r)).length >= 27 && !!label && key.startsWith(label);
    });
  const m = rule && String(rule.value || '').match(/(\d+(?:[.,]\d+)?)\s*g(?:ramas?)?(?![a-z])/i);
  const fromRule = m ? Math.round(Number(m[1].replace(',', '.'))) : null;
  if (fromRule > 0) return { grams: fromRule, habitual: true };
  const portion = Number(food?.portion_grams);
  return { grams: portion > 0 ? Math.round(portion) : null, habitual: false };
}
