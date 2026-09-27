// Competições por jornadas — a classificação oficial: validação, tempo,
// correspondência, pontos e coletiva (specs/trofeu.md §7, §4.5–4.6, §5,
// §10 Fase 4). 2026-09-27.
//
// PORQUÊ AQUI. O job `cup-standings-sync` (Edge Function) lê as páginas do
// organizador pelo adaptador — o ÚNICO ficheiro que conhece o HTML do site —
// e passa-lhe estruturas de strings (Source*). Tudo o que decide o que se
// escreve vive aqui, puro e testável: as invariantes que PARAM a escrita, o
// "pronta/estável", a correspondência pelo dorsal, os pontos e a coletiva. O
// backoffice (cliente) usa os mesmos formatos de links (CUP_ADAPTER_URLS).
// Sem Deno nem APIs do browser; só sha256Hex usa WebCrypto
// (globalThis.crypto.subtle), e só o job a chama.
//
// PRIVACIDADE (§7, inegociável). As linhas de terceiros (nomes, dorsais,
// anos, clubes de outros) vivem só na memória do job durante uma volta:
//   · as linhas canónicas (CanonRoundRow/CanonStandingRow) guardam os campos
//     pessoais em campos privados e rebentam num JSON.stringify — um log ou
//     uma resposta com linhas oficiais falha nos testes em vez de sair para
//     produção; na consola aparecem como "[linha oficial]";
//   · as entradas dos hashes de identidade (que levam o nome DELE como o
//     site o escreve) são propriedades não enumeráveis: um JSON.stringify do
//     resultado da correspondência não as leva;
//   · as escritas (ResultWrite…) só têm a linha DELE (posição, escalão,
//     tempo, pontos) e hashes; os resumos e relatórios só contagens;
//   · o dorsal é a chave: nunca se procura pelo nome, nunca se propõe o
//     dorsal de outro (o vizinho de 1 dígito só conta em agregado), dorsais
//     repetidos não ligam, e "não sou eu" nunca volta.
//
// TEMPO E PONTOS. "Pronta" = o mesmo conteúdo visto em duas voltas com ≥ 6 h;
// "estável" = 48 h sem mudar, ou o fim de D+10. Os pontos calculados a partir
// da página da prova são um MÍNIMO (os atletas de fora do concelho aparecem
// na página e não ocupam lugar na classificação de Cascais — J1 da 33.ª, em
// agregado): o ecrã diz "provisórios" e os oficiais da geral substituem-nos.
// A coletiva por jornada é uma conta da app sobre a geral oficial (o site não
// a dá por GET).

import { seasonRefYear } from "./cup.ts";

export { seasonRefYear };

// ── Links por adaptador (o backoffice valida, o job re-valida) ────────────

export interface AdapterUrls {
  jornada: RegExp;
  geral: RegExp;
  exemploJornada: string;
  exemploGeral: string;
}

/** Os links que cada adaptador aceita. O admin cola um /Resultados/{id} em
 *  cup_rounds.results_url e o /Trofeu/{id} em cup_editions.standings_url; o
 *  job só faz GET a estes (nunca postbacks). */
export const CUP_ADAPTER_URLS: Readonly<Record<string, AdapterUrls>> = Object.freeze({
  trofeu_cascais: Object.freeze({
    jornada: /^https:\/\/(www\.)?trofeuatletismocascais\.pt\/Resultados\/(\d{1,7})\/?$/i,
    geral: /^https:\/\/(www\.)?trofeuatletismocascais\.pt\/Trofeu\/(\d{1,5})\/?$/i,
    exemploJornada: "https://trofeuatletismocascais.pt/Resultados/727",
    exemploGeral: "https://trofeuatletismocascais.pt/Trofeu/17",
  }),
});

/** null = o link serve (ou está vazio, ou o adaptador não tem regra). Senão,
 *  a frase para o backoffice, com o exemplo. */
export function cupResultsUrlError(
  adapter: string | null | undefined,
  kind: "jornada" | "geral",
  url: string | null | undefined,
): string | null {
  const v = typeof url === "string" ? url.trim() : "";
  if (!v) return null;
  const rule = adapter ? CUP_ADAPTER_URLS[adapter] : undefined;
  if (!rule) return null;
  if (kind === "jornada") {
    return rule.jornada.test(v) ? null : `Cola o link de uma prova do site do Troféu: ${rule.exemploJornada}`;
  }
  return rule.geral.test(v) ? null : `Cola o link da classificação geral: ${rule.exemploGeral}`;
}

// ── O que o adaptador devolve (strings, tal como o site as escreve) ───────

export interface SourceResultRow { pos: string; bib: string; name: string; club: string; category: string; time: string }
export interface SourceResultTable {
  distanceM: number | null;
  gender: "M" | "F" | null;
  missingColumns: string[];
  rows: SourceResultRow[];
}
export interface SourceRoundPage {
  kind: "jornada";
  title: string;
  raceName: string | null;
  date: string | null;
  errorPage: boolean;
  tables: SourceResultTable[];
}
export interface SourceStandingRow { pos: string; name: string; year: string; team: string; points: string[]; total: string }
export interface SourceStandingTable {
  category: string;
  gender: "M" | "F" | null;
  pCount: number;
  missingColumns: string[];
  rows: SourceStandingRow[];
}
export interface SourceLegendEntry { k: number; name: string; dayMonth: string }
export interface SourceStandingsPage {
  kind: "geral";
  title: string;
  seasonLabel: string | null;
  errorPage: boolean;
  legend: SourceLegendEntry[];
  tables: SourceStandingTable[];
}

// ── Normalizações ─────────────────────────────────────────────────────────

/** O dorsal normalizado — gémea de cup_norm_bib (M2): sem espaços,
 *  maiúsculas, sem zeros à esquerda antes de um dígito; vazio → null.
 *  ' 0412 ' → '412', 'a12' → 'A12', '000' → '0', '0 7' → '7'. */
export function normBib(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, "").toUpperCase().replace(/^0+(?=\d)/, "");
  return s === "" ? null : s;
}

/** Nomes e clubes para comparar: sem diacríticos, minúsculas, pontuação →
 *  espaço, espaços colapsados. "Núcleo … (NAZA)" → "nucleo … naza". Nunca
 *  se grava o nome de ninguém: serve para comparar e para hashes; os clubes
 *  (organizações) vão para cup_team_aliases.alias_norm (≤ 160). */
export function normText(v: unknown): string {
  if (v == null) return "";
  return String(v)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/["'’‘`´“”«».,;:()[\]{}\-–—_/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A marca oficial em segundos: "36:12" → 2172, "1:02:03" → 3723; fração
 *  ("36:12.4", "36:12,4") arredonda para cima (regra das provas de estrada).
 *  Segundos (ou minutos em h:mm:ss) ≥ 60, zero ou outro formato → null. */
export function parseMarca(text: string): number | null {
  const s = String(text ?? "").trim();
  let h = 0, mi: number, se: number, frac: string | undefined;
  let m = /^(\d{1,2}):(\d{2})(?:[.,](\d+))?$/.exec(s);
  if (m) {
    mi = Number(m[1]);
    se = Number(m[2]);
    frac = m[3];
  } else {
    m = /^(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d+))?$/.exec(s);
    if (!m) return null;
    h = Number(m[1]);
    mi = Number(m[2]);
    se = Number(m[3]);
    frac = m[4];
    if (mi >= 60) return null;
  }
  if (se >= 60) return null;
  let t = h * 3600 + mi * 60 + se;
  if (frac && /[1-9]/.test(frac)) t += 1;
  return t > 0 ? t : null;
}

/** O código do escalão (o do seed da M2) a partir do rótulo do site e do
 *  género da TABELA (o site não escreve o género nos jovens nem nos
 *  seniores: "Sub-18", "Seniores"; escreve-o nos veteranos: "M40", "F35").
 *  "Sub-18" + M → SUB18M; "Seniores" + F → SENF; "M40" + M → M40. Uma letra
 *  que não bate com a tabela ("F35" numa tabela masculina), sem género, ou
 *  outro rótulo → null. */
export function officialCategoryCode(label: string, gender: "M" | "F" | null): string | null {
  const s = String(label ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
  let m = /^SUB ?-? ?(\d{2})(?: ?([MF]))?$/.exec(s);
  if (m) return gender && (!m[2] || m[2] === gender) ? `SUB${m[1]}${gender}` : null;
  m = /^SENIOR(?:ES)?(?: ?([MF]))?$/.exec(s);
  if (m) return gender && (!m[1] || m[1] === gender) ? `SEN${gender}` : null;
  m = /^([MF]) ?(\d{2})$/.exec(s);
  if (m) return gender === m[1] ? `${m[1]}${m[2]}` : null;
  return null;
}

/** A entrada da chave do dorsal: `${edição}:${dorsal normalizado}` (null sem
 *  dorsal). bib_key = sha256Hex disto = cup_bib_key(edição, dorsal) na BD. */
export function bibKeyInput(editionId: string, bib: unknown): string | null {
  const b = normBib(bib);
  return b == null || !editionId ? null : `${editionId}:${b}`;
}

/** SHA-256 em hexadecimal (WebCrypto). Igual ao
 *  encode(sha256(convert_to(s, 'UTF8')), 'hex') do Postgres. */
export async function sha256Hex(s: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Linhas canónicas (em memória; nunca se serializam) ────────────────────

const NO_JSON = "dados de terceiros não se serializam";
const INSPECT_DENO: unique symbol = Symbol.for("Deno.customInspect") as never;
const INSPECT_NODE: unique symbol = Symbol.for("nodejs.util.inspect.custom") as never;

/** Uma linha da página de uma prova, já validada. Os campos pessoais (dorsal,
 *  nome, clube) são privados — um spread ou Object.entries não os leva — e
 *  a linha rebenta num JSON.stringify. */
export class CanonRoundRow {
  /** Índice da tabela na página (ordem do documento). */
  readonly table: number;
  /** Pos da tabela (lugar na série). */
  readonly pos: number;
  readonly categoryCode: string;
  /** null = marca ilegível (≤ 1% da página): essa linha nunca liga. */
  readonly timeS: number | null;
  /** Lugar no escalão NA PÁGINA, entre todos os que correram com esse código. */
  readonly categoryPos: number;
  readonly #bibNorm: string;
  readonly #nameNorm: string;
  readonly #clubNorm: string;

  constructor(f: {
    table: number; pos: number; bibNorm: string; nameNorm: string; clubNorm: string;
    categoryCode: string; timeS: number | null; categoryPos: number;
  }) {
    this.table = f.table;
    this.pos = f.pos;
    this.categoryCode = f.categoryCode;
    this.timeS = f.timeS;
    this.categoryPos = f.categoryPos;
    this.#bibNorm = f.bibNorm;
    this.#nameNorm = f.nameNorm;
    this.#clubNorm = f.clubNorm;
  }

  /** '' = dorsal vazio ou inválido (nunca liga). */
  get bibNorm(): string { return this.#bibNorm; }
  get nameNorm(): string { return this.#nameNorm; }
  get clubNorm(): string { return this.#clubNorm; }

  toJSON(): never { throw new Error(NO_JSON); }
  [INSPECT_DENO](): string { return "[linha oficial]"; }
  [INSPECT_NODE](): string { return "[linha oficial]"; }
}

/** Uma linha da classificação geral, já validada (sem dorsal: o site não o
 *  mostra). Nome, equipa e ano são privados; rebenta num JSON.stringify. */
export class CanonStandingRow {
  readonly table: number;
  readonly categoryCode: string;
  readonly pos: number;
  /** P1..PN (null = célula vazia). */
  readonly points: (number | null)[];
  readonly total: number;
  readonly #nameNorm: string;
  readonly #teamNorm: string;
  readonly #year: number;

  constructor(f: {
    table: number; categoryCode: string; pos: number; nameNorm: string; teamNorm: string;
    year: number; points: (number | null)[]; total: number;
  }) {
    this.table = f.table;
    this.categoryCode = f.categoryCode;
    this.pos = f.pos;
    this.points = Object.freeze([...f.points]) as (number | null)[];
    this.total = f.total;
    this.#nameNorm = f.nameNorm;
    this.#teamNorm = f.teamNorm;
    this.#year = f.year;
  }

  get nameNorm(): string { return this.#nameNorm; }
  get teamNorm(): string { return this.#teamNorm; }
  get year(): number { return this.#year; }

  toJSON(): never { throw new Error(NO_JSON); }
  [INSPECT_DENO](): string { return "[linha oficial]"; }
  [INSPECT_NODE](): string { return "[linha oficial]"; }
}

// ── Validação (invariantes) ───────────────────────────────────────────────

export interface Check { ok: boolean; failures: string[]; warnings: string[] }

export interface RoundStats {
  tables: { distanceM: number | null; gender: string | null; rows: number }[];
  rowsTotal: number;
  /** Linhas por código de escalão (todos os de ctx.categoryCodes, com 0);
   *  '?' = rótulos que não dão código. */
  byCategory: Record<string, number>;
  /** Dorsais (distintos) que aparecem em ≥ 2 linhas. */
  bibDupPage: number;
  /** Linhas com a marca ilegível. */
  timeFailures: number;
  date: string | null;
}

export interface StandingsStats {
  tables: number;
  rowsTotal: number;
  pCount: number;
  byCategory: Record<string, number>;
  /** Linhas com Total = Σ P. */
  totalOk: number;
  /** Tabelas com Pos em ranking de competição por Total. */
  rankingOk: number;
  legend: { k: number; dayMonth: string; roundNo: number | null }[];
}

export interface RoundCheck extends Check { rows: CanonRoundRow[]; stats: RoundStats }
export interface StandingsCheck extends Check {
  rows: CanonStandingRow[];
  stats: StandingsStats;
  /** k (P1..PN) → round_id pela data da legenda; null = não se liga. */
  legendMap: Map<number, string | null>;
}

export interface RoundCtx {
  /** A data da jornada (ISO). null = sem jornada para comparar (ensaio). */
  roundDate: string | null;
  categoryCodes: Set<string>;
  courseDistancesM?: number[];
  roundName?: string | null;
  /** O que a última leitura boa viu (cup_sync_state). */
  prev?: { rowsTotal: number; categories: string[] } | null;
}

export interface StandingsCtx {
  seasonLabel: string | null;
  categoryCodes: Set<string>;
  pointsTable: number[] | null;
  roundDates: { roundId: string; roundNo: number; date: string | null }[];
  prev?: { rowsTotal: number; categories: string[] } | null;
  nowYear: number;
}

/** Limites de plausibilidade (linhas por página). */
export const ROUND_ROWS_RANGE = [20, 3000] as const;
export const STANDINGS_ROWS_RANGE = [50, 5000] as const;
/** Fração de linhas com marca/dorsal ilegível acima da qual a página pára. */
export const MAX_BAD_FRACTION = 0.01;
/** Uma leitura com menos de 80% das linhas da anterior pára (regressão). */
export const REGRESSION_FRACTION = 0.8;
/** Distância de uma tabela a > 15% de todos os percursos → aviso. */
export const DISTANCE_TOLERANCE = 0.15;

function isoDay(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.slice(0, 10)) && (v.length === 10 || v[10] === "T")
    ? v.slice(0, 10)
    : null;
}

/** Inteiro positivo de uma célula ("12", "12º", "12."). NaN se não for. */
function posOf(s: string): number {
  const m = /^\s*(\d{1,6})\s*[º°.]?\s*$/.exec(String(s ?? ""));
  return m ? Number(m[1]) : NaN;
}

/** Inteiro ≥ 0 de uma célula de pontos; '' → null; outra coisa → NaN. */
function pointsOf(s: string): number | null {
  const t = String(s ?? "").trim();
  if (t === "") return null;
  return /^\d{1,6}$/.test(t) ? Number(t) : NaN;
}

/** Ranking de competição a partir de 1: pos[0]=1, pos[i] ∈ {pos[i−1], i+1}. */
function isCompetitionRanking(pos: number[]): boolean {
  for (let i = 0; i < pos.length; i++) {
    if (!Number.isInteger(pos[i])) return false;
    if (i === 0 ? pos[0] !== 1 : pos[i] !== pos[i - 1] && pos[i] !== i + 1) return false;
  }
  return true;
}

function regressionFails(
  prev: { rowsTotal: number; categories: string[] } | null | undefined,
  rowsTotal: number,
  byCategory: Record<string, number>,
): boolean {
  if (!prev) return false;
  if (Number.isFinite(prev.rowsTotal) && prev.rowsTotal > 0 && rowsTotal < REGRESSION_FRACTION * prev.rowsTotal) return true;
  return (prev.categories || []).some((c) => !(byCategory[c] > 0));
}

function words4(s: string | null | undefined): Set<string> {
  return new Set(normText(s).split(" ").filter((w) => w.length >= 4));
}

/** A página de uma prova (/Resultados/{id}). Qualquer falha → ok false e
 *  rows [] (nada dessa página se escreve). Os avisos não param. */
export function checkRoundPage(page: SourceRoundPage, ctx: RoundCtx): RoundCheck {
  const failures = new Set<string>();
  const warnings = new Set<string>();
  const codes = ctx?.categoryCodes ?? new Set<string>();
  const tables = Array.isArray(page?.tables) ? page.tables : [];
  const date = isoDay(page?.date);

  if (!page || page.kind !== "jornada" || page.errorPage) failures.add("pagina_erro");
  if (!/resultados/i.test(page?.title ?? "")) failures.add("titulo");
  if (ctx?.roundDate) {
    if (date !== isoDay(ctx.roundDate)) failures.add("data_da_pagina");
  } else if (!date) warnings.add("data_da_pagina");
  if (!tables.length) failures.add("sem_tabelas");

  const byCategory: Record<string, number> = {};
  for (const c of codes) byCategory[c] = 0;
  const statsTables: RoundStats["tables"] = [];
  const bibCount = new Map<string, number>();
  const codeTables = new Map<string, Set<number>>();
  let rowsTotal = 0, timeFailures = 0, badBibs = 0, unknownCategory = 0;
  const pending: {
    table: number; pos: number; bibNorm: string; nameNorm: string; clubNorm: string;
    categoryCode: string; timeS: number | null; idx: number;
  }[] = [];

  tables.forEach((t, ti) => {
    const rows = Array.isArray(t?.rows) ? t.rows : [];
    statsTables.push({ distanceM: t?.distanceM ?? null, gender: t?.gender ?? null, rows: rows.length });
    if (t?.missingColumns?.length) failures.add("colunas");
    if (t?.gender !== "M" && t?.gender !== "F") failures.add("genero");
    if (!rows.length) failures.add("linhas_implausiveis");
    const positions = rows.map((r) => posOf(r?.pos));
    if (!isCompetitionRanking(positions)) failures.add("posicoes");
    if (ctx?.courseDistancesM?.length && t?.distanceM != null) {
      const d = t.distanceM;
      if (ctx.courseDistancesM.every((c) => !(c > 0) || Math.abs(d - c) > DISTANCE_TOLERANCE * c)) warnings.add("distancia");
    }
    rows.forEach((r, ri) => {
      rowsTotal += 1;
      const code = officialCategoryCode(r?.category, t?.gender ?? null);
      if (!code || !codes.has(code)) {
        unknownCategory += 1;
        byCategory["?"] = (byCategory["?"] ?? 0) + 1;
      } else {
        byCategory[code] = (byCategory[code] ?? 0) + 1;
        if (!codeTables.has(code)) codeTables.set(code, new Set());
        codeTables.get(code)!.add(ti);
      }
      const timeS = parseMarca(r?.time);
      if (timeS == null) timeFailures += 1;
      const bib = normBib(r?.bib);
      const bibOk = bib != null && /^[A-Z0-9]+$/.test(bib);
      if (!bibOk) badBibs += 1;
      else bibCount.set(bib, (bibCount.get(bib) ?? 0) + 1);
      pending.push({
        table: ti,
        pos: positions[ri],
        bibNorm: bibOk ? bib : "",
        nameNorm: normText(r?.name),
        clubNorm: normText(r?.club),
        categoryCode: code ?? "",
        timeS,
        idx: pending.length,
      });
    });
  });

  if (rowsTotal < ROUND_ROWS_RANGE[0] || rowsTotal > ROUND_ROWS_RANGE[1]) failures.add("linhas_implausiveis");
  if (rowsTotal > 0 && timeFailures > MAX_BAD_FRACTION * rowsTotal) failures.add("marca");
  else if (timeFailures > 0) warnings.add("marca_parcial");
  if (rowsTotal > 0 && badBibs > MAX_BAD_FRACTION * rowsTotal) failures.add("dorsal");
  else if (badBibs > 0) warnings.add("dorsal_parcial");
  if (unknownCategory > 0) failures.add("escalao_desconhecido");
  if (regressionFails(ctx?.prev, rowsTotal, byCategory)) failures.add("regressao");

  const bibDupPage = [...bibCount.values()].filter((n) => n >= 2).length;
  if (bibDupPage > 0) warnings.add("dorsal_repetido_pagina");
  if ([...codeTables.values()].some((s) => s.size > 1)) warnings.add("escalao_em_duas_tabelas");
  if (ctx?.roundName) {
    const a = words4(page?.raceName), b = words4(ctx.roundName);
    if (![...a].some((w) => b.has(w))) warnings.add("nome_da_prova");
  }

  const stats: RoundStats = { tables: statsTables, rowsTotal, byCategory, bibDupPage, timeFailures, date };
  const ok = failures.size === 0;
  let rows: CanonRoundRow[] = [];
  if (ok) {
    // Lugar no escalão: por Pos (e tabela) entre todos os desse código; um
    // empate na mesma tabela dá o mesmo lugar.
    const catPos = new Map<number, number>();
    const byCode = new Map<string, typeof pending>();
    for (const p of pending) {
      if (!byCode.has(p.categoryCode)) byCode.set(p.categoryCode, []);
      byCode.get(p.categoryCode)!.push(p);
    }
    for (const list of byCode.values()) {
      list.sort((a, b) => a.pos - b.pos || a.table - b.table || a.idx - b.idx);
      list.forEach((p, i) => {
        const prev = list[i - 1];
        catPos.set(p.idx, i > 0 && prev.table === p.table && prev.pos === p.pos ? catPos.get(prev.idx)! : i + 1);
      });
    }
    rows = pending.map((p) => new CanonRoundRow({ ...p, categoryPos: catPos.get(p.idx)! }));
  }
  return { ok, failures: [...failures], warnings: [...warnings], rows, stats };
}

function dayMonthOf(isoDate: string | null | undefined): string | null {
  const d = isoDay(isoDate);
  return d ? `${d.slice(8, 10)}-${d.slice(5, 7)}` : null;
}

/** A classificação geral (/Trofeu/{id}). Qualquer falha → ok false, rows []. */
export function checkStandingsPage(page: SourceStandingsPage, ctx: StandingsCtx): StandingsCheck {
  const failures = new Set<string>();
  const warnings = new Set<string>();
  const codes = ctx?.categoryCodes ?? new Set<string>();
  const tables = Array.isArray(page?.tables) ? page.tables : [];
  const table = Array.isArray(ctx?.pointsTable) && ctx.pointsTable.length ? ctx.pointsTable : null;
  const tableValues = table ? new Set(table) : null;
  const nowYear = Number.isInteger(ctx?.nowYear) ? ctx.nowYear : new Date().getUTCFullYear();

  if (!page || page.kind !== "geral" || page.errorPage) failures.add("pagina_erro");
  if (!/classifica/i.test(page?.title ?? "")) failures.add("titulo");
  const pageY = seasonRefYear(page?.seasonLabel), ctxY = seasonRefYear(ctx?.seasonLabel);
  if (pageY == null || ctxY == null || pageY !== ctxY) failures.add("epoca_da_pagina");
  if (!tables.length) failures.add("sem_tabelas");

  const pCounts = new Set(tables.map((t) => t?.pCount));
  const pCount = pCounts.size === 1 ? Number([...pCounts][0]) : 0;
  if (tables.some((t) => t?.missingColumns?.length) || pCounts.size > 1 || !(pCount >= 1)) failures.add("colunas");

  const byCategory: Record<string, number> = {};
  for (const c of codes) byCategory[c] = 0;
  const seenCodes = new Set<string>();
  const tableCodes: (string | null)[] = tables.map((t) => {
    const code = officialCategoryCode(t?.category, t?.gender ?? null);
    if (!code || !codes.has(code) || seenCodes.has(code)) {
      failures.add("escalao_desconhecido");
      return null;
    }
    seenCodes.add(code);
    return code;
  });

  let rowsTotal = 0, totalOk = 0, rankingOk = 0;
  const parsed: { t: number; code: string; pos: number; name: string; team: string; year: number; points: (number | null)[]; total: number }[] = [];
  tables.forEach((t, ti) => {
    const rows = Array.isArray(t?.rows) ? t.rows : [];
    const code = tableCodes[ti];
    if (code) byCategory[code] = rows.length;
    const pos: number[] = [];
    const totals: number[] = [];
    for (const r of rows) {
      rowsTotal += 1;
      const pts = (Array.isArray(r?.points) ? r.points : []).map(pointsOf);
      if (pts.length !== t.pCount) failures.add("colunas");
      const total = pointsOf(r?.total);
      const sum = pts.reduce<number>((a, p) => a + (p ?? 0), 0);
      if (total == null || Number.isNaN(total) || pts.some((p) => Number.isNaN(p as number)) || total !== sum) {
        failures.add("total_soma");
      } else totalOk += 1;
      const yearTxt = String(r?.year ?? "").trim();
      const year = /^\d{4}$/.test(yearTxt) ? Number(yearTxt) : NaN;
      if (!(year >= 1900 && year <= nowYear)) failures.add("ano");
      if (tableValues && pts.some((p) => p != null && !Number.isNaN(p) && p !== 0 && !tableValues.has(p))) {
        failures.add("pontos_fora_da_tabela");
      }
      const p = posOf(r?.pos);
      pos.push(p);
      totals.push(total ?? NaN);
      parsed.push({ t: ti, code: code ?? "", pos: p, name: r?.name, team: r?.team, year, points: pts, total: total ?? NaN });
    }
    // Ranking de competição por Total decrescente (um desempate pelo
    // regulamento pode separar totais iguais; nunca juntar totais diferentes).
    let good = isCompetitionRanking(pos);
    for (let i = 1; good && i < pos.length; i++) {
      if (!(totals[i] <= totals[i - 1])) good = false;
      else if (pos[i] === pos[i - 1] && totals[i] !== totals[i - 1]) good = false;
      else if (totals[i] < totals[i - 1] && pos[i] !== i + 1) good = false;
    }
    if (good) rankingOk += 1;
    else failures.add("ranking");
  });

  if (rowsTotal < STANDINGS_ROWS_RANGE[0] || rowsTotal > STANDINGS_ROWS_RANGE[1]) failures.add("linhas_implausiveis");
  if (regressionFails(ctx?.prev, rowsTotal, byCategory)) failures.add("regressao");

  // Legenda "P1: CORRIDA DA PADROEIRA (08-12)" → a jornada pela data (dd-mm).
  const legend = Array.isArray(page?.legend) ? page.legend : [];
  if (!legend.length) warnings.add("legenda_em_falta");
  const rounds = Array.isArray(ctx?.roundDates) ? ctx.roundDates : [];
  const legendMap = new Map<number, string | null>();
  for (let k = 1; k <= pCount; k++) legendMap.set(k, null);
  const statsLegend: StandingsStats["legend"] = [];
  for (const e of legend) {
    if (!e || !Number.isInteger(e.k) || e.k < 1) continue;
    const hits = rounds.filter((r) => dayMonthOf(r.date) === e.dayMonth);
    const hit = hits.length === 1 ? hits[0] : null;
    if (e.k <= pCount) legendMap.set(e.k, hit ? hit.roundId : null);
    if (!hit) warnings.add("legenda_sem_jornada");
    statsLegend.push({ k: e.k, dayMonth: e.dayMonth, roundNo: hit ? hit.roundNo : null });
  }
  if (rounds.length && pCount && pCount !== rounds.length) warnings.add("colunas_p_vs_jornadas");

  // Por k e escalão: Σ Pk = Σ tabela(1..m), m = nº com Pk > 0 (os de fora não
  // ocupam lugar). Diferente → empates ou regra nova: aviso.
  if (table && pCount) {
    const T = (i: number) => table[Math.min(i, table.length) - 1];
    for (let ti = 0; ti < tables.length; ti++) {
      const mine = parsed.filter((p) => p.t === ti);
      for (let k = 1; k <= pCount; k++) {
        const vals = mine.map((p) => p.points[k - 1]).filter((v): v is number => typeof v === "number" && v > 0);
        let expected = 0;
        for (let i = 1; i <= vals.length; i++) expected += T(i);
        if (vals.reduce((a, b) => a + b, 0) !== expected) warnings.add("pontos_soma_escalao");
      }
    }
  }

  const stats: StandingsStats = {
    tables: tables.length, rowsTotal, pCount, byCategory, totalOk, rankingOk, legend: statsLegend,
  };
  const ok = failures.size === 0;
  const rows = ok
    ? parsed.map((p) => new CanonStandingRow({
      table: p.t, categoryCode: p.code, pos: p.pos, nameNorm: normText(p.name), teamNorm: normText(p.team),
      year: p.year, points: p.points, total: p.total,
    }))
    : [];
  return { ok, failures: [...failures], warnings: [...warnings], rows, stats, legendMap };
}

// ── Hash do conteúdo não pessoal (pronta/estável) ─────────────────────────

/** O conteúdo de uma página de prova SEM dados pessoais: tabela, Pos,
 *  escalão e marca de cada linha. Uma correção de nome, dorsal ou clube não
 *  o muda; uma marca ou um lugar novos mudam-no. */
export function roundContentInput(rows: CanonRoundRow[]): string {
  return rows.map((r) => `${r.table}|${r.pos}|${r.categoryCode}|${r.timeS ?? ""}`).sort().join("\n");
}

/** O mesmo para a geral: escalão, Pos, P1..PN e Total. */
export function standingsContentInput(rows: CanonStandingRow[]): string {
  return rows.map((r) => `${r.categoryCode}|${r.pos}|${r.points.map((p) => p ?? "").join(",")}|${r.total}`).sort().join("\n");
}

// ── Tempo: quando ler, pronta, estável ────────────────────────────────────

export const CUP_SYNC_TIMING = Object.freeze({
  /** Pronta = o mesmo hash visto outra vez ≥ 6 h depois de o ver pela 1.ª vez. */
  readyAfterH: 6,
  /** Estável = pronta e 48 h sem mudar (ou o fim de D+10). */
  stableAfterH: 48,
  /** A janela de leitura: D … D+10 (dias locais). */
  windowDays: 10,
  /** De D+2 a D+10: uma leitura por dia (≥ 20 h desde a última). */
  dailyEveryH: 20,
  /** A geral lê-se com uma jornada se a última leitura dela tem ≥ 6 h. */
  standingsMinH: 6,
  /** D abre às max(12:00, 1.ª partida + 2 h) locais. */
  openAtMin: 12 * 60,
  afterStartMin: 120,
  /** Depois de D+10, uma jornada à espera da 1.ª leitura em publicar
   *  ('publicar_pendente') relê-se de 6 em 6 h até ficar pronta… */
  pendingEveryH: 6,
  /** … e fecha (estável em publicar, sem publicação) ao fim de 48 h a falhar. */
  pendingGiveUpH: 48,
});

export interface DueRound {
  date: string | null;
  date_status: string | null;
  /** A partida mais cedo dos percursos da jornada ("09:30:00"). */
  first_start_time?: string | null;
}

/** As colunas de cup_sync_state que o tempo lê. */
export interface SyncState {
  last_checked_at?: string | null;
  content_hash?: string | null;
  hash_seen_at?: string | null;
  ready_at?: string | null;
  stable_at?: string | null;
  /** O modo em que a jornada ficou estável ('observar' | 'publicar'): a
   *  marca só vale para esse modo (roundDue). null = desconhecido. */
  stable_mode?: string | null;
  fail_since?: string | null;
}

export type SyncWriteMode = "observar" | "publicar";

const H = 3600000;
const DEFAULT_TZ = "Europe/Lisbon";

function localParts(at: Date, tz: string): { day: string; minutes: number } {
  let fmt: Intl.DateTimeFormat;
  const opts: Intl.DateTimeFormatOptions = {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  };
  try {
    fmt = new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: tz || DEFAULT_TZ });
  } catch {
    fmt = new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: DEFAULT_TZ });
  }
  const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

function shiftDay(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** O instante da meia-noite local de um dia, num fuso. */
function localMidnight(day: string, tz: string): Date {
  const utc = Date.parse(`${day}T00:00:00Z`);
  let guess = utc;
  for (let i = 0; i < 3; i++) {
    const lp = localParts(new Date(guess), tz);
    const shown = Date.parse(`${lp.day}T00:00:00Z`) + lp.minutes * 60000;
    const next = guess - (shown - utc);
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

/** O fim da janela de uma jornada: a meia-noite local que fecha D+10. */
export function roundWindowEnd(date: string, tz: string): Date {
  return localMidnight(shiftDay(isoDay(date) ?? date, CUP_SYNC_TIMING.windowDays + 1), tz);
}

function openMinutes(start: string | null | undefined): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(start ?? ""));
  const s = m ? Number(m[1]) * 60 + Number(m[2]) : -Infinity;
  return Math.min(24 * 60 - 1, Math.max(CUP_SYNC_TIMING.openAtMin, s + CUP_SYNC_TIMING.afterStartMin));
}

/** Se a jornada está na janela [D, D+10] (datas locais, confirmada). */
export function roundInWindow(round: DueRound | null | undefined, now: Date, tz: string): boolean {
  const d = isoDay(round?.date);
  if (!d || round?.date_status !== "confirmada") return false;
  const age = daysBetween(d, localParts(now, tz).day);
  return age >= 0 && age <= CUP_SYNC_TIMING.windowDays;
}

/** Se a marca de estável de uma jornada vale para o modo desta volta. A de
 *  'publicar' vale para os dois; a de 'observar' (ou sem modo) só para
 *  'observar' — em publicar a jornada ainda não foi lida para os atletas. */
export function stableFor(state: SyncState | null | undefined, mode?: SyncWriteMode | null): boolean {
  if (!state?.stable_at) return false;
  return mode !== "publicar" || state.stable_mode === "publicar";
}

/** Se esta volta lê a página de uma jornada (B.6):
 *  - sem data confirmada → não ('sem_data'); já estável NESTE modo → não
 *    ('estavel');
 *  - antes de D às max(12:00, 1.ª partida + 2 h) locais → não ('cedo');
 *  - depois do fim de D+10 → não, e `closeNow` (marca estável sem ler);
 *  - D e D+1 → sim, em todas as voltas ('janela_quente');
 *  - D+2 … D+10 → sim se a última leitura tem ≥ 20 h ('diaria').
 *
 *  `mode` = o que a volta escreve. A marca de estável só vale para o modo
 *  em que foi obtida (`stable_mode`): em 'publicar', uma jornada estável em
 *  'observar' (ou fechada no fim de D+10 sem nunca ter sido lida) volta ao
 *  plano — dentro da janela, como as outras; depois dela, `pending`
 *  ('publicar_pendente'): de 6 em 6 h até ficar pronta (o job publica-a e
 *  fecha-a em publicar), e fecha ao fim de 48 h a falhar. Nunca fica presa
 *  sem uma leitura em publicar. Sem `mode`, qualquer marca vale. */
export function roundDue(
  round: DueRound | null | undefined,
  state: SyncState | null,
  now: Date,
  tz: string,
  mode?: SyncWriteMode | null,
): { due: boolean; reason: string; closeNow?: boolean; pending?: boolean } {
  const d = isoDay(round?.date);
  if (!d || round?.date_status !== "confirmada") return { due: false, reason: "sem_data" };
  if (stableFor(state, mode)) return { due: false, reason: "estavel" };
  // Aqui, uma marca de estável é de observar e a volta publica.
  const pending = !!state?.stable_at;
  const local = localParts(now, tz);
  if (local.day < d || (local.day === d && local.minutes < openMinutes(round?.first_start_time))) {
    return { due: false, reason: "cedo" };
  }
  const age = daysBetween(d, local.day);
  const last = state?.last_checked_at ? Date.parse(state.last_checked_at) : NaN;
  if (age > CUP_SYNC_TIMING.windowDays) {
    if (!pending) return { due: false, reason: "fim_da_janela", closeNow: true };
    // Só contam as falhas depois da marca de observar (as de antes são as
    // que a fecharam sem a ler).
    const fail = state?.fail_since ? Date.parse(state.fail_since) : NaN;
    const mark = Date.parse(state!.stable_at!);
    if (Number.isFinite(fail) && !(fail < mark) && now.getTime() - fail >= CUP_SYNC_TIMING.pendingGiveUpH * H) {
      return { due: false, reason: "fim_da_janela", closeNow: true, pending: true };
    }
    if (!Number.isFinite(last) || now.getTime() - last >= CUP_SYNC_TIMING.pendingEveryH * H) {
      return { due: true, reason: "publicar_pendente", pending: true };
    }
    return { due: false, reason: "lida_ha_pouco", pending: true };
  }
  if (age <= 1) return { due: true, reason: "janela_quente" };
  if (!Number.isFinite(last) || now.getTime() - last >= CUP_SYNC_TIMING.dailyEveryH * H) return { due: true, reason: "diaria" };
  return { due: false, reason: "lida_ha_pouco" };
}

/** Se esta volta lê a geral: com uma jornada lida, se a última leitura da
 *  geral tem ≥ 6 h; e uma vez por dia (≥ 20 h) enquanto alguma jornada da
 *  edição estiver na janela. */
export function standingsDue(anyRoundDue: boolean, anyRoundInWindow: boolean, state: SyncState | null, now: Date): boolean {
  const last = state?.last_checked_at ? Date.parse(state.last_checked_at) : NaN;
  const hours = Number.isFinite(last) ? (now.getTime() - last) / H : Infinity;
  return (anyRoundDue && hours >= CUP_SYNC_TIMING.standingsMinH) || (anyRoundInWindow && hours >= CUP_SYNC_TIMING.dailyEveryH);
}

/** Pronta e estável a partir do hash desta leitura (B.6). Um hash novo
 *  reinicia a contagem (e tira o "estável"); o mesmo hash visto de novo com
 *  ≥ 6 h fica pronto; pronto e 48 h sem mudar, ou o fim da janela, fica
 *  estável. Datas em ISO. */
export function readiness(
  state: SyncState | null,
  newHash: string,
  now: Date,
  windowEnd: Date,
): { hashSeenAt: string; readyAt: string | null; stableAt: string | null } {
  const nowIso = now.toISOString();
  const over = now.getTime() >= windowEnd.getTime();
  const seen = state?.hash_seen_at ? Date.parse(state.hash_seen_at) : NaN;
  if (!state || state.content_hash !== newHash || !Number.isFinite(seen)) {
    return { hashSeenAt: nowIso, readyAt: null, stableAt: over ? nowIso : null };
  }
  const age = now.getTime() - seen;
  const readyAt = state.ready_at ?? (age >= CUP_SYNC_TIMING.readyAfterH * H ? nowIso : null);
  const stableAt = state.stable_at ??
    ((readyAt && age >= CUP_SYNC_TIMING.stableAfterH * H) || over ? nowIso : null);
  return { hashSeenAt: new Date(seen).toISOString(), readyAt, stableAt };
}

// ── Correspondência (B.4) ─────────────────────────────────────────────────

export interface TeamAtDate { team_id: string | null; team_other: string | null }
export interface TeamLike { id: string; name: string; short_name?: string | null; kind?: string | null }
export interface AliasLike { alias_norm: string; team_id: string | null }

/** O clube (da lista da edição) de um nome visto na fonte: pelo alias ligado
 *  ou pelo nome/sigla do clube. null = desconhecido. */
export function resolveTeamId(clubNorm: string, teams: TeamLike[], aliases: AliasLike[]): string | null {
  const c = normText(clubNorm);
  if (!c) return null;
  const alias = (aliases || []).find((a) => a && a.team_id && normText(a.alias_norm) === c);
  if (alias) return alias.team_id;
  const team = (teams || []).find((t) => t && (normText(t.name) === c || (t.short_name != null && normText(t.short_name) === c)));
  return team ? team.id : null;
}

/** O clube da linha bate com o da inscrição (na data da jornada)?
 *  - clube da lista: 'ok' se o alias do clube da linha aponta para ele, ou o
 *    nome/sigla dele; o Individual também com o clube vazio;
 *  - "não está na lista" (team_other): 'ok' se é o mesmo texto;
 *  - sem clube: 'ok' só com o clube vazio.
 *  'desconhecido' = a linha tem um clube que ninguém ligou (vai para os
 *  aliases como "clube novo"); 'diferente' no resto (incl. vazio). */
export function clubCheck(
  team: TeamAtDate,
  clubNorm: string,
  teams: TeamLike[],
  aliases: AliasLike[],
): "ok" | "diferente" | "desconhecido" {
  const c = normText(clubNorm);
  const seen = resolveTeamId(c, teams, aliases);
  const unknown = c !== "" && seen == null;
  if (team?.team_id) {
    const mine = (teams || []).find((t) => t?.id === team.team_id);
    if (mine?.kind === "individual" && c === "") return "ok";
    if (seen === team.team_id) return "ok";
    return unknown ? "desconhecido" : "diferente";
  }
  if (team?.team_other) {
    if (c !== "" && c === normText(team.team_other)) return "ok";
    return unknown ? "desconhecido" : "diferente";
  }
  if (c === "") return "ok";
  return unknown ? "desconhecido" : "diferente";
}

/** O token do clube da inscrição na chave da geral. */
export function teamToken(team: TeamAtDate | null | undefined): string {
  if (team?.team_id) return `team:${team.team_id}`;
  const other = normText(team?.team_other);
  return other ? `outro:${other}` : "sem-clube";
}

/** O token da coluna Equipa de uma linha da geral (o mesmo espaço de
 *  teamToken): o clube pelo alias ou pelo nome; senão o texto. */
export function standingsTeamToken(teamNorm: string, teams: TeamLike[], aliases: AliasLike[]): string {
  const id = resolveTeamId(teamNorm, teams, aliases);
  if (id) return `team:${id}`;
  const t = normText(teamNorm);
  return t ? `outro:${t}` : "sem-clube";
}

/** Os dorsais a 1 carácter de distância (mesmo comprimento, uma posição
 *  diferente). Só para a contagem agregada do "vizinho" — nunca se ligam
 *  nem se mostram. */
export function neighborBibs(bibNorm: string, bibs: Iterable<string>): string[] {
  const out = new Set<string>();
  if (!bibNorm) return [];
  for (const b of bibs) {
    if (!b || b.length !== bibNorm.length || b === bibNorm) continue;
    let diff = 0;
    for (let i = 0; i < b.length && diff < 2; i++) if (b[i] !== bibNorm[i]) diff += 1;
    if (diff === 1) out.add(b);
  }
  return [...out];
}

export interface MatchEnrollment {
  id: string;
  userId: string;
  /** normBib(cup_enrollments.bib); null = sem dorsal. */
  bibNorm: string | null;
  /** sha256Hex(bibKeyInput(edição, dorsal)) = cup_bib_key. */
  bibKey: string | null;
  /** cup_enrollments.match_refused_key ("não sou eu"). */
  refusedKey: string | null;
  /** O clube NA DATA DA JORNADA (cup_enrollment_teams). */
  team: TeamAtDate;
  /** cupCategoryFor(edição, escalões, nascimento, género, data da jornada). */
  categoryCode: string | null;
}

export interface MatchInput {
  editionId: string;
  roundId: string;
  /** A validação da página: sem ok, a correspondência não corre. */
  check: RoundCheck;
  enrollments: MatchEnrollment[];
  teams: TeamLike[];
  aliases: AliasLike[];
  /** Pontos calculados: com points_mode 'tabela' (senão null). */
  pointsTable?: number[] | null;
  pointsBasis?: string | null;
}

export type MatchKind =
  | "sem_dorsal"
  | "recusado"
  | "repetido_inscricoes"
  | "repetido_pagina"
  | "ausente"
  | "ausente_vizinho"
  | "marca"
  | "escalao"
  | "clube_desconhecido"
  | "clube"
  | "linha";

export const MATCH_KINDS: readonly MatchKind[] = [
  "sem_dorsal", "recusado", "repetido_inscricoes", "repetido_pagina", "ausente", "ausente_vizinho",
  "marca", "escalao", "clube_desconhecido", "clube", "linha",
];

/** A linha DELE (nunca nome, dorsal ou clube). */
export interface ResultData {
  position: number | null;
  category_code: string | null;
  category_position: number | null;
  official_time_s: number | null;
  points: number | null;
  points_source: "oficial" | "calculado" | null;
}

export interface EnrollmentMatch {
  enrollmentId: string;
  userId: string;
  outcome: MatchKind;
  bibKey: string | null;
  /** Só com 'linha'. */
  line?: ResultData;
  /** NÃO ENUMERÁVEIS (um JSON.stringify não os leva). Com 'linha':
   *  identityInput → match_hash; standingsInput → standings_key;
   *  standingsAltInput → standings_alt_key (a chave alternativa da geral). Com
   *  'clube_desconhecido': newAlias (o clube da linha achada pelo dorsal) e
   *  standingsInput — até se saber que a linha é DELE, o clube pode ser de
   *  outra pessoa (um dígito trocado): só roundAliases o deixa sair. */
  readonly identityInput?: string;
  readonly standingsInput?: string;
  readonly standingsAltInput?: string | null;
  readonly newAlias?: string;
}

export interface MatchOutcome {
  /** false = a página não passou nas invariantes: nada se escreve. */
  ok: boolean;
  roundId: string;
  byEnrollment: EnrollmentMatch[];
  counts: Record<MatchKind, number>;
  /** Dorsais (distintos) em ≥ 2 inscrições ativas da edição. */
  bibDupEnrollments: number;
}

function emptyCounts<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
}

/** Os pontos que a app calcula da página (um MÍNIMO — os de fora não ocupam
 *  lugar na classificação oficial): base 'escalao' → pelo lugar no escalão;
 *  'geral' → pela Pos; sem tabela ou base → null. Depois do último elemento
 *  da tabela vale o último. */
export function calculatedPoints(
  pointsTable: number[] | null,
  basis: string | null,
  row: { categoryPos: number; pos: number },
): number | null {
  if (!Array.isArray(pointsTable) || !pointsTable.length) return null;
  if (!pointsTable.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0)) return null;
  const p = basis === "escalao" ? row?.categoryPos : basis === "geral" ? row?.pos : NaN;
  if (!Number.isInteger(p) || p < 1) return null;
  return pointsTable[Math.min(p, pointsTable.length) - 1];
}

/** A correspondência de uma jornada, por inscrição (a primeira que bate):
 *  sem dorsal → recusado ("não sou eu") → dorsal repetido entre inscrições →
 *  repetido na página → ausente (ou vizinho, só contado) → marca ilegível →
 *  escalão ≠ o calculado → clube desconhecido (o alias, só se a linha for
 *  DELE: roundAliases) → clube diferente → linha. Nunca o nome escrito pelo
 *  atleta. Síncrona: os hashes das inscrições vêm pré-calculados; os das
 *  linhas calcula-os o job a partir de identityInput/standingsInput
 *  (outcomeHashes). */
export function matchRoundLines(input: MatchInput): MatchOutcome {
  const counts = emptyCounts(MATCH_KINDS);
  const out: MatchOutcome = {
    ok: false, roundId: input?.roundId, byEnrollment: [], counts, bibDupEnrollments: 0,
  };
  if (!input?.check?.ok) return out;
  out.ok = true;
  const teams = input.teams || [];
  const aliases = input.aliases || [];
  const rowsByBib = new Map<string, CanonRoundRow[]>();
  for (const r of input.check.rows) {
    if (!r.bibNorm) continue;
    if (!rowsByBib.has(r.bibNorm)) rowsByBib.set(r.bibNorm, []);
    rowsByBib.get(r.bibNorm)!.push(r);
  }
  const enrByBib = new Map<string, number>();
  for (const e of input.enrollments || []) {
    const b = normBib(e?.bibNorm);
    if (b) enrByBib.set(b, (enrByBib.get(b) ?? 0) + 1);
  }
  out.bibDupEnrollments = [...enrByBib.values()].filter((n) => n >= 2).length;

  for (const e of input.enrollments || []) {
    const bib = normBib(e?.bibNorm);
    const K = e?.bibKey || null;
    const m: EnrollmentMatch = { enrollmentId: e.id, userId: e.userId, outcome: "ausente", bibKey: K };
    if (!bib || !K) m.outcome = "sem_dorsal";
    else if (e.refusedKey && K === e.refusedKey) m.outcome = "recusado";
    else if ((enrByBib.get(bib) ?? 0) >= 2) m.outcome = "repetido_inscricoes";
    else {
      const found = rowsByBib.get(bib) ?? [];
      if (found.length >= 2) m.outcome = "repetido_pagina";
      else if (!found.length) {
        const vizinho = neighborBibs(bib, rowsByBib.keys()).some((b) => {
          const rs = rowsByBib.get(b)!;
          return rs.length === 1 && rs[0].categoryCode === e.categoryCode &&
            clubCheck(e.team, rs[0].clubNorm, teams, aliases) === "ok";
        });
        m.outcome = vizinho ? "ausente_vizinho" : "ausente";
      } else {
        const row = found[0];
        if (row.timeS == null) m.outcome = "marca";
        else if (!e.categoryCode || row.categoryCode !== e.categoryCode) m.outcome = "escalao";
        else {
          const club = clubCheck(e.team, row.clubNorm, teams, aliases);
          if (club === "desconhecido") {
            m.outcome = "clube_desconhecido";
            // A linha achada pelo dorsal ainda não é dele: o clube fica fora
            // do JSON e só sai por roundAliases (a chave de uma linha que ele
            // confirmou).
            Object.defineProperty(m, "newAlias", { value: row.clubNorm, enumerable: false });
            Object.defineProperty(m, "standingsInput", {
              value: standingsKeyInput(input.editionId, row.nameNorm, row.categoryCode, teamToken(e.team)),
              enumerable: false,
            });
          } else if (club === "diferente") m.outcome = "clube";
          else {
            m.outcome = "linha";
            // team_other / sem clube: não pontuam na geral de Cascais.
            const scores = !!e.team?.team_id;
            const points = scores ? calculatedPoints(input.pointsTable ?? null, input.pointsBasis ?? null, row) : null;
            m.line = {
              position: row.pos,
              category_code: row.categoryCode,
              category_position: row.categoryPos,
              official_time_s: row.timeS,
              points,
              points_source: points == null ? null : "calculado",
            };
            Object.defineProperty(m, "identityInput", {
              value: `${K}|${row.categoryCode}|${row.clubNorm}|${row.nameNorm}`,
              enumerable: false,
            });
            Object.defineProperty(m, "standingsInput", {
              value: standingsKeyInput(input.editionId, row.nameNorm, row.categoryCode, teamToken(e.team)),
              enumerable: false,
            });
            Object.defineProperty(m, "standingsAltInput", {
              value: standingsAltKeyInput(input.editionId, row.nameNorm, row.categoryCode, teamToken(e.team)),
              enumerable: false,
            });
          }
        }
      }
    }
    counts[m.outcome] += 1;
    out.byEnrollment.push(m);
  }
  return out;
}

export interface LineHashes {
  /** Por inscrição com 'linha': sha256Hex(identityInput), sha256Hex(standingsInput)
   *  e sha256Hex(standingsAltInput) (null sem nome). */
  byEnrollment: Map<string, { matchHash: string; standingsKey: string; altKey?: string | null }>;
  /** confirmedKey(…) de cada linha 'confirmada' da edição (confirmedKeysOf). */
  confirmedKeys: Set<string>;
}

/** A marca de "ele já confirmou esta linha nesta edição": a inscrição, o
 *  dorsal e a standings_key (o nome como o site o escreve, o escalão e o
 *  clube da inscrição). O mesmo dorsal só não chega — o organizador pode dar
 *  a outra pessoa o dorsal dele numa jornada (troca de dorsais entre
 *  colegas), e essa linha nunca se confirma sozinha. */
export function confirmedKey(enrollmentId: string, bibKey: string, standingsKey: string): string {
  return `${enrollmentId}|${bibKey}|${standingsKey}`;
}

/** As confirmedKey das linhas 'confirmada' (com dorsal e chave). */
export function confirmedKeysOf(existing: ExistingResult[]): Set<string> {
  const out = new Set<string>();
  for (const e of existing || []) {
    if (e?.match_status === "confirmada" && e.bib_key && e.standings_key) {
      out.add(confirmedKey(e.enrollment_id, e.bib_key, e.standings_key));
    }
  }
  return out;
}

/** Os clubes novos das jornadas que se podem gravar em cup_team_aliases
 *  (que o admin liga em "Clubes por ligar"): só os da linha que é DELE — o
 *  mesmo dorsal, nome como o site o escreve e escalão de uma linha que ele
 *  já confirmou nesta edição. Antes disso a linha achada pelo dorsal pode
 *  ser de outra pessoa (um dígito trocado, um atleta de fora), e o clube
 *  dela não se grava: fica só a contagem, e o admin liga pela sigla ou pelo
 *  short_name do clube. A lista oficial de coletividades vem da geral. */
export async function roundAliases(outcome: MatchOutcome, confirmedKeys: Set<string>): Promise<string[]> {
  const out = new Set<string>();
  if (!outcome?.ok) return [];
  for (const m of outcome.byEnrollment || []) {
    if (m.outcome !== "clube_desconhecido" || !m.newAlias || !m.standingsInput || !m.bibKey) continue;
    const key = confirmedKey(m.enrollmentId, m.bibKey, await sha256Hex(m.standingsInput));
    if (confirmedKeys?.has(key)) out.add(m.newAlias);
  }
  return [...out];
}

/** Os hashes das linhas encontradas (o job chama-a entre matchRoundLines e
 *  roundWrites). */
export async function outcomeHashes(
  outcome: MatchOutcome,
): Promise<Map<string, { matchHash: string; standingsKey: string; altKey: string | null }>> {
  const map = new Map<string, { matchHash: string; standingsKey: string; altKey: string | null }>();
  for (const m of outcome?.byEnrollment || []) {
    if (m.outcome !== "linha" || !m.identityInput || !m.standingsInput) continue;
    map.set(m.enrollmentId, {
      matchHash: await sha256Hex(m.identityInput),
      standingsKey: await sha256Hex(m.standingsInput),
      altKey: m.standingsAltInput ? await sha256Hex(m.standingsAltInput) : null,
    });
  }
  return map;
}

/** Uma linha existente de cup_results (as colunas que a decisão lê). */
export interface ExistingResult {
  enrollment_id: string;
  round_id?: string | null;
  match_status: string;
  bib_key: string | null;
  match_hash: string | null;
  standings_key?: string | null;
  standings_alt_key?: string | null;
  points_source?: string | null;
  position?: number | string | null;
  category_code?: string | null;
  category_position?: number | string | null;
  official_time_s?: number | string | null;
  points?: number | string | null;
}

export interface ResultRow extends ResultData {
  enrollment_id: string;
  user_id: string;
  round_id: string;
  match_status: "proposta" | "confirmada" | "perdida";
  bib_key: string | null;
  match_hash: string | null;
  standings_key: string | null;
  standings_alt_key?: string | null;
}

export type ResultWrite =
  | { op: "insert"; row: ResultRow }
  | { op: "update"; enrollment_id: string; round_id: string; set: Partial<ResultRow> }
  | { op: "delete"; enrollment_id: string; round_id: string };

const NO_DATA: ResultData = {
  position: null, category_code: null, category_position: null, official_time_s: null, points: null, points_source: null,
};

function same(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return a === b;
}

function hasData(e: ExistingResult): boolean {
  return e.position != null || e.official_time_s != null;
}

/** Só os campos que mudaram (nada → null: não se escreve). */
function diff(e: ExistingResult, want: Partial<ResultRow>): Partial<ResultRow> | null {
  const set: Partial<ResultRow> = {};
  let n = 0;
  for (const [k, v] of Object.entries(want) as [keyof ResultRow, unknown][]) {
    if (!same((e as unknown as Record<string, unknown>)[k], v)) {
      (set as Record<string, unknown>)[k] = v;
      n += 1;
    }
  }
  return n ? set : null;
}

/** O que se escreve em cup_results numa jornada (tabela de B.4), só o que
 *  MUDOU (duas voltas sobre o mesmo conteúdo → zero escritas):
 *
 *  | existente \ agora            | linha (hash H)                          | sem linha                 |
 *  | nada                         | insert: confirmada se ele já confirmou  | nada                      |
 *  |                              | esta linha (confirmedKey), senão        |                           |
 *  |                              | proposta                                |                           |
 *  | proposta/perdida, outro K    | substitui (como o insert)               | apaga                     |
 *  | proposta, mesmo K            | dados; passa a confirmada se entretanto | apaga                     |
 *  |                              | confirmou esta linha noutra jornada     |                           |
 *  | perdida, mesmo K             | dados (volta a confirmada se é a mesma  | dados a null              |
 *  |                              | linha que ele tinha confirmado)         |                           |
 *  | confirmada, mesmo K, = H     | só lugar/tempo/pontos (sem perguntar)   | perdida, dados a null     |
 *  | confirmada, mesmo K, ≠ H     | perdida com os dados novos              | perdida, dados a null     |
 *  | confirmada, outro K          | fica (confirmou-a com o dorsal antigo)  | fica                      |
 *
 *  "Ele já confirmou esta linha" = o mesmo dorsal E a mesma standings_key
 *  (nome como o site o escreve, escalão, clube) de uma confirmada dele: o
 *  dorsal sozinho não chega (dorsais trocados entre colegas).
 *
 *  Dorsal repetido (entre inscrições ou na página): nenhuma liga, mas as
 *  confirmadas ficam como estavam — outra inscrição com o mesmo dorsal (por
 *  engano ou de propósito) não apaga o que ele já confirmou; as não
 *  confirmadas saem (ou ficam sem dados). 'recusado' ("não sou eu"): apaga
 *  as não confirmadas com a chave recusada (uma proposta que o job gravou
 *  na mesma volta em que ele recusou) e não toca nas confirmadas. Os pontos
 *  'oficial' (da geral) ficam enquanto a linha confirmada não muda de
 *  identidade. Uma página que não passou nas invariantes (outcome.ok false)
 *  → nenhuma escrita. */
export function roundWrites(outcome: MatchOutcome, existing: ExistingResult[], hashes: LineHashes): ResultWrite[] {
  const writes: ResultWrite[] = [];
  if (!outcome?.ok) return writes;
  const roundId = outcome.roundId;
  const byEnr = new Map<string, ExistingResult>();
  for (const e of existing || []) {
    if (e && (e.round_id == null || e.round_id === roundId)) byEnr.set(e.enrollment_id, e);
  }
  for (const m of outcome.byEnrollment) {
    const e = byEnr.get(m.enrollmentId);
    if (e && e.match_status !== "proposta" && e.match_status !== "perdida" && e.match_status !== "confirmada") continue;
    const K = m.bibKey;
    const key = { enrollment_id: m.enrollmentId, round_id: roundId };
    const update = (want: Partial<ResultRow>) => {
      const set = diff(e!, want);
      if (set) writes.push({ op: "update", ...key, set });
    };

    if (m.outcome === "recusado") {
      if (e && e.match_status !== "confirmada" && K != null && e.bib_key === K) writes.push({ op: "delete", ...key });
      continue;
    }
    if ((m.outcome === "repetido_inscricoes" || m.outcome === "repetido_pagina") && e?.match_status === "confirmada") continue;

    if (m.outcome === "linha" && m.line) {
      const h = hashes?.byEnrollment?.get(m.enrollmentId);
      if (!h) continue; // sem hash não se escreve (defensivo)
      const confirmedBefore = K != null && !!hashes.confirmedKeys?.has(confirmedKey(m.enrollmentId, K, h.standingsKey));
      const fresh = { match_hash: h.matchHash, standings_key: h.standingsKey, standings_alt_key: h.altKey ?? null, ...m.line };
      if (!e) {
        writes.push({
          op: "insert",
          row: {
            ...key, user_id: m.userId, match_status: confirmedBefore ? "confirmada" : "proposta", bib_key: K, ...fresh,
          },
        });
      } else if (e.match_status === "confirmada") {
        if (e.bib_key !== K) continue;
        if (e.match_hash === h.matchHash) {
          const keepOfficial = e.points_source === "oficial";
          const { points: _p, points_source: _s, ...rest } = fresh;
          update(keepOfficial ? rest : fresh);
        } else update({ match_status: "perdida", ...fresh });
      } else if (e.bib_key !== K) {
        update({ match_status: confirmedBefore ? "confirmada" : "proposta", bib_key: K, ...fresh });
      } else if (e.match_status === "proposta") {
        update({ match_status: confirmedBefore ? "confirmada" : "proposta", ...fresh });
      } else {
        // perdida, mesmo dorsal: volta a confirmada só se é a MESMA linha que
        // ele confirmou e que tinha desaparecido.
        const restored = e.match_hash === h.matchHash && !hasData(e);
        update({ match_status: restored ? "confirmada" : "perdida", ...fresh });
      }
      continue;
    }

    if (!e) continue;
    if (e.match_status === "confirmada") {
      if (e.bib_key !== K) continue;
      update({ match_status: "perdida", ...NO_DATA });
    } else if (e.bib_key !== K || e.match_status === "proposta") {
      writes.push({ op: "delete", ...key });
    } else {
      update({ ...NO_DATA });
    }
  }
  return writes;
}

/** "Não sou eu" em toda a edição, 1× por volta: as linhas NÃO confirmadas
 *  com a chave recusada, em qualquer jornada (como reject_cup_result). Apanha
 *  a proposta que o job gravou na mesma volta em que ele recusou (as
 *  inscrições leem-se no início da volta), mesmo numa jornada que já não se
 *  volta a ler. `existing` = as cup_results da edição (com round_id). */
export function refusedWrites(
  enrollments: { id: string; refusedKey: string | null }[],
  existing: ExistingResult[],
): ResultWrite[] {
  const refused = new Map<string, string>();
  for (const e of enrollments || []) if (e?.refusedKey) refused.set(e.id, e.refusedKey);
  const writes: ResultWrite[] = [];
  for (const x of existing || []) {
    if (!x?.round_id || x.match_status === "confirmada") continue;
    const k = refused.get(x.enrollment_id);
    if (k && x.bib_key === k) writes.push({ op: "delete", enrollment_id: x.enrollment_id, round_id: x.round_id });
  }
  return writes;
}

// ── Geral, pontos e coletiva (B.5) ────────────────────────────────────────

/** A entrada da chave da geral (sem dorsal): nome como o site o escreve,
 *  escalão e clube. Tirada da linha CONFIRMADA dele numa jornada. */
export function standingsKeyInput(editionId: string, nameNorm: string, categoryCode: string, teamTok: string): string {
  return `${editionId}|${normText(nameNorm)}|${categoryCode}|${teamTok}`;
}

/** A chave ALTERNATIVA da geral: o 1.º e o último nome (normalizados) em vez
 *  do nome inteiro, com o escalão e o clube. Tirada também da linha
 *  CONFIRMADA dele numa jornada. Serve para o nome do meio que a página da
 *  prova e a geral escrevem de maneira diferente (22 das 24 falhas da chave
 *  exata na 33.ª). null sem nome. O ano do perfil confere-se à parte. */
export function standingsAltKeyInput(editionId: string, nameNorm: string, categoryCode: string, teamTok: string): string | null {
  const t = normText(nameNorm).split(" ").filter(Boolean);
  if (!t.length) return null;
  return `${editionId}|alt|${t[0]}|${t[t.length - 1]}|${categoryCode}|${teamTok}`;
}

/** As chaves alternativas (hash, ou null) de todas as linhas da geral, pela
 *  ordem de check.rows. Em memória, como standingsRowKeys. */
export async function standingsRowAltKeys(
  editionId: string,
  check: StandingsCheck,
  teams: TeamLike[],
  aliases: AliasLike[],
): Promise<(string | null)[]> {
  const out: (string | null)[] = [];
  for (const r of check?.rows || []) {
    const input = standingsAltKeyInput(editionId, r.nameNorm, r.categoryCode, standingsTeamToken(r.teamNorm, teams, aliases));
    out.push(input ? await sha256Hex(input) : null);
  }
  return out;
}

/** As chaves (hash) de todas as linhas da geral, pela mesma ordem de
 *  check.rows. Em memória: comparam-se com a chave dele e esquecem-se. */
export async function standingsRowKeys(
  editionId: string,
  check: StandingsCheck,
  teams: TeamLike[],
  aliases: AliasLike[],
): Promise<string[]> {
  const out: string[] = [];
  for (const r of check?.rows || []) {
    out.push(await sha256Hex(standingsKeyInput(editionId, r.nameNorm, r.categoryCode, standingsTeamToken(r.teamNorm, teams, aliases))));
  }
  return out;
}

/** As colunas Pk que já saíram: alguma linha da geral com Pk > 0. A legenda
 *  pode listar a jornada k antes de o organizador preencher a coluna — até
 *  lá, a coluna vazia não diz nada (não são zeros). */
export function publishedPointColumns(rows: CanonStandingRow[]): Set<number> {
  const out = new Set<number>();
  for (const r of rows || []) {
    r.points.forEach((p, i) => {
      if (typeof p === "number" && p > 0) out.add(i + 1);
    });
  }
  return out;
}

/** Os pontos oficiais de uma linha da geral por jornada: Pk → round_id pela
 *  legenda, só nas colunas que já saíram (publishedPointColumns) e só com
 *  a célula preenchida. Uma célula vazia não vira 0 'oficial': ficam os
 *  calculados (provisórios) até a geral dizer um número. Os k sem jornada
 *  ficam de fora. */
export function officialPointsByRound(
  row: CanonStandingRow,
  legendMap: Map<number, string | null>,
  published: Set<number>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, roundId] of legendMap || []) {
    if (!roundId || k < 1 || k > row.points.length || !published?.has(k)) continue;
    const p = row.points[k - 1];
    if (typeof p === "number" && Number.isFinite(p)) out.set(roundId, p);
  }
  return out;
}

export interface LinkEnrollment {
  id: string;
  userId: string;
  /** A standings_key da linha confirmada mais recente dele (null = ainda não há). */
  standingsKey: string | null;
  /** O ano de profiles.birth_date. */
  birthYear: number | null;
  /** A standings_alt_key dessa MESMA linha confirmada (null = sem ela). */
  altKey?: string | null;
  /** As chaves alternativas que ele recusou ("não sou eu" na geral:
   *  cup_enrollments.standings_refused_keys) — nunca mais se propõem. */
  refusedAltKeys?: string[] | null;
  /** A key_hash da linha dele em cup_standings, se CONFIRMADA (a exata, ou
   *  uma alternativa que ele já confirmou). */
  confirmedKey?: string | null;
}

export interface LinkInput {
  check: StandingsCheck;
  /** standingsRowKeys(…), alinhadas com check.rows. */
  rowKeys: string[];
  /** standingsRowAltKeys(…), alinhadas com check.rows (sem elas, não há
   *  alternativa). */
  rowAltKeys?: (string | null)[];
  enrollments: LinkEnrollment[];
}

/** ligada = pela chave exata; alternativa = pela alternativa, que ele já
 *  confirmou; proposta = pela alternativa, por confirmar ("És tu?" da
 *  geral); recusada = a alternativa que ele recusou. */
export type LinkKind = "ligada" | "alternativa" | "proposta" | "recusada" | "sem_chave" | "sem_linha" | "repetida" | "ano";
export const LINK_KINDS: readonly LinkKind[] = [
  "ligada", "alternativa", "proposta", "recusada", "sem_chave", "sem_linha", "repetida", "ano",
];

export interface StandingData {
  category_code: string;
  category_rank: number;
  total_points: number;
  rounds_scored: number;
}

export interface EnrollmentLink {
  enrollmentId: string;
  userId: string;
  outcome: LinkKind;
  /** A chave com que se ligou (ou tentou): a exata, ou a alternativa. */
  keyHash: string | null;
  /** Por que chave: 'alternativa' só quando a exata não achou nenhuma linha. */
  via?: "exata" | "alternativa";
  /** Com 'ligada', 'alternativa' e 'proposta'. */
  standing?: StandingData;
  /** Idem: round_id → pontos oficiais (officialPointsByRound). Só se
   *  gravam com a ligação confirmada (ligada/alternativa). */
  pointsByRound?: Record<string, number>;
}

export interface LinkOutcome { ok: boolean; byEnrollment: EnrollmentLink[]; counts: Record<LinkKind, number> }

/** A linha dele na geral: exatamente 1 linha com a chave E com o ano de
 *  nascimento dele → liga; nenhuma com a chave → mantém o que havia
 *  (desatualizado); com a chave mas ano diferente, ou ≥ 2 → não liga e
 *  apaga (repetidos não ligam; nunca dados de outro).
 *
 *  A CHAVE ALTERNATIVA (1.º e último nome, escalão, clube, e o ano) só se
 *  tenta quando a exata não acha NENHUMA linha — com 2 ou mais (homónimos)
 *  não liga, como sempre. Só vale com exatamente 1 linha com ela e o ano na
 *  página inteira; nunca fica confirmada sozinha: 'proposta' (o "És tu?" da
 *  geral) até ele dizer que sim ('alternativa' = a que ele já confirmou);
 *  uma recusada nunca volta ('recusada'). */
export function linkStandings(input: LinkInput): LinkOutcome {
  const counts = emptyCounts(LINK_KINDS);
  const out: LinkOutcome = { ok: false, byEnrollment: [], counts };
  if (!input?.check?.ok) return out;
  out.ok = true;
  const rows = input.check.rows;
  const keys = input.rowKeys || [];
  const altKeys = input.rowAltKeys || [];
  const published = publishedPointColumns(rows);
  const fill = (l: EnrollmentLink, r: CanonStandingRow) => {
    l.standing = {
      category_code: r.categoryCode,
      category_rank: r.pos,
      total_points: r.total,
      rounds_scored: r.points.filter((p) => (p ?? 0) > 0).length,
    };
    l.pointsByRound = Object.fromEntries(officialPointsByRound(r, input.check.legendMap, published));
  };
  const ofYear = (e: LinkEnrollment) => (r: CanonStandingRow) => e.birthYear != null && r.year === e.birthYear;
  for (const e of input.enrollments || []) {
    const l: EnrollmentLink = { enrollmentId: e.id, userId: e.userId, outcome: "sem_chave", keyHash: e.standingsKey ?? null };
    if (e.standingsKey) {
      l.via = "exata";
      const withKey = rows.filter((_, i) => keys[i] === e.standingsKey);
      const mine = withKey.filter(ofYear(e));
      if (!withKey.length) {
        l.outcome = "sem_linha";
        const alt = e.altKey ?? null;
        if (alt) {
          const altWith = rows.filter((_, i) => altKeys[i] === alt);
          const altMine = altWith.filter(ofYear(e));
          if (altWith.length) {
            l.via = "alternativa";
            l.keyHash = alt;
            if ((e.refusedAltKeys || []).includes(alt)) l.outcome = "recusada";
            else if (altMine.length === 1) {
              l.outcome = e.confirmedKey === alt ? "alternativa" : "proposta";
              fill(l, altMine[0]);
            } else l.outcome = altMine.length >= 2 ? "repetida" : "ano";
          }
        }
      } else if (mine.length === 1) {
        l.outcome = "ligada";
        fill(l, mine[0]);
      } else l.outcome = mine.length >= 2 ? "repetida" : "ano";
    }
    counts[l.outcome] += 1;
    out.byEnrollment.push(l);
  }
  return out;
}

/** Os pontos oficiais nas linhas CONFIRMADAS dele (points_source
 *  'oficial'), só onde mudam. `existing` = as cup_results da edição (com
 *  round_id). */
export function officialPointsWrites(link: LinkOutcome, existing: ExistingResult[]): ResultWrite[] {
  const writes: ResultWrite[] = [];
  if (!link?.ok) return writes;
  for (const l of link.byEnrollment) {
    // Só com a ligação confirmada: uma 'proposta' (a alternativa por
    // confirmar) não troca os provisórios pelos oficiais.
    if ((l.outcome !== "ligada" && l.outcome !== "alternativa") || !l.pointsByRound) continue;
    for (const [roundId, pts] of Object.entries(l.pointsByRound)) {
      const e = (existing || []).find((x) => x.enrollment_id === l.enrollmentId && x.round_id === roundId);
      if (!e || e.match_status !== "confirmada") continue;
      const set = diff(e, { points: pts, points_source: "oficial" });
      if (set) writes.push({ op: "update", enrollment_id: l.enrollmentId, round_id: roundId, set });
    }
  }
  return writes;
}

export interface ExistingStanding {
  enrollment_id: string;
  category_code?: string | null;
  category_rank?: number | string | null;
  total_points?: number | string | null;
  rounds_scored?: number | string | null;
  key_hash?: string | null;
  /** 'confirmada' (a exata, ou a alternativa que ele confirmou) | 'proposta'. */
  match_status?: string | null;
  source_checked_at?: string | null;
}

export interface StandingRow extends StandingData {
  enrollment_id: string;
  user_id: string;
  edition_id: string;
  key_hash: string | null;
  match_status: "confirmada" | "proposta";
  source_checked_at: string;
}

export type StandingWrite =
  | { op: "insert"; row: StandingRow }
  | { op: "update"; enrollment_id: string; set: Partial<StandingRow> }
  | { op: "delete"; enrollment_id: string };

/** O que se escreve em cup_standings: ligada/alternativa → a linha dele,
 *  confirmada; proposta → a linha, 'proposta' (só se mudou, ou para
 *  refrescar a data da leitura uma vez por `refreshAfterH`); repetida/ano →
 *  apaga (pela alternativa, só a que veio dela); recusada → apaga a linha
 *  dessa chave; sem linha/sem chave → fica como estava. */
export function standingsWrites(
  link: LinkOutcome,
  existing: ExistingStanding[],
  editionId: string,
  now: Date,
  refreshAfterH: number = CUP_SYNC_TIMING.dailyEveryH,
): StandingWrite[] {
  const writes: StandingWrite[] = [];
  if (!link?.ok) return writes;
  const nowIso = now.toISOString();
  for (const l of link.byEnrollment) {
    const e = (existing || []).find((x) => x.enrollment_id === l.enrollmentId);
    if ((l.outcome === "ligada" || l.outcome === "alternativa" || l.outcome === "proposta") && l.standing) {
      const want = { ...l.standing, key_hash: l.keyHash, match_status: l.outcome === "proposta" ? "proposta" as const : "confirmada" as const };
      if (!e) {
        writes.push({
          op: "insert",
          row: { enrollment_id: l.enrollmentId, user_id: l.userId, edition_id: editionId, ...want, source_checked_at: nowIso },
        });
        continue;
      }
      const set: Partial<StandingRow> = {};
      let n = 0;
      for (const [k, v] of Object.entries(want)) {
        if (!same((e as unknown as Record<string, unknown>)[k], v)) {
          (set as Record<string, unknown>)[k] = v;
          n += 1;
        }
      }
      const last = e.source_checked_at ? Date.parse(e.source_checked_at) : NaN;
      if (n || !Number.isFinite(last) || now.getTime() - last >= refreshAfterH * H) {
        writes.push({ op: "update", enrollment_id: l.enrollmentId, set: { ...set, source_checked_at: nowIso } });
      }
    } else if ((l.outcome === "repetida" || l.outcome === "ano") && e && (l.via !== "alternativa" || e.key_hash === l.keyHash)) {
      writes.push({ op: "delete", enrollment_id: l.enrollmentId });
    } else if (l.outcome === "recusada" && e && e.key_hash === l.keyHash) {
      writes.push({ op: "delete", enrollment_id: l.enrollmentId });
    }
  }
  return writes;
}

export interface TeamRules {
  team_scoring?: string | null;
  team_min_athletes?: number | null;
  team_counting_n?: number | null;
  /** Para o desempate (mais 1.ºs lugares, 2.ºs, … — reg. 5.5/5.6). */
  pointsTable?: number[] | null;
}

export interface TeamTotal { teamId: string; points: number; athletes: number; position: number }

/** Um resolvedor de clubes para a coletiva: só clubes (kind 'clube'); o
 *  Individual e os desconhecidos ficam de fora. */
export function makeTeamResolver(teams: TeamLike[], aliases: AliasLike[]): (teamNorm: string) => string | null {
  const kind = new Map((teams || []).map((t) => [t.id, t.kind ?? "clube"]));
  return (teamNorm: string) => {
    const id = resolveTeamId(teamNorm, teams, aliases);
    return id && kind.get(id) === "clube" ? id : null;
  };
}

/** A coletiva de uma jornada (k), calculada sobre a geral oficial: por
 *  clube, atletas com Pk > 0 e a soma (ou os N melhores com 'melhores_n').
 *  Só os elegíveis (≥ team_min_athletes), com o lugar entre eles; empate
 *  desfeito por mais Pk = tabela[0], depois tabela[1], … (aproximação do
 *  5.6 do regulamento); ainda empatados → o mesmo lugar. */
export function teamTotals(
  rows: CanonStandingRow[],
  k: number,
  rules: TeamRules,
  resolveTeam: (teamNorm: string) => string | null,
): TeamTotal[] {
  const byTeam = new Map<string, number[]>();
  for (const r of rows || []) {
    const p = r.points[k - 1];
    if (!(typeof p === "number" && p > 0)) continue;
    const id = resolveTeam(r.teamNorm);
    if (!id) continue;
    if (!byTeam.has(id)) byTeam.set(id, []);
    byTeam.get(id)!.push(p);
  }
  const min = Number(rules?.team_min_athletes) > 0 ? Number(rules.team_min_athletes) : 1;
  const bestN = rules?.team_scoring === "melhores_n" && Number(rules?.team_counting_n) > 0 ? Number(rules.team_counting_n) : null;
  const levels = [...new Set((rules?.pointsTable || []).filter((x) => typeof x === "number" && x > 0))].sort((a, b) => b - a);
  const list = [...byTeam].map(([teamId, ps]) => {
    const sorted = [...ps].sort((a, b) => b - a);
    const counted = bestN ? sorted.slice(0, bestN) : sorted;
    return {
      teamId,
      points: counted.reduce((a, b) => a + b, 0),
      athletes: ps.length,
      tie: levels.map((v) => counted.filter((x) => x === v).length),
    };
  }).filter((t) => t.athletes >= min);
  const cmpTie = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i];
    return 0;
  };
  list.sort((a, b) => b.points - a.points || cmpTie(a.tie, b.tie) || a.teamId.localeCompare(b.teamId));
  const out: TeamTotal[] = [];
  list.forEach((t, i) => {
    const prev = list[i - 1];
    const position = i > 0 && prev.points === t.points && cmpTie(prev.tie, t.tie) === 0 ? out[i - 1].position : i + 1;
    out.push({ teamId: t.teamId, points: t.points, athletes: t.athletes, position });
  });
  return out;
}

export interface ExistingTeamResult {
  round_id: string;
  team_id: string | null;
  team_name: string;
  position?: number | string | null;
  points?: number | string | null;
  athletes_count?: number | string | null;
  points_source?: string | null;
}

export interface TeamResultRow {
  round_id: string;
  team_id: string;
  team_name: string;
  position: number;
  points: number;
  athletes_count: number;
  points_source: "calculado";
}

export type TeamResultWrite =
  | { op: "insert"; row: TeamResultRow }
  | { op: "update"; round_id: string; team_name: string; set: Partial<TeamResultRow> }
  | { op: "delete"; round_id: string; team_name: string };

/** O que se escreve em cup_team_results numa jornada: SÓ os clubes com
 *  alguma inscrição ativa (os outros vivem em memória), com o nome do
 *  catálogo; um clube que deixou de ser elegível perde a linha (só as que o
 *  job escreveu — 'calculado'). */
export function teamResultWrites(
  totals: TeamTotal[],
  existing: ExistingTeamResult[],
  roundId: string,
  teams: TeamLike[],
  teamsWithEnrollment: Set<string>,
): TeamResultWrite[] {
  const writes: TeamResultWrite[] = [];
  const mine = (existing || []).filter((e) => e && e.round_id === roundId);
  const keep = new Set<string>();
  for (const t of totals || []) {
    if (!teamsWithEnrollment.has(t.teamId)) continue;
    const team = (teams || []).find((x) => x.id === t.teamId);
    if (!team) continue;
    keep.add(team.name);
    const row: TeamResultRow = {
      round_id: roundId, team_id: t.teamId, team_name: team.name, position: t.position, points: t.points,
      athletes_count: t.athletes, points_source: "calculado",
    };
    const e = mine.find((x) => x.team_name === team.name);
    if (!e) {
      writes.push({ op: "insert", row });
      continue;
    }
    const set: Partial<TeamResultRow> = {};
    let n = 0;
    for (const [k, v] of Object.entries(row)) {
      if (k === "round_id" || k === "team_name") continue;
      if (!same((e as unknown as Record<string, unknown>)[k], v)) {
        (set as Record<string, unknown>)[k] = v;
        n += 1;
      }
    }
    if (n) writes.push({ op: "update", round_id: roundId, team_name: team.name, set });
  }
  for (const e of mine) {
    if (e.points_source === "calculado" && !keep.has(e.team_name)) {
      writes.push({ op: "delete", round_id: roundId, team_name: e.team_name });
    }
  }
  return writes;
}

// ── Relatórios agregados (observar, correr, ensaio) ───────────────────────
// Nunca nomes, dorsais ou clubes — nem de organizações: só contagens.

/** Bandas em vez de contagens exatas pequenas — gémea de cup_band. */
export function band(n: number): "0" | "1–19" | "20+" {
  const v = Number(n) || 0;
  return v <= 0 ? "0" : v < 20 ? "1–19" : "20+";
}

function stateOf(c: Check): "ok" | "regressao" | "invariante" {
  return c.ok ? "ok" : c.failures.includes("regressao") ? "regressao" : "invariante";
}

export function roundSummary(check: RoundCheck): Record<string, unknown> {
  const s = check.stats;
  return {
    estado: stateOf(check),
    falhas: [...check.failures],
    avisos: [...check.warnings],
    data: s.date,
    tabelas: s.tables.map((t) => ({ distancia_m: t.distanceM, genero: t.gender, linhas: t.rows })),
    linhas: s.rowsTotal,
    por_escalao: { ...s.byCategory },
    dorsais_repetidos: s.bibDupPage,
    marcas_ilegiveis: s.timeFailures,
  };
}

export function standingsSummary(check: StandingsCheck, extra: { unmappedTeams: number }): Record<string, unknown> {
  const s = check.stats;
  return {
    estado: stateOf(check),
    falhas: [...check.failures],
    avisos: [...check.warnings],
    tabelas: s.tables,
    linhas: s.rowsTotal,
    colunas_p: s.pCount,
    total_igual_soma: s.totalOk,
    ranking_ok: s.rankingOk,
    legenda: s.legend.map((l) => ({ k: l.k, dia_mes: l.dayMonth, jornada: l.roundNo })),
    equipas_por_ligar: Number(extra?.unmappedTeams) || 0,
  };
}

export interface CrossCategory {
  escalao: string;
  na_pagina: number;
  com_pontos: number;
  soma_oficial: number;
  esperado_todos: number;
  esperado_so_com_pontos: number;
}

export interface CrossReport {
  k: number;
  /** false = uma das páginas não passou nas invariantes (sem números). */
  disponivel: boolean;
  por_escalao: CrossCategory[];
  escaloes: number;
  escaloes_que_batem_so_com_pontos: number;
  escaloes_que_batem_todos: number;
  base_provavel: "escalao" | "indeterminada";
  /** false = os de fora não ocupam lugar; null = não dá para distinguir. */
  fora_ocupam_lugar: boolean | null;
  /** Das linhas da geral com Pk > 0: com par único (nome, escalão) na
   *  página; e a ligação simulada — quantas ligam pela chave exata, quantas
   *  pela alternativa (por confirmar, na app) e quantas não ligam. */
  chave_da_geral: {
    linhas_com_pontos: number;
    com_par_unico_na_pagina: number;
    ligam_exata: number;
    ligam_alternativa: number;
    nao_ligam: number;
  };
  coletiva: { equipas_elegiveis: number; top3_pontos: number[] };
}

/** O cruzamento de uma prova (página) com a coluna Pk da geral, SÓ em
 *  agregado — valida o adaptador contra os totais oficiais e responde à base
 *  dos pontos e a "os de fora ocupam lugar?" sem mostrar ninguém:
 *  - por escalão, Σ Pk oficial contra a tabela aplicada a todos os da
 *    página e só aos m com pontos;
 *  - chave da geral: das linhas com Pk > 0, quantas têm exatamente um par
 *    (nome como o site o escreve, escalão) na página; e, simulando que cada
 *    uma é de um inscrito (a linha dele na página, o clube e o ano da
 *    própria linha da geral), quantas ligam pela chave exata, quantas pela
 *    alternativa (só quando a exata não acha nenhuma linha) e quantas não;
 *  - coletiva: equipas elegíveis e os 3 maiores totais (a Equipa da geral
 *    como clube; o Individual fora). */
export function crossCheck(
  round: RoundCheck,
  standings: StandingsCheck,
  k: number,
  pointsTable: number[],
  teamRules: TeamRules = {},
): CrossReport {
  const report: CrossReport = {
    k, disponivel: false, por_escalao: [], escaloes: 0, escaloes_que_batem_so_com_pontos: 0,
    escaloes_que_batem_todos: 0, base_provavel: "indeterminada", fora_ocupam_lugar: null,
    chave_da_geral: { linhas_com_pontos: 0, com_par_unico_na_pagina: 0, ligam_exata: 0, ligam_alternativa: 0, nao_ligam: 0 },
    coletiva: { equipas_elegiveis: 0, top3_pontos: [] },
  };
  if (!round?.ok || !standings?.ok || !Array.isArray(pointsTable) || !pointsTable.length) return report;
  report.disponivel = true;
  const T = (i: number) => pointsTable[Math.min(i, pointsTable.length) - 1];
  const sumT = (n: number) => {
    let s = 0;
    for (let i = 1; i <= n; i++) s += T(i);
    return s;
  };
  const pk = (r: CanonStandingRow) => r.points[k - 1] ?? 0;
  const withPoints = standings.rows.filter((r) => pk(r) > 0);
  const codes = new Set<string>();
  for (const [c, n] of Object.entries(round.stats.byCategory)) if (c !== "?" && n > 0) codes.add(c);
  for (const r of withPoints) codes.add(r.categoryCode);
  for (const code of [...codes].sort()) {
    const mine = withPoints.filter((r) => r.categoryCode === code);
    const na = round.stats.byCategory[code] ?? 0;
    report.por_escalao.push({
      escalao: code,
      na_pagina: na,
      com_pontos: mine.length,
      soma_oficial: mine.reduce((a, r) => a + pk(r), 0),
      esperado_todos: sumT(na),
      esperado_so_com_pontos: sumT(mine.length),
    });
  }
  report.escaloes = report.por_escalao.length;
  report.escaloes_que_batem_so_com_pontos = report.por_escalao.filter((c) => c.soma_oficial === c.esperado_so_com_pontos).length;
  report.escaloes_que_batem_todos = report.por_escalao.filter((c) => c.soma_oficial === c.esperado_todos).length;
  const best = Math.max(report.escaloes_que_batem_so_com_pontos, report.escaloes_que_batem_todos);
  report.base_provavel = report.escaloes > 0 && best >= 0.9 * report.escaloes ? "escalao" : "indeterminada";
  report.fora_ocupam_lugar = report.escaloes_que_batem_so_com_pontos > report.escaloes_que_batem_todos
    ? false
    : report.escaloes_que_batem_todos > report.escaloes_que_batem_so_com_pontos
    ? true
    : null;

  const pairs = new Map<string, number>();
  for (const r of round.rows) {
    const key = `${r.nameNorm}|${r.categoryCode}`;
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }
  // A ligação simulada (só contagens; os nomes ficam nestes mapas locais).
  const ends = (n: string) => {
    const t = normText(n).split(" ").filter(Boolean);
    return t.length ? `${t[0]}|${t[t.length - 1]}` : "";
  };
  const countBy = <T>(xs: T[], key: (x: T) => string) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
    return m;
  };
  const geralExact = countBy(standings.rows, (r) => `${r.nameNorm}|${r.categoryCode}|${r.teamNorm}|${r.year}`);
  const geralExactAnyYear = countBy(standings.rows, (r) => `${r.nameNorm}|${r.categoryCode}|${r.teamNorm}`);
  const geralAlt = countBy(standings.rows, (r) => `${ends(r.nameNorm)}|${r.categoryCode}|${r.teamNorm}|${r.year}`);
  let exata = 0, alternativa = 0, nao = 0;
  for (const r of withPoints) {
    const onPage = pairs.get(`${r.nameNorm}|${r.categoryCode}`) ?? 0;
    if (onPage >= 1) {
      // A exata acha linha(s) na geral: a alternativa não se tenta.
      if (onPage === 1 && geralExact.get(`${r.nameNorm}|${r.categoryCode}|${r.teamNorm}|${r.year}`) === 1) exata += 1;
      else nao += 1;
      continue;
    }
    const e = ends(r.nameNorm);
    const lines = e ? round.rows.filter((x) => x.categoryCode === r.categoryCode && ends(x.nameNorm) === e) : [];
    if (lines.length !== 1 || (geralExactAnyYear.get(`${lines[0].nameNorm}|${r.categoryCode}|${r.teamNorm}`) ?? 0) > 0) {
      nao += 1;
      continue;
    }
    if (geralAlt.get(`${e}|${r.categoryCode}|${r.teamNorm}|${r.year}`) === 1) alternativa += 1;
    else nao += 1;
  }
  report.chave_da_geral = {
    linhas_com_pontos: withPoints.length,
    com_par_unico_na_pagina: withPoints.filter((r) => pairs.get(`${r.nameNorm}|${r.categoryCode}`) === 1).length,
    ligam_exata: exata,
    ligam_alternativa: alternativa,
    nao_ligam: nao,
  };

  const totals = teamTotals(
    standings.rows,
    k,
    { team_scoring: "soma_todos", team_min_athletes: 4, ...teamRules, pointsTable },
    (t) => (t && t !== "individual" ? `n:${t}` : null),
  );
  report.coletiva = { equipas_elegiveis: totals.length, top3_pontos: totals.slice(0, 3).map((t) => t.points) };
  return report;
}
