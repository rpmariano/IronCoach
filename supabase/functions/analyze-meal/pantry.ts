// O que a Carol sabe de como o atleta come (bugs #48 e #52, fase A,
// 2026-10-04). Fora do index.ts para se poder testar: o index arranca o
// servidor ao ser importado.
//
// Duas tabelas (migração 20261003233613_athlete_pantry):
//   · athlete_foods — os alimentos dele, com os valores por 100 g. Um alimento
//     entra na despensa (in_pantry) à SEGUNDA vez que aparece numa refeição,
//     ou logo, quando vem de um rótulo lido numa foto (ou, na fase C, quando o
//     atleta o adiciona à mão). Na despensa, os valores ficam: a Carol já o
//     conhece e não o volta a estimar. Ajustado à mão (edited_by_athlete),
//     nem um rótulo o reescreve.
//   · athlete_food_rules — como ele cozinha e tempera ("fritos → azeite").
//     Vêm das observações; confirmam-se à segunda vez igual. Uma regra
//     confirmada que depois muda passa a "varia".
//
// Tudo isto é best-effort: uma falha a ler ou a aprender nunca trava o
// registo da refeição.

import { foodKey } from "../_shared/formulas/foodKey.ts";

export const NUTRIENT_COLUMNS = [
  "calories_per_100g", "protein_per_100g", "carbs_per_100g", "fat_per_100g",
  "fiber_per_100g", "sugar_per_100g", "sodium_per_100g", "iron_mg_per_100g",
  "calcium_mg_per_100g", "vitamin_c_mg_per_100g", "potassium_mg_per_100g",
] as const;

/** Os micronutrientes (D6 da Evolução, 2026-10-05): podem ficar por saber.
 *  Calorias e macros não — sem eles a refeição não tem números. */
export const MICRO_COLUMNS = [
  "fiber_per_100g", "sugar_per_100g", "sodium_per_100g", "iron_mg_per_100g",
  "calcium_mg_per_100g", "vitamin_c_mg_per_100g", "potassium_mg_per_100g",
] as const;
const MICRO_SET: ReadonlySet<string> = new Set(MICRO_COLUMNS);
export const isMicroColumn = (k: string): boolean => MICRO_SET.has(k);

/**
 * Um micronutriente como se grava em meal_items (D6, 2026-10-05): o número
 * (≥ 0) quando há, null quando não há. Até aqui virava 0 — e um 0 tanto
 * queria dizer "não tem" como "não sei", o que tornava impossível dizer
 * "dado em X% dos alimentos". Atenção a Number(null) = 0: null/undefined/""
 * ficam null antes de converter. Um valor inválido (negativo, NaN, texto)
 * também é "não sei", não 0.
 */
export function microOrNull(v: unknown): number | null {
  if (v == null || (typeof v === "string" && !v.trim())) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Um micronutriente na resposta do modelo: só um número é um valor (como o
 *  num() de sempre, que não aceitava texto); o resto — campo ausente, null,
 *  texto, negativo — é "não deu", null (D6, 2026-10-05). */
export function microFromModel(v: unknown): number | null {
  return typeof v === "number" ? microOrNull(v) : null;
}

// ── Os micronutrientes da despensa (2026-10-05) ──────────────────────────
// Migração 20261005100000_pantry_micronutrients_nullable: em athlete_foods
// os micronutrientes passam a nuláveis (null = por confirmar) e a linha ganha
// micros_checked_at. A REGRA, em três casos, por micronutriente:
//   · null                → por confirmar;
//   · > 0                 → dado (um valor positivo nunca foi inventado);
//   · 0                   → dado SÓ se micros_checked_at = updated_at (foi o
//     código novo, que grava null no que não sabe, o último a escrever a
//     linha); senão é um 0 antigo, ambíguo — por confirmar.
// Um micronutriente por confirmar preenche-se com o que uma análise der
// (nextFoodRow); um dado nunca se escreve por cima, a não ser por um rótulo.

/** As colunas que se leem de athlete_foods (as de sempre + o que diz se os
 *  zeros da linha são dados). */
export const FOOD_SELECT =
  "name, name_key, portion_grams, portion_label, times_seen, in_pantry, source, edited_by_athlete, micros_checked_at, updated_at, " +
  NUTRIENT_COLUMNS.join(", ");

const sameInstant = (a: unknown, b: unknown): boolean => {
  if (a == null || b == null) return false;
  const ta = Date.parse(String(a));
  return Number.isFinite(ta) && ta === Date.parse(String(b));
};

/** Os zeros desta linha são dados? (micros_checked_at = updated_at) */
// deno-lint-ignore no-explicit-any
export function microsTrusted(food: any): boolean {
  return sameInstant(food?.micros_checked_at, food?.updated_at);
}

/** O que a despensa sabe deste micronutriente, ou null se está por confirmar. */
// deno-lint-ignore no-explicit-any
export function pantryMicro(food: any, k: string): number | null {
  const v = microOrNull(food?.[k]);
  if (v === 0 && !microsTrusted(food)) return null;
  return v;
}

/** Os micronutrientes por confirmar deste alimento da despensa. */
// deno-lint-ignore no-explicit-any
export function missingMicros(food: any): string[] {
  return MICRO_COLUMNS.filter((k) => pantryMicro(food, k) == null);
}

/** Completo: calorias e macros com número, e os sete micronutrientes dados.
 *  Só um alimento completo se regista sem o Gemini (splitKnownWritten). */
// deno-lint-ignore no-explicit-any
export function isPantryComplete(food: any): boolean {
  if (!food) return false;
  const macrosOk = NUTRIENT_COLUMNS.filter((k) => !isMicroColumn(k))
    .every((k) => food[k] != null && Number.isFinite(Number(food[k])) && Number(food[k]) >= 0);
  return macrosOk && missingMicros(food).length === 0;
}

// Raiz de uma palavra, para "fritos" ↔ "frita", "ovos" ↔ "ovo", "batatas" ↔
// "batata": tira o -s do plural e, em palavras de 4+ letras, a vogal final.
const stem = (w: string): string => {
  let s = w.endsWith("s") && w.length > 3 ? w.slice(0, -1) : w;
  if (s.length >= 4 && /[aeo]$/.test(s)) s = s.slice(0, -1);
  return s;
};
const stems = (text: unknown): Set<string> =>
  new Set(foodKey(text).split(" ").filter((w) => w.length >= 3 && /[a-z]/.test(w)).map(stem));

/**
 * As perguntas da Carol que ainda estão em aberto para este alimento: uma
 * regra "por confirmar" (vista uma vez) ou "varia" (ela continua a perguntar,
 * ruleInfo no Armário) cujo tema partilha uma palavra com o nome dele
 * ("frango" → "Peito de frango"). Um falso positivo custa só uma chamada ao
 * modelo; um falso negativo era registar às cegas o que ela prometeu
 * perguntar — por isso a comparação é larga (raiz da palavra).
 */
export function pendingRulesFor(name: unknown, rules: FoodRule[]): FoodRule[] {
  const words = stems(name);
  if (!words.size) return [];
  return (rules || []).filter((r) =>
    (r.status === "por_confirmar" || r.status === "varia") &&
    [...stems(r.topic)].some((w) => words.has(w))
  );
}

/** As colunas de meal_items que a análise escreve. O resto que um item traz
 *  pelo caminho (source_index, from_label) não é coluna — sai aqui. */
const MEAL_ITEM_COLUMNS = ["name", "quantity_grams", ...NUTRIENT_COLUMNS] as const;

// deno-lint-ignore no-explicit-any
export function pickMealItem(it: any): Record<string, unknown> {
  // Micronutriente em falta grava null, não 0 (D6, 2026-10-05) — precisa da
  // migração 20261005090000_micronutrients_nullable aplicada antes.
  return Object.fromEntries(MEAL_ITEM_COLUMNS.map((k) => [
    k,
    isMicroColumn(k) ? microOrNull(it?.[k]) : it?.[k] ?? (k === "name" ? "Alimento" : 0),
  ]));
}

export type PantryFood = {
  id?: string;
  name: string;
  name_key: string;
  portion_grams: number | null;
  portion_label: string | null;
  times_seen: number;
  in_pantry: boolean;
  source: "refeicao" | "rotulo" | "manual";
  edited_by_athlete: boolean;
  // Ver "Os micronutrientes da despensa": os zeros só são dados com
  // micros_checked_at = updated_at (2026-10-05).
  micros_checked_at?: string | null;
  updated_at?: string | null;
} & Partial<Record<(typeof NUTRIENT_COLUMNS)[number], number | null>>;

export type FoodRule = {
  topic: string;
  topic_key: string;
  value: string;
  value_key: string;
  confirmations: number;
  status: "por_confirmar" | "confirmado" | "varia";
  source: "observacao" | "resposta" | "manual";
};

export type CookingFact = { topic: string; value: string };

export type Pantry = { foods: PantryFood[]; rules: FoodRule[]; byKey: Map<string, PantryFood> };

export const EMPTY_PANTRY: Pantry = { foods: [], rules: [], byKey: new Map() };

/** Quantos alimentos da despensa vão no pedido ao Gemini — os mais usados. */
export const PANTRY_PROMPT_LIMIT = 80;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** A despensa (só o que já lá está) e as regras, para o pedido da análise. */
// deno-lint-ignore no-explicit-any
export async function fetchPantry(sb: any, userId: string): Promise<Pantry> {
  try {
    const [foodsRes, rulesRes] = await Promise.all([
      sb.from("athlete_foods")
        .select(FOOD_SELECT)
        .eq("user_id", userId)
        .eq("in_pantry", true)
        .order("times_seen", { ascending: false })
        .limit(PANTRY_PROMPT_LIMIT),
      // Todas as regras, também as por confirmar (2026-10-05): uma por
      // confirmar é uma pergunta em aberto (pendingRulesFor). O pedido ao
      // modelo continua a levar só as confirmadas e as que variam
      // (knowledgeSection filtra), e as perguntas só fogem das confirmadas.
      sb.from("athlete_food_rules")
        .select("topic, topic_key, value, value_key, confirmations, status, source")
        .eq("user_id", userId),
    ]);
    const foods: PantryFood[] = foodsRes?.error ? [] : (foodsRes?.data ?? []);
    const rules: FoodRule[] = rulesRes?.error ? [] : (rulesRes?.data ?? []);
    if (foodsRes?.error) console.warn("Despensa não lida:", foodsRes.error.message);
    if (rulesRes?.error) console.warn("Regras de cozinha não lidas:", rulesRes.error.message);
    return { foods, rules, byKey: new Map(foods.map((f) => [f.name_key, f])) };
  } catch (e) {
    console.warn("Despensa não lida:", e instanceof Error ? e.message : e);
    return EMPTY_PANTRY;
  }
}

/** A secção do pedido de análise com o que ela já sabe. "" sem nada — o
 *  pedido de quem ainda não tem despensa fica igual ao de sempre. */
export function knowledgeSection(foods: PantryFood[], rules: FoodRule[]): string {
  const certas = rules.filter((r) => r.status === "confirmado");
  const variam = rules.filter((r) => r.status === "varia");
  if (!foods.length && !certas.length && !variam.length) return "";
  let s = "\n\nO QUE JÁ SABES DESTE ATLETA (aprendido com ele):";
  if (certas.length) {
    s += `\nComo cozinha e tempera — usa isto em vez de adivinhar (a observação desta refeição, se disser outra coisa, ganha): ` +
      certas.map((r) => `${r.topic}: ${r.value}`).join("; ") + ".";
  }
  if (variam.length) {
    s += `\nVaria de vez para vez — não assumas o que foi da última vez: ` + variam.map((r) => r.topic).join(", ") + ".";
  }
  if (foods.length) {
    s += "\nAlimentos que ele já tem guardados — quando um destes aparecer, escrito ou nas fotos, usa EXATAMENTE este nome:\n" +
      foods.slice(0, PANTRY_PROMPT_LIMIT)
        .map((f) => `- ${f.name}${f.portion_grams ? ` (porção habitual ${f.portion_label ? `${f.portion_label}, ` : ""}${Math.round(f.portion_grams)} g)` : ""}`)
        .join("\n");
  }
  return s;
}

/** Os valores por 100 g da despensa, no lugar dos estimados; o nome passa a
 *  ser o dela. As gramas ficam as do item.
 *  Micronutrientes (2026-10-05): os da despensa quando ela os sabe
 *  (pantryMicro — um 0 antigo, ambíguo, não conta como sabido); senão o que
 *  o item já trazia da análise (null se nada). É esse valor da análise que
 *  depois preenche a despensa (nextFoodRow). Nunca se inventa um 0.
 *  `pending`: há perguntas da Carol em aberto sobre este alimento
 *  (pendingRulesFor) — parseQuestions deixa-a perguntar. */
// deno-lint-ignore no-explicit-any
export function withPantryValues<T extends Record<string, any>>(item: T, food: PantryFood, pending = false): T {
  const values = Object.fromEntries(NUTRIENT_COLUMNS.map((k) => {
    if (!isMicroColumn(k)) return [k, num(food[k])];
    return [k, pantryMicro(food, k) ?? microOrNull(item?.[k])];
  }));
  return { ...item, ...values, name: food.name, from_pantry: true, ...(pending ? { pantry_pending: true } : {}) };
}

/** Um item analisado (das fotos, ou escrito e juntado às fotos) que já está
 *  na despensa fica com os valores dela. Um rótulo lido agora não se troca:
 *  é ele que vai atualizar a despensa. `rules`: para marcar os que têm
 *  perguntas em aberto (2026-10-05). */
// deno-lint-ignore no-explicit-any
export function applyPantry<T extends Record<string, any>>(items: T[], byKey: Map<string, PantryFood>, rules: FoodRule[] = []): T[] {
  return items.map((it) => {
    if (it?.from_label) return it;
    const food = byKey.get(foodKey(it?.name));
    return food ? withPantryValues(it, food, pendingRulesFor(food.name, rules).length > 0) : it;
  });
}

type WrittenItem = { name: string; grams: number | null };

/**
 * Registo só escrito: o que ela já conhece por inteiro não vai ao Gemini.
 * Conhecido (2026-10-05) = na despensa, com gramas (as escritas, ou a porção
 * habitual), COMPLETO (isPantryComplete: os sete micronutrientes dados) e
 * sem perguntas da Carol em aberto sobre ele (pendingRulesFor). Uma refeição
 * só destes calcula-se aqui, sem chamada ao modelo para os valores.
 *   known: índice → item pronto a gravar;
 *   unknown: os que vão ao modelo. Os que estão na despensa mas não chegam
 *   (micronutrientes por confirmar, perguntas em aberto, sem gramas) levam
 *   `food`: vão com o nome dela e as gramas dela, e a resposta do modelo só
 *   serve para o que lhe falta — o resto fica o da despensa (withPantryValues).
 */
export function splitKnownWritten(
  written: WrittenItem[],
  byKey: Map<string, PantryFood>,
  rules: FoodRule[] = [],
): { known: Map<number, Record<string, unknown>>; unknown: { index: number; item: WrittenItem; food?: PantryFood; pending?: boolean }[] } {
  const known = new Map<number, Record<string, unknown>>();
  const unknown: { index: number; item: WrittenItem; food?: PantryFood; pending?: boolean }[] = [];
  written.forEach((w, index) => {
    const food = byKey.get(foodKey(w.name));
    if (!food) {
      unknown.push({ index, item: w });
      return;
    }
    const grams = w.grams ?? (food.portion_grams ? Number(food.portion_grams) : null);
    const pending = pendingRulesFor(food.name, rules).length > 0;
    if (grams && !pending && isPantryComplete(food)) known.set(index, withPantryValues({ quantity_grams: grams }, food));
    else unknown.push({ index, item: { name: food.name, grams }, food, pending });
  });
  return { known, unknown };
}

// ── Aprender ──────────────────────────────────────────────────────────────

/**
 * A linha de athlete_foods depois de mais uma refeição com este alimento.
 * Calorias e macros: na despensa ficam — a não ser um rótulo novo;
 * ajustados à mão, ficam sempre.
 * Micronutrientes (2026-10-05) — a regra de "Os micronutrientes da
 * despensa", lá em cima:
 *   · quando a linha guarda os valores (na despensa / ajustada à mão), um
 *     micronutriente dado fica; um por confirmar (null, ou 0 antigo)
 *     preenche-se com o que esta análise deu;
 *   · quando a linha leva os valores novos (ainda fora da despensa, ou um
 *     rótulo), o que a análise deu ganha; o que não deu fica o que a
 *     despensa já sabia — um valor dado nunca se troca por um "não sei".
 *   · o que ninguém sabe grava null (nunca 0), e a linha fica marcada
 *     (micros_checked_at = updated_at): a partir daqui os zeros dela são
 *     dados. Um 0 antigo que esta análise não confirmou passa a null — era
 *     "por confirmar", agora diz-se.
 */
// deno-lint-ignore no-explicit-any
export function nextFoodRow(existing: PantryFood | null, item: any, userId: string, nowISO: string): Record<string, unknown> | null {
  const key = foodKey(item?.name);
  if (!key) return null;
  const fromLabel = item?.from_label === true;
  const seen = (existing?.times_seen ?? 0) + 1;
  const wasIn = existing?.in_pantry === true;
  const keepValues = !!existing && (existing.edited_by_athlete || (wasIn && !fromLabel));
  const values = Object.fromEntries(NUTRIENT_COLUMNS.map((k) => {
    if (!isMicroColumn(k)) return [k, keepValues ? num(existing![k]) : num(item?.[k])];
    const known = existing ? pantryMicro(existing, k) : null;
    const fresh = microOrNull(item?.[k]);
    return [k, keepValues ? (known ?? fresh) : (fresh ?? known)];
  }));
  return {
    user_id: userId,
    name: existing && (wasIn || existing.edited_by_athlete) ? existing.name : String(item.name).slice(0, 120),
    name_key: key,
    portion_grams: existing?.portion_grams ?? (num(item?.quantity_grams) || null),
    portion_label: existing?.portion_label ?? null,
    ...values,
    micros_checked_at: nowISO,
    times_seen: seen,
    in_pantry: wasIn || fromLabel || seen >= 2,
    source: fromLabel && !existing?.edited_by_athlete ? "rotulo" : (existing?.source ?? "refeicao"),
    edited_by_athlete: existing?.edited_by_athlete ?? false,
    last_used_at: nowISO,
    updated_at: nowISO,
  };
}

/** A regra depois de mais uma observação — ou, desde a fase B, de mais uma
 *  resposta a uma pergunta da Carol — sobre o mesmo tema. null = não mexer
 *  (uma regra que o atleta escreveu à mão só ele a muda). */
export function nextRuleRow(
  existing: FoodRule | null,
  fact: CookingFact,
  userId: string,
  nowISO: string,
  source: "observacao" | "resposta" = "observacao",
): Record<string, unknown> | null {
  const topic_key = foodKey(fact.topic);
  const value_key = foodKey(fact.value);
  if (!topic_key || !value_key) return null;
  const base = { user_id: userId, topic: fact.topic.slice(0, 40), topic_key, updated_at: nowISO };
  if (!existing) {
    return { ...base, value: fact.value.slice(0, 60), value_key, confirmations: 1, status: "por_confirmar", source };
  }
  if (existing.source === "manual") return null;
  if (existing.value_key === value_key) {
    const confirmations = existing.confirmations + 1;
    const status = existing.status === "varia"
      ? (confirmations >= 3 ? "confirmado" : "varia")
      : (confirmations >= 2 ? "confirmado" : "por_confirmar");
    return { ...base, topic: existing.topic, value: existing.value, value_key, confirmations, status, source };
  }
  return {
    ...base, value: fact.value.slice(0, 60), value_key, confirmations: 1,
    status: existing.status === "por_confirmar" ? "por_confirmar" : "varia", source,
  };
}

/** Os factos de cozinha que o Gemini tirou das observações, limpos. */
export function parseCookingFacts(raw: unknown): CookingFact[] {
  if (!Array.isArray(raw)) return [];
  return raw
    // deno-lint-ignore no-explicit-any
    .map((f: any) => ({ topic: String(f?.topic ?? "").trim(), value: String(f?.value ?? "").trim() }))
    .filter((f) => f.topic && f.value && f.topic.length <= 40 && f.value.length <= 60)
    .slice(0, 5);
}

/**
 * Aprende com uma refeição acabada de gravar: cada alimento conta mais uma
 * vez (uma só, mesmo que apareça duas vezes na refeição) e as observações
 * somam às regras. Devolve os nomes que entraram na despensa por um rótulo.
 */
// deno-lint-ignore no-explicit-any
export async function learnFromMeal(sb: any, userId: string, items: any[], facts: CookingFact[], nowISO = new Date().toISOString()): Promise<{ fromLabel: string[] }> {
  const fromLabel: string[] = [];
  try {
    // deno-lint-ignore no-explicit-any
    const byKey = new Map<string, any>();
    for (const it of items || []) {
      const k = foodKey(it?.name);
      if (k && !byKey.has(k)) byKey.set(k, it);
    }
    if (byKey.size) {
      const { data: existing, error } = await sb.from("athlete_foods")
        .select(FOOD_SELECT)
        .eq("user_id", userId)
        .in("name_key", [...byKey.keys()]);
      if (error) throw error;
      const prev = new Map<string, PantryFood>((existing ?? []).map((f: PantryFood) => [f.name_key, f]));
      const rows = [...byKey.entries()]
        .map(([k, it]) => nextFoodRow(prev.get(k) ?? null, it, userId, nowISO))
        .filter((r): r is Record<string, unknown> => !!r);
      if (rows.length) {
        const { error: upErr } = await sb.from("athlete_foods").upsert(rows, { onConflict: "user_id,name_key" });
        if (upErr) throw upErr;
      }
      for (const [k, it] of byKey) {
        if (it?.from_label && !prev.get(k)?.edited_by_athlete) fromLabel.push(String(it.name));
      }
    }

    if (facts.length) await learnRules(sb, userId, facts, "observacao", nowISO);
  } catch (e) {
    console.warn("Despensa por atualizar:", e instanceof Error ? e.message : e);
  }
  return { fromLabel };
}

/**
 * Soma factos às regras de como ele cozinha — das observações de uma
 * refeição nova, ou das respostas às perguntas (fase B). Devolve como cada
 * regra ficou, para a app dizer "anotado" / "guardado" / "varia". Nunca
 * rejeita.
 */
export async function learnRules(
  // deno-lint-ignore no-explicit-any
  sb: any,
  userId: string,
  facts: CookingFact[],
  source: "observacao" | "resposta",
  nowISO = new Date().toISOString(),
): Promise<{ topic: string; value: string; status: string }[]> {
  try {
    const seenTopics = new Set<string>();
    const unique = facts.filter((f) => {
      const k = foodKey(f.topic);
      if (!k || seenTopics.has(k)) return false;
      seenTopics.add(k);
      return true;
    });
    if (!unique.length) return [];
    const { data: existingRules, error } = await sb.from("athlete_food_rules")
      .select("topic, topic_key, value, value_key, confirmations, status, source")
      .eq("user_id", userId)
      .in("topic_key", unique.map((f) => foodKey(f.topic)));
    if (error) throw error;
    const prev = new Map<string, FoodRule>((existingRules ?? []).map((r: FoodRule) => [r.topic_key, r]));
    const rows = unique
      .map((f) => nextRuleRow(prev.get(foodKey(f.topic)) ?? null, f, userId, nowISO, source))
      .filter((r): r is Record<string, unknown> => !!r);
    if (rows.length) {
      const { error: upErr } = await sb.from("athlete_food_rules").upsert(rows, { onConflict: "user_id,topic_key" });
      if (upErr) throw upErr;
    }
    return rows.map((r) => ({ topic: String(r.topic), value: String(r.value), status: String(r.status) }));
  } catch (e) {
    console.warn("Regras de cozinha por atualizar:", e instanceof Error ? e.message : e);
    return [];
  }
}

// ── Fase B: as perguntas da Carol ─────────────────────────────────────────

/** Uma pergunta ao atleta, guardada em meals.carol_questions. */
export type CarolQuestion = {
  id: string;
  topic: string;
  item_name: string;
  question: string;
  options: string[];
  assumed: string;
  impact_kcal: number;
  answer?: string | null;
  answered_at?: string | null;
};

/** Abaixo disto a resposta não muda nada que se veja: não se pergunta. */
export const MIN_QUESTION_IMPACT_KCAL = 50;
export const MAX_QUESTIONS = 2;

/**
 * As perguntas que o Gemini propôs, filtradas pelas regras da casa: no
 * máximo 2, só as que mudam ≥ 50 kcal, nunca sobre um tema já confirmado
 * (ela já sabe), nunca sobre um alimento da despensa (já o conhece — a não
 * ser que haja uma regra por confirmar ou que varia sobre ele, 2026-10-05), e
 * sempre presas a um alimento desta refeição. A opção assumida tem de estar
 * entre as opções — é a que a estimativa usou.
 */
export function parseQuestions(
  raw: unknown,
  // deno-lint-ignore no-explicit-any
  items: any[],
  rules: FoodRule[],
  newId: () => string = () => crypto.randomUUID(),
): CarolQuestion[] {
  if (!Array.isArray(raw)) return [];
  const confirmed = new Set(rules.filter((r) => r.status === "confirmado").map((r) => r.topic_key));
  const itemsByKey = new Map((items || []).map((it) => [foodKey(it?.name), it]));
  const seenTopics = new Set<string>();
  const out: CarolQuestion[] = [];
  for (const q of raw) {
    const topic = String(q?.topic ?? "").trim().slice(0, 40);
    const question = String(q?.question ?? "").trim().slice(0, 140);
    const itemName = String(q?.item_name ?? "").trim();
    const topicKey = foodKey(topic);
    const options = [...new Set((Array.isArray(q?.options) ? q.options : [])
      .map((o: unknown) => String(o ?? "").trim().slice(0, 40))
      .filter(Boolean))].slice(0, 4) as string[];
    const assumed = String(q?.assumed ?? "").trim().slice(0, 40);
    const impact = Math.round(Number(q?.impact_kcal));
    const item = itemsByKey.get(foodKey(itemName));
    // Da despensa, só se há perguntas em aberto sobre ele (pantry_pending,
    // 2026-10-05) — foi por isso que o modelo foi chamado.
    if (!topicKey || !question || options.length < 2 || !item || (item.from_pantry && !item.pantry_pending)) continue;
    if (!Number.isFinite(impact) || impact < MIN_QUESTION_IMPACT_KCAL) continue;
    if (confirmed.has(topicKey) || seenTopics.has(topicKey)) continue;
    if (!options.some((o) => foodKey(o) === foodKey(assumed))) continue;
    seenTopics.add(topicKey);
    out.push({ id: newId(), topic, item_name: String(item.name), question, options, assumed, impact_kcal: impact, answer: null, answered_at: null });
    if (out.length >= MAX_QUESTIONS) break;
  }
  return out;
}

/**
 * O servidor troca o nome que o Gemini deu a um alimento escrito pelo que o
 * atleta escreveu (mergePhotoAndWrittenItems, analyzeManualItems) — e as
 * perguntas vinham presas ao nome do Gemini, por isso parseQuestions não as
 * encontrava e caíam (revisão pré-master de 2026-10-04). Aqui passam para o
 * nome final. `pairs`: [nome do Gemini, nome final]; `finalNames`: os nomes
 * de todos os alimentos da refeição, já finais.
 */
export function remapQuestionItems(questions: unknown, pairs: [string, string][], finalNames: string[] = []): unknown {
  if (!Array.isArray(questions)) return questions;
  const finals = new Set(finalNames.map(foodKey));
  const byKey = new Map(pairs.map(([from, to]) => [foodKey(from), to]));
  // deno-lint-ignore no-explicit-any
  return questions.flatMap((q: any) => {
    const key = foodKey(q?.item_name);
    const to = byKey.get(key);
    if (finals.has(key)) {
      // Ambígua: "Arroz" é um alimento da refeição (da foto) e também o nome
      // que o Gemini deu ao "arroz basmati" escrito. Não se sabe de qual
      // fala, e a resposta ajustaria um deles às cegas — cai; a estimativa
      // fica (revisão do 51a04fc1).
      if (to && foodKey(to) !== key) return [];
      return [q];
    }
    return [to ? { ...q, item_name: to } : q];
  });
}

/**
 * A lista que vai no pedido tem só os 80 mais usados (PANTRY_PROMPT_LIMIT),
 * mas a app conta como conhecido tudo o que está na despensa: um alimento
 * escrito fora dos 80 dizia "já conhecido" e era estimado na mesma (revisão
 * pré-master). Junta-se ao mapa o que falta, procurado pelo nome. Com menos
 * de 80 na despensa o mapa já está completo e não se pergunta nada. Nunca
 * rejeita.
 */
// deno-lint-ignore no-explicit-any
export async function withWrittenFoods(sb: any, userId: string, pantry: Pantry, names: string[]): Promise<Pantry> {
  if (pantry.foods.length < PANTRY_PROMPT_LIMIT) return pantry;
  const missing = [...new Set(names.map(foodKey).filter((k) => k && !pantry.byKey.has(k)))];
  if (!missing.length) return pantry;
  try {
    const { data, error } = await sb.from("athlete_foods")
      .select(FOOD_SELECT)
      .eq("user_id", userId)
      .eq("in_pantry", true)
      .in("name_key", missing);
    if (error || !data?.length) return pantry;
    const byKey = new Map(pantry.byKey);
    for (const f of data as PantryFood[]) byKey.set(f.name_key, f);
    return { ...pantry, byKey };
  } catch {
    return pantry;
  }
}
