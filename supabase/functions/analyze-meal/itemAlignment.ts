// Os itens que o Gemini devolve, emparelhados com os alimentos que o atleta
// escreveu (urgência de 2026-11-04: o Rui não conseguia gravar uma refeição —
// 3 vezes seguidas «A estimativa não devolveu todos os alimentos pedidos»).
//
// Antes, o registo manual exigia exatamente um item por alimento, pela ordem,
// e o das fotos um item com o source_index de cada escrito; um a mais ou a
// menos e a refeição não se gravava. Desde o #109 o modelo tende a devolver os
// ingredientes opcionais (manteiga, azeite, molho) como itens à parte, ou a
// partir um alimento composto («pão com manteiga» → «Pão» + «Manteiga»).
//
// Agora:
//   · com o mesmo número de itens, pela ordem (o de sempre);
//   · senão, pelo nome (foodKey, palavra a palavra): nomes repetidos («ovo»,
//     «ovo») um a um; várias partes de um composto juntam-se num só alimento
//     (gramas somadas, valores por 100 g pesados pelas gramas); um ingrediente
//     opcional («Manteiga») só vai para um escrito que o nomeie; os extras
//     descartam-se (um ingrediente opcional é pergunta da Carol, nunca um item
//     à parte — optionalAdditions.ts);
//   · o que não emparelha pelo nome falta — nunca pela ordem, que dava os
//     valores de um alimento a outro (revisão do 5fd4c502) — e quem chama
//     refá-lo numa chamada curta só com esses.
import { foodKey } from "../_shared/formulas/foodKey.ts";
import { additionFamilies, optionalIngredientFamily } from "./optionalAdditions.ts";

// deno-lint-ignore no-explicit-any
type Item = Record<string, any> & { name: string; quantity_grams: number };

const STOP = new Set(["de", "do", "da", "dos", "das", "com", "sem", "e", "em", "a", "o", "as", "os", "um", "uma", "no", "na", "ao", "à"]);
const tokens = (s: unknown): Set<string> =>
  new Set(foodKey(s).split(" ").filter((w) => w.length >= 2 && !STOP.has(w)));

/** As palavras de `a` todas em `b`. */
const within = (a: Set<string>, b: Set<string>) => a.size > 0 && [...a].every((w) => b.has(w));

/** Os valores por 100 g que se pesam pelas gramas ao juntar partes. */
const PER_100G = /_per_100g$/;

/**
 * Várias partes de um alimento num só item: gramas somadas e cada valor por
 * 100 g pesado pelas gramas de cada parte. Um micronutriente por saber (null)
 * numa parte deixa-o por saber no todo — somá-lo como zero inventava um valor.
 */
export function combineParts<T extends Item>(parts: T[]): T {
  if (parts.length === 1) return parts[0];
  const grams = parts.reduce((s, p) => s + (Number(p.quantity_grams) || 0), 0);
  const out: Item = { ...parts[0], quantity_grams: grams };
  const keys = new Set(parts.flatMap((p) => Object.keys(p).filter((k) => PER_100G.test(k))));
  for (const k of keys) {
    if (parts.some((p) => p[k] == null)) {
      out[k] = null;
      continue;
    }
    out[k] = grams > 0 ? parts.reduce((s, p) => s + Number(p[k]) * (Number(p.quantity_grams) || 0), 0) / grams : 0;
  }
  return out as T;
}

export interface Alignment<T extends Item> {
  /** Um item por alimento escrito (null = falta), pela ordem da lista. */
  items: (T | null)[];
  /** Os devolvidos que não são de nenhum alimento escrito (descartados). */
  extras: T[];
  /** [nome do modelo, nome escrito] — para as perguntas seguirem o nome escrito. */
  pairs: [string, string][];
  /** Alimentos escritos que vieram em várias partes (juntas). */
  combined: number;
}

/**
 * Emparelha `raw` (o que o modelo devolveu) com `written` (o que o atleta
 * escreveu). Com o mesmo número de itens, pela ordem — o pedido diz «pela
 * MESMA ORDEM» e é o caso de sempre. Senão, pelo nome; ver o topo do ficheiro.
 */
export function alignItems<T extends Item>(raw: T[], written: { name: string }[]): Alignment<T> {
  const writtenNames = written.map((w) => w.name.slice(0, 120));
  // Um ingrediente opcional devolvido («Manteiga», «Azeite») só pode ser de um
  // escrito que o nomeie («pão com manteiga») — nunca dá os valores dele ao
  // café (revisão do 5fd4c502).
  const fits = (r: T, i: number) => {
    const fam = optionalIngredientFamily(r.name);
    return !fam || additionFamilies(written[i].name).has(fam);
  };
  // O mesmo número e cada um no lugar certo: pela ordem, como o pedido diz.
  if (raw.length === written.length && raw.every((r, i) => fits(r, i))) {
    return {
      items: [...raw],
      extras: [],
      pairs: raw.map((r, i) => [String(r.name), writtenNames[i]]),
      combined: 0,
    };
  }
  const wTok = written.map((w) => tokens(w.name));
  const wKey = written.map((w) => foodKey(w.name));
  const groups: T[][] = written.map(() => []);
  const covered: Set<string>[] = written.map(() => new Set());
  const leftovers: T[] = [];
  for (const r of raw) {
    const rk = foodKey(r.name);
    const rt = tokens(r.name);
    // A pontuação de cada escrito: o mesmo nome (100), ou um nome contido no
    // outro (as palavras em comum) — a parte de um composto, ou o escrito com
    // mais detalhe.
    const scored = written.map((_, i) => {
      if (!fits(r, i)) return { i, score: 0 };
      if (rk && rk === wKey[i]) return { i, score: 100 };
      if (within(rt, wTok[i]) || within(wTok[i], rt)) return { i, score: [...rt].filter((t) => wTok[i].has(t)).length };
      return { i, score: 0 };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.i - b.i);
    // Primeiro um escrito ainda sem item — «ovo», «ovo» emparelham um a um.
    const free = scored.find((x) => !groups[x.i].length);
    if (free) {
      groups[free.i].push(r);
      rt.forEach((t) => wTok[free.i].has(t) && covered[free.i].add(t));
      continue;
    }
    // Senão, uma parte de um composto já começado, se acrescenta palavras do
    // escrito ainda por cobrir («Pão» + «Manteiga» de «pão com manteiga»).
    const part = scored.find((x) => x.score < 100 && [...rt].some((t) => wTok[x.i].has(t) && !covered[x.i].has(t)));
    if (part) {
      groups[part.i].push(r);
      rt.forEach((t) => wTok[part.i].has(t) && covered[part.i].add(t));
      continue;
    }
    // Nem uma coisa nem outra: um extra (um repetido, um ingrediente a mais).
    leftovers.push(r);
  }
  // O que não emparelha pelo nome NÃO se emparelha pela ordem (revisão do
  // 5fd4c502: o café ficava com os valores da manteiga) — falta, e quem chama
  // refá-lo numa chamada curta.
  const pairs: [string, string][] = [];
  groups.forEach((g, i) => g.forEach((r) => pairs.push([String(r.name), writtenNames[i]])));
  return {
    items: groups.map((g) => (g.length ? combineParts(g) : null)),
    extras: leftovers,
    pairs,
    combined: groups.filter((g) => g.length > 1).length,
  };
}

/**
 * Fotos e alimentos escritos (mergePhotoAndWrittenItems): os itens com o
 * source_index de um escrito são dele — várias partes juntam-se, um repetido
 * conta uma vez; os outros são das fotos. Um escrito sem item fica com o item
 * das fotos que tenha o mesmo nome, se houver (o modelo esqueceu-se do
 * source_index); senão falta (null) e quem chama refá-lo.
 */
export function alignPhotoAndWritten<T extends Item & { source_index?: number }>(
  raw: T[],
  written: { name: string }[],
): { fromPhotos: Omit<T, "source_index">[]; items: (Omit<T, "source_index"> | null)[]; pairs: [string, string][]; combined: number; moved: number } {
  const writtenNames = written.map((w) => w.name.slice(0, 120));
  const wTok = written.map((w) => tokens(w.name));
  const groups: Omit<T, "source_index">[][] = written.map(() => []);
  const covered: Set<string>[] = written.map(() => new Set());
  const fromPhotos: Omit<T, "source_index">[] = [];
  for (const { source_index, ...item } of raw) {
    const idx = Number(source_index);
    if (!(Number.isInteger(idx) && idx >= 1 && idx <= written.length)) {
      fromPhotos.push(item);
      continue;
    }
    const i = idx - 1;
    // Um ingrediente opcional com o índice de um escrito que não o nomeia
    // («Manteiga» com o do café) é um ingrediente acrescentado: fora.
    const fam = optionalIngredientFamily(item.name);
    if (fam && !additionFamilies(written[i].name).has(fam)) continue;
    const adds = [...tokens(item.name)].filter((t) => wTok[i].has(t) && !covered[i].has(t));
    // Repetido (não acrescenta nada do escrito): fica o primeiro.
    if (groups[i].length && !adds.length) continue;
    groups[i].push(item);
    adds.forEach((t) => covered[i].add(t));
  }
  // Um escrito sem item: o das fotos com o mesmo nome (palavras contidas).
  let moved = 0;
  groups.forEach((g, i) => {
    if (g.length) return;
    const at = fromPhotos.findIndex((p) => {
      const pt = tokens(p.name);
      return foodKey(p.name) === foodKey(written[i].name) || within(pt, wTok[i]) || within(wTok[i], pt);
    });
    if (at >= 0) {
      g.push(fromPhotos.splice(at, 1)[0]);
      moved += 1;
    }
  });
  const pairs: [string, string][] = [];
  groups.forEach((g, i) => g.forEach((r) => pairs.push([String(r.name), writtenNames[i]])));
  return {
    fromPhotos,
    items: groups.map((g) => (g.length ? combineParts(g as Item[]) as Omit<T, "source_index"> : null)),
    pairs,
    combined: groups.filter((g) => g.length > 1).length,
    moved,
  };
}

/** O que se regista em app_logs quando o número de itens não bate certo:
 *  só contagens e nomes de alimentos. */
export function mismatchMeta(
  mode: "manual" | "fotos",
  requested: number,
  raw: { name?: unknown }[],
  a: { items: unknown[]; extras: { name?: unknown }[]; combined: number; moved?: number },
  outcome: "emparelhado" | "refeitos" | "falhou",
): Record<string, unknown> {
  return {
    mode,
    requested,
    returned: raw.length,
    returned_names: raw.map((r) => String(r?.name ?? "").slice(0, 60)).slice(0, 40),
    extras: a.extras.map((r) => String(r?.name ?? "").slice(0, 60)).slice(0, 20),
    combined: a.combined,
    moved: a.moved ?? 0,
    missing: a.items.filter((x) => !x).length,
    outcome,
  };
}
