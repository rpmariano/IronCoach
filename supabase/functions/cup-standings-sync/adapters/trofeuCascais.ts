// Adaptador `trofeu_cascais` — o ÚNICO ficheiro que conhece o site do
// Troféu de Atletismo de Cascais (specs/trofeu.md §7; fase 4, A).
// 2026-09-27.
//
// O SITE (ASP.NET WebForms, lido a 2026-09-27 só para ver a estrutura):
//   · /Resultados/{id} — uma prova. Fora das tabelas: "RESULTADOS", o nome da
//     prova, "CLASSIFICAÇÃO" e a data (dd-mm-aaaa) num botão. Um acordeão com
//     um <h5>"6200 metros - Series"</h5> por distância (vale para as tabelas
//     seguintes até ao próximo) e, antes de cada tabela, "1ª Série M
//     (Masculino)". Cada <table> tem <th scope="col"> Pos, Dorsal, Nome,
//     Clube, Escalão, Nac, Marca. O clube tem uma <img> com o nome no
//     atributo e a sigla num <span>; só o texto conta.
//   · /Trofeu/{id} — a classificação geral: título "33º TROFÉU … 2025/2026 -
//     Classificação"; um <h5>"M40 (Masculino)"</h5> antes de cada tabela;
//     colunas Pos, Nome, Ano, Equipa, P1..PN, Total (sem dorsal); no fim a
//     legenda "P1: CORRIDA DA PADROEIRA (08-12), P2: … (11-01), …".
//   · A coletiva só existe por postback — o job nunca faz postbacks.
// Só GET, um pedido por página, ≥ 1,5 s entre pedidos, robots.txt
// respeitado, User-Agent identificado, timeout e limite de tamanho.
//
// PRIVACIDADE. O HTML vive só dentro de fetchTrofeuPage → parse* → validação
// (em @formulas/cupResults.ts), numa variável local de quem chama. Este
// ficheiro não escreve na consola, não guarda nada e as falhas são só
// códigos — nunca o conteúdo de uma célula nem o HTML (teste de fuga em
// sync.test.ts).

import {
  CUP_ADAPTER_URLS,
  type SourceLegendEntry,
  type SourceResultRow,
  type SourceResultTable,
  type SourceRoundPage,
  type SourceStandingRow,
  type SourceStandingsPage,
  type SourceStandingTable,
} from "../../_shared/formulas/cupResults.ts";

export const TROFEU_ADAPTER = "trofeu_cascais";

const ORIGIN = "https://trofeuatletismocascais.pt";
export const TROFEU_ROBOTS_URL = `${ORIGIN}/robots.txt`;

/** O User-Agent por omissão (CUP_SYNC_USER_AGENT substitui-o). Diz quem lê
 *  e para quê; sem e-mail pessoal no código. */
export const TROFEU_USER_AGENT =
  "IronCoach-classificacao/1.0 (app IronCoach; lê a classificação do Troféu para os atletas inscritos na app)";

/** O token com que o robots.txt nos pode nomear ("User-agent: …"). */
const UA_TOKEN = "ironcoach-classificacao";

export const TROFEU_LIMITS = Object.freeze({
  timeoutMs: 20_000,
  /** As páginas reais têm 0,66–0,82 MB. */
  maxBytes: 3 * 1024 * 1024,
  robotsMaxBytes: 256 * 1024,
  minGapMs: 1_500,
  /** Volta do cron: máx. 6 páginas e 90 s. */
  cronPages: 6,
  cronBudgetMs: 90_000,
  /** Pedido do admin (Ler agora, ensaio): 12 jornadas + a geral, e a
   *  resposta antes dos 90 s do cliente. */
  adminPages: 13,
  adminBudgetMs: 70_000,
});

/** Os códigos de escalão que os rótulos do site dão (officialCategoryCode)
 *  — os 32 do seed da M2. O ensaio (sem edição na BD) usa-os. */
export const TROFEU_CATEGORY_CODES: readonly string[] = Object.freeze([
  "SUB12M", "SUB12F", "SUB14M", "SUB14F", "SUB16M", "SUB16F", "SUB18M", "SUB18F",
  "SUB20M", "SUB20F", "SUB23M", "SUB23F", "SENM", "SENF",
  "M35", "F35", "M40", "F40", "M45", "F45", "M50", "F50", "M55", "F55",
  "M60", "F60", "M65", "F65", "M70", "F70", "M75", "M80",
]);

/** A tabela de pontos do regulamento geral (15-13-11-10-9-8-7-6-5-4,
 *  11.º–20.º 3, 21.º–30.º 2, 31.º+ 1): a do ensaio quando o admin não manda
 *  outra. */
export const TROFEU_POINTS_TABLE: readonly number[] = Object.freeze([
  15, 13, 11, 10, 9, 8, 7, 6, 5, 4,
  3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  1,
]);

// ── Links ─────────────────────────────────────────────────────────────────

/** 'jornada' (/Resultados/{id}), 'geral' (/Trofeu/{id}) ou null. Os
 *  formatos vivem em CUP_ADAPTER_URLS (o backoffice valida com os mesmos). */
export function trofeuUrlKind(url: unknown): "jornada" | "geral" | null {
  const rule = CUP_ADAPTER_URLS[TROFEU_ADAPTER];
  const v = typeof url === "string" ? url.trim() : "";
  if (!v || !rule) return null;
  if (rule.jornada.test(v)) return "jornada";
  if (rule.geral.test(v)) return "geral";
  return null;
}

/** O link na forma em que se pede (sem www, sem barra final): os dois
 *  anfitriões são o mesmo site, e assim há um só robots.txt. */
export function trofeuCanonicalUrl(url: unknown): string | null {
  const rule = CUP_ADAPTER_URLS[TROFEU_ADAPTER];
  const v = typeof url === "string" ? url.trim() : "";
  if (!v || !rule) return null;
  let m = rule.jornada.exec(v);
  if (m) return `${ORIGIN}/Resultados/${Number(m[2])}`;
  m = rule.geral.exec(v);
  if (m) return `${ORIGIN}/Trofeu/${Number(m[2])}`;
  return null;
}

// ── Pedidos ───────────────────────────────────────────────────────────────

export type FetchFailure = "url" | "rede" | "http" | "tipo" | "tamanho" | "robots" | "orcamento";
export interface FetchOk { ok: true; url: string; html: string; bytes: number; ms: number }
export interface FetchKo { ok: false; url: string; code: FetchFailure; status: number | null }
export type RobotsVerdict = "livre" | "proibido" | "erro";

/** As dependências de uma volta (injetáveis nos testes) e o seu estado: o
 *  número de páginas, o início (orçamento) e o último pedido (espaçamento). */
export interface TrofeuHttp {
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  /** Relógio em ms (orçamento e espaçamento). */
  now: () => number;
  userAgent: string;
  maxPages: number;
  budgetMs: number;
  minGapMs: number;
  timeoutMs: number;
  maxBytes: number;
  state: { startedAt: number; pages: number; requests: number; lastAt: number | null; robots: RobotsVerdict | null };
}

export function trofeuHttp(over: Partial<Omit<TrofeuHttp, "state">> = {}): TrofeuHttp {
  const now = over.now ?? (() => Date.now());
  return {
    fetchImpl: over.fetchImpl ?? ((input, init) => fetch(input, init)),
    sleep: over.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    now,
    userAgent: over.userAgent || TROFEU_USER_AGENT,
    maxPages: over.maxPages ?? TROFEU_LIMITS.cronPages,
    budgetMs: over.budgetMs ?? TROFEU_LIMITS.cronBudgetMs,
    minGapMs: over.minGapMs ?? TROFEU_LIMITS.minGapMs,
    timeoutMs: over.timeoutMs ?? TROFEU_LIMITS.timeoutMs,
    maxBytes: over.maxBytes ?? TROFEU_LIMITS.maxBytes,
    state: { startedAt: now(), pages: 0, requests: 0, lastAt: null, robots: null },
  };
}

function overBudget(deps: TrofeuHttp): boolean {
  return deps.now() - deps.state.startedAt >= deps.budgetMs;
}

/** Espera o que faltar para os ≥ minGapMs desde o último pedido. */
async function pace(deps: TrofeuHttp): Promise<void> {
  const last = deps.state.lastAt;
  if (last == null) return;
  const wait = deps.minGapMs - (deps.now() - last);
  if (wait > 0) await deps.sleep(wait);
}

type Got =
  | { ok: true; status: number; contentType: string; body: Uint8Array | null; tooBig: boolean }
  | { ok: false; code: "rede" };

/** Um GET com timeout próprio (limpo no fim: nada fica pendurado), sem
 *  seguir redirecionamentos, e o corpo lido em stream até `limit` bytes. */
async function get(deps: TrofeuHttp, url: string, accept: string, limit: number, readBody: (status: number) => boolean): Promise<Got> {
  await pace(deps);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), deps.timeoutMs);
  deps.state.requests += 1;
  try {
    const res = await deps.fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal: ac.signal,
      headers: { "User-Agent": deps.userAgent, "Accept": accept, "Accept-Language": "pt-PT" },
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (!readBody(res.status)) {
      await res.body?.cancel().catch(() => {});
      return { ok: true, status: res.status, contentType, body: null, tooBig: false };
    }
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > limit) {
      await res.body?.cancel().catch(() => {});
      return { ok: true, status: res.status, contentType, body: null, tooBig: true };
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          await reader.cancel().catch(() => {});
          return { ok: true, status: res.status, contentType, body: null, tooBig: true };
        }
        chunks.push(value);
      }
    }
    const body = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      body.set(c, at);
      at += c.byteLength;
    }
    return { ok: true, status: res.status, contentType, body, tooBig: false };
  } catch {
    // Timeout, rede, DNS, ligação cortada: tudo "rede" (sem pormenores).
    return { ok: false, code: "rede" };
  } finally {
    clearTimeout(timer);
    deps.state.lastAt = deps.now();
  }
}

/** Uma página do site: só os links de CUP_ADAPTER_URLS (outro → 'url', sem
 *  pedido), só GET, no máximo `maxPages` por volta e dentro do orçamento
 *  ('orcamento'), 3xx/4xx/5xx → 'http', sem text/html → 'tipo', acima de
 *  `maxBytes` → 'tamanho', timeout ou rede → 'rede'. */
export async function fetchTrofeuPage(url: string, deps: TrofeuHttp): Promise<FetchOk | FetchKo> {
  const canonical = trofeuCanonicalUrl(url);
  if (!canonical) return { ok: false, url: String(url ?? ""), code: "url", status: null };
  if (deps.state.pages >= deps.maxPages || overBudget(deps)) {
    return { ok: false, url: canonical, code: "orcamento", status: null };
  }
  deps.state.pages += 1;
  const t0 = deps.now();
  const got = await get(deps, canonical, "text/html", deps.maxBytes, (s) => s >= 200 && s < 300);
  if (!got.ok) return { ok: false, url: canonical, code: "rede", status: null };
  if (got.status < 200 || got.status >= 300) return { ok: false, url: canonical, code: "http", status: got.status };
  if (!/text\/html/i.test(got.contentType)) return { ok: false, url: canonical, code: "tipo", status: got.status };
  if (got.tooBig || !got.body) return { ok: false, url: canonical, code: "tamanho", status: got.status };
  const html = new TextDecoder("utf-8").decode(got.body);
  return { ok: true, url: canonical, html, bytes: got.body.byteLength, ms: deps.now() - t0 };
}

// ── robots.txt ────────────────────────────────────────────────────────────

/** Os caminhos que o job lê. */
const ROBOTS_PATHS = ["/Resultados/1", "/Trofeu/1"];

interface RobotsGroup { agents: string[]; rules: { allow: boolean; path: string }[] }

function robotsGroups(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let cur: RobotsGroup | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (!cur || cur.rules.length) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(value.toLowerCase());
    } else if ((field === "disallow" || field === "allow") && cur) {
      cur.rules.push({ allow: field === "allow", path: value });
    }
  }
  return groups;
}

function robotsPatternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = body.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${re}${anchored ? "$" : ""}`).test(path);
}

/** Proibido por um grupo? A regra mais longa que bate ganha (Allow ganha
 *  empates); um Disallow vazio não proíbe nada. */
function groupForbids(g: RobotsGroup, path: string): boolean {
  let best: { allow: boolean; len: number } | null = null;
  for (const r of g.rules) {
    if (!r.path) continue;
    if (!robotsPatternMatches(r.path, path)) continue;
    const len = r.path.length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
  }
  return !!best && !best.allow;
}

/** Se o robots.txt deixa ler as páginas do job. Conservador: basta o grupo
 *  "*" OU o nosso a proibir para a volta parar. 404/410 → livre; outro
 *  estado, rede ou redirecionamento → 'erro' (a volta pára também). Uma
 *  vez por volta (fica no estado da sessão). */
export async function checkRobots(deps: TrofeuHttp): Promise<RobotsVerdict> {
  if (deps.state.robots) return deps.state.robots;
  const got = await get(deps, TROFEU_ROBOTS_URL, "text/plain", TROFEU_LIMITS.robotsMaxBytes, (s) => s === 200);
  let verdict: RobotsVerdict;
  if (!got.ok) verdict = "erro";
  else if (got.status === 404 || got.status === 410) verdict = "livre";
  else if (got.status !== 200 || got.tooBig || !got.body) verdict = "erro";
  else {
    const text = new TextDecoder("utf-8").decode(got.body);
    const applies = robotsGroups(text).filter((g) =>
      g.agents.some((a) => a === "*" || (a.length > 0 && UA_TOKEN.startsWith(a)))
    );
    verdict = applies.some((g) => ROBOTS_PATHS.some((p) => groupForbids(g, p))) ? "proibido" : "livre";
  }
  deps.state.robots = verdict;
  return verdict;
}

// ── HTML → texto (tokenizador próprio, sem DOM nem dependências) ──────────

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", shy: "",
  ordm: "º", ordf: "ª", deg: "°", middot: "·", ndash: "–", mdash: "—", hellip: "…",
  laquo: "«", raquo: "»", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", copy: "©", reg: "®",
  aacute: "á", Aacute: "Á", agrave: "à", Agrave: "À", acirc: "â", Acirc: "Â", atilde: "ã", Atilde: "Ã",
  auml: "ä", Auml: "Ä", ccedil: "ç", Ccedil: "Ç", eacute: "é", Eacute: "É", egrave: "è", Egrave: "È",
  ecirc: "ê", Ecirc: "Ê", euml: "ë", Euml: "Ë", iacute: "í", Iacute: "Í", igrave: "ì", Igrave: "Ì",
  icirc: "î", Icirc: "Î", iuml: "ï", Iuml: "Ï", ntilde: "ñ", Ntilde: "Ñ", oacute: "ó", Oacute: "Ó",
  ograve: "ò", Ograve: "Ò", ocirc: "ô", Ocirc: "Ô", otilde: "õ", Otilde: "Õ", ouml: "ö", Ouml: "Ö",
  uacute: "ú", Uacute: "Ú", ugrave: "ù", Ugrave: "Ù", ucirc: "û", Ucirc: "Û", uuml: "ü", Uuml: "Ü",
};

function codePoint(n: number): string {
  if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return "�";
  if (n === 0xa0) return " ";
  return String.fromCodePoint(n);
}

/** Entidades numéricas (&#231; &#xE7;) e as nomeadas mais comuns; &nbsp; →
 *  espaço. Uma desconhecida fica como está. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|[A-Za-z][A-Za-z0-9]{1,15});/g, (all, ent: string) => {
    if (ent[0] === "#") {
      return codePoint(ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10));
    }
    return Object.prototype.hasOwnProperty.call(NAMED, ent) ? NAMED[ent] : all;
  });
}

function collapse(s: string): string {
  return s.replace(/[\s ]+/g, " ").trim();
}

interface RawTable {
  /** Os textos fora de tabelas entre a tabela anterior (ou o início) e esta. */
  before: string[];
  header: string[] | null;
  rows: string[][];
}

interface Walked { title: string; outside: string[]; tables: RawTable[] }

const RAW_TEXT = new Set(["script", "style", "title", "textarea", "noscript", "template"]);
const TOKEN =
  /<!--[\s\S]*?(?:-->|$)|<![^>]*>?|<\?[^>]*>?|<(\/?)([A-Za-z][A-Za-z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</y;

/** Percorre o HTML uma vez: o <title>, os textos fora de tabelas (pela
 *  ordem) e as tabelas de topo (cabeçalho + linhas de células já em texto).
 *  Tabelas dentro de tabelas contam como texto da célula. Nunca lança. */
function walk(html: string): Walked {
  const src = String(html ?? "");
  const out: Walked = { title: "", outside: [], tables: [] };
  const tm = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(src);
  if (tm) out.title = collapse(decodeEntities(tm[1].replace(/<[^>]*>/g, " ")));

  let before: string[] = [];
  let depth = 0;
  let table: RawTable | null = null;
  let inHead = false;
  let row: { cells: string[]; allTh: boolean } | null = null;
  let cell: string[] | null = null;

  const closeCell = () => {
    if (cell && row) row.cells.push(collapse(cell.join(" ")));
    cell = null;
  };
  const closeRow = () => {
    closeCell();
    if (row && table && row.cells.length) {
      if ((inHead || row.allTh) && table.header == null) table.header = row.cells;
      else if (!row.allTh && row.cells.some((c) => c !== "")) table.rows.push(row.cells);
    }
    row = null;
  };

  TOKEN.lastIndex = 0;
  let i = 0;
  while (i < src.length) {
    TOKEN.lastIndex = i;
    const m = TOKEN.exec(src);
    if (!m) break;
    i = TOKEN.lastIndex;
    const tag = m[2]?.toLowerCase();
    if (tag) {
      const closing = m[1] === "/";
      if (!closing && RAW_TEXT.has(tag)) {
        // O conteúdo de <script>, <style>, <title>… não é texto da página.
        const endRe = new RegExp(`</${tag}\\b`, "ig");
        endRe.lastIndex = i;
        const end = endRe.exec(src);
        i = end ? end.index : src.length;
        continue;
      }
      if (tag === "table") {
        if (!closing) {
          if (depth === 0) {
            table = { before, header: null, rows: [] };
            before = [];
            inHead = false;
          }
          depth += 1;
        } else if (depth > 0) {
          depth -= 1;
          if (depth === 0 && table) {
            closeRow();
            out.tables.push(table);
            table = null;
          }
        }
        continue;
      }
      if (depth !== 1) {
        if (depth > 1 && cell && tag === "br") (cell as string[]).push(" ");
        continue;
      }
      if (tag === "thead") inHead = !closing;
      else if (tag === "tbody" || tag === "tfoot") inHead = false;
      else if (tag === "tr") closeRow();
      else if (tag === "td" || tag === "th") {
        closeCell();
        if (!closing) {
          if (!row) row = { cells: [], allTh: true };
          if (tag === "td") row.allTh = false;
          cell = [];
        }
      } else if (tag === "br" && cell) (cell as string[]).push(" ");
      if (tag === "tr" && !closing) row = { cells: [], allTh: true };
      continue;
    }
    if (m[0].startsWith("<!") || m[0].startsWith("<?")) continue;
    const text = decodeEntities(m[0]);
    if (depth > 0) {
      if (cell) (cell as string[]).push(text);
      continue;
    }
    const t = collapse(text);
    if (t) {
      before.push(t);
      out.outside.push(t);
    }
  }
  if (table) {
    closeRow();
    out.tables.push(table);
  }
  return out;
}

/** Nome de coluna para comparar: sem acentos, minúsculas, só letras e
 *  números ("Escalão" → "escalao"). */
function headerKey(s: string): string {
  return s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function columnIndex(header: string[] | null): Map<string, number> {
  const idx = new Map<string, number>();
  (header ?? []).forEach((h, i) => {
    const k = headerKey(h);
    if (k && !idx.has(k)) idx.set(k, i);
  });
  return idx;
}

const ERROR_TITLE = /\b404\b|not found|runtime error|server error|p[aá]gina n[aã]o encontrada/i;
const ERROR_BODY =
  /file or directory not found|runtime error|server error in|http error \d{3}|p[aá]gina n[aã]o encontrada|page not found|the resource cannot be found/i;

function isErrorPage(w: Walked): boolean {
  return ERROR_TITLE.test(w.title) || ERROR_BODY.test(w.outside.join(" ").slice(0, 3000));
}

function lastMatch(re: RegExp, s: string): RegExpExecArray | null {
  let last: RegExpExecArray | null = null;
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  for (let m = g.exec(s); m; m = g.exec(s)) {
    last = m;
    if (m[0] === "") g.lastIndex += 1;
  }
  return last;
}

function genderOf(word: string | undefined): "M" | "F" | null {
  const w = (word ?? "").toLowerCase();
  return w === "masculino" ? "M" : w === "feminino" ? "F" : null;
}

function isoFromDmy(d: string, m: string, y: string): string | null {
  const iso = `${y}-${m}-${d}`;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === iso ? iso : null;
}

const ROUND_COLUMNS = ["pos", "dorsal", "nome", "clube", "escalao", "marca"] as const;

/** /Resultados/{id} → SourceRoundPage. Nunca lança: devolve o que achou e a
 *  validação (checkRoundPage) decide. */
export function parseRoundPage(html: string): SourceRoundPage {
  const w = walk(html);
  const raceName = w.title.replace(/\s*-\s*Resultados\s*$/i, "").trim();
  let date: string | null = null;
  for (const t of w.outside) {
    const m = /\b(\d{2})-(\d{2})-(\d{4})\b/.exec(t);
    if (m) {
      date = isoFromDmy(m[1], m[2], m[3]);
      break;
    }
  }
  let distanceM: number | null = null;
  const tables: SourceResultTable[] = w.tables.map((t) => {
    const text = t.before.join(" ");
    const dm = lastMatch(/(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*metros\b/i, text);
    if (dm) distanceM = Number(dm[1].replace(/[.\s]/g, "")) || null;
    const gm = lastMatch(/\((Masculino|Feminino)\)/i, text);
    const idx = columnIndex(t.header);
    const missingColumns = ROUND_COLUMNS.filter((c) => !idx.has(c));
    const cellOf = (cells: string[], c: string) => (idx.has(c) ? cells[idx.get(c)!] ?? "" : "");
    const rows: SourceResultRow[] = t.rows.map((cells) => ({
      pos: cellOf(cells, "pos"),
      bib: cellOf(cells, "dorsal"),
      name: cellOf(cells, "nome"),
      club: cellOf(cells, "clube"),
      category: cellOf(cells, "escalao"),
      time: cellOf(cells, "marca"),
    }));
    return { distanceM, gender: genderOf(gm?.[1]), missingColumns: [...missingColumns], rows };
  });
  return {
    kind: "jornada",
    title: w.title,
    raceName: raceName || null,
    date,
    errorPage: isErrorPage(w),
    tables,
  };
}

const STANDINGS_COLUMNS = ["pos", "nome", "ano", "equipa", "total"] as const;

/** O título de uma tabela da geral: o último texto antes dela ("M40
 *  (Masculino)"), ou os dois últimos se o género vier noutro elemento. */
function standingsTitle(before: string[]): { category: string; gender: "M" | "F" | null } {
  const re = /^(.*?)\s*\((Masculino|Feminino)\)\s*$/i;
  const last = before[before.length - 1] ?? "";
  const m = re.exec(last) ?? re.exec(before.slice(-2).join(" "));
  if (!m) return { category: last, gender: null };
  return { category: m[1].trim(), gender: genderOf(m[2]) };
}

/** /Trofeu/{id} → SourceStandingsPage. Nunca lança. */
export function parseStandingsPage(html: string): SourceStandingsPage {
  const w = walk(html);
  const sm = /(\d{4})\s*\/\s*(\d{2,4})/.exec(w.title);
  const legend: SourceLegendEntry[] = [];
  const seenK = new Set<number>();
  const lre = /\bP(\d{1,2})\s*:\s*(.+?)\s*\((\d{2})-(\d{2})\)/g;
  const all = w.outside.join(" ");
  for (let m = lre.exec(all); m; m = lre.exec(all)) {
    const k = Number(m[1]);
    if (seenK.has(k)) continue;
    seenK.add(k);
    legend.push({ k, name: m[2].trim(), dayMonth: `${m[3]}-${m[4]}` });
  }
  const tables: SourceStandingTable[] = w.tables.map((t) => {
    const { category, gender } = standingsTitle(t.before);
    const idx = columnIndex(t.header);
    const pCols = [...idx.entries()]
      .map(([k, i]) => ({ n: /^p(\d{1,2})$/.exec(k), i }))
      .filter((x): x is { n: RegExpExecArray; i: number } => !!x.n)
      .map((x) => ({ k: Number(x.n[1]), i: x.i }))
      .sort((a, b) => a.k - b.k);
    const contiguous = pCols.every((p, j) => p.k === j + 1);
    const missingColumns: string[] = STANDINGS_COLUMNS.filter((c) => !idx.has(c));
    if (!pCols.length || !contiguous) missingColumns.push("p");
    const cellOf = (cells: string[], c: string) => (idx.has(c) ? cells[idx.get(c)!] ?? "" : "");
    const rows: SourceStandingRow[] = t.rows.map((cells) => ({
      pos: cellOf(cells, "pos"),
      name: cellOf(cells, "nome"),
      year: cellOf(cells, "ano"),
      team: cellOf(cells, "equipa"),
      points: pCols.map((p) => cells[p.i] ?? ""),
      total: cellOf(cells, "total"),
    }));
    return { category, gender, pCount: pCols.length, missingColumns, rows };
  });
  return {
    kind: "geral",
    title: w.title,
    seasonLabel: sm ? `${sm[1]}/${sm[2]}` : null,
    errorPage: isErrorPage(w),
    legend,
    tables,
  };
}
