// O papel de cada jornada a partir das linhas da competição, no cliente e no
// servidor (specs/trofeu.md §4.3–§4.4, Fase 3). 2026-09-27.
//
// @doutrina src/coach-knowledge/02-corrida-prova.md Bloco 2.3 #6
//
// PORQUÊ AQUI. O ecrã do Troféu, o hub da prova e o cartão diário mostram o
// papel proposto de cada jornada ("Pelas contas: controlar"); a Carol lê o
// mesmo papel no bloco COMPETIÇÃO POR JORNADAS. Os dois têm de dizer o mesmo
// (§5, "Nunca: a classificação de cabeça"), por isso a montagem da entrada de
// arbitrateSeries — o percurso do atleta em cada jornada, a distância, o
// "feita", o nível — vive numa só função pura, com as provas filtradas como
// o servidor as lê (fetchSeriesBlock: `cup_round_id` não nulo OU data ≥ hoje
// − 60 dias). seriesBlock.ts ainda tem a sua cópia desta montagem; a
// paridade está fixada em seriesBlock.test.ts (personas A–K) — se uma mudar,
// o teste parte.
//
// PROMOVER UMA JORNADA A PRINCIPAL (§4.3) é uma ação com custo: o taper de
// uma prova `a`, as jornadas à volta que mudam de papel, e as principais de
// fora que ficam perto demais (essas mandam sempre). promotionImpact diz esse
// custo ANTES de se gravar nada — simula `race_priority 'a'` na prova da
// jornada e compara os papéis.

import {
  arbitrateSeries,
  principalWindow,
  type ArbitrationRace,
  type RoundRole,
  type SeriesIntent,
} from "./seriesArbitration.ts";
import {
  courseFor,
  cupCategoryFor,
  type CupCategory,
  type CupCourse,
  type CupCourseOverride,
  type CupEdition,
  type CupRound,
} from "./cup.ts";
import { racePriorityOf } from "./mainRace.ts";
import { resolveExperienceLevel } from "./racePlanning.ts";
import { getTaperDays } from "./taper.ts";

export type { RoundRole } from "./seriesArbitration.ts";

// As principais que acabaram há mais do que isto já não mexem nos papéis (a
// recuperação mais longa, #2, é de 42 dias) — o mesmo corte da leitura do
// servidor (RACE_LOOKBACK_DAYS em seriesBlock.ts).
export const CUP_ROLES_RACE_LOOKBACK_DAYS = 60;

export interface CupRolesParticipation {
  round_id: string;
  decision?: string | null;
  intent?: string | null;
  intent_source?: string | null;
  [k: string]: unknown;
}

export interface CupRolesInput {
  edition: CupEdition | null | undefined;
  rounds: CupRound[] | null | undefined;
  /** As participações da inscrição ativa (uma por jornada). */
  participations?: CupRolesParticipation[] | null;
  categories?: CupCategory[] | null;
  courses?: CupCourse[] | null;
  overrides?: CupCourseOverride[] | null;
  /** As race_events do atleta — todas; filtram-se cá dentro como no servidor. */
  races?: ArbitrationRace[] | null;
  /** As corridas (runs.race_id) — é o que torna uma jornada "feita". */
  runs?: Array<{ race_id?: string | null }> | null;
  profile?: { birth_date?: string | null; gender?: string | null; experience_level?: string | null } | null;
  /** cup_enrollments.season_goal */
  seasonGoal?: string | null;
  todayISO: string;
}

function dayOf(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

/** As provas como o servidor as lê para o bloco da Carol. */
function racesAsRead(races: ArbitrationRace[] | null | undefined, today: string): ArbitrationRace[] {
  const cutoff = addDaysISO(today, -CUP_ROLES_RACE_LOOKBACK_DAYS);
  return (races || []).filter((r): r is ArbitrationRace =>
    !!r && (r.cup_round_id != null || (dayOf(r.date) ?? "") >= cutoff)
  );
}

/** O papel proposto de cada jornada — um por jornada, pela ordem de
 *  `input.rounds` (a mesma montagem de buildSeriesBlock). [] sem dia válido. */
export function cupRoundRoles(input: CupRolesInput): RoundRole[] {
  const today = dayOf(input?.todayISO);
  if (!today) return [];
  const edition = input.edition ?? null;
  const rounds = (input.rounds || []).filter((r): r is CupRound => !!r && !!r.id);
  const participationOf = new Map((input.participations || []).filter(Boolean).map((p) => [p.round_id, p]));
  const races = racesAsRead(input.races, today);
  const raceOfRound = new Map<string, ArbitrationRace>();
  for (const r of races) if (r.cup_round_id && !raceOfRound.has(r.cup_round_id)) raceOfRound.set(r.cup_round_id, r);
  const withRun = new Set((input.runs || []).map((r) => r?.race_id).filter(Boolean));
  const profile = input.profile ?? null;

  const distanceOf = (r: CupRound): number | null => {
    const raceKm = Number(raceOfRound.get(r.id)?.distance_km);
    if (Number.isFinite(raceKm) && raceKm > 0) return raceKm;
    const category = cupCategoryFor(edition, input.categories, profile?.birth_date ?? null, profile?.gender ?? null, r.date ?? null);
    const m = Number(courseFor(r, input.courses, input.overrides, category)?.distance_m);
    return Number.isFinite(m) && m > 0 ? m / 1000 : null;
  };

  return arbitrateSeries({
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
    seasonGoal: input.seasonGoal ?? null,
    todayISO: today,
  });
}

export interface PromotionChange {
  roundId: string;
  from: SeriesIntent | null;
  to: SeriesIntent | null;
}

export interface PromotionImpact {
  /** A prova da jornada (race_events.id). */
  raceId: string;
  /** Os dias de afinação de uma principal desta distância, para o nível dele. */
  taperDays: number;
  /** A recuperação depois dela (#2). */
  recoveryDays: number;
  /** As OUTRAS jornadas cujo papel proposto muda, pela ordem de `rounds`. */
  changes: PromotionChange[];
  /** As principais de fora (por concluir, de hoje em diante) cujas janelas se
   *  cruzam com a desta jornada — essas mandam sempre. Pela data. */
  near: ArbitrationRace[];
}

/** O custo de promover a jornada `roundId` a principal, antes de gravar.
 *  null sem prova ligada à jornada (sem prova não há o que promover). */
export function promotionImpact(input: CupRolesInput, roundId: string): PromotionImpact | null {
  const today = dayOf(input?.todayISO);
  if (!today || !roundId) return null;
  const all = input.races || [];
  const race = all.find((r) => !!r && r.cup_round_id === roundId && r.id != null);
  if (!race) return null;
  const level = resolveExperienceLevel(null, input.profile ?? null);

  const round = (input.rounds || []).find((r) => r?.id === roundId) ?? null;
  let km = Number(race.distance_km);
  if (!(Number.isFinite(km) && km > 0) && round) {
    const p = input.profile ?? null;
    const category = cupCategoryFor(input.edition ?? null, input.categories, p?.birth_date ?? null, p?.gender ?? null, round.date ?? null);
    const m = Number(courseFor(round, input.courses, input.overrides, category)?.distance_m);
    km = Number.isFinite(m) && m > 0 ? m / 1000 : NaN;
  }
  const distanceKm = Number.isFinite(km) && km > 0 ? km : null;
  const promoted: ArbitrationRace = { ...race, race_priority: "a", distance_km: distanceKm };

  const before = cupRoundRoles(input);
  const after = cupRoundRoles({ ...input, races: all.map((r) => (r === race ? promoted : r)) });
  const changes: PromotionChange[] = [];
  for (let i = 0; i < before.length; i++) {
    const b = before[i];
    const a = after[i];
    if (!b || !a || b.roundId === roundId) continue;
    if (b.intent !== a.intent) changes.push({ roundId: b.roundId, from: b.intent, to: a.intent });
  }

  const win = principalWindow(promoted, level);
  const taperDays = getTaperDays(distanceKm, "a", level, race.race_type ?? null);
  const J = dayOf(race.date);
  const near = !J ? [] : all
    .filter((r): r is ArbitrationRace => {
      if (!r || r === race || r.cup_round_id != null) return false;
      if (racePriorityOf(r) !== "a" || r.status === "concluida") return false;
      const P = dayOf(r.date);
      if (!P || P < today) return false;
      const w = principalWindow(r, level);
      const d = daysBetween(J, P); // jornada − principal
      // A jornada na janela da principal, ou a principal na da jornada.
      return (d >= -w.controlDays && d <= w.recoveryDays) || (-d >= -win.controlDays && -d <= win.recoveryDays);
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id ?? "").localeCompare(String(b.id ?? "")));

  return {
    raceId: String(race.id),
    taperDays,
    recoveryDays: win.recoveryDays,
    changes,
    near,
  };
}
