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

/** As colunas de meal_items que a análise escreve. O resto que um item traz
 *  pelo caminho (source_index, from_label) não é coluna — sai aqui. */
const MEAL_ITEM_COLUMNS = ["name", "quantity_grams", ...NUTRIENT_COLUMNS] as const;

// deno-lint-ignore no-explicit-any
export function pickMealItem(it: any): Record<string, unknown> {
  return Object.fromEntries(MEAL_ITEM_COLUMNS.map((k) => [k, it?.[k] ?? (k === "name" ? "Alimento" : 0)]));
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
} & Partial<Record<(typeof NUTRIENT_COLUMNS)[number], number>>;

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
        .select("name, name_key, portion_grams, portion_label, times_seen, in_pantry, source, edited_by_athlete, " + NUTRIENT_COLUMNS.join(", "))
        .eq("user_id", userId)
        .eq("in_pantry", true)
        .order("times_seen", { ascending: false })
        .limit(PANTRY_PROMPT_LIMIT),
      sb.from("athlete_food_rules")
        .select("topic, topic_key, value, value_key, confirmations, status, source")
        .eq("user_id", userId)
        .in("status", ["confirmado", "varia"]),
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
 *  ser o dela. As gramas ficam as do item. */
// deno-lint-ignore no-explicit-any
export function withPantryValues<T extends Record<string, any>>(item: T, food: PantryFood): T {
  const values = Object.fromEntries(NUTRIENT_COLUMNS.map((k) => [k, num(food[k])]));
  return { ...item, ...values, name: food.name, from_pantry: true };
}

/** Um item analisado (das fotos, ou escrito e juntado às fotos) que já está
 *  na despensa fica com os valores dela. Um rótulo lido agora não se troca:
 *  é ele que vai atualizar a despensa. */
// deno-lint-ignore no-explicit-any
export function applyPantry<T extends Record<string, any>>(items: T[], byKey: Map<string, PantryFood>): T[] {
  return items.map((it) => {
    if (it?.from_label) return it;
    const food = byKey.get(foodKey(it?.name));
    return food ? withPantryValues(it, food) : it;
  });
}

/**
 * Registo só escrito: os alimentos que ela já conhece não vão ao Gemini.
 * Conhecido = na despensa, e com gramas (as escritas, ou a porção habitual).
 *   known: índice → item pronto a gravar; unknown: os que faltam estimar.
 */
export function splitKnownWritten(
  written: { name: string; grams: number | null }[],
  byKey: Map<string, PantryFood>,
): { known: Map<number, Record<string, unknown>>; unknown: { index: number; item: { name: string; grams: number | null } }[] } {
  const known = new Map<number, Record<string, unknown>>();
  const unknown: { index: number; item: { name: string; grams: number | null } }[] = [];
  written.forEach((w, index) => {
    const food = byKey.get(foodKey(w.name));
    const grams = w.grams ?? (food?.portion_grams ? Number(food.portion_grams) : null);
    if (food && grams) known.set(index, withPantryValues({ quantity_grams: grams }, food));
    else unknown.push({ index, item: w });
  });
  return { known, unknown };
}

// ── Aprender ──────────────────────────────────────────────────────────────

/** A linha de athlete_foods depois de mais uma refeição com este alimento. */
// deno-lint-ignore no-explicit-any
export function nextFoodRow(existing: PantryFood | null, item: any, userId: string, nowISO: string): Record<string, unknown> | null {
  const key = foodKey(item?.name);
  if (!key) return null;
  const fromLabel = item?.from_label === true;
  const seen = (existing?.times_seen ?? 0) + 1;
  const wasIn = existing?.in_pantry === true;
  // Na despensa, os valores ficam — a não ser um rótulo novo; ajustados à
  // mão, ficam sempre.
  const keepValues = !!existing && (existing.edited_by_athlete || (wasIn && !fromLabel));
  const values = Object.fromEntries(NUTRIENT_COLUMNS.map((k) => [k, keepValues ? num(existing![k]) : num(item?.[k])]));
  return {
    user_id: userId,
    name: existing && (wasIn || existing.edited_by_athlete) ? existing.name : String(item.name).slice(0, 120),
    name_key: key,
    portion_grams: existing?.portion_grams ?? (num(item?.quantity_grams) || null),
    portion_label: existing?.portion_label ?? null,
    ...values,
    times_seen: seen,
    in_pantry: wasIn || fromLabel || seen >= 2,
    source: fromLabel && !existing?.edited_by_athlete ? "rotulo" : (existing?.source ?? "refeicao"),
    edited_by_athlete: existing?.edited_by_athlete ?? false,
    last_used_at: nowISO,
    updated_at: nowISO,
  };
}

/** A regra depois de mais uma observação sobre o mesmo tema. null = não
 *  mexer (uma regra que o atleta escreveu à mão só ele a muda). */
export function nextRuleRow(existing: FoodRule | null, fact: CookingFact, userId: string, nowISO: string): Record<string, unknown> | null {
  const topic_key = foodKey(fact.topic);
  const value_key = foodKey(fact.value);
  if (!topic_key || !value_key) return null;
  const base = { user_id: userId, topic: fact.topic.slice(0, 40), topic_key, updated_at: nowISO };
  if (!existing) {
    return { ...base, value: fact.value.slice(0, 60), value_key, confirmations: 1, status: "por_confirmar", source: "observacao" };
  }
  if (existing.source === "manual") return null;
  if (existing.value_key === value_key) {
    const confirmations = existing.confirmations + 1;
    const status = existing.status === "varia"
      ? (confirmations >= 3 ? "confirmado" : "varia")
      : (confirmations >= 2 ? "confirmado" : "por_confirmar");
    return { ...base, topic: existing.topic, value: existing.value, value_key, confirmations, status, source: existing.source };
  }
  return {
    ...base, value: fact.value.slice(0, 60), value_key, confirmations: 1,
    status: existing.status === "por_confirmar" ? "por_confirmar" : "varia", source: "observacao",
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
        .select("name, name_key, portion_grams, portion_label, times_seen, in_pantry, source, edited_by_athlete, " + NUTRIENT_COLUMNS.join(", "))
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

    if (facts.length) {
      const keys = facts.map((f) => foodKey(f.topic)).filter(Boolean);
      const { data: existingRules, error } = await sb.from("athlete_food_rules")
        .select("topic, topic_key, value, value_key, confirmations, status, source")
        .eq("user_id", userId)
        .in("topic_key", keys);
      if (error) throw error;
      const prev = new Map<string, FoodRule>((existingRules ?? []).map((r: FoodRule) => [r.topic_key, r]));
      const seenTopics = new Set<string>();
      const rows = facts
        .filter((f) => { const k = foodKey(f.topic); if (seenTopics.has(k)) return false; seenTopics.add(k); return true; })
        .map((f) => nextRuleRow(prev.get(foodKey(f.topic)) ?? null, f, userId, nowISO))
        .filter((r): r is Record<string, unknown> => !!r);
      if (rows.length) {
        const { error: upErr } = await sb.from("athlete_food_rules").upsert(rows, { onConflict: "user_id,topic_key" });
        if (upErr) throw upErr;
      }
    }
  } catch (e) {
    console.warn("Despensa por atualizar:", e instanceof Error ? e.message : e);
  }
  return { fromLabel };
}
