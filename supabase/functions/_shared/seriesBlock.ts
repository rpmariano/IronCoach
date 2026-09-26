// O bloco da competição por jornadas no prompt da Carol (specs/trofeu.md §5,
// Fase 2). 2026-09-26.
//
// @doutrina src/coach-knowledge/02-corrida-prova.md Bloco 2.3 #6
//
// SEM INSCRIÇÃO NADA MUDA. Quem não corre o circuito não pode notar diferença
// nenhuma (§1): para quem nunca se inscreveu, fetchSeriesBlock faz UMA leitura
// (cup_enrollments do próprio) e devolve null — o chat, o cartão diário e a
// análise de corrida ficam iguais byte a byte (testes de invariância em
// coach-chat/index.test.ts). Quem saiu há 30 dias ou menos leva uma só linha
// ("saiu, decisão dele"); aos 31, null.
//
// O PAPEL É SEMPRE CALCULADO. O que a Carol lê sai de funções puras em
// @formulas — arbitrateSeries (o papel de cada jornada), pointsBand (a faixa
// de pontos), attendanceCount (o contador) —, as mesmas do cliente. O modelo
// recebe o papel feito e a regra de não o refazer; sem data confirmada não há
// papel nem data inventada.
//
// O DORSAL NUNCA: as leituras listam as colunas uma a uma e nenhuma é a do
// dorsal de cup_enrollments. Também nunca entram os nomes dos clubes, o limiar
// de atletas da coletiva, dados de outros atletas nem cup_team_results (não se
// lê). Todas as leituras vão com o `sb` do pedido (JWT do atleta, RLS "own
// rows") — nada de service role.
//
// Dois tipos de função, como em carolMemory.ts:
//   - buildSeriesBlock: texto puro a partir das linhas já lidas (todo o texto
//     sai daqui; os testes de texto correm sobre ela);
//   - fetchSeriesBlock: as leituras, best-effort — qualquer erro dá null, e
//     uma tabela da M1 em falta nem sequer vai ao log.

// deno-lint-ignore-file no-explicit-any

import { arbitrateSeries, isSeriesIntent, type ArbitrationRace, type RoundRole, type SeriesIntent } from "./formulas/seriesArbitration.ts";
import { pointsBand, type CupResultLike, type PointsBand } from "./formulas/cupPoints.ts";
import {
  attendanceCount,
  classifyEnrollment,
  courseFor,
  cupCategoryFor,
  type CupCategory,
  type CupCourse,
  type CupCourseOverride,
  type CupEdition,
  type CupRound,
  type CupTeam,
  type EnrollmentKind,
} from "./formulas/cup.ts";
import { racePriorityOf } from "./formulas/mainRace.ts";
import { resolveExperienceLevel } from "./formulas/racePlanning.ts";

export type SeriesChannel = "chat" | "daily" | "run";

export type CupQuestion =
  | { key: "premio" }
  | { key: "clube" }
  | { key: "principais"; races: Array<{ id: string; name: string | null; date: string }> };

export interface SeriesBlock {
  /** O bloco, pronto a colar na cauda do prompt. */
  text: string;
  /** false = só a linha de quem saiu (sem papéis, sem ferramentas). */
  active: boolean;
  editionId: string;
  /** cup_competitions.short_name */
  competitionName: string;
  /** cup_competitions.round_label ("Jornada", "Etapa"…) */
  roundLabel: string;
  /** Há pelo menos uma jornada confirmada de hoje em diante. */
  hasCalendar: boolean;
  /** Um por jornada; [] se !active. */
  roles: RoundRole[];
  /** race_events.id → a intenção da jornada (a dele, senão o papel proposto).
   *  Só provas b/c de jornadas de hoje em diante; {} se !active. */
  intentByRaceId: Record<string, SeriesIntent>;
  /** As perguntas desta época que ainda faltam — só no chat e com inscrição ativa. */
  questions: CupQuestion[];
}

// ── As linhas lidas (as colunas de D.2, uma a uma) ────────────────────────

export interface SeriesEnrollmentRow {
  id: string;
  edition_id: string;
  team_id?: string | null;
  team_other?: string | null;
  is_federated?: boolean | null;
  season_goal?: string | null;
  status?: string | null;
  joined_at?: string | null;
  left_at?: string | null;
  [k: string]: unknown;
}

export interface SeriesEditionRow extends CupEdition {
  edition_no?: number | null;
  season_label?: string | null;
  points_mode?: string | null;
  points_table?: unknown;
  points_basis?: string | null;
  team_scoring?: string | null;
  competition?: { short_name?: string | null; round_label?: string | null } | null;
}

export interface SeriesRoundRow extends CupRound {
  name?: string | null;
  previous_date?: string | null;
  location?: string | null;
  terrain?: string | null;
}

export interface SeriesParticipationRow {
  round_id: string;
  decision?: string | null;
  decision_source?: string | null;
  intent?: string | null;
  intent_source?: string | null;
  [k: string]: unknown;
}

export interface SeriesSummaryRow {
  edition_id: string;
  attendances?: number | null;
  rounds_total?: number | null;
  category_rank?: number | null;
  [k: string]: unknown;
}

export interface SeriesSummaryEditionRow {
  id: string;
  season_label?: string | null;
  competition?: { short_name?: string | null } | null;
  [k: string]: unknown;
}

export interface SeriesBlockInput {
  /** O dia das contas (papéis, presenças, janelas): hoje, ou o da corrida
   *  que se comenta. */
  todayISO: string;
  /** O dia real contra o qual se decide a inscrição (ativa, ou saiu há ≤ 30
   *  dias). Omisso = `todayISO`; só a análise de corrida os separa. */
  statusTodayISO?: string | null;
  /** A leitura dos resultados confirmados falhou: sem eles não se sabe a
   *  posição de referência — a Carol não fala de pontos (e não diz que não há
   *  resultados). */
  resultsUnknown?: boolean;
  /** A leitura das notas falhou: não se sabe se ele já disse quando treina
   *  com o clube — a pergunta não se faz desta vez. */
  notesUnknown?: boolean;
  channel: SeriesChannel;
  /** Todas as inscrições do próprio (a leitura-porteiro). */
  enrollments: SeriesEnrollmentRow[] | null | undefined;
  /** A edição da inscrição, com `competition` (short_name, round_label). */
  edition: SeriesEditionRow | null | undefined;
  rounds?: SeriesRoundRow[] | null;
  participations?: SeriesParticipationRow[] | null;
  categories?: CupCategory[] | null;
  teams?: CupTeam[] | null;
  courses?: CupCourse[] | null;
  overrides?: CupCourseOverride[] | null;
  /** As race_events do atleta (as das jornadas e as principais). */
  races?: ArbitrationRace[] | null;
  /** As corridas ligadas às provas das jornadas (runs.race_id). */
  runs?: Array<{ race_id?: string | null }> | null;
  /** cup_results confirmados do próprio; `round_date` junta-se aqui se faltar. */
  results?: CupResultLike[] | null;
  summaries?: SeriesSummaryRow[] | null;
  summaryEditions?: SeriesSummaryEditionRow[] | null;
  profile?: { birth_date?: string | null; gender?: string | null; experience_level?: string | null } | null;
  /** coach_notes 'disponibilidade' (só no chat, para a pergunta do clube). */
  notes?: Array<{ note?: string | null }> | null;
}

// ── Datas e números em texto ──────────────────────────────────────────────

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DIA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function dayOf(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

/** a − b em dias de calendário (UTC). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "6 dez" — o dia sem zero e o mês abreviado. */
export function dayMonth(iso: string | null | undefined): string {
  const d = dayOf(iso);
  if (!d) return "";
  return `${Number(d.slice(8, 10))} ${MES[Number(d.slice(5, 7)) - 1]}`;
}

function weekday(iso: string): string {
  return DIA_SEMANA[new Date(`${iso}T00:00:00Z`).getUTCDay()];
}

/** 7 → "7 km", 7.4 → "7,4 km" (uma casa, vírgula, sem ",0"). */
function kmText(km: number): string {
  return `${String(Math.round(km * 10) / 10).replace(".", ",")} km`;
}

/** 'HH:MM:SS' (o `time` do PostgREST) → 'HH:MM'. */
function hhmm(v: unknown): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? "").trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

// ── Os textos fixos ───────────────────────────────────────────────────────

const KIND_TEXT: Record<EnrollmentKind, string> = {
  clube_elegivel: "clube que conta para as classificações finais",
  individual_elegivel: "individual, conta para a classificação individual",
  individual_aberto: "individual; não entra nas classificações finais",
  clube_aberto: "clube de fora; corre e aparece nos resultados, mas não entra nas classificações finais",
  clube_por_confirmar: "clube por confirmar; até lá, não entra nas classificações finais",
};

export const SEASON_GOAL_TEXT: Readonly<Record<string, string>> = {
  participar: "só participar",
  premio: "ir a prémio (classificação final)",
  pontos_clube: "pontos para o clube",
  marcas: "melhorar marcas",
};

export const DECISION_TEXT: Readonly<Record<string, string>> = {
  vou: "vai",
  nao_vou: "não vai",
  nao_sei: "ainda não sabe",
  nao_fui: "não foi",
};

const POINTS_WHY_TEXT: Record<string, string> = {
  sem_pontos: "esta competição não dá pontos individuais",
  modo_desconhecido: "a base da pontuação ainda não é conhecida",
  base_desconhecida: "a base da pontuação ainda não é conhecida",
  tabela_invalida: "a base da pontuação ainda não é conhecida",
  fora_da_classificacao: "a inscrição dele fica fora das classificações finais",
  sem_posicoes: "ainda não há resultados oficiais dele confirmados",
};

// Quantas jornadas se listam; as outras ficam num "+N".
const MAX_LISTED_ROUNDS = 6;
// Quem saiu há estes dias ou menos leva a linha "saiu"; depois, nada.
export const LEFT_LINE_DAYS = 30;
// A pergunta das principais: até 5 provas.
const MAX_PRINCIPAL_QUESTION = 5;

// ── A inscrição que conta ─────────────────────────────────────────────────

/** A inscrição ativa; senão a saída mais recente, se foi há ≤ 30 dias.
 *  null para quem nunca se inscreveu, saiu há mais tempo ou só tem épocas
 *  concluídas. `todayISO` é o dia REAL (o estado da inscrição é o de hoje):
 *  uma saída "no futuro" desse dia (d < 0) não é uma saída recente — era o
 *  que acontecia com o dia de uma corrida antiga, anterior à saída. */
export function pickSeriesEnrollment(
  enrollments: SeriesEnrollmentRow[] | null | undefined,
  todayISO: string,
): { enrollment: SeriesEnrollmentRow; active: boolean } | null {
  const rows = (enrollments || []).filter((e) => e && e.id && e.edition_id);
  const active = rows.find((e) => e.status === "ativa");
  if (active) return { enrollment: active, active: true };
  const today = dayOf(todayISO);
  const left = rows
    .filter((e) => e.status === "saiu" && dayOf(e.left_at))
    .sort((a, b) => String(b.left_at).localeCompare(String(a.left_at)))[0];
  if (!left || !today) return null;
  const d = daysBetween(today, dayOf(left.left_at)!);
  return d >= 0 && d <= LEFT_LINE_DAYS ? { enrollment: left, active: false } : null;
}

// ── O papel em texto ──────────────────────────────────────────────────────

function roleReasonText(role: RoundRole, label: string, roundNoById: Map<string, number | null | undefined>): string {
  const l = label.toLowerCase();
  const p = role.principal;
  const pDate = p ? dayMonth(p.date) : "";
  const pName = p?.name ? String(p.name).slice(0, 80) : null;
  const P = pName ? `prova principal (${pName}, ${pDate})` : `prova principal (${pDate})`;
  const n = Math.abs(role.offsetDays ?? 0);
  const ref = role.refRoundId ? `${l} ${roundNoById.get(role.refRoundId) ?? "?"}` : null;
  switch (role.reason) {
    case "e_principal": return "é a prova principal dele";
    case "dia_da_principal": return `é o dia da ${P}`;
    case "encostada_a_principal": return `a ${n} ${n === 1 ? "dia" : "dias"} ${(role.offsetDays ?? 0) < 0 ? "antes" : "depois"} da ${P}`;
    case "polimento_da_principal": return `polimento da ${P}`;
    case "recuperacao_da_principal": return `recuperação da ${P}`;
    case "recuperacao_da_maratona": return `a primeira depois da ${P}`;
    case "par_curto": return ref ? `a ${role.gapDays} dias da ${ref}, atacada` : `a ${role.gapDays} dias da prova principal`;
    case "recuperacao_da_jornada": return ref ? `ainda na recuperação da ${ref}` : "ainda na recuperação da prova principal";
    case "progressao": return `em progressão; ataca 1 em ${role.every}`;
    case "progressao_atacar": return `a vez de atacar (1 em ${role.every})`;
    case "livre": return "fora das janelas das principais";
    default: return "";
  }
}

function pointsLine(b: PointsBand): string {
  if (b.band === "desconhecida") return `Pontos: não fales de pontos (${POINTS_WHY_TEXT[b.why ?? ""] ?? POINTS_WHY_TEXT.base_desconhecida}).`;
  const basis = b.basis === "escalao" ? "no escalão" : "na geral";
  const prov = b.provisional
    ? ` (referência provisória: ${b.count} ${b.count === 1 ? "resultado confirmado" : "resultados confirmados"})`
    : "";
  if (b.band === "escada") {
    return b.position === 1
      ? `Pontos (${basis}): na posição de referência (1.º) valem ${b.points} — é o máximo${prov}.`
      : `Pontos (${basis}): na posição de referência (${b.position}.º) valem ${b.points}; o lugar acima vale ${b.nextPoints}${prov}.`;
  }
  if (b.band === "patamar") {
    // O patamar do topo não tem nada acima (nextPoints null): dizia "a 0
    // lugares do patamar acima (10 → null pontos)" (revisão pré-deploy da Fase 2).
    if (b.nextPoints == null) {
      return `Pontos (${basis}): está no patamar do topo — do ${b.block?.from}.º ao ${b.block?.to}.º todos têm ${b.points}; atacar não muda os pontos${prov}.`;
    }
    const d = b.placesToBoundary ?? 0;
    return d <= 3
      ? `Pontos (${basis}): está a ${d} ${d === 1 ? "lugar" : "lugares"} do patamar acima (${b.points} → ${b.nextPoints} pontos)${prov}.`
      : `Pontos (${basis}): entre o ${b.block?.from}.º e o ${b.block?.to}.º todos têm ${b.points}; atacar não muda os pontos — não fales de pontos${prov}.`;
  }
  return `Pontos (${basis}): da posição de referência (${b.position}.º) para baixo todos têm ${b.points}; atacar não muda os pontos${prov}.`;
}

// ── O bloco (puro) ────────────────────────────────────────────────────────

/** O bloco a partir das linhas lidas (D.3/D.4 do desenho da Fase 2). null
 *  sem inscrição ativa nem saída recente, ou sem a edição dela. */
export function buildSeriesBlock(input: SeriesBlockInput): SeriesBlock | null {
  const today = dayOf(input?.todayISO);
  if (!today) return null;
  const statusDay = dayOf(input.statusTodayISO) ?? today;
  const pick = pickSeriesEnrollment(input.enrollments, statusDay);
  // O dia das contas (papéis, lista, provas, contador). É o `todayISO` — menos
  // na análise de uma corrida registada ou reanalisada com atraso: aí
  // `todayISO` é a data da corrida, e com ele a "seguinte" podia ser uma
  // jornada que já passou, com o papel calculado como se ainda viesse aí.
  // As contas fazem-se no dia REAL e a jornada da corrida fica dita numa
  // linha à parte (revisão pré-deploy da Fase 2).
  const asOf = input.channel === "run" && statusDay > today ? statusDay : today;
  const lateRunDay = asOf !== today ? today : null;
  if (!pick) return null;
  const { enrollment } = pick;
  const edition = input.edition;
  if (!edition?.id || edition.id !== enrollment.edition_id) return null;
  const competitionName = String(edition.competition?.short_name ?? "").trim();
  if (!competitionName) return null;
  const roundLabel = String(edition.competition?.round_label ?? "").trim() || "Jornada";
  const l = roundLabel.toLowerCase();
  const ls = `${l}s`;

  // Saiu há ≤ 30 dias: uma linha, sem cabeçalho, sem papéis nem ferramentas.
  if (!pick.active) {
    const d = dayOf(enrollment.left_at)!;
    return {
      text: `O atleta saiu da competição ${competitionName} a ${d.slice(8, 10)}/${d.slice(5, 7)}, decisão dele; não o empurres a voltar.`,
      active: false,
      editionId: edition.id,
      competitionName,
      roundLabel,
      hasCalendar: false,
      roles: [],
      intentByRaceId: {},
      questions: [],
    };
  }

  const rounds = (input.rounds || []).filter((r): r is SeriesRoundRow => !!r && !!r.id);
  const participationOf = new Map((input.participations || []).filter(Boolean).map((p) => [p.round_id, p]));
  const races = (input.races || []).filter((r): r is ArbitrationRace => !!r);
  const raceOfRound = new Map<string, ArbitrationRace>();
  for (const r of races) if (r.cup_round_id && !raceOfRound.has(r.cup_round_id)) raceOfRound.set(r.cup_round_id, r);
  const withRun = new Set((input.runs || []).map((r) => r?.race_id).filter(Boolean));
  const profile = input.profile ?? null;

  // O percurso DO ATLETA em cada jornada (o escalão muda com a idade à data
  // da prova) — a mesma escolha que a sincronização faz no servidor.
  const courseOf = new Map<string, CupCourse | null>();
  for (const r of rounds) {
    const category = cupCategoryFor(edition, input.categories, profile?.birth_date ?? null, profile?.gender ?? null, r.date ?? null);
    courseOf.set(r.id, courseFor(r, input.courses, input.overrides, category));
  }
  const distanceOf = (r: SeriesRoundRow): number | null => {
    const raceKm = Number(raceOfRound.get(r.id)?.distance_km);
    if (Number.isFinite(raceKm) && raceKm > 0) return raceKm;
    const m = Number(courseOf.get(r.id)?.distance_m);
    return Number.isFinite(m) && m > 0 ? m / 1000 : null;
  };

  const roles = arbitrateSeries({
    rounds: rounds.map((r) => {
      const p = participationOf.get(r.id);
      const race = raceOfRound.get(r.id);
      return {
        id: r.id,
        round_no: r.round_no ?? null,
        date: r.date ?? null,
        date_status: r.date_status ?? null,
        distance_km: distanceOf(r),
        decision: p?.decision ?? null,
        intent: p?.intent ?? null,
        intent_source: p?.intent_source ?? null,
        done: !!race && (race.status === "concluida" || (race.id != null && withRun.has(race.id))),
      };
    }),
    races,
    level: resolveExperienceLevel(null, profile),
    seasonGoal: enrollment.season_goal ?? null,
    todayISO: asOf,
  });
  const roleOf = new Map(roles.map((o) => [o.roundId, o]));
  const roundNoById = new Map(rounds.map((r) => [r.id, r.round_no]));
  const roundDateById = new Map(rounds.map((r) => [r.id, dayOf(r.date)]));

  const kind = classifyEnrollment(enrollment, input.teams);
  const band = pointsBand(
    edition,
    kind,
    (input.results || []).filter(Boolean).map((x) => ({ ...x, round_date: x.round_date ?? roundDateById.get(x.round_id) ?? null })),
  );
  const seasonGoal = enrollment.season_goal ?? "participar";

  // A intenção das provas das jornadas daqui para a frente — é o que o taper
  // de cada uma lê (getTaperDays por intenção). A escolha dele manda.
  const intentByRaceId: Record<string, SeriesIntent> = {};
  for (const r of rounds) {
    const race = raceOfRound.get(r.id);
    const raceDay = dayOf(race?.date);
    if (!race?.id || !raceDay || raceDay < asOf) continue;
    const prio = racePriorityOf(race);
    if (prio !== "b" && prio !== "c") continue;
    const chosen = participationOf.get(r.id)?.intent;
    const value = isSeriesIntent(chosen) ? chosen : roleOf.get(r.id)?.intent ?? null;
    if (value) intentByRaceId[race.id] = value;
  }

  const hasCalendar = rounds.some((r) => r.date_status === "confirmada" && (dayOf(r.date) ?? "") >= asOf);

  const L: string[] = [];
  L.push(`--- COMPETIÇÃO POR JORNADAS (o atleta está inscrito) ---`);
  L.push(
    `${competitionName}, ${edition.edition_no ?? "?"}.ª edição (${edition.season_label ?? "?"}). ` +
      `Inscrição: ${kind ? KIND_TEXT[kind] : "por confirmar"}. Objetivo da época: ${SEASON_GOAL_TEXT[seasonGoal] ?? SEASON_GOAL_TEXT.participar}.`,
  );

  if (lateRunDay) {
    const own = rounds.find((r) => r.date_status !== "cancelada" && dayOf(r.date) === lateRunDay);
    if (own) {
      L.push(`Esta corrida (${dayMonth(lateRunDay)}) foi a ${roundLabel} ${own.round_no ?? "?"} · ${own.name ?? `${roundLabel} ${own.round_no ?? ""}`.trim()} — já passou; a seguinte é a primeira da lista abaixo.`);
    }
  }

  if (!hasCalendar) {
    L.push(`Calendário por publicar: ainda não há ${ls} com data confirmada. Não inventes datas nem calcules papéis; ajuda no que já se decide (as provas principais da época, a base, os dias de treino).`);
  } else {
    L.push(`Próximas ${ls} (o papel proposto sai das contas da app — é uma sugestão; ele decide):`);
    const upcoming = rounds
      .filter((r) => r.date_status !== "cancelada" && (!dayOf(r.date) || dayOf(r.date)! >= asOf))
      .sort((a, b) => (a.round_no ?? 0) - (b.round_no ?? 0) || String(a.id).localeCompare(String(b.id)));
    for (const r of upcoming.slice(0, MAX_LISTED_ROUNDS)) {
      const day = dayOf(r.date);
      const date = r.date_status === "confirmada" && day
        ? `${dayMonth(day)} (${weekday(day)})`
        : r.date_status === "adiada"
        ? "adiada"
        : day
        ? `~${dayMonth(day)} (data provável)`
        : "sem data";
      const prev = dayOf(r.previous_date);
      const changed = prev && prev !== day ? ` (mudou de ${dayMonth(prev)})` : "";
      const km = distanceOf(r);
      const start = hhmm(courseOf.get(r.id)?.start_time);
      const course = km ? ` · ${kmText(km)}${start ? ` às ${start}` : ""}` : "";
      const p = participationOf.get(r.id);
      const decision = `decisão: ${p?.decision ? DECISION_TEXT[p.decision] ?? "por decidir" : "por decidir"}`;
      const chosen = p?.intent_source === "atleta" && isSeriesIntent(p?.intent) ? `; ele escolheu ${p.intent}` : "";
      const role = roleOf.get(r.id);
      const paper = role?.intent
        ? `; papel proposto: ${role.intent} — ${roleReasonText(role, roundLabel, roundNoById)}`
        : role?.reason === "sem_data"
        ? "; papel só com data confirmada"
        : "";
      L.push(`- ${roundLabel} ${r.round_no ?? "?"} · ${date}${changed} · ${r.name ?? `${roundLabel} ${r.round_no ?? ""}`.trim()}${course} · ${decision}${chosen}${paper}`);
    }
    if (upcoming.length > MAX_LISTED_ROUNDS) L.push(`(+${upcoming.length - MAX_LISTED_ROUNDS} no calendário)`);
  }

  // O contador só com o objetivo "ir a prémio" (§4.3).
  if (seasonGoal === "premio") {
    const a = attendanceCount(edition, rounds, races, asOf, input.runs);
    if (a?.rule === "pct_minima") {
      L.push(
        `Presenças para a classificação final: ${a.done} feitas, precisa de ${a.required} em ${a.total}` +
          `${a.rounding ? " (arredondamento a confirmar no regulamento)" : ""}; ainda pode faltar a ${a.canMiss}.` +
          `${a.reachable ? "" : " Já não dá para chegar ao mínimo: di-lo uma vez, sem drama."}`,
      );
    } else if (a?.rule === "melhores_n") {
      L.push(`Contam as ${a.required} melhores; já tem ${a.done}.`);
    }
  }

  // Resultados por ler: só a faixa que dependia deles muda (sem eles dava
  // "ainda não há resultados" — falso); as outras razões mantêm-se.
  L.push(input.resultsUnknown && band.band === "desconhecida" && band.why === "sem_posicoes"
    ? `Pontos: não fales de pontos agora (os resultados dele não foram lidos).`
    : pointsLine(band));
  if (band.attendanceArgument) L.push(`Na classificação coletiva do clube contam todos os que comparecem: comparecer vale mais do que atacar.`);

  // As épocas anteriores (só com inscrição ativa) — presenças e o lugar dele,
  // nunca os pontos: "a Carol cala pontos" tem de continuar verificável.
  const editionById = new Map((input.summaryEditions || []).filter(Boolean).map((e) => [e.id, e]));
  const seasons = (input.summaries || [])
    .filter(Boolean)
    .map((s) => ({ s, e: editionById.get(s.edition_id) }))
    .filter((x) => x.e?.season_label && x.e?.competition?.short_name)
    .sort((a, b) => String(a.e!.season_label).localeCompare(String(b.e!.season_label)));
  for (const { s, e } of seasons) {
    const rank = Number.isInteger(s.category_rank) && (s.category_rank as number) > 0 ? `, ${s.category_rank}.º no escalão` : "";
    L.push(`Época anterior — ${e!.competition!.short_name} ${e!.season_label}: ${s.attendances ?? 0} de ${s.rounds_total ?? 0} presenças${rank}.`);
  }

  L.push(
    `Regras: as provas principais dele mandam sempre. O papel de cada ${l} é o desta lista — calculado; nunca o refaças de cabeça, nem inventes datas. ` +
      `Se ele escolher outro papel, explica uma vez o custo e aceita sem julgar. Com dor, doença ou um alarme, ele salta e não se discute; os pontos nunca pesam contra isso. ` +
      `Nunca uses o clube ou os colegas para o pressionar a correr, não fales de quantos atletas o clube precisa, nem de outros atletas ou das classificações deles.`,
  );
  if (input.channel === "chat") {
    L.push(`No balanço de uma ${l} (depois da prova), fecha com o papel da seguinte, tal como está nesta lista. O que ele decidir numa ${l} grava-se com set_cup_participation.`);
  } else if (input.channel === "daily") {
    L.push(`No cartão: se houver uma ${l} nos próximos 7 dias, uma frase com o dia, a distância e o papel proposto — nunca como o objetivo da época e sem mudar o plano.`);
  } else if (input.channel === "run") {
    L.push(`Se esta corrida foi uma ${l} (mesma data), fecha o comentário com o papel da seguinte, tal como está nesta lista.`);
  }

  // As 3 perguntas, uma vez por edição (§5) — só no chat. "Só participar" é
  // a omissão do ecrã de inscrição: é o "não sei" da spec.
  const questions: CupQuestion[] = [];
  if (input.channel === "chat") {
    if ((kind === "clube_elegivel" || kind === "individual_elegivel") && seasonGoal === "participar") questions.push({ key: "premio" });
    if (kind?.startsWith("clube_") && !input.notesUnknown && !(input.notes || []).some((n) => /\bclube\b/i.test(String(n?.note ?? "")))) {
      questions.push({ key: "clube" });
    }
    const lastRound = rounds.map((r) => dayOf(r.date)).filter((d): d is string => !!d).sort().at(-1) ?? null;
    const principals = races
      .filter((r) => {
        const d = dayOf(r.date);
        return r.id && d && racePriorityOf(r) === "a" && !r.cup_round_id && r.status !== "concluida" &&
          d >= today && (!lastRound || d <= lastRound);
      })
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)))
      .slice(0, MAX_PRINCIPAL_QUESTION)
      .map((r) => ({ id: String(r.id), name: r.name ?? null, date: dayOf(r.date)! }));
    if (principals.length) questions.push({ key: "principais", races: principals });
  }

  return {
    text: L.join("\n"),
    active: true,
    editionId: edition.id,
    competitionName,
    roundLabel,
    hasCalendar,
    roles,
    intentByRaceId,
    questions,
  };
}

// ── O turno do mapa da época (F.2) ────────────────────────────────────────

/** A mensagem de abertura quando o atleta vem do aviso "O mapa da época" do
 *  Início. Com `first` (a 1.ª vez nesta edição), junta as perguntas que ainda
 *  faltam — uma de cada vez. */
export function buildCupMapTurn(block: SeriesBlock, first: boolean): string {
  const l = block.roundLabel.toLowerCase();
  const ls = `${l}s`;
  const withoutCalendar = block.hasCalendar
    ? ""
    : `Ainda não há ${ls} com data confirmada: di-lo, não inventes datas nem papéis, e fica pelas principais. `;
  let text =
    `A app mostrou-lhe no Início o mapa da época de ${block.competitionName} e ele abriu o chat a partir daí. ` +
    `Apresenta-lho numa só mensagem, com o bloco COMPETIÇÃO POR JORNADAS à frente: as provas principais dele e as janelas delas, ` +
    `e o papel proposto de cada ${l} com data confirmada — os papéis são os da lista, calculados; não os refaças. ` +
    withoutCalendar +
    `Os papéis são sugestões: ele decide. O que ele disser grava-se com set_cup_participation; se escolher outro papel, explica uma vez o custo e aceita sem julgar. ` +
    `Se houver um plano aceite e as ${ls} a que ele vai não estiverem nele, propõe nesta mesma conversa o plano ajustado com propose_training_plan ` +
    `(replace_active_plan=true): cada ${l} como prova no dia dela, com os dias fáceis do papel antes (3 antes de uma atacada, 2 antes das outras), e as principais a mandar.`;
  if (!first || !block.questions.length) return text;
  text += `\n\nDepois do mapa, e uma de cada vez (espera pela resposta antes da seguinte), faz as perguntas desta época que ainda faltam:`;
  for (const q of block.questions) {
    if (q.key === "premio") {
      text += `\n- O prémio: a inscrição dele conta para a classificação final e o objetivo da época está em "só participar". ` +
        `Pergunta se quer ir a prémio; se disser que sim, grava com set_cup_season_goal (premio); se disser que não, fica como está e não voltas a perguntar.`;
    } else if (q.key === "clube") {
      text += `\n- O treino com o clube: pergunta em que dias e a que horas treina com o clube e grava com save_coach_note (categoria disponibilidade), ` +
        `a começar por "Treino com o clube:". Esses treinos são a qualidade da semana: não receites intervalos por cima deles.`;
    } else if (q.key === "principais") {
      const list = q.races.map((r) => `"${r.name ? String(r.name).slice(0, 80) : "prova sem nome"}" (${dayMonth(r.date)})`).join(", ");
      text += `\n- As provas principais: ${list} estão marcadas como principais (é a marcação por omissão da app). ` +
        `Confirma com ele se são mesmo; se alguma não for, passa-a a secundária com update_race_event (race_priority="b").`;
    }
  }
  return text;
}

/** O bloco na cauda de um prompt de texto (cartão diário, análise de
 *  corrida): vazio sem bloco, como memoryPromptSection. */
export function seriesPromptSection(text: string | null | undefined): string {
  return text ? `${text}\n\n` : "";
}

/** A fase de uma jornada (prova b/c com papel) no contexto das provas: sem
 *  macrociclo próprio — a afinação é a do papel (#6: 3 dias fáceis antes de
 *  uma atacada, 2 antes das outras). */
export function seriesRacePhaseText(intent: SeriesIntent, daysUntil: number, taperDays: number): string {
  if (daysUntil <= 0) return "Dia da jornada (ou já passou)";
  if (intent === "saltar") return `Jornada que, pelas contas, se salta (faltam ${daysUntil} dias); se ele for, ${taperDays} dias fáceis antes`;
  if (daysUntil <= taperDays) return `Afinação para a jornada (papel: ${intent}; ${taperDays} dias fáceis antes; faltam ${daysUntil})`;
  return `Jornada de competição (papel: ${intent}); sem macrociclo próprio — ${taperDays} dias fáceis antes dela`;
}

// ── As leituras ───────────────────────────────────────────────────────────

const MISSING_CODES = new Set(["42P01", "PGRST205", "PGRST202", "42883", "PGRST200"]);

/** A tabela/função da M1 ainda não existe nesta BD (a mesma régua do
 *  cliente, isCupSchemaMissing em src/store/cupSlice.js). */
export function isCupSchemaMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown };
  if (typeof e.code === "string" && MISSING_CODES.has(e.code)) return true;
  const msg = String(e.message ?? "");
  return /relation .*cup_.* does not exist|Could not find the (table|function) .*cup_|Could not find the function public\.(enroll_cup|update_enrollment|leave_cup|set_participation)/i
    .test(msg);
}

// As colunas, uma a uma: nunca `*` (o dorsal vive em cup_enrollments).
const ENROLLMENT_COLUMNS = "id, edition_id, team_id, team_other, is_federated, season_goal, status, joined_at, left_at";
const EDITION_COLUMNS =
  "id, edition_no, season_label, status, points_mode, points_table, points_basis, team_scoring, counting_rule, counting_value, age_rule, " +
  "competition:cup_competitions(short_name, round_label)";
const ROUND_COLUMNS = "id, round_no, name, date, date_status, previous_date, location, terrain";
const PARTICIPATION_COLUMNS = "round_id, decision, decision_source, intent, intent_source";
const CATEGORY_COLUMNS = "edition_id, code, gender, min_age, max_age, course_code";
const TEAM_COLUMNS = "id, edition_id, kind, eligible_final";
const RACE_COLUMNS = "id, name, date, distance_km, race_type, race_priority, status, cup_round_id";
const RESULT_COLUMNS = "round_id, position, category_position, match_status";
const SUMMARY_COLUMNS = "edition_id, attendances, rounds_total, category_rank";
// As principais que acabaram há mais do que isto já não mexem nos papéis
// (a recuperação mais longa, #2, é de 42 dias).
const RACE_LOOKBACK_DAYS = 60;

/** Um erro de leitura: null, e só vai ao log se não for a M1 em falta. Nunca
 *  linhas nem ids — só a mensagem. */
function readFailed(error: any): null {
  if (!isCupSchemaMissing(error)) console.warn("seriesBlock: leitura falhou:", error?.message ?? String(error));
  return null;
}

/** Uma leitura acessória (resultados, épocas anteriores, notas) que falhou
 *  não apaga o bloco todo — e com ele as SERIES_TOOLS: fica vazia, com um
 *  aviso (revisão pré-deploy da Fase 2). As leituras de que os papéis
 *  dependem continuam a dar null em erro. */
// deno-lint-ignore no-explicit-any
function optionalFailed(r: any, what: string): boolean {
  if (!r?.error) return false;
  if (!isCupSchemaMissing(r.error)) console.warn(`seriesBlock: ${what} não lido(s):`, r.error?.message ?? String(r.error));
  return true;
}

/** O bloco do atleta, ou null (sem inscrição, ou em qualquer erro). Uma só
 *  leitura para quem nunca se inscreveu; duas para quem saiu há ≤ 30 dias.
 *  `opts.statusTodayISO`: o dia real, quando `todayISO` não o é (a análise
 *  de uma corrida registada com atraso) — a inscrição decide-se contra ele;
 *  no canal 'run' as contas também (a jornada da corrida fica numa linha à
 *  parte). */
export async function fetchSeriesBlock(
  sb: any,
  userId: string,
  todayISO: string,
  opts: { channel: SeriesChannel; statusTodayISO?: string | null },
): Promise<SeriesBlock | null> {
  try {
    const today = dayOf(todayISO);
    if (!today) return null;
    const channel = opts?.channel ?? "chat";
    const statusToday = dayOf(opts?.statusTodayISO) ?? today;

    // Q0 — o porteiro: a única leitura de quem não está inscrito.
    const enrR = await sb.from("cup_enrollments").select(ENROLLMENT_COLUMNS).eq("user_id", userId);
    if (enrR.error) return readFailed(enrR.error);
    const enrollments: SeriesEnrollmentRow[] = enrR.data || [];
    const pick = pickSeriesEnrollment(enrollments, statusToday);
    if (!pick) return null;

    const enr = pick.enrollment;
    const editionQuery = () => sb.from("cup_editions").select(EDITION_COLUMNS).eq("id", enr.edition_id).maybeSingle();

    // Saiu há ≤ 30 dias: só a edição (o nome da competição).
    if (!pick.active) {
      const edR = await editionQuery();
      if (edR.error) return readFailed(edR.error);
      return buildSeriesBlock({ todayISO: today, statusTodayISO: statusToday, channel, enrollments, edition: edR.data });
    }

    // Q1 + Q2 — inscrição ativa, em paralelo.
    const ed = enr.edition_id;
    const [edR, roundsR, partsR, catsR, teamsR, racesR, profR, resultsR, summariesR, notesR] = await Promise.all([
      editionQuery(),
      sb.from("cup_rounds").select(ROUND_COLUMNS).eq("edition_id", ed).order("round_no", { ascending: true }),
      sb.from("cup_participations").select(PARTICIPATION_COLUMNS).eq("enrollment_id", enr.id),
      sb.from("cup_categories").select(CATEGORY_COLUMNS).eq("edition_id", ed),
      sb.from("cup_teams").select(TEAM_COLUMNS).eq("edition_id", ed),
      sb.from("race_events").select(RACE_COLUMNS).eq("user_id", userId)
        .or(`cup_round_id.not.is.null,date.gte.${addDaysISO(today, -RACE_LOOKBACK_DAYS)}`)
        .order("date", { ascending: true }).limit(300),
      sb.from("profiles").select("birth_date, gender, experience_level").eq("id", userId).maybeSingle(),
      sb.from("cup_results").select(RESULT_COLUMNS).eq("enrollment_id", enr.id).eq("match_status", "confirmada"),
      sb.from("cup_season_summaries").select(SUMMARY_COLUMNS).eq("user_id", userId).neq("enrollment_id", enr.id),
      channel === "chat"
        ? sb.from("coach_notes").select("note").eq("user_id", userId).eq("category", "disponibilidade")
        : Promise.resolve({ data: [], error: null }),
    ]);
    for (const r of [edR, roundsR, partsR, catsR, teamsR, racesR, profR]) {
      if (r?.error) return readFailed(r.error);
    }
    const resultsFailed = optionalFailed(resultsR, "resultados");
    const summariesFailed = optionalFailed(summariesR, "épocas anteriores");
    const notesFailed = optionalFailed(notesR, "notas");
    if (!edR.data) return null;

    const rounds: SeriesRoundRow[] = roundsR.data || [];
    const roundIds = rounds.map((r) => r.id).filter(Boolean);
    const roundIdSet = new Set(roundIds);
    const races: ArbitrationRace[] = racesR.data || [];
    const jornadaRaceIds = races.filter((r) => r.cup_round_id && roundIdSet.has(r.cup_round_id) && r.id).map((r) => r.id as string);
    const summaries: SeriesSummaryRow[] = summariesFailed ? [] : summariesR.data || [];
    const summaryEditionIds = [...new Set(summaries.map((s) => s.edition_id).filter(Boolean))];
    const none = Promise.resolve({ data: [], error: null });

    // Q3 — o que depende das jornadas e das épocas anteriores.
    const [coursesR, overridesR, runsR, pastEdR] = await Promise.all([
      roundIds.length ? sb.from("cup_round_courses").select("round_id, code, distance_m, start_time").in("round_id", roundIds) : none,
      // Leitura própria, não embed: a tabela não tem FK direta para cup_rounds.
      roundIds.length ? sb.from("cup_round_course_overrides").select("round_id, category_code, course_code").in("round_id", roundIds) : none,
      jornadaRaceIds.length ? sb.from("runs").select("race_id").eq("user_id", userId).in("race_id", jornadaRaceIds) : none,
      summaryEditionIds.length
        ? sb.from("cup_editions").select("id, season_label, competition:cup_competitions(short_name)").in("id", summaryEditionIds)
        : none,
    ]);
    for (const r of [coursesR, overridesR, runsR]) {
      if (r?.error) return readFailed(r.error);
    }
    const pastEdFailed = optionalFailed(pastEdR, "edições anteriores");

    return buildSeriesBlock({
      todayISO: today,
      statusTodayISO: statusToday,
      channel,
      enrollments,
      edition: edR.data,
      rounds,
      participations: partsR.data || [],
      categories: catsR.data || [],
      teams: teamsR.data || [],
      courses: coursesR.data || [],
      overrides: overridesR.data || [],
      races,
      runs: runsR.data || [],
      results: resultsFailed ? [] : resultsR.data || [],
      resultsUnknown: resultsFailed,
      summaries,
      summaryEditions: pastEdFailed ? [] : pastEdR.data || [],
      profile: profR.data ?? null,
      notes: notesFailed ? [] : notesR.data || [],
      notesUnknown: notesFailed,
    });
  } catch (e) {
    console.warn("seriesBlock: fetchSeriesBlock falhou:", (e as Error)?.message ?? e);
    return null;
  }
}
