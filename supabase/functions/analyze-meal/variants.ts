// Despensa: alimento genérico com variantes (bug #87, 2026-10-25).
// Contrato: specs/despensa-variantes-contrato.md. Migração
// 20261025140000_athlete_foods_variants (parent_id, variant_label).
//
// «Coxa de frango» é o GENÉRICO; «Coxa de frango com pele» e «… sem pele»
// são VARIANTES (linhas filhas), cada uma com os seus valores por 100 g.
// Sempre que o genérico aparece numa refeição, o servidor pergunta qual foi
// a variante — a pergunta sai daqui, da base de dados, sem o Gemini, e faz-se
// SEMPRE (mesmo com uma regra confirmada; não conta para o limite de 5).
// Respondida, o alimento fica com os valores da variante escolhida, também
// sem o Gemini; só uma variante que ainda não tem valores vai ao modelo.
//
// De onde vem o genérico de um alimento da refeição, por esta ordem:
//   1. o nome é o de uma variante guardada → o genérico dela;
//   2. o modelo disse generic_name (+ variant) → esse;
//   3. o nome é o de um genérico guardado (o atleta escreveu «coxa de frango»);
//   4. o nome começa pelo de um genérico guardado («coxa de frango sem pele»
//      com só «com pele» guardada) → esse, e o resto é o rótulo.
//
// Os campos do modelo, por item (RESPONSE_SCHEMA): generic_name, variant e
// variant_options — null quando o alimento não tem uma qualificação que mude
// os valores. Os campos que ficam no item depois de resolvido (não são
// colunas de meal_items; pickMealItem deixa-os de fora): variant_of (o nome
// do genérico) e variant_label.

import { foodKey } from "../_shared/formulas/foodKey.ts";
import {
  type CarolQuestion,
  FOOD_SELECT,
  isUnanswerableQuestion,
  nextFoodRow,
  type PantryFood,
  withPantryValues,
} from "./pantry.ts";

export type VariantFood = PantryFood & { id: string; parent_id: string | null; variant_label: string | null };
export type VariantGroup = { generic: VariantFood; variants: VariantFood[] };
export type VariantIndex = {
  /** name_key do genérico → o genérico e as variantes (mais usadas primeiro). */
  byGeneric: Map<string, VariantGroup>;
  /** name_key de uma variante → name_key do genérico. */
  genericOfVariant: Map<string, string>;
};

export const EMPTY_VARIANTS: VariantIndex = { byGeneric: new Map(), genericOfVariant: new Map() };

// Função e não constante: pantry.ts importa este módulo e este importa o
// FOOD_SELECT dele — uma constante lia-o antes de existir (import circular).
export const variantSelect = (): string => `id, parent_id, variant_label, ${FOOD_SELECT}`;

/** Até quantas variantes vão numa pergunta. */
export const MAX_VARIANT_OPTIONS = 4;

/** Um rótulo de variante: minúsculas, um espaço, 1-40 caracteres; "" se não serve. */
export function normalizeVariantLabel(v: unknown): string {
  const s = String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return s.length >= 1 && s.length <= 40 ? s : "";
}

/** O nome de uma variante: o genérico + o rótulo ("Coxa de frango" + "sem pele"). */
export function variantName(generic: string, label: string): string {
  return `${generic.trim()} ${label}`.slice(0, 120);
}

export function buildVariantIndex(rows: VariantFood[]): VariantIndex {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const byGeneric = new Map<string, VariantGroup>();
  const genericOfVariant = new Map<string, string>();
  for (const v of rows) {
    if (!v.parent_id || !v.variant_label) continue;
    const g = byId.get(v.parent_id);
    if (!g) continue;
    const group = byGeneric.get(g.name_key) ?? { generic: g, variants: [] };
    group.variants.push(v);
    byGeneric.set(g.name_key, group);
    genericOfVariant.set(v.name_key, g.name_key);
  }
  for (const group of byGeneric.values()) {
    group.variants.sort((a, b) => (b.times_seen ?? 0) - (a.times_seen ?? 0) || a.name_key.localeCompare(b.name_key));
  }
  return { byGeneric, genericOfVariant };
}

/** As variantes do atleta e os seus genéricos. Nunca rejeita: sem elas, a
 *  refeição regista-se como antes. */
// deno-lint-ignore no-explicit-any
export async function fetchVariants(sb: any, userId: string): Promise<VariantIndex> {
  try {
    const { data: variants, error } = await sb.from("athlete_foods")
      .select(variantSelect())
      .eq("user_id", userId)
      .not("parent_id", "is", null);
    if (error) throw error;
    const parentIds = [...new Set((variants ?? []).map((v: VariantFood) => v.parent_id).filter(Boolean))];
    if (!parentIds.length) return EMPTY_VARIANTS;
    const { data: generics, error: gErr } = await sb.from("athlete_foods")
      .select(variantSelect())
      .eq("user_id", userId)
      .in("id", parentIds);
    if (gErr) throw gErr;
    return buildVariantIndex([...(generics ?? []), ...(variants ?? [])]);
  } catch (e) {
    console.warn("Variantes da despensa não lidas:", e instanceof Error ? e.message : e);
    return EMPTY_VARIANTS;
  }
}

/** A linha do pedido ao modelo com os genéricos que têm variantes. */
export function variantKnowledge(idx: VariantIndex | undefined): string {
  if (!idx?.byGeneric.size) return "";
  return "\nAlimentos com variantes guardadas — quando um destes aparecer, generic_name é EXATAMENTE este nome e " +
    "variant uma destas (ou outra, se for claramente outra):\n" +
    [...idx.byGeneric.values()].slice(0, 40)
      .map((g) => `- ${g.generic.name}: ${g.variants.map((v) => v.variant_label).join(" | ")}`)
      .join("\n");
}

type Resolved = { genericName: string; genericKey: string; label: string; modelOptions: string[] };

/** O genérico e a variante de um alimento da refeição, ou null se não tem. */
// deno-lint-ignore no-explicit-any
export function variantOf(item: any, idx: VariantIndex): Resolved | null {
  const key = foodKey(item?.name);
  const modelLabel = normalizeVariantLabel(item?.variant);
  const modelGeneric = String(item?.generic_name ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const modelOptions = (Array.isArray(item?.variant_options) ? item.variant_options : [])
    .map(normalizeVariantLabel).filter(Boolean);
  const fromGroup = (gKey: string, label: string): Resolved | null => {
    const g = idx.byGeneric.get(gKey);
    return g && label ? { genericName: g.generic.name, genericKey: gKey, label, modelOptions } : null;
  };

  // 1. Uma variante guardada, pelo nome.
  const gOfVariant = idx.genericOfVariant.get(key);
  if (gOfVariant) {
    const v = idx.byGeneric.get(gOfVariant)!.variants.find((x) => x.name_key === key)!;
    return fromGroup(gOfVariant, modelLabel && foodKey(modelGeneric) === gOfVariant ? modelLabel : v.variant_label!);
  }
  // 2. O que o modelo disse.
  if (modelGeneric && modelLabel && foodKey(modelGeneric) && foodKey(modelGeneric) !== key) {
    const gKey = foodKey(modelGeneric);
    return fromGroup(gKey, modelLabel) ?? { genericName: modelGeneric, genericKey: gKey, label: modelLabel, modelOptions };
  }
  if (modelGeneric && modelLabel && foodKey(modelGeneric) === key) {
    // "Coxa de frango" + "sem pele" com o nome sem a variante: é o genérico.
    return fromGroup(key, modelLabel) ?? { genericName: modelGeneric, genericKey: key, label: modelLabel, modelOptions };
  }
  // 3. O próprio genérico guardado: assume-se a variante mais usada.
  const group = idx.byGeneric.get(key);
  if (group) return fromGroup(key, group.variants[0]?.variant_label ?? "");
  // 4. Começa pelo nome de um genérico guardado; o resto é o rótulo.
  for (const [gKey] of idx.byGeneric) {
    if (key.startsWith(gKey + " ")) {
      const label = normalizeVariantLabel(String(item?.name ?? "").trim().slice(gKey.length));
      const r = fromGroup(gKey, label);
      if (r) return r;
    }
  }
  return null;
}

const per100 = (food: Record<string, unknown> | undefined, k: string): number | null => {
  const n = Number(food?.[k]);
  return food && food[k] != null && Number.isFinite(n) ? n : null;
};

/** O quanto a resposta pode mudar a energia e a proteína (das variantes com valores). */
function variantImpact(grams: number, valued: Record<string, unknown>[]): { kcal: number; protein: number } {
  const spread = (k: string) => {
    const vs = valued.map((f) => per100(f, k)).filter((v): v is number => v != null);
    return vs.length >= 2 ? ((Math.max(...vs) - Math.min(...vs)) * grams) / 100 : 0;
  };
  return { kcal: Math.round(spread("calories_per_100g")), protein: Math.round(spread("protein_per_100g") * 10) / 10 };
}

/** «Coxa de frango: com pele ou sem pele?» */
export function variantQuestionText(generic: string, options: string[]): string {
  const opts = options.length > 1 ? `${options.slice(0, -1).join(", ")} ou ${options.at(-1)}` : options[0];
  return `${generic.trim()}: ${opts}?`;
}

/**
 * Resolve as variantes dos alimentos de uma refeição já estimada. Cada
 * alimento com genérico fica com o nome e os valores da variante assumida
 * (a que o modelo viu ou, sem isso, a mais usada) — os da base de dados
 * quando ela já os tem — e marcado com variant_of/variant_label para a
 * despensa aprender. Com duas ou mais variantes possíveis, gera a pergunta.
 * Um rótulo lido numa foto (from_label) fica como está: é ele que manda.
 * `renames`: [nome antigo, nome novo], para as perguntas do modelo seguirem.
 */
// deno-lint-ignore no-explicit-any
export function resolveVariants<T extends Record<string, any>>(
  items: T[],
  idx: VariantIndex | undefined,
  newId: () => string = () => crypto.randomUUID(),
): { items: T[]; questions: CarolQuestion[]; renames: [string, string][] } {
  const questions: CarolQuestion[] = [];
  const renames: [string, string][] = [];
  const index = idx ?? EMPTY_VARIANTS;
  const out = items.map((item) => {
    if (!item || item.from_label) return item;
    const r = variantOf(item, index);
    if (!r) return item;
    const group = index.byGeneric.get(r.genericKey);
    const stored = group?.variants ?? [];
    const storedAssumed = stored.find((v) => foodKey(v.variant_label) === foodKey(r.label));
    const grams = Number(item.quantity_grams) || 0;
    // deno-lint-ignore no-explicit-any
    const resolved: any = storedAssumed
      ? withPantryValues({ ...item }, storedAssumed)
      : { ...item, name: variantName(r.genericName, r.label) };
    resolved.variant_of = r.genericName;
    resolved.variant_label = r.label;
    if (resolved.name !== item.name) renames.push([String(item.name), String(resolved.name)]);

    // As opções: as guardadas (mais usadas primeiro), a assumida, as que o modelo sugeriu.
    const seen = new Set<string>();
    const options: string[] = [];
    for (const l of [...stored.map((v) => v.variant_label!), r.label, ...r.modelOptions]) {
      const k = foodKey(l);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      options.push(l);
    }
    // A assumida tem de caber nas opções, mesmo cortando.
    const shown = options.slice(0, MAX_VARIANT_OPTIONS);
    if (!shown.some((o) => foodKey(o) === foodKey(r.label))) shown[shown.length - 1] = r.label;
    if (shown.length >= 2) {
      const question = variantQuestionText(r.genericName, shown);
      if (!isUnanswerableQuestion(question, shown)) {
        const valued = shown.map((l) =>
          foodKey(l) === foodKey(r.label) && !storedAssumed ? resolved : stored.find((v) => foodKey(v.variant_label) === foodKey(l))
        ).filter(Boolean) as Record<string, unknown>[];
        const impact = variantImpact(grams, valued);
        questions.push({
          id: newId(), kind: "variante", topic: r.genericName, item_name: String(resolved.name), question,
          options: shown, assumed: r.label, impact_kcal: impact.kcal, impact_protein_g: impact.protein,
          answer: null, answered_at: null,
        });
      }
    }
    return resolved as T;
  });
  return { items: out, questions, renames };
}

/**
 * A resposta a uma pergunta de variante (modo "answer"): o genérico, o rótulo
 * escolhido, a linha da variante quando a base de dados já a tem (os valores
 * vêm dela, sem o modelo) e o nome com que o alimento fica. stored = null é
 * uma variante sem valores guardados («Outro…») — a única que vai ao modelo.
 */
export function variantAnswer(
  topic: string,
  answer: string,
  idx: VariantIndex | undefined,
): { generic: string; label: string; stored: VariantFood | null; rename: string } {
  const group = idx?.byGeneric.get(foodKey(topic));
  const label = normalizeVariantLabel(answer) || String(answer).trim().slice(0, 40);
  const stored = group?.variants.find((v) => foodKey(v.variant_label) === foodKey(label)) ?? null;
  const generic = group?.generic.name ?? topic;
  return { generic, label, stored, rename: stored ? stored.name : variantName(generic, label) };
}

/** As perguntas cruas do modelo passam para os nomes novos dos alimentos
 *  (resolveVariants renomeou-os) — senão parseQuestions não os encontrava. */
export function renameQuestionItems(raw: unknown, renames: [string, string][]): unknown {
  if (!Array.isArray(raw) || !renames.length) return raw;
  const to = new Map(renames.map(([from, name]) => [foodKey(from), name]));
  // deno-lint-ignore no-explicit-any
  return raw.map((q: any) => (to.has(foodKey(q?.item_name)) ? { ...q, item_name: to.get(foodKey(q?.item_name)) } : q));
}

/**
 * As perguntas do modelo + as das variantes. As do modelo que falam do mesmo
 * alimento e da mesma escolha (uma opção igual a uma variante) caem — senão
 * o atleta respondia duas vezes ao mesmo; as que ficam passam para o nome
 * novo do alimento.
 */
export function mergeVariantQuestions(
  modelQuestions: CarolQuestion[],
  variantQuestions: CarolQuestion[],
  renames: [string, string][],
): CarolQuestion[] {
  const to = new Map(renames.map(([from, name]) => [foodKey(from), name]));
  const variantByItem = new Map(variantQuestions.map((q) => [foodKey(q.item_name), new Set(q.options.map(foodKey))]));
  const kept = modelQuestions
    .map((q) => (to.has(foodKey(q.item_name)) ? { ...q, item_name: to.get(foodKey(q.item_name))! } : q))
    .filter((q) => {
      const labels = variantByItem.get(foodKey(q.item_name));
      return !labels || !q.options.some((o) => labels.has(foodKey(o)));
    });
  return [...kept, ...variantQuestions];
}

/**
 * A despensa aprende as variantes de uma refeição: o genérico (criado com os
 * valores desta variante, se ainda não existe; senão conta mais uma vez) e a
 * ligação da linha da variante ao genérico (parent_id, variant_label). A linha
 * da variante já foi escrita antes (learnFromMeal, pelo nome completo).
 * `countGeneric: false` quando não é uma refeição nova (a resposta a uma
 * pergunta, uma embalagem no chat): o genérico não conta como visto outra vez.
 * `inPantry`: o genérico entra logo na despensa (um rótulo).
 * Nunca rejeita.
 */
export async function linkVariants(
  // deno-lint-ignore no-explicit-any
  sb: any,
  userId: string,
  // deno-lint-ignore no-explicit-any
  items: any[],
  nowISO: string,
  opts: { countGeneric?: boolean; inPantry?: boolean } = {},
): Promise<void> {
  const countGeneric = opts.countGeneric ?? true;
  try {
    // deno-lint-ignore no-explicit-any
    const byGeneric = new Map<string, { name: string; items: any[] }>();
    for (const it of items || []) {
      const label = normalizeVariantLabel(it?.variant_label);
      const gKey = foodKey(it?.variant_of);
      if (!label || !gKey || gKey === foodKey(it?.name)) continue;
      const g = byGeneric.get(gKey) ?? { name: String(it.variant_of).trim().slice(0, 120), items: [] };
      g.items.push({ ...it, variant_label: label });
      byGeneric.set(gKey, g);
    }
    if (!byGeneric.size) return;

    const { data: existing, error } = await sb.from("athlete_foods")
      .select(variantSelect())
      .eq("user_id", userId)
      .in("name_key", [...byGeneric.keys()]);
    if (error) throw error;
    const prev = new Map<string, VariantFood>((existing ?? []).map((f: VariantFood) => [f.name_key, f]));

    // Os genéricos que faltam: com os valores da primeira variante (a "por omissão").
    const missing = [...byGeneric.entries()].filter(([k]) => !prev.has(k));
    if (missing.length) {
      const rows = missing.map(([, g]) => {
        const row = nextFoodRow(null, { ...g.items[0], name: g.name, from_label: false }, userId, nowISO)!;
        row.times_seen = countGeneric ? 1 : 0;
        row.in_pantry = !!opts.inPantry;
        row.source = opts.inPantry ? "rotulo" : "refeicao";
        return row;
      });
      const { data: created, error: insErr } = await sb.from("athlete_foods")
        .upsert(rows, { onConflict: "user_id,name_key" })
        .select(variantSelect());
      if (insErr) throw insErr;
      for (const f of (created ?? []) as VariantFood[]) prev.set(f.name_key, f);
    }

    for (const [gKey, g] of byGeneric) {
      const generic = prev.get(gKey);
      // Uma variante não pode ser genérico de outra (um nível só).
      if (!generic?.id || generic.parent_id) continue;
      let genericInPantry = !!generic.in_pantry;
      if (!missing.some(([k]) => k === gKey)) {
        const seen = (generic.times_seen ?? 0) + (countGeneric ? 1 : 0);
        genericInPantry = generic.in_pantry || seen >= 2 || !!opts.inPantry;
        if (seen !== generic.times_seen || genericInPantry !== generic.in_pantry) {
          const { error: upErr } = await sb.from("athlete_foods")
            .update({ times_seen: seen, in_pantry: genericInPantry, last_used_at: nowISO })
            .eq("id", generic.id).eq("user_id", userId);
          if (upErr) throw upErr;
        }
      }
      for (const it of g.items) {
        const { error: linkErr } = await sb.from("athlete_foods")
          .update({ parent_id: generic.id, variant_label: it.variant_label })
          .eq("user_id", userId)
          .eq("name_key", foodKey(it.name))
          .neq("id", generic.id);
        if (linkErr) throw linkErr;
      }
      // Decisão do coordenador (#87, opção a): com o genérico na despensa,
      // as variantes dele também lá estão — o Armário (loadPantry, só
      // in_pantry = true) mostra-as debaixo do genérico. As já ligadas antes
      // de o genérico lá entrar passam aqui também. Um alimento com
      // qualificação visto uma vez só (genérico fora da despensa) fica fora.
      if (genericInPantry) {
        const { error: pantryErr } = await sb.from("athlete_foods")
          .update({ in_pantry: true })
          .eq("user_id", userId)
          .eq("parent_id", generic.id)
          .eq("in_pantry", false);
        if (pantryErr) throw pantryErr;
      }
    }
  } catch (e) {
    console.warn("Variantes por ligar:", e instanceof Error ? e.message : e);
  }
}

/** A linha de uma variante escolhida numa resposta (ou guardada do chat):
 *  escreve-a (sem a contar como mais uma refeição, se `countSeen` for false)
 *  e liga-a ao genérico. Nunca rejeita. */
export async function learnVariantFood(
  // deno-lint-ignore no-explicit-any
  sb: any,
  userId: string,
  // deno-lint-ignore no-explicit-any
  item: any,
  nowISO: string,
  opts: { countSeen?: boolean; inPantry?: boolean } = {},
): Promise<void> {
  try {
    const key = foodKey(item?.name);
    if (!key) return;
    const { data: existing, error } = await sb.from("athlete_foods")
      .select(FOOD_SELECT).eq("user_id", userId).eq("name_key", key).maybeSingle();
    if (error) throw error;
    const row = nextFoodRow((existing ?? null) as PantryFood | null, item, userId, nowISO);
    if (!row) return;
    if (opts.countSeen === false) row.times_seen = (existing as PantryFood | null)?.times_seen ?? 0;
    if (opts.inPantry) {
      row.in_pantry = true;
      row.source = "rotulo";
    }
    const { error: upErr } = await sb.from("athlete_foods").upsert(row, { onConflict: "user_id,name_key" });
    if (upErr) throw upErr;
    await linkVariants(sb, userId, [item], nowISO, { countGeneric: false, inPantry: opts.inPantry });
  } catch (e) {
    console.warn("Variante por guardar:", e instanceof Error ? e.message : e);
  }
}
