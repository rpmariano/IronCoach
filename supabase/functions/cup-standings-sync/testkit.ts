// Só para os testes do cup-standings-sync (handler.test.ts, sync.test.ts):
// um Supabase falso em memória (o subconjunto do PostgREST que o job usa, a
// registar todas as escritas), o site falso (serve o HTML SINTÉTICO do
// renderizador) e o cenário das fixtures do pacote 1.

import { CASCAIS_REG_CATEGORIES } from "../_shared/formulas/cup.fixtures.ts";
import type { SourceRoundPage, SourceStandingsPage } from "../_shared/formulas/cupResults.ts";
import {
  PROPRIA,
  SINT_COURSES,
  SINT_EDITION,
  SINT_GERAL_PAGE,
  SINT_J1,
  SINT_J1_PAGE,
  SINT_ROUNDS,
  SINT_TEAMS,
} from "../_shared/formulas/cupResults.fixtures.ts";
import { trofeuHttp, type TrofeuHttp } from "./adapters/trofeuCascais.ts";
import { renderRoundHtml, renderStandingsHtml } from "./adapters/trofeuCascais.testhtml.ts";
import type { SyncDeps } from "./sync.ts";

export type Row = Record<string, unknown>;
type Op = "select" | "insert" | "update" | "upsert" | "delete";

export interface WriteLog { table: string; op: Exclude<Op, "select">; payload: unknown; matched: number }
export interface Failure { table: string; op?: Op; code: string; message?: string }

/** As chaves únicas que o falso respeita (um insert repetido dá 23505). */
const KEYS: Record<string, string[]> = {
  cup_results: ["enrollment_id", "round_id"],
  cup_standings: ["enrollment_id"],
  cup_sync_state: ["edition_id", "target"],
  cup_round_publication: ["round_id"],
  cup_team_results: ["round_id", "team_name"],
  cup_team_aliases: ["edition_id", "alias_norm"],
};

/** As tabelas que um atleta lê (observar nunca escreve aqui). */
export const ATHLETE_TABLES = ["cup_results", "cup_standings", "cup_team_results", "cup_round_publication"];

function same(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null;
  return a === b || String(a) === String(b);
}

function splitTop(expr: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (const ch of expr) {
    if (ch === '"') q = !q;
    if (ch === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function evalCond(r: Row, cond: string): boolean {
  const m = /^([a-z_]+)\.(is|eq|lt|gt|lte|gte)\.(.*)$/.exec(cond.trim());
  if (!m) throw new Error(`filtro or() não suportado no falso: ${cond}`);
  const v = m[3].replace(/^"(.*)"$/, "$1");
  const x = r[m[1]];
  if (m[2] === "is") return v === "null" ? x == null : String(x) === v;
  if (x == null) return false;
  const s = String(x);
  return m[2] === "eq" ? s === v : m[2] === "lt" ? s < v : m[2] === "gt" ? s > v : m[2] === "lte" ? s <= v : s >= v;
}

function project(r: Row, cols: string | null): Row {
  if (!cols || cols.trim() === "*") return { ...r };
  const out: Row = {};
  for (const c of cols.split(",").map((x) => x.trim()).filter(Boolean)) out[c] = r[c] ?? null;
  return out;
}

export class FakeDb {
  tables: Record<string, Row[]> = {};
  writes: WriteLog[] = [];
  failures: Failure[] = [];

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [t, rows] of Object.entries(seed)) this.tables[t] = rows.map((r) => structuredClone(r));
  }

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }

  writesTo(tables: string[]): WriteLog[] {
    return this.writes.filter((w) => tables.includes(w.table));
  }

  /** As tabelas em que se escreveu (sem repetições). */
  writtenTables(): string[] {
    return [...new Set(this.writes.map((w) => w.table))].sort();
  }
}

class FakeQuery implements PromiseLike<{ data: unknown; error: { code: string; message: string } | null }> {
  op: Op = "select";
  cols: string | null = "*";
  returning: string | null = null;
  filters: ((r: Row) => boolean)[] = [];
  payload: unknown = null;
  opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  single: "maybe" | "one" | null = null;
  lim: number | null = null;
  rng: [number, number] | null = null;
  orderCol: string | null = null;

  constructor(readonly db: FakeDb, readonly table: string) {}

  select(cols = "*"): this {
    if (this.op === "select") this.cols = cols;
    else this.returning = cols;
    return this;
  }
  insert(p: unknown): this {
    this.op = "insert";
    this.payload = p;
    return this;
  }
  update(p: unknown): this {
    this.op = "update";
    this.payload = p;
    return this;
  }
  upsert(p: unknown, o: { onConflict?: string; ignoreDuplicates?: boolean } = {}): this {
    this.op = "upsert";
    this.payload = p;
    this.opts = o;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  eq(c: string, v: unknown): this {
    this.filters.push((r) => same(r[c], v));
    return this;
  }
  neq(c: string, v: unknown): this {
    this.filters.push((r) => !same(r[c], v));
    return this;
  }
  in(c: string, vs: unknown[]): this {
    this.filters.push((r) => vs.some((v) => same(r[c], v)));
    return this;
  }
  is(c: string, v: unknown): this {
    this.filters.push((r) => (v === null ? r[c] == null : same(r[c], v)));
    return this;
  }
  or(expr: string): this {
    const parts = splitTop(expr);
    this.filters.push((r) => parts.some((p) => evalCond(r, p)));
    return this;
  }
  order(c: string): this {
    this.orderCol = c;
    return this;
  }
  limit(n: number): this {
    this.lim = n;
    return this;
  }
  range(a: number, b: number): this {
    this.rng = [a, b];
    return this;
  }
  maybeSingle(): this {
    this.single = "maybe";
    return this;
  }

  then<A = { data: unknown; error: { code: string; message: string } | null }, B = never>(
    onF?: ((v: { data: unknown; error: { code: string; message: string } | null }) => A | PromiseLike<A>) | null,
    onR?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.exec()).then(onF, onR);
  }

  matching(): Row[] {
    return this.db.rows(this.table).filter((r) => this.filters.every((f) => f(r)));
  }

  exec(): { data: unknown; error: { code: string; message: string } | null } {
    const fail = this.db.failures.find((f) => f.table === this.table && (!f.op || f.op === this.op));
    if (fail) return { data: null, error: { code: fail.code, message: fail.message ?? "falha simulada" } };
    const all = this.db.rows(this.table);
    const keyCols = this.opts.onConflict?.split(",").map((s) => s.trim()) ?? KEYS[this.table] ?? null;
    const keyOf = (r: Row) => (keyCols ? keyCols.map((k) => String(r[k] ?? "")).join("|") : null);

    if (this.op === "select") {
      let rows = this.matching();
      if (this.orderCol) {
        const c = this.orderCol;
        rows = [...rows].sort((a, b) => String(a[c] ?? "").localeCompare(String(b[c] ?? "")));
      }
      if (this.rng) rows = rows.slice(this.rng[0], this.rng[1] + 1);
      if (this.lim != null) rows = rows.slice(0, this.lim);
      const data = rows.map((r) => project(r, this.cols));
      if (this.single === "maybe") {
        if (data.length > 1) return { data: null, error: { code: "PGRST116", message: "várias linhas" } };
        return { data: data[0] ?? null, error: null };
      }
      return { data, error: null };
    }

    const items = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
    if (this.op === "insert") {
      const keys = new Set(all.map(keyOf));
      for (const it of items) {
        const k = keyOf(it);
        if (k != null && keys.has(k)) return { data: null, error: { code: "23505", message: "duplicate key" } };
        if (k != null) keys.add(k);
      }
      for (const it of items) all.push(structuredClone(it));
      this.db.writes.push({ table: this.table, op: "insert", payload: structuredClone(this.payload), matched: items.length });
      return { data: this.returning != null ? items.map((r) => project(r, this.returning)) : null, error: null };
    }
    if (this.op === "upsert") {
      let n = 0;
      for (const it of items) {
        const k = keyOf(it);
        const ex = k != null ? all.find((r) => keyOf(r) === k) : undefined;
        if (ex) {
          if (this.opts.ignoreDuplicates) continue;
          Object.assign(ex, structuredClone(it));
        } else all.push(structuredClone(it));
        n += 1;
      }
      this.db.writes.push({ table: this.table, op: "upsert", payload: structuredClone(this.payload), matched: n });
      return { data: null, error: null };
    }
    const rows = this.matching();
    if (this.op === "update") {
      for (const r of rows) Object.assign(r, structuredClone(this.payload as Row));
      this.db.writes.push({ table: this.table, op: "update", payload: structuredClone(this.payload), matched: rows.length });
      return { data: this.returning != null ? rows.map((r) => project(r, this.returning)) : null, error: null };
    }
    // delete
    this.db.tables[this.table] = all.filter((r) => !rows.includes(r));
    this.db.writes.push({ table: this.table, op: "delete", payload: null, matched: rows.length });
    return { data: null, error: null };
  }
}

// ── O site falso ──────────────────────────────────────────────────────────

export const J1_URL = "https://trofeuatletismocascais.pt/Resultados/901";
export const GERAL_URL = SINT_EDITION.standings_url as string;

export class FakeSite {
  pages = new Map<string, () => Response>();
  robots: () => Response = () => new Response("não há", { status: 404, headers: { "content-type": "text/html" } });
  calls: { url: string; method: string; ua: string | null }[] = [];

  readonly fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    this.calls.push({ url, method: init?.method ?? "GET", ua: new Headers(init?.headers).get("user-agent") });
    if (url.endsWith("/robots.txt")) return Promise.resolve(this.robots());
    const p = this.pages.get(url);
    return Promise.resolve(p ? p() : new Response("não há", { status: 404, headers: { "content-type": "text/html" } }));
  }) as typeof fetch;

  serveRound(url: string, page: SourceRoundPage): this {
    const html = renderRoundHtml(page);
    this.pages.set(url, () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }));
    return this;
  }

  serveGeral(url: string, page: SourceStandingsPage): this {
    const html = renderStandingsHtml(page);
    this.pages.set(url, () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }));
    return this;
  }

  /** Pedidos às páginas (sem o robots.txt). */
  pageCalls(): number {
    return this.calls.filter((c) => !c.url.endsWith("/robots.txt")).length;
  }
}

export class Clock {
  constructor(public now: Date) {}
  set(iso: string): this {
    this.now = new Date(iso);
    return this;
  }
  plusHours(h: number): this {
    this.now = new Date(this.now.getTime() + h * 3_600_000);
    return this;
  }
}

export function httpFor(site: FakeSite, clock: Clock): (kind: "cron" | "admin") => TrofeuHttp {
  return (kind) =>
    trofeuHttp({
      fetchImpl: site.fetch,
      sleep: () => Promise.resolve(),
      now: () => clock.now.getTime(),
      maxPages: kind === "admin" ? 13 : 6,
      budgetMs: 90_000,
    });
}

export function syncDeps(db: FakeDb, site: FakeSite, clock: Clock): SyncDeps {
  return { sb: db, http: httpFor(site, clock), now: () => clock.now };
}

// ── O cenário: a 34.ª sintética, a J1 com link, a própria inscrita ─────────

export const EDITION_ROW: Row = {
  id: SINT_EDITION.id,
  season_label: SINT_EDITION.season_label,
  status: SINT_EDITION.status,
  results_source: SINT_EDITION.results_source,
  results_adapter: SINT_EDITION.results_adapter,
  sync_mode: SINT_EDITION.sync_mode,
  standings_url: SINT_EDITION.standings_url,
  points_mode: SINT_EDITION.points_mode,
  points_table: SINT_EDITION.points_table,
  points_basis: SINT_EDITION.points_basis,
  team_scoring: SINT_EDITION.team_scoring,
  team_min_athletes: SINT_EDITION.team_min_athletes,
  team_counting_n: SINT_EDITION.team_counting_n,
  bib_scope: SINT_EDITION.bib_scope,
  age_rule: SINT_EDITION.age_rule,
  time_zone: SINT_EDITION.time_zone,
};

export const PROPRIA_ENROLLMENT: Row = {
  id: PROPRIA.enrollmentId,
  user_id: PROPRIA.userId,
  edition_id: SINT_EDITION.id,
  status: "ativa",
  bib: PROPRIA.bib,
  team_id: PROPRIA.team_id,
  team_other: null,
  match_refused_key: null,
};

export interface ScenarioOver {
  edition?: Row;
  enrollments?: Row[];
  profiles?: Row[];
  participations?: Row[];
  tables?: Record<string, Row[]>;
}

export function scenario(over: ScenarioOver = {}): FakeDb {
  const enrollments = over.enrollments ?? [PROPRIA_ENROLLMENT];
  return new FakeDb({
    cup_editions: [{ ...EDITION_ROW, ...(over.edition ?? {}) }],
    cup_rounds: SINT_ROUNDS.map((r) => ({
      id: r.id,
      edition_id: r.edition_id,
      round_no: r.round_no,
      name: r.name,
      date: r.date,
      date_status: r.date_status,
      results_url: r.id === SINT_J1.id ? J1_URL : null,
    })),
    cup_round_courses: SINT_COURSES.map((c) => ({ id: c.id, round_id: c.round_id, code: c.code, distance_m: c.distance_m, start_time: c.start_time })),
    cup_categories: CASCAIS_REG_CATEGORIES as unknown as Row[],
    cup_teams: SINT_TEAMS.map((t) => ({ id: t.id, edition_id: t.edition_id, name: t.name, short_name: t.short_name, kind: t.kind })),
    cup_team_aliases: [],
    cup_sync_state: [],
    cup_enrollments: enrollments,
    cup_enrollment_teams: [],
    profiles: over.profiles ?? [{ id: PROPRIA.userId, birth_date: PROPRIA.birth_date, gender: PROPRIA.gender, is_admin: false }],
    cup_participations: over.participations ??
      enrollments.map((e, i) => ({ id: `p-${i}`, enrollment_id: e.id, user_id: e.user_id, round_id: SINT_J1.id, decision: "vou" })),
    race_events: [],
    cup_results: [],
    cup_standings: [],
    cup_team_results: [],
    cup_round_publication: [],
    app_logs: [],
    ...(over.tables ?? {}),
  });
}

export function siteWith(round: SourceRoundPage = SINT_J1_PAGE, geral: SourceStandingsPage = SINT_GERAL_PAGE): FakeSite {
  return new FakeSite().serveRound(J1_URL, round).serveGeral(GERAL_URL, geral);
}

/** D = 06/12/2026 (Lisboa = UTC em dezembro): a J1 abre às 12:00. */
export const T1 = "2026-12-06T15:00:00Z";
