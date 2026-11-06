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

/** Quanto um nome devolvido é o de um escrito: 2 o mesmo nome, 1 um contido
 *  no outro («Pão» e «pão de queijo»), 0 nada. O mesmo nome ganha ao contido
 *  — [pão, pão de queijo] ← [Pão de queijo, Pão] (revisão do 9583d6c3). */
const nameStrength = (name: unknown, writtenName: unknown): number => {
  const k = foodKey(name);
  if (k && k === foodKey(writtenName)) return 2;
  const a = tokens(name);
  const b = tokens(writtenName);
  return within(a, b) || within(b, a) ? 1 : 0;
};

/** Com o mesmo número de itens, a ordem só se deixa numa troca real: trocar
 *  dois itens de lugar emparelha melhor os dois ([pão, ovos] ← [Ovos, Pão]).
 *  [hambúrguer, batatas] ← [Burger com batatas, Batatas fritas] não é troca —
 *  as batatas são as do lugar delas (revisão do 9583d6c3). */
function hasRealSwap(raw: { name: string }[], written: { name: string }[]): boolean {
  for (let i = 0; i < raw.length; i++) {
    for (let j = 0; j < raw.length; j++) {
      if (i === j) continue;
      const kept = nameStrength(raw[i].name, written[i].name) + nameStrength(raw[j].name, written[j].name);
      const swapped = nameStrength(raw[i].name, written[j].name) + nameStrength(raw[j].name, written[i].name);
      if (swapped > kept) return true;
    }
  }
  return false;
}

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
  // O mesmo número e cada um no lugar certo: pela ordem, como o pedido diz —
  // a não ser numa troca real de lugares.
  if (raw.length === written.length && raw.every((r, i) => fits(r, i)) && !hasRealSwap(raw, written)) {
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
  const rTok = raw.map((r) => tokens(r.name));
  const rKey = raw.map((r) => foodKey(r.name));
  // A pontuação de cada par: o mesmo nome (100), ou um nome contido no outro
  // (as palavras em comum) — a parte de um composto, ou o escrito com mais
  // detalhe. Um ingrediente opcional só num escrito que o nomeie.
  const score = (ri: number, wi: number): number => {
    if (!fits(raw[ri], wi)) return 0;
    if (rKey[ri] && rKey[ri] === wKey[wi]) return 100;
    if (within(rTok[ri], wTok[wi]) || within(wTok[wi], rTok[ri])) return [...rTok[ri]].filter((t) => wTok[wi].has(t)).length;
    return 0;
  };
  const cover = (ri: number, wi: number) => rTok[ri].forEach((t) => wTok[wi].has(t) && covered[wi].add(t));
  // 1.º, um item para cada escrito: os pares de pontuação mais alta primeiro —
  // o mesmo nome antes do contido; em empate, o do seu lugar e depois a ordem.
  // «ovo», «ovo» emparelham um a um; o primeiro item pela ordem do raw já não
  // fica com o escrito de outro (revisão do 9583d6c3).
  const cands: { ri: number; wi: number; sc: number }[] = [];
  raw.forEach((_, ri) => written.forEach((_, wi) => {
    const sc = score(ri, wi);
    if (sc > 0) cands.push({ ri, wi, sc });
  }));
  cands.sort((a, b) => b.sc - a.sc || Number(b.ri === b.wi) - Number(a.ri === a.wi) || a.wi - b.wi || a.ri - b.ri);
  const used = new Set<number>();
  for (const c of cands) {
    if (used.has(c.ri) || groups[c.wi].length) continue;
    groups[c.wi].push(raw[c.ri]);
    used.add(c.ri);
    cover(c.ri, c.wi);
  }
  // 2.º, as partes de um composto já começado, se acrescentam palavras do
  // escrito ainda por cobrir («Pão» + «Manteiga» de «pão com manteiga»).
  const leftovers: T[] = [];
  raw.forEach((r, ri) => {
    if (used.has(ri)) return;
    const part = cands
      .filter((c) => c.ri === ri && c.sc < 100 && [...rTok[ri]].some((t) => wTok[c.wi].has(t) && !covered[c.wi].has(t)))
      .sort((a, b) => b.sc - a.sc || a.wi - b.wi)[0];
    if (part) {
      groups[part.wi].push(r);
      cover(ri, part.wi);
      return;
    }
    // Nem uma coisa nem outra: um extra (um repetido, um ingrediente a mais).
    leftovers.push(r);
  });
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
  const validIdx = (v: unknown) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= written.length ? n - 1 : -1;
  };
  // Quão bem o escrito j já está servido pelos itens que trazem o índice dele.
  const ownBest = written.map((w, j) =>
    Math.max(0, ...raw.filter((r) => validIdx(r.source_index) === j).map((r) => nameStrength(r.name, w.name))));
  for (const { source_index, ...item } of raw) {
    const idx = validIdx(source_index);
    if (idx < 0) {
      fromPhotos.push(item);
      continue;
    }
    // O índice errado ([pão, ovos] com «Ovos» no 1): vai para o escrito de que
    // é pelo nome — só numa troca real, se emparelha com ele melhor do que com
    // o do seu índice E melhor do que os itens que já trazem o dele
    // ([hambúrguer, batatas] com «Burger com batatas» no 1 fica no 1; revisão
    // do 9583d6c3). Em empate, um escrito ainda sem item.
    let i = idx;
    const own = nameStrength(item.name, written[idx].name);
    let best = own;
    written.forEach((w, j) => {
      if (j === idx) return;
      const sj = nameStrength(item.name, w.name);
      if (!(sj > own && sj > ownBest[j])) return;
      if (sj > best || (sj === best && groups[i].length && !groups[j].length)) {
        i = j;
        best = sj;
      }
    });
    // Nada em comum com o escrito do seu índice e com o MESMO nome de outro
    // escrito, já servido ([ovo, pão, ovo] com «Ovo» no índice do pão): é
    // desse, não deste — fora. O escrito fica sem item e refaz-se (revisão
    // do 23684d82). Só com o mesmo nome: com uma palavra em comum («Burger
    // com batatas» no índice do hambúrguer) fica, que pode ser o dele.
    if (i === idx && own === 0 && written.some((w, j) => j !== idx && nameStrength(item.name, w.name) === 2)) continue;
    // Um ingrediente opcional com o índice de um escrito que não o nomeia
    // («Manteiga» com o do café) foi acrescentado: fora. Com o de um que o
    // nomeia («pão com manteiga») é uma parte, e junta-se a ele (abaixo).
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
