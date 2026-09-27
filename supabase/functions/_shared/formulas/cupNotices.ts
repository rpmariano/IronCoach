// Os avisos do Troféu no tick da Carol (specs/trofeu.md §8, §10 Fase 5) —
// puro, para os testes não precisarem de rede. 2026-09-27.
//
// QUEM. Só há avisos para quem a edição tem os avisos ligados pelo admin
// (cup_editions.notifications_enabled), a inscrição está ativa e ele ligou
// pelo menos um (cup_enrollments.notify_*, todos desligados por omissão):
// cupNoticesOn. As regras de jornada nos momentos race_* — o "regime do
// Troféu", cupRegimeOn — pedem mais: um aviso DE JORNADA (mudanças de data,
// prazo de inscrição que se aplique a ele, classificação). O calendário
// sozinho — o "Avisa-me quando sair" que a inscrição sem calendário liga
// (§4.2: "liga só esse aviso") — dá o cup_calendar e mais nada. Sem nada
// disto — hoje, toda a gente —, cupTickCandidates devolve a MESMA lista que
// recebeu (a mesma referência): o tick fica como era.
//
// O QUÊ. Com os avisos, os cup_* que ele ligou, com chave própria e frase
// fixa, sem Gemini: o prazo de inscrição, a mudança de data, a classificação
// e o calendário. No regime, também:
//   - as provas de jornada (race_events.cup_round_id desta edição, sem ser
//     principal) perdem a véspera (fica no chat e no cartão do dia), não têm
//     nada em trote/saltar/"Não vou", e a manhã diz a hora do percurso;
//   - máximo 3 notificações por jornada, contando as race_* dessa prova
//     (CUP_ROUND_PUSH_CAP), seja qual for a prioridade dela: chegado ao teto
//     — ou sem saber quantas saíram (leitura falhada) —, tudo o que é dessa
//     jornada sai. Uma jornada promovida a principal ('a') fica com a véspera
//     e as frases de sempre, mas conta e respeita o teto como as outras.
//
// PRIVACIDADE. Nenhuma frase leva lugar, pontos, clube, dorsal nem dados de
// terceiros: o estado que chega aqui nem os tem (CupNoticeState). O lugar e os
// pontos dizem-se no chat, a ele (coach-chat, turno cup_results).

import { nomeProprio, proactiveTab, type ServerProactiveCandidate } from "./proactiveTriggers.ts";
import { entryDeadlineNotice } from "./cup.ts";

export const CUP_NOTICE_TRIGGERS = ["cup_calendar", "cup_date_change", "cup_entry_deadline", "cup_results"] as const;
export type CupNoticeTrigger = typeof CUP_NOTICE_TRIGGERS[number];

export function isCupNoticeTrigger(t: unknown): t is CupNoticeTrigger {
  return typeof t === "string" && (CUP_NOTICE_TRIGGERS as readonly string[]).includes(t);
}

/** Notificações por jornada, contando as race_* da prova dessa jornada (§8). */
export const CUP_ROUND_PUSH_CAP = 3;
/** O prazo de inscrição avisa-se nas 48 h antes de fechar (§8). */
export const CUP_ENTRY_DEADLINE_PUSH_HOURS = 48;
/** Uma mudança de data é notícia nas 72 h seguintes; depois já está no ecrã. */
export const CUP_DATE_CHANGE_NEWS_HOURS = 72;
/** O calendário é notícia nos 14 dias seguintes à 1.ª jornada confirmada. */
export const CUP_CALENDAR_NEWS_DAYS = 14;
/** A classificação avisa-se até D + 13 (antes de +14 d, §8). */
export const CUP_RESULTS_MAX_DAYS = 14;
/** Uma mudança de data vista na app (coach_impressions 'moment') nesta janela não se notifica. */
export const CUP_DATE_CHANGE_SEEN_DAYS = 7;

// ── As chaves (contrato com o cliente: src/utils/cupPushRoute.js) ─────────
// O id da jornada é sempre o 2.º segmento; a data da mudança é a NOVA data —
// uma 2.ª mudança é outra notícia, com outra chave.

export const cupCalendarKey = (editionId: string) => `cup_calendar:${editionId}`;
export const cupDateChangeKey = (roundId: string, dateISO: string) => `cup_date_change:${roundId}:${dateISO}`;
export const cupEntryDeadlineKey = (roundId: string) => `cup_entry_deadline:${roundId}`;
export const cupResultsKey = (roundId: string) => `cup_results:${roundId}`;

/** A jornada de uma chave cup_date_change/cup_entry_deadline/cup_results (o
 *  cup_calendar é da edição: null). */
export function cupNoticeRoundId(key: string | null | undefined): string | null {
  const m = /^(?:cup_date_change|cup_entry_deadline|cup_results):([^:]+)/.exec(typeof key === "string" ? key : "");
  return m ? m[1] : null;
}

/** A prova de uma chave race_morning/race_eve/race_after (2.º segmento). */
export function raceIdOfRaceKey(key: string | null | undefined): string | null {
  const m = /^(?:race_morning|race_eve|race_after):([^:]+)/.exec(typeof key === "string" ? key : "");
  return m ? m[1] : null;
}

// ── O estado que o tick lê em lote (coach-proactive-tick/cupNoticeState.ts) ─

export interface CupNoticeState {
  edition: {
    id: string;
    notificationsEnabled: boolean;
    status: string;
    /** cup_competitions.short_name */
    competitionName: string | null;
    seasonLabel: string | null;
    /** cup_competitions.round_label ("Jornada", "Etapa"…) */
    roundLabel: string | null;
    entryMode: string | null;
    timeZone: string | null;
    /** A 1.ª vez que uma jornada da edição ficou confirmada (cup_audit_log). */
    calendarOutAt: string | null;
  };
  enrollment: {
    id: string;
    status: string;
    joinedAt: string | null;
    entryBy: string | null;
    notifyCalendar: boolean;
    notifyDateChanges: boolean;
    notifyEntryDeadline: boolean;
    notifyResults: boolean;
  };
  rounds: Array<{
    id: string;
    roundNo: number;
    name: string;
    date: string | null;
    dateStatus: string;
    previousDate: string | null;
    dateChangedAt: string | null;
    entryDeadlineAt: string | null;
    /** cup_round_publication.results_ready_at (job ou manual, tanto faz). */
    resultsReadyAt: string | null;
  }>;
  participations: Array<{ roundId: string; decision: string | null; intent: string | null; entryDoneAt: string | null; decidedAt: string | null }>;
  /** As provas dele ligadas a jornadas DESTA edição, de qualquer prioridade. */
  races: Array<{ id: string; roundId: string; priority: string | null }>;
  /** As dessas provas que têm corrida ligada (runs.race_id). */
  ranRaceIds: string[];
  /** Notificações já enviadas por jornada (roundPushCountsOf). */
  roundPushCounts: Record<string, number>;
  /** raceId → o ÚLTIMO instante em que um balanço dessa prova lhe chegou
   *  (raceAfterReachedAtOf). */
  raceAfterReachedAt: Record<string, string>;
  /** As chaves cup_date_change vistas na app (coach_impressions 'moment'). */
  seenKeys: string[];
  /** Que leituras acessórias correram bem. Uma que falhou cala só os avisos
   *  que dependem dela: sem as notificações enviadas não se sabe o teto — não
   *  há avisos, e as race_* de jornada ficam como no teto (fora da lista). */
  parts: { pushes: boolean; log: boolean; seen: boolean; calendar: boolean; publication: boolean; runs: boolean };
}

// ── Os candidatos ─────────────────────────────────────────────────────────

/** O que o tick precisa para um aviso do Troféu (ou uma race_* de jornada com
 *  frase própria): a frase fixa e o separador do toque. */
export interface CupInfo {
  editionId: string;
  roundId: string | null;
  body: string;
  tab: "home" | "coach";
}

export type CupNoticeCandidate = Omit<ServerProactiveCandidate, "trigger"> & { trigger: CupNoticeTrigger; cup: CupInfo };
export type TickCandidate = (ServerProactiveCandidate & { cup?: CupInfo }) | CupNoticeCandidate;

const RACE_TRIGGERS = new Set<string>(["race_morning", "race_eve", "race_after"]);
/** "Nada em trote, saltar, Não vou ou Não fui" (§8). */
const SKIP_INTENTS = new Set<string>(["trote", "saltar"]);
const DAY_MS = 86400000;
const NAME_MAX = 40;

function dayOf(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

function addDaysISO(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

function ms(v: string | null | undefined): number | null {
  if (typeof v !== "string" || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function clipName(name: string | null | undefined): string {
  return String(name ?? "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX).trim();
}

/** Há avisos do Troféu para ele: a edição ligada, a inscrição ativa e algum
 *  notify_* (ver o cabeçalho). */
export function cupNoticesOn(s: CupNoticeState | null | undefined): boolean {
  if (!s?.edition || !s.enrollment) return false;
  if (!s.edition.notificationsEnabled || s.edition.status === "encerrada") return false;
  if (s.enrollment.status !== "ativa") return false;
  const e = s.enrollment;
  return !!(e.notifyCalendar || e.notifyDateChanges || e.notifyEntryDeadline || e.notifyResults);
}

/** O prazo de inscrição é dele: inscrição por jornada e não é o clube que o
 *  inscreve (o Perfil mostra-lhe esse interruptor desligado e parado). */
function entryDeadlineApplies(s: CupNoticeState): boolean {
  return s.edition.entryMode === "por_jornada" && s.enrollment.entryBy !== "clube";
}

/** O regime do Troféu — as regras de jornada nos race_* (ver o cabeçalho):
 *  só com um aviso de jornada ligado. O notify_calendar não conta, nem um
 *  notify_entry_deadline que não se aplica a ele: nenhum dos dois se vê no
 *  Perfil como aviso de jornada, e não o podiam prender às regras. */
export function cupRegimeOn(s: CupNoticeState | null | undefined): boolean {
  if (!s || !cupNoticesOn(s)) return false;
  const e = s.enrollment;
  return !!(e.notifyDateChanges || e.notifyResults || (e.notifyEntryDeadline && entryDeadlineApplies(s)));
}

/** Quantas notificações já saíram de cada jornada: as cup_* com a jornada na
 *  chave e as race_* das provas dessa jornada. O calendário é da edição e não
 *  conta. A classificação junta ao balanço não é uma notificação à parte. */
export function roundPushCountsOf(
  pushRows: Array<{ key?: string | null }> | null | undefined,
  races: Array<{ id: string; roundId: string }> | null | undefined,
): Record<string, number> {
  const roundOfRace = new Map((races || []).filter((r) => r?.id && r.roundId).map((r) => [r.id, r.roundId]));
  const out: Record<string, number> = {};
  for (const row of pushRows || []) {
    const key = row?.key;
    const raceId = raceIdOfRaceKey(key);
    const roundId = cupNoticeRoundId(key) ?? (raceId ? roundOfRace.get(raceId) ?? null : null);
    if (roundId) out[roundId] = (out[roundId] ?? 0) + 1;
  }
  return out;
}

/** raceId → o ÚLTIMO instante em que um balanço dessa prova lhe chegou: a
 *  conversa entregue (coach_proactive_log) ou a notificação enviada
 *  (coach_proactive_pushes), a que vier depois. O último e não o 1.º: a
 *  conversa junta a classificação sempre que acontece depois de ela estar
 *  pronta (coach-chat, fetchCupResultFacts), mesmo que a notificação desse
 *  balanço tenha saído antes — basta UM balanço depois da classificação para
 *  ela já lhe ter chegado. */
export function raceAfterReachedAtOf(
  logRows: Array<{ key?: string | null; sent_at?: string | null }> | null | undefined,
  pushRows: Array<{ key?: string | null; sent_at?: string | null }> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of [...(logRows || []), ...(pushRows || [])]) {
    if (!row?.key || !row.key.startsWith("race_after:")) continue;
    const raceId = raceIdOfRaceKey(row.key);
    const at = ms(row.sent_at ?? null);
    if (!raceId || at == null) continue;
    const prev = ms(out[raceId]);
    if (prev == null || at > prev) out[raceId] = row.sent_at!;
  }
  return out;
}

// ── As frases (≤ 140, sem "!" nem emoji — validatePushText) ───────────────

const WEEKDAY = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MONTH = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "jornada 3 (Corrida CCD)" — o rótulo da competição em minúsculas
 *  ("jornada" e "etapa" são femininas: as frases dizem "a jornada 3"). O nome
 *  cai quando repete o rótulo ("Jornada 3"). */
export function cupRoundText(roundLabel: string | null | undefined, roundNo: number, name: string | null | undefined): string {
  const label = String(roundLabel ?? "").trim().toLowerCase() || "jornada";
  const head = `${label} ${roundNo}`;
  const n = clipName(name);
  return n && n.toLowerCase() !== head ? `${head} (${n})` : head;
}

/** "2027-01-24" → "domingo, 24 jan" (o dia da semana sem "-feira"). */
export function cupDayLabel(dateISO: string): string {
  const d = dayOf(dateISO);
  if (!d) return "";
  return `${WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()]}, ${Number(d.slice(8, 10))} ${MONTH[Number(d.slice(5, 7)) - 1]}`;
}

/** 570 → "9h30", 600 → "10h"; null sem hora. */
export function cupHourLabel(minutes: number | null | undefined): string | null {
  if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 0 || minutes >= 24 * 60) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** A manhã de uma jornada, com a hora do percurso dele (race_events.start_time,
 *  que a sincronização grava a partir de cup_round_courses). */
function jornadaMorningBody(c: ServerProactiveCandidate): string {
  const name = clipName(nomeProprio(c.raceName));
  const hour = cupHourLabel(c.startMinutes ?? null);
  return `Hoje é dia de prova${name ? `: ${name}` : ""}${hour ? `, partida às ${hour}` : ""}. ` +
    (c.hasFirstKmPace ? "Deixei-te o ritmo do primeiro km." : "Fala comigo antes da partida.");
}

/** O balanço de uma jornada com a classificação já saída (a junção, §8). */
function jornadaAfterBody(c: ServerProactiveCandidate): string {
  const name = clipName(nomeProprio(c.raceName));
  return `Vi o registo da ${name ? `prova ${name}` : "tua prova"} e já saiu a classificação. Vem fazer o balanço comigo.`;
}

// ── As regras ─────────────────────────────────────────────────────────────

type Round = CupNoticeState["rounds"][number];
type Participation = CupNoticeState["participations"][number];

function notGoing(p: Participation | undefined): boolean {
  return !p || p.decision !== "vou" || (!!p.intent && SKIP_INTENTS.has(p.intent));
}

/** A classificação ainda é notícia: até D + 13 e antes da véspera da
 *  jornada confirmada seguinte. */
function resultsWindowOpen(s: CupNoticeState, round: Round, todayISO: string): boolean {
  const d = dayOf(round.date);
  if (!d || todayISO < d || todayISO > addDaysISO(d, CUP_RESULTS_MAX_DAYS - 1)) return false;
  const next = (s.rounds || [])
    .filter((r) => r && r.id !== round.id && r.dateStatus === "confirmada" && (dayOf(r.date) ?? "") > d)
    .map((r) => dayOf(r.date)!)
    .sort()[0];
  return !next || todayISO < addDaysISO(next, -1);
}

function resultsReady(round: Round | undefined, now: Date): boolean {
  const at = ms(round?.resultsReadyAt ?? null);
  return at != null && at <= now.getTime();
}

function indexState(s: CupNoticeState) {
  const partOf = new Map<string, Participation>();
  for (const p of s.participations || []) if (p?.roundId) partOf.set(p.roundId, p);
  const roundOf = new Map<string, Round>();
  for (const r of s.rounds || []) if (r?.id) roundOf.set(r.id, r);
  // Sem a contagem (leitura falhada) não se sabe quantas saíram: a jornada
  // fica como no teto — nunca uma 4.ª por não se ter lido.
  const capped = (roundId: string) => !s.parts?.pushes || (s.roundPushCounts?.[roundId] ?? 0) >= CUP_ROUND_PUSH_CAP;
  return { partOf, roundOf, capped };
}

/** Os avisos cup_* que se aplicam agora, por esta ordem: prazo, data,
 *  classificação, calendário. Nenhum sem os avisos ligados, nem sem a
 *  contagem das notificações enviadas (sem ela não há teto). Uma leitura
 *  acessória em falta cala só os avisos que dependem dela. */
export function listCupNotices(s: CupNoticeState, now: Date, todayISO: string): CupNoticeCandidate[] {
  if (!cupNoticesOn(s) || !s.parts?.pushes) return [];
  const { partOf, capped } = indexState(s);
  const e = s.enrollment;
  const rounds = [...(s.rounds || [])].filter((r) => r?.id).sort((a, b) => (a.roundNo ?? 0) - (b.roundNo ?? 0));
  const out: CupNoticeCandidate[] = [];
  const nowMs = now.getTime();
  const base = { raceId: null, raceName: null, hasRun: false, silenceDays: null, anchorDate: null, anchorAt: null };
  const raceOfRound = new Map<string, string>();
  for (const r of s.races || []) if (r?.id && r.roundId && !raceOfRound.has(r.roundId)) raceOfRound.set(r.roundId, r.id);
  const push = (trigger: CupNoticeTrigger, key: string, round: Round | null, body: string, tab: "home" | "coach", extra: { hasRun?: boolean } = {}) => {
    out.push({
      ...base,
      raceId: round ? raceOfRound.get(round.id) ?? null : null,
      raceName: round ? clipName(round.name) || null : null,
      anchorDate: round ? dayOf(round.date) : null,
      ...extra,
      trigger,
      key,
      cup: { editionId: s.edition.id, roundId: round?.id ?? null, body, tab },
    });
  };
  const text = (r: Round) => cupRoundText(s.edition.roundLabel, r.roundNo, r.name);

  // O prazo de inscrição (§4.4): a régua do cartão do dia, a 48 h.
  if (e.notifyEntryDeadline) {
    for (const round of rounds) {
      const p = partOf.get(round.id);
      if (capped(round.id) || notGoing(p)) continue;
      const notice = entryDeadlineNotice({
        entryMode: s.edition.entryMode,
        entryBy: e.entryBy,
        decision: p!.decision,
        entryDoneAt: p!.entryDoneAt,
        dateStatus: round.dateStatus,
        deadlineAt: round.entryDeadlineAt,
        now,
        timeZone: s.edition.timeZone,
        windowHours: CUP_ENTRY_DEADLINE_PUSH_HOURS,
      });
      if (notice) push("cup_entry_deadline", cupEntryDeadlineKey(round.id), round, `A inscrição na ${text(round)} fecha ${notice.whenLabel}.`, "home");
    }
  }

  // A mudança de data de uma jornada "Vou": só se ele disse "Vou" antes da
  // mudança (depois, já sabia a data nova), nas 72 h seguintes, e se não a
  // viu na app.
  if (e.notifyDateChanges && s.parts.seen) {
    const seen = new Set(s.seenKeys || []);
    for (const round of rounds) {
      const p = partOf.get(round.id);
      const date = dayOf(round.date);
      const prev = dayOf(round.previousDate);
      const changedAt = ms(round.dateChangedAt);
      if (capped(round.id) || notGoing(p) || round.dateStatus !== "confirmada") continue;
      if (!date || !prev || prev === date || changedAt == null || date < todayISO) continue;
      if (changedAt > nowMs || nowMs - changedAt > CUP_DATE_CHANGE_NEWS_HOURS * 3600000) continue;
      const decidedAt = ms(p!.decidedAt);
      if (decidedAt != null && decidedAt > changedAt) continue;
      const key = cupDateChangeKey(round.id, date);
      if (seen.has(key)) continue;
      push("cup_date_change", key, round, `${capitalize(`a ${text(round)}`)} mudou para ${cupDayLabel(date)}.`, "home");
    }
  }

  // A classificação de uma jornada que ele correu. Se um balanço dessa prova
  // lhe chegou (notificação ou conversa) depois de a classificação estar
  // pronta, foi com ela (a junção, no coach-chat): não se repete. Se ainda
  // não chegou, a race_after de jornada fica À FRENTE na lista, com a frase
  // que a junta — e, saindo ela, esta cai na hora seguinte pela mesma regra.
  if (e.notifyResults && s.parts.publication && s.parts.runs && s.parts.log) {
    const ran = new Set(s.ranRaceIds || []);
    for (const round of rounds) {
      const p = partOf.get(round.id);
      const raceId = raceOfRound.get(round.id);
      if (capped(round.id) || notGoing(p) || !raceId || !ran.has(raceId)) continue;
      if (!resultsReady(round, now) || !resultsWindowOpen(s, round, todayISO)) continue;
      const reached = ms(s.raceAfterReachedAt?.[raceId] ?? null);
      if (reached != null && ms(round.resultsReadyAt)! <= reached) continue;
      push("cup_results", cupResultsKey(round.id), round, `Saiu a classificação da ${text(round)}. Vem ver comigo.`, "coach", { hasRun: true });
    }
  }

  // O calendário ("Avisa-me quando sair", §4.2): saiu depois de ele se
  // inscrever, há ≤ 14 dias. É da edição: não conta para nenhuma jornada.
  if (e.notifyCalendar && s.parts.calendar) {
    const out1 = ms(s.edition.calendarOutAt);
    const joined = ms(e.joinedAt);
    if (out1 != null && joined != null && out1 > joined && out1 <= nowMs && nowMs - out1 <= CUP_CALENDAR_NEWS_DAYS * DAY_MS) {
      const name = [clipName(s.edition.competitionName), clipName(s.edition.seasonLabel)].filter(Boolean).join(" ");
      push("cup_calendar", cupCalendarKey(s.edition.id), null, name ? `Saiu o calendário: ${name}.` : "Saiu o calendário da tua competição.", "home");
    }
  }
  return out;
}

/** A ordem de toda a lista do tick: os cup_* entram entre os momentos de
 *  sempre, sem mudar a ordem relativa deles. */
const TICK_ORDER = [
  "intervention", "race_morning", "race_eve", "race_conflict", "race_after",
  "cup_entry_deadline", "cup_date_change", "cup_results",
  "block_end", "silence", "week_review", "missed_workout",
  "cup_calendar", "leaderboard", "percentile_ready",
];
const rankOf = (t: string) => {
  const i = TICK_ORDER.indexOf(t);
  return i < 0 ? TICK_ORDER.length : i;
};

/** Cada cup_* entra antes do 1.º momento da lista com posição maior na ordem
 *  do tick. Sem cup_*, a lista que entrou. */
export function mergeCupCandidates(base: TickCandidate[], cup: CupNoticeCandidate[]): TickCandidate[] {
  if (!cup.length) return base;
  const out: TickCandidate[] = [...base];
  for (const c of [...cup].sort((a, b) => rankOf(a.trigger) - rankOf(b.trigger))) {
    const r = rankOf(c.trigger);
    const i = out.findIndex((x) => rankOf(x.trigger) > r);
    if (i < 0) out.push(c);
    else out.splice(i, 0, c);
  }
  return out;
}

/** O ÚNICO ponto de entrada do tick: a lista de listServerProactive com as
 *  regras de jornada e os avisos do Troféu. Sem avisos, a mesma referência;
 *  sem o regime (só o calendário), os race_* ficam intocados.
 *  `opts.notices === false`: sem avisos cup_* (a M3 recusou-os nesta
 *  execução) — as regras de jornada continuam. */
export function cupTickCandidates(
  base: ServerProactiveCandidate[],
  s: CupNoticeState | null | undefined,
  now: Date,
  todayISO: string,
  opts: { notices?: boolean } = {},
): TickCandidate[] {
  if (!s || !cupNoticesOn(s)) return base;
  const notices = opts.notices === false ? [] : listCupNotices(s, now, todayISO);
  if (!cupRegimeOn(s)) return mergeCupCandidates(base, notices);
  const { partOf, roundOf, capped } = indexState(s);
  const roundOfRace = new Map<string, { roundId: string; promoted: boolean }>();
  for (const r of s.races || []) if (r?.id && r.roundId) roundOfRace.set(r.id, { roundId: r.roundId, promoted: r.priority === "a" });
  const kept: TickCandidate[] = [];
  let changed = false;
  for (const c of base) {
    const race = RACE_TRIGGERS.has(c.trigger) && c.raceId ? roundOfRace.get(c.raceId) : undefined;
    if (!race) {
      kept.push(c);
      continue;
    }
    const { roundId } = race;
    // Uma jornada promovida a principal ('a') é tratada como principal — com
    // a véspera e as frases de sempre —, mas é uma jornada: conta para o teto
    // e respeita-o (§8, "máximo 3 por jornada").
    if (race.promoted) {
      if (capped(roundId)) changed = true;
      else kept.push(c);
      continue;
    }
    // Sem véspera numa jornada (fica no chat e no cartão do dia); nada em
    // trote, saltar ou sem "Vou"; e nada depois do teto.
    const p = partOf.get(roundId);
    if (c.trigger === "race_eve" || (p && notGoing(p)) || capped(roundId)) {
      changed = true;
      continue;
    }
    const round = roundOf.get(roundId);
    const body = c.trigger === "race_morning"
      ? jornadaMorningBody(c)
      : c.trigger === "race_after" && c.hasRun && !c.unlinkedRun && s.enrollment.notifyResults && s.parts.publication &&
          round && resultsReady(round, now) && resultsWindowOpen(s, round, todayISO)
      ? jornadaAfterBody(c)
      : null;
    if (body) {
      kept.push({ ...c, cup: { editionId: s.edition.id, roundId, body, tab: proactiveTab(c.trigger) } });
      changed = true;
    } else {
      kept.push(c);
    }
  }
  return !changed && !notices.length ? base : mergeCupCandidates(kept, notices);
}

/** A frase fixa de um aviso do Troféu (ou de uma race_* de jornada no
 *  regime), sem Gemini; null para os momentos de sempre. */
export function cupNoticeMessage(c: TickCandidate): { title: string; body: string } | null {
  if (c.cup?.body) return { title: "Carol", body: c.cup.body };
  // Nunca acontece (os cup_* nascem com frase), mas um cup_* nunca vai ao Gemini.
  if (isCupNoticeTrigger(c.trigger)) return { title: "Carol", body: "Tenho uma novidade da tua competição. Vem ver." };
  return null;
}

/** O separador que o toque abre: o do aviso, ou o de sempre. */
export function tickTab(c: TickCandidate): "home" | "coach" {
  if (c.cup?.tab) return c.cup.tab;
  return isCupNoticeTrigger(c.trigger) ? "home" : proactiveTab(c.trigger);
}
