import { getEvolutionViewDef } from './registry';

/**
 * Cache das vistas da Evolução (2026-10-04, F6 / plano §2.2).
 *
 * FORA do React e FORA do zustand de propósito: sobrevive a sair e voltar a
 * um separador (o useMemo morria com o componente) e não redesenha nada ao
 * ser escrita. Uma entrada por `separador|kind|offset|hoje`; o "hoje" na
 * chave faz com que a mudança de dia dê sempre falha (os dias fechados
 * mudam).
 *
 * Acerto em dois passos:
 * 1. identidade de cada dep — o caso normal: o store mantém a mesma lista
 *    quando um recarregamento traz o mesmo conteúdo (shareUnchanged);
 * 2. impressão digital de cada lista/objeto — quando um recarregamento cria
 *    uma lista nova com o mesmo conteúdo (o sameList do store desiste acima
 *    do orçamento, precisamente nas listas grandes). A impressão guarda-se
 *    numa WeakMap lista→impressão e calcula-se SÓ em tempo morto
 *    (prepare.js, primeFingerprints, retomável linha a linha).
 *
 * Revisão 2026-10-04: o render NUNCA calcula impressões. Medido: 1000
 * refeições × 5 itens custam ~36–68 ms em desktop só a comparar (×6 num
 * telemóvel), e quase sempre para nada (a gravação mudou o conteúdo e a
 * vista é refeita na mesma). Por isso, no render:
 * - comprimentos diferentes (inserir/apagar uma linha) → falha logo, sem
 *   hash nenhum;
 * - só se comparam impressões JÁ memorizadas dos dois lados; se faltar uma,
 *   é falha e a vista é refeita (plano §2.2 ponto 7: "calcula-se como
 *   hoje"). A preparação em tempo morto prima as impressões antes de
 *   comparar, por isso é aí que o acerto por impressão acontece (e quem
 *   entra depois acerta por identidade, porque a entrada adota os deps).
 *
 * Pressupostos (documentados, não verificados):
 * - as listas do store são imutáveis (o store substitui, não empurra para
 *   dentro); uma lista mutada no sítio ficaria com a impressão antiga;
 * - a impressão de um objeto depende da ORDEM das chaves ({a,b} ≠ {b,a}).
 *   As linhas do PostgREST vêm sempre pela ordem do select, por isso não
 *   falha hoje; no pior caso é uma falha a mais (recalcula), nunca um
 *   acerto errado;
 * - NaN como dep primitivo compara-se com Object.is (igual a si próprio).
 *
 * As vistas NUNCA se congelam: o Chart.js escreve nos arrays de `data`.
 */

export const EVOLUTION_CACHE_MAX = 30;

// Sentinela interna de falha: uma vista pode, em teoria, ser `undefined`
// (não fica por isso eternamente por guardar).
const MISS = Symbol('evolution-cache-miss');

// Map mantém a ordem de inserção: o primeiro é o menos usado (LRU).
let entries = new Map();
let fingerprints = new WeakMap(); // valor → impressão COMPLETA
let partials = new WeakMap(); // lista → progresso { i, ids, content } de uma impressão a meio
let stats = { hits: 0, fingerprintHits: 0, builds: 0, hashed: 0 };

export function evolutionCacheKey(tab, period, todayISO) {
  return `${tab}|${period?.kind ?? ''}|${period?.offset ?? 0}|${todayISO}`;
}

// ── Impressão digital ────────────────────────────────────────────────────
// FNV-1a de 32 bits. Duas sementes (ids e conteúdo) dão 64 bits no total —
// uma colisão entre duas versões da MESMA lista do atleta é desprezável.
const FNV_PRIME = 16777619;
const SEED_IDS = 2166136261;
const SEED_CONTENT = 2654435761;
// Até onde se desce dentro de cada linha: refeição → meal_items → item.
const MAX_DEPTH = 4;

function mix(h, str) {
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

// Assinatura barata do conteúdo: percorre primitivos (e arrays/objetos
// aninhados até MAX_DEPTH). Datas pelo instante.
function contentHash(h, v, depth) {
  if (v === null) return mix(h, '\u0000n');
  if (v === undefined) return mix(h, '\u0000u');
  const t = typeof v;
  if (t !== 'object') return mix(h, `\u0000${t[0]}${String(v)}`);
  if (v instanceof Date) return mix(h, `\u0000d${v.getTime()}`);
  if (depth >= MAX_DEPTH) return mix(h, Array.isArray(v) ? `\u0000[${v.length}` : '\u0000{');
  if (Array.isArray(v)) {
    h = mix(h, `\u0000[${v.length}`);
    for (let i = 0; i < v.length; i++) h = contentHash(h, v[i], depth + 1);
    return mix(h, ']');
  }
  h = mix(h, '\u0000{');
  for (const k in v) {
    if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
    h = mix(h, k);
    h = contentHash(h, v[k], depth + 1);
  }
  return mix(h, '}');
}

const isObj = (v) => v !== null && typeof v === 'object';

/**
 * Avança a impressão de `value`. Listas: linha a linha, com o progresso
 * guardado em `partials`, para que uma lista de 1000 refeições se possa
 * repartir por várias fatias de tempo morto (revisão 2026-10-04: uma
 * impressão inteira de uma vez rebentava a deadline de ~50 ms do
 * requestIdleCallback). Objetos soltos (o profile) calculam-se de uma vez —
 * são pequenos. `ctx.shouldYield()` é consultado antes de cada linha, mas só
 * depois de `ctx.progressed` (garante que cada chamada avança pelo menos uma
 * linha). Devolve true se a impressão ficou completa.
 */
function advanceFingerprint(value, ctx) {
  if (fingerprints.has(value)) return true;
  if (!Array.isArray(value)) {
    const fp = `o:${contentHash(SEED_CONTENT, value, 0).toString(36)}:${contentHash(SEED_IDS, value, 0).toString(36)}`;
    fingerprints.set(value, fp);
    stats.hashed++;
    ctx.progressed = true;
    return true;
  }
  let p = partials.get(value);
  if (!p) {
    p = { i: 0, ids: SEED_IDS, content: SEED_CONTENT };
    partials.set(value, p);
  }
  while (p.i < value.length) {
    if (ctx.progressed && ctx.shouldYield && ctx.shouldYield()) return false;
    const item = value[p.i];
    const id = isObj(item) ? (item.id ?? item.date ?? p.i) : p.i;
    p.ids = mix(p.ids, `\u0000${String(id)}`);
    // Cada linha que seja objeto tem a sua impressão memorizada: uma lista
    // nova feita de linhas antigas ([...runs, nova]) só paga a linha nova.
    p.content = mix(p.content, isObj(item) ? fingerprintOf(item) : `\u0000${typeof item}${String(item)}`);
    p.i++;
    ctx.progressed = true;
  }
  partials.delete(value);
  fingerprints.set(value, `a${value.length}:${p.ids.toString(36)}:${p.content.toString(36)}`);
  stats.hashed++;
  ctx.progressed = true;
  return true;
}

/** Impressão digital de um dep (lista, objeto ou primitivo), calculada já e
 *  de uma vez se faltar. Memorizada por identidade para listas/objetos. Só
 *  para tempo morto e testes — o caminho do render nunca a chama. */
export function fingerprintOf(value) {
  if (!isObj(value)) return `p:${typeof value}:${String(value)}`;
  advanceFingerprint(value, { progressed: false, shouldYield: null });
  return fingerprints.get(value);
}

/** Já há impressão COMPLETA para este valor? (não calcula) */
export function hasFingerprint(value) {
  return !isObj(value) || fingerprints.has(value);
}

/** Calcula em tempo morto as impressões que faltam; devolve quantas ficaram
 *  completas nesta chamada. `shouldYield()` permite parar a meio — também a
 *  meio de uma lista (retoma na chamada seguinte de onde ficou). Avança
 *  sempre pelo menos uma linha, para nunca ficar parada. */
export function primeFingerprints(depsValues, shouldYield) {
  const ctx = { progressed: false, shouldYield: shouldYield || null };
  let n = 0;
  for (const v of depsValues || []) {
    if (hasFingerprint(v)) continue;
    if (ctx.progressed && shouldYield && shouldYield()) break;
    if (!advanceFingerprint(v, ctx)) break;
    n++;
  }
  return n;
}

function sameIdentity(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

/**
 * Os deps `a` e `b` PODEM ter o mesmo conteúdo? Verificação sem hash
 * nenhum: o mesmo número de deps, primitivos iguais, e listas com o mesmo
 * comprimento. Falso aqui é falha certa (inserir/apagar uma linha mata a
 * comparação antes de se calcular uma única impressão). A preparação usa-a
 * para não primar impressões que não podem dar acerto.
 */
export function depsMayMatch(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (Object.is(x, y)) continue;
    if (!isObj(x) || !isObj(y)) return false; // primitivos diferentes (ou objeto vs. primitivo)
    const ax = Array.isArray(x);
    if (ax !== Array.isArray(y)) return false;
    if (ax && x.length !== y.length) return false;
  }
  return true;
}

// Só com impressões já memorizadas: nunca calcula (é chamada no render).
function sameFingerprint(a, b) {
  if (!depsMayMatch(a, b)) return false;
  for (let i = 0; i < a.length; i++) {
    if (Object.is(a[i], b[i])) continue;
    const fa = fingerprints.get(a[i]);
    const fb = fingerprints.get(b[i]);
    if (fa === undefined || fb === undefined || fa !== fb) return false;
  }
  return true;
}

function touch(key, entry) {
  entries.delete(key);
  entries.set(key, entry);
}

function store(key, entry) {
  entries.delete(key);
  entries.set(key, entry);
  while (entries.size > EVOLUTION_CACHE_MAX) entries.delete(entries.keys().next().value);
}

/** Já há vista para estes deps, por IDENTIDADE? Não calcula impressões nem
 *  mexe na ordem do LRU — serve à preparação para saber o que falta sem
 *  gastar nada (o acerto por impressão fica para a própria tarefa). */
export function isEvolutionViewCached(tab, period, depsValues, todayISO) {
  const e = entries.get(evolutionCacheKey(tab, period, todayISO));
  return !!e && sameIdentity(e.deps, depsValues);
}

/** Os deps com que a entrada desta chave foi feita (ou undefined). Serve à
 *  preparação para primar em tempo morto as impressões dos dois lados antes
 *  de comparar. Não mexe no LRU. */
export function evolutionEntryDeps(tab, period, todayISO) {
  return entries.get(evolutionCacheKey(tab, period, todayISO))?.deps;
}

function lookup(tab, period, depsValues, todayISO) {
  const key = evolutionCacheKey(tab, period, todayISO);
  const e = entries.get(key);
  if (!e) return MISS;
  if (sameIdentity(e.deps, depsValues)) {
    touch(key, e);
    stats.hits++;
    return e.view;
  }
  if (sameFingerprint(e.deps, depsValues)) {
    // Daqui em diante acerta logo por identidade.
    e.deps = depsValues;
    touch(key, e);
    stats.fingerprintHits++;
    return e.view;
  }
  return MISS;
}

/** A vista em cache, se houver uma válida para estes deps; undefined se não.
 *  Não refaz a vista e NÃO calcula impressões (só usa as já memorizadas);
 *  o custo é O(número de deps). */
export function peekEvolutionView(tab, period, depsValues, todayISO) {
  const v = lookup(tab, period, depsValues, todayISO);
  return v === MISS ? undefined : v;
}

/**
 * A vista de `tab` no período `{kind, offset}` para estes deps e este dia:
 * da cache se os deps forem os mesmos (identidade ou impressão digital),
 * senão calculada agora com o `build` registado e guardada. Nunca calcula
 * impressões (seguro no render: o pior caso é refazer a vista). Devolve null se
 * o separador não tiver vista registada. `build` pode ser passado à mão
 * (testes, ou um separador que ainda não se registou).
 */
export function getEvolutionView(tab, period, depsValues, todayISO, build) {
  const cached = lookup(tab, period, depsValues, todayISO);
  if (cached !== MISS) return cached;
  const fn = build || getEvolutionViewDef(tab)?.build;
  if (!fn) return null;
  const p = { kind: period?.kind, offset: period?.offset ?? 0 };
  const view = fn(depsValues, p, todayISO);
  stats.builds++;
  store(evolutionCacheKey(tab, p, todayISO), { deps: depsValues, view });
  return view;
}

export function evolutionCacheSize() {
  return entries.size;
}

export function evolutionCacheKeys() {
  return [...entries.keys()];
}

export function evolutionCacheStats() {
  return { ...stats, size: entries.size };
}

/** Testes e mudança de conta (App.jsx): larga as listas da conta anterior. */
export function resetEvolutionCache() {
  entries = new Map();
  fingerprints = new WeakMap();
  partials = new WeakMap();
  stats = { hits: 0, fingerprintHits: 0, builds: 0, hashed: 0 };
}
