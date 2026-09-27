// cup-standings-sync — a volta do job da classificação (specs/trofeu.md §7;
// fase 4, C). 2026-09-27.
//
// Orquestração com dependências injetadas (a BD, os pedidos ao site e o
// relógio), para os testes correrem sem rede nem Supabase. Quem decide O QUE
// se escreve é @formulas/cupResults.ts (puro); quem conhece o site é
// adapters/trofeuCascais.ts. Aqui só se lê a BD, se pede, se chama um e
// outro, e se executa o que eles devolvem.
//
// INERTE ATÉ À M2 E AO ADMIN (o cron e o "Ler agora"; o ensaio é à parte):
//   · a sonda da M2 (cup_sync_state, cup_results.bib_key) falha com
//     42P01/42703/PGRST204/PGRST205 → { m2_por_aplicar }: nenhum pedido ao
//     site, nenhuma escrita (nem app_logs);
//   · só entram edições com results_source 'adaptador', sync_mode ≠
//     'desligado' e não encerradas (a 34.ª nasce 'desligado');
//   · não há cron até a M2 estar aplicada (cria-se à mão, H.6).
//
// O QUE CADA MODO ESCREVE (C.4):
//   · observar — cup_sync_state (estado agregado), app_logs (alertas e
//     mudanças, agregados) e cup_team_aliases (a coluna Equipa da geral: a
//     lista oficial de coletividades). NADA que um atleta leia.
//   · publicar — + cup_round_publication, cup_results e cup_standings (a
//     linha DELE: pela chave exata; sem nenhuma linha com ela, pela
//     alternativa — 1.º e último nome —, 'proposta' até ele confirmar e sem
//     pontos oficiais até lá) e cup_team_results (só clubes com inscritos), e o clube da
//     linha DELE nos aliases — só depois de ele ter confirmado essa linha
//     (roundAliases: antes, a linha achada pelo dorsal pode ser de outra
//     pessoa). Só com a página "pronta" (o mesmo conteúdo em
//     duas leituras com ≥ 6 h). Com bib_scope ≠ 'epoca' não corre a
//     correspondência (o dorsal só é chave se for o mesmo toda a época):
//     alerta e fica como observar.
//   · passar de observar a publicar: a marca de "estável" guarda o modo em
//     que foi obtida (cup_sync_state.stable_mode) e a de observar não conta
//     em publicar (roundDue) — as jornadas já lidas voltam ao plano e
//     publicam-se logo se a página não mudou; depois de D+10 relêem-se de 6
//     em 6 h até ficarem prontas (48 h a falhar, ou sem interessados,
//     fecham). Nenhuma fica presa sem uma leitura em publicar.
//   · ensaio — só pelo admin (JWT de admin; o cron nunca o corre): lê os
//     links dados e devolve só números (C.6); na BD, só 1 linha agregada em
//     app_logs. Corre SEM a M2: não lê nem grava nada que um atleta leia.
//
// PRIVACIDADE. O HTML e as linhas oficiais vivem só dentro de uma leitura
// (variáveis locais de readRound/readStandings/runEnsaio). Os relatórios,
// o estado e os registos levam contagens, códigos, hashes e bandas; os
// erros da BD só o código (a mensagem do PostgREST pode trazer valores). O
// teste de fuga (sync.test.ts) junta a consola, todas as escritas e todas as
// respostas e procura os nomes, dorsais e clubes das fixtures.

import { type CupCategory, cupCategoryFor } from "../_shared/formulas/cup.ts";
import {
  type AliasLike,
  band,
  bibKeyInput,
  checkRoundPage,
  checkStandingsPage,
  confirmedKeysOf,
  crossCheck,
  type CrossReport,
  type ExistingResult,
  type ExistingStanding,
  type ExistingTeamResult,
  linkStandings,
  makeTeamResolver,
  MATCH_KINDS,
  type MatchEnrollment,
  type MatchKind,
  matchRoundLines,
  normBib,
  normText,
  officialPointsWrites,
  outcomeHashes,
  publishedPointColumns,
  readiness,
  refusedWrites,
  resolveTeamId,
  type ResultWrite,
  roundAliases,
  roundContentInput,
  roundDue,
  roundInWindow,
  type RoundCheck,
  roundSummary,
  roundWindowEnd,
  roundWrites,
  sha256Hex,
  type StandingsCheck,
  standingsContentInput,
  standingsDue,
  standingsRowAltKeys,
  standingsRowKeys,
  standingsSummary,
  standingsWrites,
  type StandingWrite,
  type SyncState,
  type TeamLike,
  teamResultWrites,
  type TeamResultWrite,
  teamTotals,
} from "../_shared/formulas/cupResults.ts";
import {
  checkRobots,
  fetchTrofeuPage,
  parseRoundPage,
  parseStandingsPage,
  type RobotsVerdict,
  TROFEU_ADAPTER,
  TROFEU_CATEGORY_CODES,
  TROFEU_POINTS_TABLE,
  type TrofeuHttp,
  trofeuUrlKind,
} from "./adapters/trofeuCascais.ts";

export const SYNC_EVENT = "cup-standings-sync";

// ── A BD (o cliente do Supabase com a service role, ou o falso dos testes) ─

export interface DbError { code?: string | null; message?: string | null }
// O cliente real (supabase-js) e o falso dos testes: só se usa from(…).
// deno-lint-ignore no-explicit-any
export type Db = { from(table: string): any };

/** Uma falha da BD, só com o código (a mensagem pode trazer valores). */
export class DbFailure extends Error {
  constructor(readonly code: string) {
    super(`bd:${code}`);
    this.name = "DbFailure";
  }
}

const M2_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

/** A M2 ainda não está aplicada (tabela ou coluna nova em falta). */
export function isM2Missing(e: DbError | null | undefined): boolean {
  if (!e) return false;
  return M2_CODES.has(String(e.code ?? "")) || /does not exist|Could not find/i.test(String(e.message ?? ""));
}

async function run<T>(p: PromiseLike<{ data: T | null; error: DbError | null }>): Promise<T | null> {
  const { data, error } = await p;
  if (error) throw new DbFailure(String(error.code || "desconhecido"));
  return data;
}

const PAGE = 1000;
const IN_CHUNK = 100;

/** Todas as linhas, em páginas de 1000 (o max_rows do PostgREST). */
// deno-lint-ignore no-explicit-any
async function selectAll<T>(make: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0;; from += PAGE) {
    const rows = (await run<T[]>(make().range(from, from + PAGE - 1))) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** `col in (values)`, em pedaços de 100 (o URL do GET tem limite). */
async function selectIn<T>(
  sb: Db,
  table: string,
  cols: string,
  col: string,
  values: (string | null | undefined)[],
  order: string,
  // deno-lint-ignore no-explicit-any
  extra?: (q: any) => any,
): Promise<T[]> {
  const uniq = [...new Set(values.filter((v): v is string => typeof v === "string" && v !== ""))];
  const out: T[] = [];
  for (let i = 0; i < uniq.length; i += IN_CHUNK) {
    const chunk = uniq.slice(i, i + IN_CHUNK);
    out.push(...await selectAll<T>(() => {
      const q = sb.from(table).select(cols).in(col, chunk).order(order);
      return extra ? extra(q) : q;
    }));
  }
  return out;
}

// ── Formas das linhas lidas ───────────────────────────────────────────────

const EDITION_COLS =
  "id, season_label, status, results_source, results_adapter, sync_mode, standings_url, points_mode, points_table, " +
  "points_basis, team_scoring, team_min_athletes, team_counting_n, bib_scope, age_rule, time_zone";
const ROUND_COLS = "id, edition_id, round_no, name, date, date_status, results_url";
const COURSE_COLS = "round_id, code, distance_m, start_time";
const CATEGORY_COLS = "id, edition_id, code, gender, min_age, max_age, course_code";
const TEAM_COLS = "id, name, short_name, kind";
const ALIAS_COLS = "alias_norm, team_id";
const STATE_COLS =
  "edition_id, target, round_id, last_checked_at, last_status, last_codes, content_hash, hash_seen_at, ready_at, " +
  "stable_at, stable_mode, fail_since, rows_total, rows_by_category";
const ENROLLMENT_COLS = "id, user_id, bib, team_id, team_other, match_refused_key, standings_refused_keys";
const ENROLLMENT_TEAM_COLS = "enrollment_id, team_id, team_other, from_date";
const PROFILE_COLS = "id, birth_date, gender";
const RESULT_COLS =
  "enrollment_id, round_id, match_status, match_hash, bib_key, standings_key, standings_alt_key, points_source, position, " +
  "category_code, category_position, official_time_s, points";
const STANDING_COLS =
  "enrollment_id, category_code, category_rank, total_points, rounds_scored, key_hash, match_status, source_checked_at";
const TEAM_RESULT_COLS = "round_id, team_id, team_name, position, points, athletes_count, points_source";
const PUBLICATION_COLS = "round_id, results_ready_at, source, stable_at, content_hash";

export type EditionRow = {
  id: string;
  season_label: string | null;
  status: string | null;
  results_source: string | null;
  results_adapter: string | null;
  sync_mode: string | null;
  standings_url: string | null;
  points_mode: string | null;
  points_table: unknown;
  points_basis: string | null;
  team_scoring: string | null;
  team_min_athletes: number | null;
  team_counting_n: number | null;
  bib_scope: string | null;
  age_rule: string | null;
  time_zone: string | null;
};
type RoundRow = {
  id: string;
  edition_id: string;
  round_no: number | null;
  name: string | null;
  date: string | null;
  date_status: string | null;
  results_url: string | null;
};
type CourseRow = { round_id: string; code: string; distance_m: number | null; start_time: string | null };
type TeamRow = TeamLike & { name: string };
type StateRow = SyncState & {
  edition_id: string;
  target: string;
  round_id?: string | null;
  last_status?: string | null;
  last_codes?: string[] | null;
  rows_total?: number | null;
  rows_by_category?: Record<string, number> | null;
};
type EnrollmentRow = {
  id: string;
  user_id: string;
  bib: string | null;
  team_id: string | null;
  team_other: string | null;
  match_refused_key: string | null;
  /** As chaves alternativas da geral que ele recusou ("não sou eu" na geral). */
  standings_refused_keys?: string[] | null;
};
type EnrollmentTeamRow = { enrollment_id: string; team_id: string | null; team_other: string | null; from_date: string };
type ProfileRow = { id: string; birth_date: string | null; gender: string | null };
type ResultDbRow = ExistingResult & { round_id: string };
type PublicationRow = {
  round_id: string;
  results_ready_at: string | null;
  source: string | null;
  stable_at: string | null;
  content_hash: string | null;
};

interface LogRow {
  user_id: null;
  level: "error" | "info";
  event: string;
  message: string;
  meta: Record<string, unknown>;
}

// ── Relatórios (só agregados) ─────────────────────────────────────────────

export interface TargetReport {
  round_id: string | null;
  round_no: number | null;
  estado: string;
  /** Os códigos da leitura (as falhas numa leitura que parou; os avisos numa boa). */
  codigos: string[];
  /** As falhas (vazio numa leitura boa) — o backoffice mostra-as. */
  falhas: string[];
  /** As linhas da página (null sem leitura). */
  linhas: number | null;
  pronta: boolean;
  estavel: boolean;
}

export interface EditionReport {
  edition_id: string;
  sync_mode: string | null;
  /** O que se escreveu: 'publicar', ou 'observar' (também publicar com bib_scope ≠ 'epoca'). */
  modo: "observar" | "publicar";
  skipped?: "a_correr";
  erro?: string;
  robots: RobotsVerdict | null;
  paginas: number;
  jornadas: TargetReport[];
  geral: (TargetReport & { ligacao?: Record<string, string> }) | null;
  /** Escritas por tabela, em bandas (0, 1–19, 20+). */
  escritas: Record<string, string>;
  /** Resultados da correspondência, em bandas. */
  correspondencia: Record<string, string>;
  dorsais_repetidos_inscricoes: number | null;
}

export type SyncRequest = { modo: "cron" } | { modo: "correr"; editionId: string; roundIds?: string[] | null };

export type SyncStatus =
  | "ok"
  | "m2_por_aplicar"
  | "a_correr"
  | "sem_edicao"
  | "desligado"
  | "encerrada"
  | "fonte"
  | "adaptador";

export interface SyncOutcome { status: SyncStatus; edicoes: EditionReport[] }

export interface SyncDeps {
  /** O cliente com a service role. */
  sb: Db;
  /** Uma sessão de pedidos por volta (limites de páginas e de tempo). */
  http: (kind: "cron" | "admin") => TrofeuHttp;
  now: () => Date;
}

// ── Utilitários ───────────────────────────────────────────────────────────

const HOUR = 3_600_000;
const LOCK_MIN = 10;
const MASS_CATEGORY = 3;
const RETRY_ALERT_H = 48;
const FAR_FUTURE = new Date(Date.UTC(9999, 0, 1));

function localDay(at: Date, tz: string): string {
  const opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: tz }).formatToParts(at);
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: "Europe/Lisbon" }).formatToParts(at);
  }
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function pointsTableOf(v: unknown): number[] | null {
  if (!Array.isArray(v) || !v.length) return null;
  const nums = v.map((x) => Number(x));
  return nums.every((x) => Number.isFinite(x) && x >= 0) ? nums : null;
}

function sameCodes(a: string[] | null | undefined, b: string[]): boolean {
  const x = [...(a ?? [])].sort(), y = [...b].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

function prevOf(st: StateRow | null): { rowsTotal: number; categories: string[] } | null {
  if (!st || st.rows_total == null) return null;
  const cats = Object.entries(st.rows_by_category ?? {})
    .filter(([k, v]) => k !== "?" && Number(v) > 0)
    .map(([k]) => k);
  return { rowsTotal: Number(st.rows_total), categories: cats };
}

/** 'regressao' ("fica em espera") só quando é a única falha; uma página de
 *  erro ou sem tabelas também parece uma regressão, mas é uma invariante. */
function failedStatus(failures: string[]): "regressao" | "invariante" {
  return failures.length > 0 && failures.every((f) => f === "regressao") ? "regressao" : "invariante";
}

function bandsOf(counts: Record<string, number>): Record<string, string> {
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, band(v)]));
}

/** A M2 está aplicada? (as duas coisas novas de que o job depende). */
async function m2Present(sb: Db): Promise<boolean> {
  for (const [table, col] of [["cup_sync_state", "edition_id"], ["cup_results", "bib_key"]]) {
    const { error } = await sb.from(table).select(col).limit(1);
    if (error) {
      if (isM2Missing(error)) return false;
      throw new DbFailure(String(error.code || "desconhecido"));
    }
  }
  return true;
}

async function insertLogs(sb: Db, logs: LogRow[]): Promise<void> {
  if (!logs.length) return;
  try {
    await sb.from("app_logs").insert(logs);
  } catch {
    // Um registo que falha não pode deitar abaixo a volta (nem sair para a consola).
  }
}

/** O trinco da volta (uma de cada vez por edição; 10 min de validade). */
async function acquireLock(sb: Db, editionId: string, now: Date): Promise<boolean> {
  await run(sb.from("cup_sync_state").upsert(
    { edition_id: editionId, target: "edicao" },
    { onConflict: "edition_id,target", ignoreDuplicates: true },
  ));
  const cutoff = new Date(now.getTime() - LOCK_MIN * 60_000).toISOString();
  const rows = await run<{ edition_id: string }[]>(
    sb.from("cup_sync_state")
      .update({ running_since: now.toISOString() })
      .eq("edition_id", editionId)
      .eq("target", "edicao")
      .or(`running_since.is.null,running_since.lt."${cutoff}"`)
      .select("edition_id"),
  );
  return (rows ?? []).length > 0;
}

async function releaseLock(sb: Db, editionId: string): Promise<void> {
  try {
    await sb.from("cup_sync_state").update({ running_since: null }).eq("edition_id", editionId).eq("target", "edicao");
  } catch {
    // Fica para os 10 minutos do trinco.
  }
}

// ── A volta ───────────────────────────────────────────────────────────────

/** Uma volta: a do cron (todas as edições do plano) ou a do admin ("Ler
 *  agora" numa edição: lê já as jornadas passadas — ou as pedidas — e a
 *  geral, ignorando o "devido" mas nunca o "pronta"). */
export async function runSync(deps: SyncDeps, req: SyncRequest): Promise<SyncOutcome> {
  const sb = deps.sb;
  if (!(await m2Present(sb))) return { status: "m2_por_aplicar", edicoes: [] };
  let editions: EditionRow[];
  if (req.modo === "correr") {
    const ed = await run<EditionRow>(sb.from("cup_editions").select(EDITION_COLS).eq("id", req.editionId).maybeSingle());
    if (!ed) return { status: "sem_edicao", edicoes: [] };
    if (ed.status === "encerrada") return { status: "encerrada", edicoes: [] };
    if (ed.sync_mode !== "observar" && ed.sync_mode !== "publicar") return { status: "desligado", edicoes: [] };
    if (ed.results_source !== "adaptador") return { status: "fonte", edicoes: [] };
    if (ed.results_adapter !== TROFEU_ADAPTER) return { status: "adaptador", edicoes: [] };
    editions = [ed];
  } else {
    editions = await selectAll<EditionRow>(() =>
      sb.from("cup_editions").select(EDITION_COLS)
        .eq("results_source", "adaptador")
        .neq("sync_mode", "desligado")
        .neq("status", "encerrada")
        .order("id")
    );
    editions = editions.filter((e) => e.sync_mode === "observar" || e.sync_mode === "publicar");
  }
  if (!editions.length) return { status: "ok", edicoes: [] };
  const http = deps.http(req.modo === "correr" ? "admin" : "cron");
  const edicoes: EditionReport[] = [];
  for (const ed of editions) {
    if (ed.results_adapter === TROFEU_ADAPTER) edicoes.push(await new EditionRun(deps, http, ed, req).run());
    else edicoes.push(await unknownAdapter(deps, ed));
  }
  if (req.modo === "correr" && edicoes[0]?.skipped === "a_correr") return { status: "a_correr", edicoes };
  return { status: "ok", edicoes };
}

/** Uma edição do plano com um adaptador que o job não conhece: não lê
 *  nada; a linha 'edicao' fica 'adaptador' e alerta uma vez. */
async function unknownAdapter(deps: SyncDeps, ed: EditionRow): Promise<EditionReport> {
  const sb = deps.sb;
  const now = deps.now().toISOString();
  const report: EditionReport = {
    edition_id: ed.id, sync_mode: ed.sync_mode, modo: "observar", erro: "adaptador", robots: null, paginas: 0,
    jornadas: [], geral: null, escritas: {}, correspondencia: {}, dorsais_repetidos_inscricoes: null,
  };
  try {
    const prev = await run<{ last_codes: string[] | null }>(
      sb.from("cup_sync_state").select("last_codes").eq("edition_id", ed.id).eq("target", "edicao").maybeSingle(),
    );
    await run(sb.from("cup_sync_state").upsert(
      { edition_id: ed.id, target: "edicao", last_checked_at: now, last_status: "adaptador", last_codes: ["adaptador"] },
      { onConflict: "edition_id,target" },
    ));
    if (!(prev?.last_codes ?? []).includes("adaptador")) {
      await insertLogs(sb, [{
        user_id: null, level: "error", event: SYNC_EVENT, message: "adaptador",
        meta: { modo: "cron", sync_mode: ed.sync_mode, edition_id: ed.id, round_id: null, alvo: "edicao", codigos: ["adaptador"] },
      }]);
    }
  } catch (e) {
    if (!(e instanceof DbFailure)) throw e;
  }
  return report;
}

class EditionRun {
  readonly sb: Db;
  readonly now: Date;
  readonly nowIso: string;
  readonly tz: string;
  readonly today: string;
  readonly mode: "observar" | "publicar";
  readonly writeMode: "observar" | "publicar";
  readonly forced: boolean;
  readonly report: EditionReport;
  readonly logs: LogRow[] = [];
  readonly pointsTable: number[] | null;
  readonly pagesAtStart: number;

  rounds: RoundRow[] = [];
  courses: CourseRow[] = [];
  categories: CupCategory[] = [];
  categoryCodes = new Set<string>();
  teams: TeamRow[] = [];
  aliases: AliasLike[] = [];
  states = new Map<string, StateRow>();
  enrollments: EnrollmentRow[] = [];
  enrollmentTeams: EnrollmentTeamRow[] = [];
  profiles = new Map<string, ProfileRow>();
  results: ResultDbRow[] = [];
  standings: ExistingStanding[] = [];
  teamResults: ExistingTeamResult[] = [];
  publications = new Map<string, PublicationRow>();
  bibKeys = new Map<string, string | null>();
  writes: Record<string, number> = {
    cup_results: 0, cup_standings: 0, cup_team_results: 0, cup_round_publication: 0, cup_team_aliases: 0,
  };
  matchCounts: Record<MatchKind, number> = Object.fromEntries(MATCH_KINDS.map((k) => [k, 0])) as Record<MatchKind, number>;
  robotsChecked = false;

  constructor(readonly deps: SyncDeps, readonly http: TrofeuHttp, readonly ed: EditionRow, readonly req: SyncRequest) {
    this.sb = deps.sb;
    this.now = deps.now();
    this.nowIso = this.now.toISOString();
    this.tz = ed.time_zone || "Europe/Lisbon";
    this.today = localDay(this.now, this.tz);
    this.mode = ed.sync_mode === "publicar" ? "publicar" : "observar";
    this.writeMode = this.mode === "publicar" && ed.bib_scope === "epoca" ? "publicar" : "observar";
    this.forced = req.modo === "correr";
    this.pointsTable = ed.points_mode === "tabela" ? pointsTableOf(ed.points_table) : null;
    this.pagesAtStart = http.state.pages;
    this.report = {
      edition_id: ed.id,
      sync_mode: ed.sync_mode,
      modo: this.writeMode,
      robots: null,
      paginas: 0,
      jornadas: [],
      geral: null,
      escritas: {},
      correspondencia: {},
      dorsais_repetidos_inscricoes: null,
    };
  }

  get baseMeta(): Record<string, unknown> {
    return { modo: this.forced ? "correr" : this.writeMode, sync_mode: this.ed.sync_mode, edition_id: this.ed.id };
  }

  alert(code: string, meta: Record<string, unknown>): void {
    this.logs.push({ user_id: null, level: "error", event: SYNC_EVENT, message: code, meta: { ...this.baseMeta, ...meta } });
  }

  info(meta: Record<string, unknown>): void {
    this.logs.push({ user_id: null, level: "info", event: SYNC_EVENT, message: "ok", meta: { ...this.baseMeta, ...meta } });
  }

  state(target: string): StateRow | null {
    return this.states.get(target) ?? null;
  }

  async saveState(row: Partial<StateRow> & { target: string }): Promise<void> {
    const full = { edition_id: this.ed.id, ...row };
    await run(this.sb.from("cup_sync_state").upsert(full, { onConflict: "edition_id,target" }));
    this.states.set(row.target, { ...(this.states.get(row.target) ?? {}), ...full } as StateRow);
  }

  async run(): Promise<EditionReport> {
    let locked: boolean;
    try {
      locked = await acquireLock(this.sb, this.ed.id, this.now);
    } catch (e) {
      if (!(e instanceof DbFailure)) throw e;
      this.report.erro = "bd";
      return this.report;
    }
    if (!locked) {
      this.report.skipped = "a_correr";
      return this.report;
    }
    try {
      await this.load();
      await this.work();
    } catch (e) {
      if (!(e instanceof DbFailure)) throw e;
      this.report.erro = "bd";
      this.alert("bd", { round_id: null, alvo: "edicao", codigos: [e.code] });
    } finally {
      await releaseLock(this.sb, this.ed.id);
      await insertLogs(this.sb, this.logs);
    }
    this.report.paginas = this.http.state.pages - this.pagesAtStart;
    this.report.escritas = bandsOf(this.writes);
    this.report.correspondencia = bandsOf(this.matchCounts);
    return this.report;
  }

  async load(): Promise<void> {
    const sb = this.sb, id = this.ed.id;
    this.rounds = await selectAll<RoundRow>(() => sb.from("cup_rounds").select(ROUND_COLS).eq("edition_id", id).order("round_no"));
    const roundIds = this.rounds.map((r) => r.id);
    this.courses = await selectIn<CourseRow>(sb, "cup_round_courses", COURSE_COLS, "round_id", roundIds, "id");
    this.categories = await selectAll<CupCategory>(() => sb.from("cup_categories").select(CATEGORY_COLS).eq("edition_id", id).order("id"));
    this.categoryCodes = new Set(this.categories.map((c) => c.code));
    this.teams = await selectAll<TeamRow>(() => sb.from("cup_teams").select(TEAM_COLS).eq("edition_id", id).order("id"));
    this.aliases = await selectAll<AliasLike>(() => sb.from("cup_team_aliases").select(ALIAS_COLS).eq("edition_id", id).order("id"));
    const states = await selectAll<StateRow>(() => sb.from("cup_sync_state").select(STATE_COLS).eq("edition_id", id).order("target"));
    this.states = new Map(states.map((s) => [s.target, s]));
    if (this.writeMode !== "publicar") return;
    // As inscrições ATIVAS da edição (todas: o "dorsal repetido entre
    // inscrições" conta-as a todas, e uma sem dorsal perde a proposta que
    // tivesse). Nunca o nome — não existe na BD.
    this.enrollments = await selectAll<EnrollmentRow>(() =>
      sb.from("cup_enrollments").select(ENROLLMENT_COLS).eq("edition_id", id).eq("status", "ativa").order("id")
    );
    const enrIds = this.enrollments.map((e) => e.id);
    this.enrollmentTeams = await selectIn<EnrollmentTeamRow>(sb, "cup_enrollment_teams", ENROLLMENT_TEAM_COLS, "enrollment_id", enrIds, "id");
    const profiles = await selectIn<ProfileRow>(sb, "profiles", PROFILE_COLS, "id", this.enrollments.map((e) => e.user_id), "id");
    this.profiles = new Map(profiles.map((p) => [p.id, p]));
    this.results = await selectIn<ResultDbRow>(sb, "cup_results", RESULT_COLS, "round_id", roundIds, "id");
    this.standings = await selectAll<ExistingStanding>(() => sb.from("cup_standings").select(STANDING_COLS).eq("edition_id", id).order("enrollment_id"));
    this.teamResults = await selectIn<ExistingTeamResult>(sb, "cup_team_results", TEAM_RESULT_COLS, "round_id", roundIds, "id");
    const pubs = await selectIn<PublicationRow>(sb, "cup_round_publication", PUBLICATION_COLS, "round_id", roundIds, "round_id");
    this.publications = new Map(pubs.map((p) => [p.round_id, p]));
  }

  firstStart(roundId: string): string | null {
    const s = this.courses.filter((c) => c.round_id === roundId && c.start_time).map((c) => String(c.start_time)).sort();
    return s[0] ?? null;
  }

  distances(roundId: string): number[] | undefined {
    const d = this.courses.filter((c) => c.round_id === roundId && Number(c.distance_m) > 0).map((c) => Number(c.distance_m));
    return d.length ? d : undefined;
  }

  targetReport(
    r: RoundRow | null,
    estado: string,
    codigos: string[] = [],
    pronta = false,
    estavel = false,
    linhas: number | null = null,
  ): TargetReport {
    const falhas = estado === "ok" || estado === "fim_da_janela" ? [] : codigos;
    return { round_id: r?.id ?? null, round_no: r?.round_no ?? null, estado, codigos, falhas, linhas, pronta, estavel };
  }

  async work(): Promise<void> {
    // 1. O plano das jornadas.
    const wanted = this.req.modo === "correr" && this.req.roundIds?.length ? new Set(this.req.roundIds) : null;
    let toRead: RoundRow[] = [];
    const toClose: RoundRow[] = [];
    // Depois de D+10, à espera da 1.ª leitura em publicar (estável só em
    // observar): lêem-se depois das outras e, sem interessados, fecham.
    const pending = new Set<string>();
    for (const r of this.rounds) {
      if (r.date_status === "cancelada") continue;
      if (this.forced) {
        if (wanted && !wanted.has(r.id)) continue;
        if (r.date_status !== "confirmada" || !r.date || r.date > this.today) {
          if (wanted) this.report.jornadas.push(this.targetReport(r, r.date && r.date > this.today ? "futura" : "sem_data"));
          continue;
        }
        toRead.push(r);
        continue;
      }
      const due = roundDue(
        { date: r.date, date_status: r.date_status, first_start_time: this.firstStart(r.id) },
        this.state(`jornada:${r.id}`),
        this.now,
        this.tz,
        this.writeMode,
      );
      if (due.closeNow) toClose.push(r);
      else if (due.due) {
        toRead.push(r);
        if (due.pending) pending.add(r.id);
      }
    }

    // 2. Sem link (a partir de D+1) ou com um link que não é do site.
    const usable: RoundRow[] = [];
    for (const r of toRead) {
      if (!r.results_url) {
        if (this.forced || (r.date && dayDiff(r.date, this.today) >= 1)) await this.failure(r, "sem_url", ["sem_url"], null);
        else this.report.jornadas.push(this.targetReport(r, "sem_url_ainda"));
        continue;
      }
      if (trofeuUrlKind(r.results_url) !== "jornada") {
        await this.failure(r, "invariante", ["url"], null);
        continue;
      }
      usable.push(r);
    }
    toRead = usable;

    // 3. Em publicar, só as jornadas com interessados ("Vou", prova ligada,
    //    ou já com uma linha nossa). O "Ler agora" do admin lê todas.
    if (this.writeMode === "publicar" && !this.forced && toRead.length) {
      const ids = toRead.map((r) => r.id);
      const vou = await selectIn<{ round_id: string }>(
        this.sb, "cup_participations", "round_id", "round_id", ids, "id", (q) => q.eq("decision", "vou"),
      );
      const linked = await selectIn<{ cup_round_id: string }>(this.sb, "race_events", "cup_round_id", "cup_round_id", ids, "id");
      const interested = new Set<string>([
        ...vou.map((x) => x.round_id),
        ...linked.map((x) => x.cup_round_id),
        ...this.results.map((x) => x.round_id),
      ]);
      for (const r of toRead) {
        if (interested.has(r.id)) continue;
        // Uma pendente sem ninguém para quem publicar fecha já (em publicar).
        if (pending.has(r.id)) toClose.push(r);
        else this.report.jornadas.push(this.targetReport(r, "sem_interessados"));
      }
      toRead = toRead.filter((r) => interested.has(r.id));
    }

    // 4. A geral: com as jornadas lidas (≥ 6 h) ou 1×/dia numa janela.
    const geralUrl = this.ed.standings_url && trofeuUrlKind(this.ed.standings_url) === "geral" ? this.ed.standings_url : null;
    const inWindow = this.rounds.some((r) => roundInWindow({ date: r.date, date_status: r.date_status }, this.now, this.tz));
    let geralDue = this.forced
      ? !!this.ed.standings_url
      : !!this.ed.standings_url && standingsDue(toRead.length > 0, inWindow, this.state("geral"), this.now);
    if (geralDue && !geralUrl) {
      await this.failure(null, "invariante", ["url"], null);
      geralDue = false;
    }

    // 5. Páginas por volta: guarda uma para a geral; o resto fica para a
    //    próxima (as menos lidas primeiro).
    toRead.sort((a, b) =>
      Number(pending.has(a.id)) - Number(pending.has(b.id)) ||
      String(this.state(`jornada:${a.id}`)?.last_checked_at ?? "").localeCompare(String(this.state(`jornada:${b.id}`)?.last_checked_at ?? "")) ||
      String(b.date).localeCompare(String(a.date))
    );
    const slots = Math.max(0, this.http.maxPages - this.http.state.pages - (geralDue ? 1 : 0));
    for (const r of toRead.slice(slots)) this.report.jornadas.push(this.targetReport(r, "orcamento"));
    toRead = toRead.slice(0, slots);

    // 6. robots.txt, uma vez por volta com trabalho.
    if (toRead.length || geralDue) {
      const verdict = await checkRobots(this.http);
      this.report.robots = verdict;
      this.robotsChecked = true;
      if (verdict !== "livre") {
        for (const r of toRead) this.report.jornadas.push(this.targetReport(r, "robots"));
        toRead = [];
        geralDue = false;
      }
    }

    // 7. As jornadas, uma a uma (uma falha não desfaz as anteriores). Antes,
    //    em publicar, o "não sou eu" em toda a edição.
    if (this.writeMode === "publicar") await this.sweepRefused();
    for (const r of toRead) await this.readRound(r);
    // 8. A geral, depois das jornadas.
    if (geralDue && geralUrl) await this.readStandings(geralUrl);
    // 9. As jornadas que saíram da janela sem ficar estáveis.
    for (const r of toClose) await this.closeRound(r);
    // 10. O estado da edição.
    await this.finishEdition();
  }

  /** Uma leitura que falhou: estado, código e alerta (só na transição; a
   *  rede só ao fim de 48 h). Nada mais se escreve dessa página. */
  async failure(
    r: RoundRow | null,
    status: "invariante" | "regressao" | "rede" | "sem_url",
    codes: string[],
    summary: Record<string, unknown> | null,
  ): Promise<void> {
    const target = r ? `jornada:${r.id}` : "geral";
    const prev = this.state(target);
    // Uma falha de antes da marca de estável (a que a fechou sem a ler) não
    // conta para uma leitura depois dela (a pendente de publicar, "Ler agora").
    const stale = !!prev?.fail_since && !!prev?.stable_at && Date.parse(prev.fail_since) < Date.parse(prev.stable_at);
    const failSince = (!stale && prev?.fail_since) || this.nowIso;
    const all = [...codes];
    let alertCode: string | null = null;
    if (status === "rede") {
      if (this.now.getTime() - Date.parse(failSince) >= RETRY_ALERT_H * HOUR) {
        all.push("rede_48h");
        if (!(prev?.last_codes ?? []).includes("rede_48h")) alertCode = "rede_48h";
      }
    } else if (prev?.last_status !== status || !sameCodes(prev?.last_codes, all)) alertCode = status;
    await this.saveState({
      target,
      round_id: r?.id ?? null,
      url: r ? r.results_url : this.ed.standings_url,
      last_checked_at: this.nowIso,
      last_status: status,
      last_codes: all,
      fail_since: failSince,
      summary: summary ?? { estado: status, falhas: codes },
    } as Partial<StateRow> & { target: string });
    if (alertCode) {
      this.alert(alertCode, {
        round_id: r?.id ?? null,
        alvo: r ? "jornada" : "geral",
        codigos: all,
        linhas: typeof summary?.linhas === "number" ? summary.linhas : null,
      });
    }
    const rep = this.targetReport(r, status, all, false, false, typeof summary?.linhas === "number" ? summary.linhas : null);
    if (r) this.report.jornadas.push(rep);
    else this.report.geral = rep;
  }

  /** O falhanço de um pedido (rede, http, tipo, tamanho, url). */
  async fetchFailure(r: RoundRow | null, code: string, status: number | null): Promise<void> {
    const netlike = code === "rede" || code === "http";
    const c = code === "http" && status ? `http_${status}` : code;
    await this.failure(r, netlike ? "rede" : "invariante", [c], { estado: netlike ? "rede" : "invariante", falhas: [c] });
  }

  async bibKey(e: EnrollmentRow): Promise<string | null> {
    if (!this.bibKeys.has(e.id)) {
      const input = bibKeyInput(this.ed.id, e.bib);
      this.bibKeys.set(e.id, input ? await sha256Hex(input) : null);
    }
    return this.bibKeys.get(e.id) ?? null;
  }

  teamAt(e: EnrollmentRow, date: string | null): { team_id: string | null; team_other: string | null } {
    const hist = this.enrollmentTeams
      .filter((h) => h.enrollment_id === e.id && (!date || String(h.from_date) <= date))
      .sort((a, b) => String(b.from_date).localeCompare(String(a.from_date)));
    if (hist.length) return { team_id: hist[0].team_id ?? null, team_other: hist[0].team_other ?? null };
    return { team_id: e.team_id ?? null, team_other: e.team_other ?? null };
  }

  /** "Não sou eu" dado DEPOIS de a volta ler as inscrições: relê a recusa
   *  antes de cada jornada (e da geral), para a correspondência não voltar a
   *  propor a linha recusada nesta mesma volta. */
  async refreshRefusals(): Promise<void> {
    if (!this.enrollments.length) return;
    const fresh = await selectIn<{ id: string; match_refused_key: string | null; standings_refused_keys: string[] | null }>(
      this.sb, "cup_enrollments", "id, match_refused_key, standings_refused_keys", "id", this.enrollments.map((e) => e.id), "id",
    );
    const byId = new Map(fresh.map((x) => [x.id, x]));
    this.enrollments = this.enrollments.map((e) => {
      const f = byId.get(e.id);
      return f ? { ...e, match_refused_key: f.match_refused_key ?? null, standings_refused_keys: f.standings_refused_keys ?? [] } : e;
    });
  }

  /** As não confirmadas com a chave recusada, em toda a edição (1× por
   *  volta, em publicar). */
  async sweepRefused(): Promise<void> {
    const w = refusedWrites(this.enrollments.map((e) => ({ id: e.id, refusedKey: e.match_refused_key ?? null })), this.results);
    if (w.length) await this.applyResultWrites(w);
  }

  async readRound(r: RoundRow): Promise<void> {
    const target = `jornada:${r.id}`;
    const prev = this.state(target);
    const res = await fetchTrofeuPage(r.results_url!, this.http);
    if (!res.ok) {
      if (res.code === "orcamento") this.report.jornadas.push(this.targetReport(r, "orcamento"));
      else await this.fetchFailure(r, res.code, res.status);
      return;
    }
    // O HTML e as linhas oficiais não saem daqui.
    const check = checkRoundPage(parseRoundPage(res.html), {
      roundDate: r.date,
      categoryCodes: this.categoryCodes,
      courseDistancesM: this.distances(r.id),
      roundName: r.name,
      prev: prevOf(prev),
    });
    const summary = roundSummary(check);
    if (!check.ok) {
      const status = failedStatus(check.failures);
      await this.failure(r, status, check.failures, { ...summary, estado: status });
      return;
    }
    const hash = await sha256Hex(roundContentInput(check.rows));
    // Estável só em observar e a volta publica: a marca de observar não
    // conta (roundDue) — a página tem de estar pronta para os atletas.
    const pending = this.writeMode === "publicar" && !!prev?.stable_at && prev.stable_mode !== "publicar";
    const rd = readiness(pending ? { ...prev, stable_at: null } : prev, hash, this.now, roundWindowEnd(r.date!, this.tz));
    let stableAt = rd.stableAt;
    let stableMode: string | null = stableAt ? this.writeMode : null;
    if (pending && stableAt && !rd.readyAt) {
      // Depois de D+10 o fim da janela dava-a por estável sem estar pronta:
      // continua pendente (relê-se de 6 em 6 h, roundDue) com a marca antiga.
      stableAt = prev!.stable_at ?? null;
      stableMode = prev!.stable_mode ?? null;
    } else if (stableAt && prev?.stable_mode === "publicar" && prev.stable_at === stableAt) {
      // Um "Ler agora" em observar não desfaz a marca de publicar.
      stableMode = "publicar";
    }
    const codes = [...check.warnings];
    let athleteWrites = 0;
    let pubWritten = false;
    let matchMeta: Record<string, unknown> = {};
    if (this.writeMode === "publicar" && rd.readyAt) {
      const m = await this.matchRound(r, check);
      athleteWrites = m.writes;
      matchMeta = m.meta;
      if (m.escalao >= MASS_CATEGORY) {
        codes.push("escalao_errado_em_massa");
        if (!(prev?.last_codes ?? []).includes("escalao_errado_em_massa")) {
          this.alert("escalao_errado_em_massa", { round_id: r.id, alvo: "jornada", codigos: codes, escalao_diferente: band(m.escalao) });
        }
      }
      pubWritten = await this.writePublication(r.id, hash, { readyAt: rd.readyAt, stableAt });
    }
    await this.saveState({
      target,
      round_id: r.id,
      url: r.results_url,
      last_checked_at: this.nowIso,
      last_status: "ok",
      last_codes: codes,
      content_hash: hash,
      hash_seen_at: rd.hashSeenAt,
      ready_at: rd.readyAt,
      stable_at: stableAt,
      stable_mode: stableMode,
      fail_since: null,
      rows_total: check.stats.rowsTotal,
      rows_by_category: check.stats.byCategory,
      summary: { ...summary, ...matchMeta },
    } as Partial<StateRow> & { target: string });
    const changed = prev?.content_hash !== hash || (!prev?.ready_at && !!rd.readyAt) || (prev?.stable_at ?? null) !== stableAt ||
      (prev?.stable_mode ?? null) !== stableMode || athleteWrites > 0 || pubWritten || prev?.last_status !== "ok";
    if (changed) {
      this.info({
        round_id: r.id,
        alvo: "jornada",
        codigos: codes,
        linhas: check.stats.rowsTotal,
        por_escalao: check.stats.byCategory,
        pronta: !!rd.readyAt,
        estavel: !!stableAt,
        ...matchMeta,
      });
    }
    this.report.jornadas.push(this.targetReport(r, "ok", codes, !!rd.readyAt, !!stableAt, check.stats.rowsTotal));
  }

  /** A correspondência de uma jornada pronta (B.4) e as escritas dela. */
  async matchRound(r: RoundRow, check: RoundCheck): Promise<{ writes: number; escalao: number; meta: Record<string, unknown> }> {
    await this.refreshRefusals();
    const enrollments: MatchEnrollment[] = [];
    for (const e of this.enrollments) {
      const prof = this.profiles.get(e.user_id);
      const cat = prof ? cupCategoryFor(this.ed, this.categories, prof.birth_date, prof.gender, r.date) : null;
      enrollments.push({
        id: e.id,
        userId: e.user_id,
        bibNorm: normBib(e.bib),
        bibKey: await this.bibKey(e),
        refusedKey: e.match_refused_key ?? null,
        team: this.teamAt(e, r.date),
        categoryCode: cat?.code ?? null,
      });
    }
    const outcome = matchRoundLines({
      editionId: this.ed.id,
      roundId: r.id,
      check,
      enrollments,
      teams: this.teams,
      aliases: this.aliases,
      pointsTable: this.pointsTable,
      pointsBasis: this.ed.points_basis,
    });
    const confirmed = confirmedKeysOf(this.results);
    const writes = roundWrites(outcome, this.results.filter((x) => x.round_id === r.id), {
      byEnrollment: await outcomeHashes(outcome),
      confirmedKeys: confirmed,
    });
    await this.applyResultWrites(writes);
    // Só o clube de uma linha que ele já confirmou (antes destas escritas).
    const newAliases = await roundAliases(outcome, confirmed);
    const fresh = await this.insertAliases(newAliases.map((a) => ({ alias_norm: a, team_id: null })));
    if (fresh.unlinked) this.alert("clube_novo", { round_id: r.id, alvo: "jornada", novos: fresh.unlinked });
    for (const k of MATCH_KINDS) this.matchCounts[k] += outcome.counts[k];
    const statusOf = (w: ResultWrite) => (w.op === "insert" ? w.row.match_status : w.op === "update" ? w.set.match_status : undefined);
    const meta = {
      ligados: band(outcome.counts.linha),
      propostas: band(writes.filter((w) => statusOf(w) === "proposta").length),
      confirmadas_auto: band(writes.filter((w) => statusOf(w) === "confirmada").length),
      perdidas: band(writes.filter((w) => statusOf(w) === "perdida").length),
      recusados: band(outcome.counts.recusado),
      ausentes: band(outcome.counts.ausente),
      vizinhos: band(outcome.counts.ausente_vizinho),
      escalao_diferente: band(outcome.counts.escalao),
      clube_diferente: band(outcome.counts.clube + outcome.counts.clube_desconhecido),
      sem_dorsal: band(outcome.counts.sem_dorsal),
      dorsais_repetidos_inscricoes: outcome.bibDupEnrollments,
    };
    return { writes: writes.length, escalao: outcome.counts.escalao, meta };
  }

  async applyResultWrites(writes: ResultWrite[]): Promise<void> {
    const sb = this.sb;
    for (const w of writes) {
      if (w.op === "delete") {
        await run(sb.from("cup_results").delete().eq("enrollment_id", w.enrollment_id).eq("round_id", w.round_id));
        this.results = this.results.filter((x) => !(x.enrollment_id === w.enrollment_id && x.round_id === w.round_id));
      } else if (w.op === "update") {
        await run(sb.from("cup_results").update(w.set).eq("enrollment_id", w.enrollment_id).eq("round_id", w.round_id));
        this.results = this.results.map((x) =>
          x.enrollment_id === w.enrollment_id && x.round_id === w.round_id ? { ...x, ...w.set } as ResultDbRow : x
        );
      }
    }
    const inserts = writes.filter((w): w is Extract<ResultWrite, { op: "insert" }> => w.op === "insert").map((w) => w.row);
    if (inserts.length) {
      await run(sb.from("cup_results").insert(inserts));
      this.results.push(...inserts.map((row) => ({ ...row }) as ResultDbRow));
    }
    this.writes.cup_results += writes.length;
  }

  /** "Saiu" para os atletas: só em publicar e com a página pronta; nunca
   *  por cima de uma publicação manual (o results_ready_at fica). */
  async writePublication(roundId: string, hash: string, rd: { readyAt: string | null; stableAt: string | null }): Promise<boolean> {
    const pub = this.publications.get(roundId) ?? null;
    const want: PublicationRow = {
      round_id: roundId,
      content_hash: hash,
      results_ready_at: pub?.results_ready_at ?? rd.readyAt,
      source: pub?.source ?? "job",
      stable_at: pub?.stable_at ?? rd.stableAt,
    };
    if (pub && (Object.keys(want) as (keyof PublicationRow)[]).every((k) => (pub[k] ?? null) === (want[k] ?? null))) return false;
    await run(this.sb.from("cup_round_publication").upsert(want, { onConflict: "round_id" }));
    this.publications.set(roundId, want);
    this.writes.cup_round_publication += 1;
    return true;
  }

  /** Aliases novos (organizações): liga sozinho pelo nome/sigla de um clube
   *  da edição; os outros ficam "por ligar" (team_id null). */
  async insertAliases(list: { alias_norm: string; team_id: string | null }[]): Promise<{ inserted: number; unlinked: number }> {
    const known = new Set(this.aliases.map((a) => normText(a.alias_norm)));
    const fresh: { edition_id: string; alias_norm: string; team_id: string | null }[] = [];
    for (const a of list) {
      const n = normText(a.alias_norm);
      if (!n || n.length > 160 || known.has(n)) continue;
      known.add(n);
      fresh.push({ edition_id: this.ed.id, alias_norm: n, team_id: a.team_id ?? resolveTeamId(n, this.teams, []) });
    }
    if (!fresh.length) return { inserted: 0, unlinked: 0 };
    await run(this.sb.from("cup_team_aliases").upsert(fresh, { onConflict: "edition_id,alias_norm", ignoreDuplicates: true }));
    this.aliases.push(...fresh.map((f) => ({ alias_norm: f.alias_norm, team_id: f.team_id })));
    this.writes.cup_team_aliases += fresh.length;
    return { inserted: fresh.length, unlinked: fresh.filter((f) => !f.team_id).length };
  }

  async readStandings(url: string): Promise<void> {
    const prev = this.state("geral");
    const res = await fetchTrofeuPage(url, this.http);
    if (!res.ok) {
      if (res.code === "orcamento") this.report.geral = this.targetReport(null, "orcamento");
      else await this.fetchFailure(null, res.code, res.status);
      return;
    }
    const check = checkStandingsPage(parseStandingsPage(res.html), {
      seasonLabel: this.ed.season_label,
      categoryCodes: this.categoryCodes,
      pointsTable: this.pointsTable,
      roundDates: this.rounds
        .filter((r) => r.date && r.date_status !== "cancelada")
        .map((r) => ({ roundId: r.id, roundNo: Number(r.round_no), date: r.date })),
      prev: prevOf(prev),
      nowYear: Number(this.today.slice(0, 4)),
    });
    if (!check.ok) {
      const status = failedStatus(check.failures);
      await this.failure(null, status, check.failures, { ...standingsSummary(check, { unmappedTeams: 0 }), estado: status });
      return;
    }
    // A coluna Equipa: a lista oficial de coletividades (organizações).
    const teamNorms = [...new Set(check.rows.map((x) => x.teamNorm).filter((t) => t && t.length <= 160))];
    const fresh = await this.insertAliases(teamNorms.map((t) => ({ alias_norm: t, team_id: null })));
    if (fresh.unlinked) this.alert("clube_novo", { round_id: null, alvo: "geral", novos: fresh.unlinked });
    const unmappedTeams = teamNorms.filter((t) => !resolveTeamId(t, this.teams, this.aliases)).length;

    const hash = await sha256Hex(standingsContentInput(check.rows));
    const rd = readiness(prev, hash, this.now, FAR_FUTURE);
    let linkMeta: Record<string, string> = {};
    let athleteWrites = 0;
    if (this.writeMode === "publicar" && rd.readyAt) {
      const l = await this.linkStandings(check);
      linkMeta = l.meta;
      athleteWrites = l.writes;
    }
    const summary = standingsSummary(check, { unmappedTeams });
    await this.saveState({
      target: "geral",
      round_id: null,
      url,
      last_checked_at: this.nowIso,
      last_status: "ok",
      last_codes: [...check.warnings],
      content_hash: hash,
      hash_seen_at: rd.hashSeenAt,
      ready_at: rd.readyAt,
      stable_at: rd.stableAt,
      fail_since: null,
      rows_total: check.stats.rowsTotal,
      rows_by_category: check.stats.byCategory,
      summary: { ...summary, ...linkMeta },
    } as Partial<StateRow> & { target: string });
    const changed = prev?.content_hash !== hash || (!prev?.ready_at && !!rd.readyAt) || (!prev?.stable_at && !!rd.stableAt) ||
      athleteWrites > 0 || fresh.inserted > 0 || prev?.last_status !== "ok";
    if (changed) {
      this.info({
        round_id: null,
        alvo: "geral",
        codigos: [...check.warnings],
        linhas: check.stats.rowsTotal,
        pronta: !!rd.readyAt,
        estavel: !!rd.stableAt,
        equipas_por_ligar: unmappedTeams,
        ...linkMeta,
      });
    }
    this.report.geral = {
      ...this.targetReport(null, "ok", [...check.warnings], !!rd.readyAt, !!rd.stableAt, check.stats.rowsTotal),
      ligacao: linkMeta,
    };
  }

  /** A linha DELE na geral (B.5): pela chave da SUA linha confirmada e o ano
   *  do perfil — ou, sem nenhuma linha com ela, pela chave alternativa (1.º e
   *  último nome), que fica 'proposta' até ele confirmar; os pontos oficiais
   *  nas confirmadas (nunca com a geral por confirmar); a coletiva dos clubes
   *  com inscritos (conta da app sobre a geral oficial). */
  async linkStandings(check: StandingsCheck): Promise<{ writes: number; meta: Record<string, string> }> {
    const roundById = new Map(this.rounds.map((r) => [r.id, r]));
    // O "Sim"/"Não sou eu" da geral pode ter chegado a meio da volta.
    await this.refreshRefusals();
    this.standings = await selectAll<ExistingStanding>(() =>
      this.sb.from("cup_standings").select(STANDING_COLS).eq("edition_id", this.ed.id).order("enrollment_id")
    );
    // A chave da confirmada mais recente dele. Todas as confirmadas levam uma
    // chave que ELE confirmou: o job só confirma sozinho com a mesma
    // standings_key de uma confirmada dele (roundWrites), e o "Sim, sou eu"
    // só arrasta as propostas com a mesma chave (confirm_cup_result, M2) —
    // uma linha de outra pessoa com o dorsal dele fica 'proposta' e não
    // entra aqui.
    const latest = (enrollmentId: string): ResultDbRow | null => {
      const mine = this.results
        .filter((x) => x.enrollment_id === enrollmentId && x.match_status === "confirmada" && x.standings_key)
        .sort((a, b) =>
          String(roundById.get(b.round_id)?.date ?? "").localeCompare(String(roundById.get(a.round_id)?.date ?? "")) ||
          Number(roundById.get(b.round_id)?.round_no ?? 0) - Number(roundById.get(a.round_id)?.round_no ?? 0)
        );
      return mine[0] ?? null;
    };
    const rowKeys = await standingsRowKeys(this.ed.id, check, this.teams, this.aliases);
    const rowAltKeys = await standingsRowAltKeys(this.ed.id, check, this.teams, this.aliases);
    const link = linkStandings({
      check,
      rowKeys,
      rowAltKeys,
      enrollments: this.enrollments.map((e) => {
        const birth = this.profiles.get(e.user_id)?.birth_date;
        const y = birth && /^\d{4}/.test(birth) ? Number(birth.slice(0, 4)) : null;
        const row = latest(e.id);
        const st = this.standings.find((x) => x.enrollment_id === e.id);
        return {
          id: e.id,
          userId: e.user_id,
          standingsKey: row?.standings_key ?? null,
          altKey: row?.standings_alt_key ?? null,
          birthYear: y,
          refusedAltKeys: e.standings_refused_keys ?? [],
          confirmedKey: st && (st.match_status ?? "confirmada") === "confirmada" ? st.key_hash ?? null : null,
        };
      }),
    });
    let writes = 0;
    const sw = standingsWrites(link, this.standings, this.ed.id, this.now);
    await this.applyStandingWrites(sw);
    writes += sw.length;
    const pw = officialPointsWrites(link, this.results);
    await this.applyResultWrites(pw);
    writes += pw.length;

    const resolver = makeTeamResolver(this.teams, this.aliases);
    const withEnrollment = new Set(this.enrollments.map((e) => e.team_id).filter((t): t is string => !!t));
    const rules = {
      team_scoring: this.ed.team_scoring,
      team_min_athletes: this.ed.team_min_athletes,
      team_counting_n: this.ed.team_counting_n,
      pointsTable: this.pointsTable,
    };
    // Só as colunas Pk que já saíram (a legenda pode chegar antes dos pontos).
    const published = publishedPointColumns(check.rows);
    for (const [k, roundId] of check.legendMap) {
      if (!roundId || !roundById.has(roundId) || !published.has(k)) continue;
      const tw = teamResultWrites(teamTotals(check.rows, k, rules, resolver), this.teamResults, roundId, this.teams, withEnrollment);
      await this.applyTeamWrites(tw);
      writes += tw.length;
    }
    return {
      writes,
      meta: {
        ligadas: band(link.counts.ligada),
        ligadas_alternativa: band(link.counts.alternativa),
        propostas_geral: band(link.counts.proposta),
        recusadas_geral: band(link.counts.recusada),
        sem_linha: band(link.counts.sem_linha),
        repetidas: band(link.counts.repetida),
        ano_diferente: band(link.counts.ano),
      },
    };
  }

  async applyStandingWrites(writes: StandingWrite[]): Promise<void> {
    const sb = this.sb;
    for (const w of writes) {
      if (w.op === "insert") {
        await run(sb.from("cup_standings").insert(w.row));
        this.standings.push({ ...w.row });
      } else if (w.op === "update") {
        await run(sb.from("cup_standings").update(w.set).eq("enrollment_id", w.enrollment_id));
        this.standings = this.standings.map((x) => (x.enrollment_id === w.enrollment_id ? { ...x, ...w.set } : x));
      } else {
        await run(sb.from("cup_standings").delete().eq("enrollment_id", w.enrollment_id));
        this.standings = this.standings.filter((x) => x.enrollment_id !== w.enrollment_id);
      }
    }
    this.writes.cup_standings += writes.length;
  }

  async applyTeamWrites(writes: TeamResultWrite[]): Promise<void> {
    const sb = this.sb;
    for (const w of writes) {
      if (w.op === "insert") {
        await run(sb.from("cup_team_results").insert(w.row));
        this.teamResults.push({ ...w.row });
      } else if (w.op === "update") {
        await run(sb.from("cup_team_results").update(w.set).eq("round_id", w.round_id).eq("team_name", w.team_name));
        this.teamResults = this.teamResults.map((x) =>
          x.round_id === w.round_id && x.team_name === w.team_name ? { ...x, ...w.set } : x
        );
      } else {
        await run(sb.from("cup_team_results").delete().eq("round_id", w.round_id).eq("team_name", w.team_name));
        this.teamResults = this.teamResults.filter((x) => !(x.round_id === w.round_id && x.team_name === w.team_name));
      }
    }
    this.writes.cup_team_results += writes.length;
  }

  /** Fim de D+10 sem ficar estável: estável agora (neste modo), sem ler. Em
   *  publicar também a pendente sem interessados ou 48 h a falhar. */
  async closeRound(r: RoundRow): Promise<void> {
    await this.saveState(
      { target: `jornada:${r.id}`, round_id: r.id, stable_at: this.nowIso, stable_mode: this.writeMode } as Partial<StateRow> & { target: string },
    );
    if (this.writeMode === "publicar") {
      const pub = this.publications.get(r.id);
      if (pub?.results_ready_at && !pub.stable_at) {
        await run(this.sb.from("cup_round_publication").update({ stable_at: this.nowIso }).eq("round_id", r.id));
        this.publications.set(r.id, { ...pub, stable_at: this.nowIso });
        this.writes.cup_round_publication += 1;
      }
    }
    this.info({ round_id: r.id, alvo: "jornada", codigos: ["fim_da_janela"], estavel: true });
    this.report.jornadas.push(this.targetReport(r, "fim_da_janela", ["fim_da_janela"], false, true));
  }

  /** A linha 'edicao': os alertas da edição (robots, bib_scope) e o resumo. */
  async finishEdition(): Promise<void> {
    const prev = this.state("edicao");
    const prevCodes = prev?.last_codes ?? [];
    const codes = new Set<string>();
    let failSince: string | null = null;
    if (this.robotsChecked) {
      if (this.report.robots === "proibido") codes.add("robots_proibido");
      if (this.report.robots === "erro") {
        codes.add("robots_erro");
        failSince = prev?.fail_since ?? this.nowIso;
        if (this.now.getTime() - Date.parse(failSince) >= RETRY_ALERT_H * HOUR) codes.add("robots_48h");
      }
    } else {
      for (const c of prevCodes) if (c.startsWith("robots_")) codes.add(c);
      failSince = prev?.fail_since ?? null;
    }
    if (this.mode === "publicar" && this.ed.bib_scope !== "epoca") codes.add("bib_scope");
    for (const c of codes) {
      if (prevCodes.includes(c)) continue;
      if (c === "robots_proibido" || c === "robots_48h") this.alert("robots", { round_id: null, alvo: "edicao", codigos: [...codes] });
      if (c === "bib_scope") this.alert("bib_scope", { round_id: null, alvo: "edicao", codigos: [...codes] });
    }
    let dup: number | null = null;
    if (this.writeMode === "publicar") {
      const byBib = new Map<string, number>();
      for (const e of this.enrollments) {
        const b = normBib(e.bib);
        if (b) byBib.set(b, (byBib.get(b) ?? 0) + 1);
      }
      dup = [...byBib.values()].filter((n) => n >= 2).length;
    }
    this.report.dorsais_repetidos_inscricoes = dup;
    const list = [...codes];
    await this.saveState({
      target: "edicao",
      last_checked_at: this.nowIso,
      last_status: list.some((c) => c.startsWith("robots_")) ? "robots" : codes.has("bib_scope") ? "bib_scope" : "ok",
      last_codes: list,
      fail_since: failSince,
      summary: {
        modo: this.writeMode,
        sync_mode: this.ed.sync_mode,
        origem: this.forced ? "correr" : "cron",
        ultima_volta: this.nowIso,
        paginas: this.http.state.pages - this.pagesAtStart,
        jornadas_lidas: this.report.jornadas.filter((j) => j.estado === "ok").length,
        dorsais_repetidos_inscricoes: dup,
      },
    } as Partial<StateRow> & { target: string });
    if (this.forced && !this.logs.some((l) => l.level === "info")) {
      this.info({ round_id: null, alvo: "edicao", codigos: list, jornadas_lidas: this.report.jornadas.filter((j) => j.estado === "ok").length });
    }
  }
}

// ── Ensaio (C.6): lê e valida sem gravar; devolve só números ──────────────

export interface EnsaioInput {
  jornadas: string[];
  geral?: string | null;
  points_table?: number[] | null;
  team_min_athletes?: number | null;
  season_label?: string | null;
}

export interface EnsaioReport {
  modo: "ensaio";
  robots: RobotsVerdict;
  paginas: number;
  jornadas: Record<string, unknown>[];
  geral: Record<string, unknown> | null;
  cruzamento: (CrossReport & { jornada: number })[];
}

export type EnsaioOutcome = { status: "ok"; report: EnsaioReport } | { status: "robots_proibido" | "robots_erro" };

/** O ensaio de uma época inteira (ex.: a 33.ª, sem a criar na BD): os
 *  `/Resultados/{id}` das provas e o `/Trofeu/{id}` da geral. A data de
 *  cada página faz de data da jornada; a legenda da geral liga Pk à página
 *  pela data. Só o admin (o handler exige o JWT de admin; o cron corre
 *  sempre runSync, nunca isto). Não precisa da M2 — de propósito: não lê
 *  nem grava nada que um atleta leia; na BD só 1 linha agregada em
 *  app_logs. */
export async function runEnsaio(deps: SyncDeps, input: EnsaioInput): Promise<EnsaioOutcome> {
  const http = deps.http("admin");
  const robots = await checkRobots(http);
  if (robots !== "livre") return { status: robots === "proibido" ? "robots_proibido" : "robots_erro" };
  const now = deps.now();
  const codes = new Set(TROFEU_CATEGORY_CODES);
  const pointsTable = pointsTableOf(input.points_table) ?? [...TROFEU_POINTS_TABLE];
  const teamMin = Number(input.team_min_athletes) > 0 ? Number(input.team_min_athletes) : 4;

  const checks: (RoundCheck | null)[] = [];
  const jornadas: Record<string, unknown>[] = [];
  for (const url of input.jornadas) {
    const res = await fetchTrofeuPage(url, http);
    if (!res.ok) {
      checks.push(null);
      const netlike = res.code === "rede" || res.code === "http";
      const c = res.code === "http" && res.status ? `http_${res.status}` : res.code;
      jornadas.push({ url, estado: res.code === "orcamento" ? "orcamento" : netlike ? "rede" : "invariante", falhas: [c], k: null });
      continue;
    }
    const check = checkRoundPage(parseRoundPage(res.html), { roundDate: null, categoryCodes: codes, prev: null });
    checks.push(check);
    jornadas.push({
      url,
      ...roundSummary(check),
      k: null,
      hash: check.ok ? (await sha256Hex(roundContentInput(check.rows))).slice(0, 8) : null,
    });
  }

  let geral: Record<string, unknown> | null = null;
  const cruzamento: (CrossReport & { jornada: number })[] = [];
  if (input.geral) {
    const res = await fetchTrofeuPage(input.geral, http);
    if (!res.ok) {
      const netlike = res.code === "rede" || res.code === "http";
      const c = res.code === "http" && res.status ? `http_${res.status}` : res.code;
      geral = { estado: res.code === "orcamento" ? "orcamento" : netlike ? "rede" : "invariante", falhas: [c] };
    } else {
      const page = parseStandingsPage(res.html);
      const check = checkStandingsPage(page, {
        seasonLabel: input.season_label || page.seasonLabel,
        categoryCodes: codes,
        pointsTable,
        roundDates: checks.flatMap((c, i) => (c?.stats.date ? [{ roundId: `p${i}`, roundNo: i + 1, date: c.stats.date }] : [])),
        prev: null,
        nowYear: Number(localDay(now, "Europe/Lisbon").slice(0, 4)),
      });
      const teams = new Set(check.rows.map((x) => x.teamNorm).filter(Boolean));
      const s = standingsSummary(check, { unmappedTeams: teams.size });
      geral = {
        ...s,
        legenda: check.stats.legend.map((l) => ({ k: l.k, dia_mes: l.dayMonth, pagina: l.roundNo })),
      };
      checks.forEach((c, i) => {
        const hit = [...check.legendMap].find(([, id]) => id === `p${i}`);
        if (!hit) return;
        jornadas[i].k = hit[0];
        if (c) cruzamento.push({ jornada: i + 1, ...crossCheck(c, check, hit[0], pointsTable, { team_min_athletes: teamMin }) });
      });
    }
  }

  const report: EnsaioReport = { modo: "ensaio", robots, paginas: http.state.pages, jornadas, geral, cruzamento };
  const falhas = new Set<string>();
  for (const j of jornadas) for (const f of (j.falhas as string[]) ?? []) falhas.add(f);
  for (const f of (geral?.falhas as string[] | undefined) ?? []) falhas.add(f);
  await insertLogs(deps.sb, [{
    user_id: null,
    level: "info",
    event: SYNC_EVENT,
    message: "ensaio",
    meta: {
      modo: "ensaio",
      jornadas: jornadas.length,
      jornadas_ok: jornadas.filter((j) => j.estado === "ok").length,
      geral: geral ? geral.estado : null,
      falhas: [...falhas],
      paginas: http.state.pages,
      cruzamento: cruzamento.map((c) => ({
        jornada: c.jornada,
        k: c.k,
        escaloes: c.escaloes,
        batem_so_com_pontos: c.escaloes_que_batem_so_com_pontos,
        fora_ocupam_lugar: c.fora_ocupam_lugar,
        geral_exata: c.chave_da_geral.ligam_exata,
        geral_alternativa: c.chave_da_geral.ligam_alternativa,
        geral_nao_ligam: c.chave_da_geral.nao_ligam,
      })),
    },
  }]);
  return { status: "ok", report };
}
