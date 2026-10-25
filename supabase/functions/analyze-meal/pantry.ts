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
import { fetchVariants, linkVariants, type VariantIndex, variantKnowledge } from "./variants.ts";

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
    // Um hábito de quantidade com gramas (o peso que ele escreveu, bug #75)
    // não é uma pergunta em aberto: o alimento continua sem ir ao modelo.
    !(/quantidades?\s*$/i.test(r.topic) && optionGrams(r.value) != null) &&
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

// variants (bug #87): os genéricos com variantes (variants.ts).
export type Pantry = { foods: PantryFood[]; rules: FoodRule[]; byKey: Map<string, PantryFood>; variants?: VariantIndex };

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
    const [foodsRes, rulesRes, variants] = await Promise.all([
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
      // Bug #87: as variantes e os genéricos delas (nunca rejeita).
      fetchVariants(sb, userId),
    ]);
    const foods: PantryFood[] = foodsRes?.error ? [] : (foodsRes?.data ?? []);
    const rules: FoodRule[] = rulesRes?.error ? [] : (rulesRes?.data ?? []);
    if (foodsRes?.error) console.warn("Despensa não lida:", foodsRes.error.message);
    if (rulesRes?.error) console.warn("Regras de cozinha não lidas:", rulesRes.error.message);
    return { foods, rules, byKey: new Map(foods.map((f) => [f.name_key, f])), variants };
  } catch (e) {
    console.warn("Despensa não lida:", e instanceof Error ? e.message : e);
    return EMPTY_PANTRY;
  }
}

/** A secção do pedido de análise com o que ela já sabe. "" sem nada — o
 *  pedido de quem ainda não tem despensa fica igual ao de sempre. */
export function knowledgeSection(foods: PantryFood[], rules: FoodRule[], variants?: VariantIndex): string {
  // Um hábito de PREPARAÇÃO aprendido sem prato ("tempero: 1 colher de
  // azeite") já não diz a que prato se aplica: não entra — ela pergunta e
  // aprende-o por prato. Ficam:
  // · os escritos pelo atleta (manual): foi ele que disse que valem para tudo;
  // · os de quantidade sem prato ("manteiga · quantidade"): são da própria
  //   manteiga quando vem como alimento à parte (contextualTopic não junta o
  //   prato quando o alimento É o ingrediente). Tirá-los calava a resposta
  //   dele — confirmada, não se volta a perguntar (revisão pré-master).
  const certas = rules.filter((r) => r.status === "confirmado" && !isDishlessHabit(r));
  const variam = rules.filter((r) => r.status === "varia");
  const comVariantes = variantKnowledge(variants);
  if (!foods.length && !certas.length && !variam.length && !comVariantes) return "";
  let s = "\n\nO QUE JÁ SABES DESTE ATLETA (aprendido com ele):";
  if (certas.length) {
    // Fase C dos #58/#66 (2026-10-17): também quanto costuma pôr ("manteiga ·
    // quantidade: camada fina, um lado (~5 g)"), e a observação desta
    // refeição passa a regra explícita — «anular a predefinição e assumir o
    // comentário». A regra contrariada passa a "varia" (nextRuleRow) e ela
    // volta a perguntar da próxima vez.
    s += `\nComo cozinha, tempera e quanto costuma pôr — usa isto em vez de adivinhar: ` +
      certas.map((r) => `${r.topic}${r.source === "manual" && isGenericTopic(r.topic) && !isQuantityTopic(r.topic) ? " (em qualquer prato)" : ""}: ${r.value}`).join("; ") + "." +
      // Bug #74 (2026-10-19): "tempero: 1 colher de azeite" não vale para tudo.
      `\nCada hábito vale SÓ para o prato ou alimento que nomeia ("azeite na salada" não serve para o esparguete), ` +
      `a não ser que diga "(em qualquer prato)"; um hábito de uma categoria ("fritos", "saladas", "grelhados") vale ` +
      `para os pratos dessa categoria; "<alimento> · quantidade" é quanto põe desse alimento quando aparece à parte.` +
      `\nA OBSERVAÇÃO DESTA REFEIÇÃO TEM PRIORIDADE sobre qualquer hábito acima: se disser outra coisa (ex.: "fritas em ` +
      `óleo" quando o hábito é air fryer, "muita manteiga" quando o hábito é camada fina), usa a observação nesta refeição ` +
      `e ignora o hábito.`;
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
  return s + comVariantes;
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
    .map((f: any) => {
      const topic = String(f?.topic ?? "").trim();
      // Uma quantidade das observações fica com o mesmo tema que a pergunta.
      return { topic: /quantidade/i.test(topic) ? quantityTopic(topic) : topic, value: String(f?.value ?? "").trim() };
    })
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
      // Bug #87: a variante fica ligada ao genérico (criado se ainda não existe).
      await linkVariants(sb, userId, [...byKey.values()].filter((it) => it?.variant_of && it?.variant_label), nowISO);
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
  // "preparacao" (como foi feito/temperado) ou "quantidade" (quanto — as
  // opções trazem as gramas, "(~N g)"). As gravadas antes de 2026-10-17 não
  // têm o campo: são de preparação. specs/carol-quantidades-habitos-refeicoes.md §4.1.
  // "variante" (bug #87, 2026-10-25): qual foi a variante de um genérico da
  // despensa («Coxa de frango: com pele ou sem pele?»). Gerada pelo servidor
  // a partir da base de dados (variants.ts), nunca pelo modelo; as opções
  // são os variant_label e o topic é o nome do genérico.
  kind: "preparacao" | "quantidade" | "variante";
  topic: string;
  item_name: string;
  question: string;
  options: string[];
  assumed: string;
  impact_kcal: number;
  // Quanto a resposta pode mudar a proteína, em g (bug #58/#66, 2026-10-17).
  impact_protein_g: number;
  answer?: string | null;
  answered_at?: string | null;
};

/** Abaixo disto a resposta não muda nada que se veja: não se pergunta.
 *  Basta passar UM dos dois: o fiambre do bug #58 mudava ~17 kcal mas ~3,5 g
 *  de proteína — e era a proteína que ela depois criticava. Até 5 perguntas
 *  (#66: «mais vale ir perguntando do que assumir»), as de mais impacto
 *  primeiro. specs/carol-quantidades-habitos-refeicoes.md §4.2. */
export const MIN_QUESTION_IMPACT_KCAL = 40;
export const MIN_QUESTION_IMPACT_PROTEIN_G = 4;
export const MAX_QUESTIONS = 5;

/** O peso de uma pergunta para a ordem: quantas vezes passa o limiar. */
const questionWeight = (q: CarolQuestion): number =>
  Math.max(q.impact_kcal / MIN_QUESTION_IMPACT_KCAL, q.impact_protein_g / MIN_QUESTION_IMPACT_PROTEIN_G);

/** As gramas que uma opção (ou resposta) de quantidade diz — "3 fatias finas
 *  (~35 g)", "20 g", "camada fina (≈5g)" — ou null se não diz. É com isto que
 *  uma resposta de quantidade se aplica sem o modelo: troca-se só as gramas. */
export function optionGrams(text: unknown): number | null {
  const s = String(text ?? "");
  const toNum = (v: string) => Number(v.replace(",", "."));
  // "2 fatias de 20 g" são 40 g, não 20 (revisão pré-master de 2026-10-17).
  const each = s.match(/(\d+(?:[.,]\d+)?)\s+[a-zà-ú]+(?:\s+[a-zà-ú]+)?\s+de\s+(\d+(?:[.,]\d+)?)\s*g(?:ramas?)?(?![a-z])/i);
  if (each) {
    const n = toNum(each[1]) * toNum(each[2]);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*g(?:ramas?)?(?![a-z])/i);
  if (!m) return null;
  const n = toNum(m[1]);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** As gramas do alimento depois de uma resposta de quantidade com gramas:
 *  soma-se a diferença entre a resposta e a assumida — num prato que veio num
 *  só item ("Tosta mista", 120 g) a pergunta "quanto fiambre?" mexe só na
 *  parte do fiambre. Sem gramas na assumida, ficam as da resposta. Nunca < 0. */
export function quantityAnswerGrams(itemGrams: number, answer: unknown, assumed: unknown): number | null {
  const a = optionGrams(answer);
  if (a == null) return null;
  const s = optionGrams(assumed);
  return s == null ? a : Math.max(0, Math.round((Number(itemGrams) || 0) + a - s));
}

/** Um tema de quantidade sempre como "<alimento> · quantidade": o modelo
 *  pode mandar "quantidade de manteiga" ou "manteiga quantidade", e as duas
 *  têm de ser a MESMA regra (para confirmar e deixar de perguntar) e cair em
 *  "Quanto costumas pôr" no Armário (revisão pré-master de 2026-10-17). */
export function quantityTopic(raw: unknown): string {
  const food = String(raw ?? "")
    .replace(/\bquantidades?\b/gi, " ")
    .replace(/^\s*(?:de|do|da|dos|das)\s+/i, "")
    .replace(/[·:\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return food ? `${food.slice(0, 27)} · quantidade` : "";
}

/**
 * As perguntas que o Gemini propôs, filtradas pelas regras da casa: no
 * máximo 5, só as que mudam ≥ 40 kcal ou ≥ 4 g de proteína (as de mais
 * impacto primeiro), nunca sobre um tema já confirmado
 * (ela já sabe), nunca sobre um alimento da despensa (já o conhece — a não
 * ser que haja uma regra por confirmar ou que varia sobre ele, 2026-10-05), e
 * sempre presas a um alimento desta refeição. A opção assumida tem de estar
 * entre as opções — é a que a estimativa usou.
 * Quantidade (2026-10-17): cada opção tem de dizer as gramas (optionGrams),
 * nunca sobre gramas que o atleta escreveu (grams_explicit), e o tema passa a
 * "<alimento> · quantidade" — é assim que fica nas regras e que, confirmado,
 * deixa de se perguntar.
 */
/**
 * Bug #86: «que % de gordura tem a carne?» — quem comeu não sabe responder a
 * percentagens, teores nem valores nutricionais; isso é a Carol que estima
 * (vai para assumed). O prompt já o proíbe (QUESTIONS_RULE); isto é a rede de
 * segurança para quando o modelo pergunta à mesma. O "(~N g)" das opções de
 * quantidade sai antes de olhar — essas são para responder.
 */
const UNANSWERABLE_RE = new RegExp(
  [
    "%",
    "percent",
    "\\bteor",
    "\\bkcal\\b",
    "\\bcalorias?\\b",
    "valor(?:es)? nutricion",
    "(?:\\bgramas?|\\bg)\\s+de\\s+(?:gordura|prote[íi]na|hidratos|a[çc][úu]car|fibra)",
  ].join("|"),
  "i",
);

export function isUnanswerableQuestion(question: string, options: string[]): boolean {
  return [question, ...options].some((t) => UNANSWERABLE_RE.test(t.replace(/\(\s*~?\s*\d+(?:[.,]\d+)?\s*g\s*\)/gi, "")));
}

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
    const kind: CarolQuestion["kind"] = q?.kind === "quantidade" ? "quantidade" : "preparacao";
    const rawTopic = String(q?.topic ?? "").trim();
    const question = String(q?.question ?? "").trim().slice(0, 140);
    const itemName = String(q?.item_name ?? "").trim();
    const item = itemsByKey.get(foodKey(itemName));
    // Tema genérico ("tempero") ganha o alimento (bug #74, contextualTopic).
    const topic = kind === "quantidade"
      ? quantityTopic(contextualTopic(rawTopic, String(item?.name ?? ""), 27))
      : contextualTopic(rawTopic, String(item?.name ?? ""), 40);
    const topicKey = foodKey(topic);
    const options = [...new Set((Array.isArray(q?.options) ? q.options : [])
      .map((o: unknown) => String(o ?? "").trim().slice(0, 50))
      .filter(Boolean))].slice(0, 4) as string[];
    const assumed = String(q?.assumed ?? "").trim().slice(0, 50);
    const kcal = Math.round(Number(q?.impact_kcal));
    const impact = Number.isFinite(kcal) && kcal > 0 ? kcal : 0;
    const protein = Math.round(Number(q?.impact_protein_g) * 10) / 10;
    const impactProtein = Number.isFinite(protein) && protein > 0 ? protein : 0;
    // Da despensa, só se há perguntas em aberto sobre ele (pantry_pending,
    // 2026-10-05) — foi por isso que o modelo foi chamado.
    if (!topicKey || !question || options.length < 2 || !item || (item.from_pantry && !item.pantry_pending)) continue;
    if (isUnanswerableQuestion(question, options)) continue;
    if (impact < MIN_QUESTION_IMPACT_KCAL && impactProtein < MIN_QUESTION_IMPACT_PROTEIN_G) continue;
    if (confirmed.has(topicKey) || seenTopics.has(topicKey)) continue;
    if (!options.some((o) => foodKey(o) === foodKey(assumed))) continue;
    if (kind === "quantidade" && (item.grams_explicit || !options.every((o) => optionGrams(o) != null))) continue;
    seenTopics.add(topicKey);
    out.push({ id: newId(), kind, topic, item_name: String(item.name), question, options, assumed, impact_kcal: impact, impact_protein_g: impactProtein, answer: null, answered_at: null });
  }
  // Ordem estável: com o mesmo peso fica a ordem do modelo.
  return out
    .map((q, i) => ({ q, i }))
    .sort((a, b) => questionWeight(b.q) - questionWeight(a.q) || a.i - b.i)
    .slice(0, MAX_QUESTIONS)
    .map(({ q }) => q);
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

/* Bug #74 (2026-10-19): um hábito com um tema genérico — "tempero: Azeite (1
   colher de chá)" — passava a valer para qualquer prato, quando a colher de
   azeite era da salada. Os temas que só dizem o ingrediente ou o gesto ganham
   o alimento a que a pergunta se prende: "tempero" + "Salada mista" →
   "tempero (Salada mista)". O prompt já pede o prato; isto é a rede. */
const GENERIC_TOPICS = new Set([
  "tempero", "temperos", "azeite", "oleo", "manteiga", "molho", "molhos", "gordura", "sal", "acucar", "natas",
  "quantidade", "porcao", "fritura",
]);

/** O núcleo de um tema, sem "quantidade" nem o "de" que a acompanha:
 *  "quantidade de manteiga", "manteiga · quantidade" e "manteiga" → "manteiga"
 *  (revisão pré-master do #74: "quantidade de manteiga" dava "de manteiga",
 *  que não se reconhecia como genérico e escapava sem prato). */
function topicCore(topic: string): string {
  return String(topic || "")
    .replace(/\bquantidades?\b/gi, " ")
    .replace(/[·:]/g, " ")
    .replace(/^\s*(?:de|do|da|dos|das)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** É um tema que só diz o ingrediente ou o gesto, sem prato ("tempero",
 *  "azeite · quantidade")? Os temas com prato ("tempero (Salada mista)")
 *  e os de categoria ("fritos") não são. */
export function isGenericTopic(topic: string): boolean {
  return GENERIC_TOPICS.has(foodKey(topicCore(topic)));
}

/** "manteiga · quantidade", "manteiga quantidades" ou, de dados antigos,
 *  "quantidade de manteiga". A mesma regra de isQuantityRule em
 *  src/utils/pantry.js. */
function isQuantityTopic(topic: string): boolean {
  const t = String(topic || "");
  return /quantidades?\s*$/i.test(t) || /^\s*quantidades?\b/i.test(t);
}

/** Um hábito de preparação aprendido (não escrito por ele) cujo tema não diz
 *  o prato — "tempero", "molho". A Carol já não o usa; o Armário marca-o
 *  (isDishlessRule em src/utils/pantry.js, a mesma regra). Pode ser de antes
 *  do #74 ou um facto das observações em que o modelo não pôs o prato. */
export function isDishlessHabit(rule: FoodRule): boolean {
  return rule.source !== "manual" && !isQuantityTopic(rule.topic) && isGenericTopic(rule.topic);
}

export function contextualTopic(rawTopic: string, itemName: string, max = 40): string {
  const topic = String(rawTopic || "").trim();
  const core = topicCore(topic);
  const item = String(itemName || "").trim();
  if (!GENERIC_TOPICS.has(foodKey(core)) || !item || foodKey(item) === foodKey(core)) return topic.slice(0, max);
  // Corta-se o PRATO, nunca o parêntese: "azeite (Esparguete à bolonh"
  // ficava aberto (revisão pré-master do #74). Dois pratos com o mesmo início
  // longo ainda partilham o tema — raro, e o nome inteiro não cabe no Armário.
  const room = max - core.length - 3;
  if (room < 4) return core.slice(0, max);
  const dish = item.length > room ? `${item.slice(0, room - 1).trimEnd()}…` : item;
  return `${core} (${dish})`;
}

/* Bug #75 (2026-10-20): o peso que o atleta escreve para um alimento da
   despensa, quando é outro que não a porção habitual, soma a um hábito de
   quantidade — "arroz branco cozido · quantidade: 150 g". Duas vezes o mesmo
   peso confirma-o (nextRuleRow), e a app passa a usá-lo por omissão.
   A porção da despensa só não conta enquanto não há hábito: havendo, voltar
   a ela também é um peso a aprender (senão o hábito ficava preso). */
export const PORTION_FACT_MAX_GRAMS = 3000;
export function portionFacts(
  written: Array<{ name?: string | null; grams?: number | null }> | null | undefined,
  byKey: Map<string, PantryFood>,
  rules: Array<{ topic?: string | null }> = [],
): CookingFact[] {
  const habitKeys = new Set((rules || []).map((r) => foodKey(r?.topic)).filter(Boolean));
  const out: CookingFact[] = [];
  const seen = new Set<string>();
  for (const w of written || []) {
    const grams = Math.round(Number(w?.grams));
    if (!(grams > 0) || grams > PORTION_FACT_MAX_GRAMS) continue;
    const food = byKey.get(foodKey(w?.name));
    if (!food || seen.has(food.name_key)) continue;
    const topic = quantityTopic(food.name);
    if (!topic) continue;
    const portion = Math.round(Number(food.portion_grams));
    if (portion > 0 && portion === grams && !habitKeys.has(foodKey(topic))) continue;
    seen.add(food.name_key);
    out.push({ topic, value: `${grams} g` });
  }
  return out;
}
