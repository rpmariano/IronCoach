// A arbitragem das jornadas com as provas principais (specs/trofeu.md §5, Fase 2).
//
// @doutrina src/coach-knowledge/02-corrida-prova.md Bloco 2.3 #6
// @doutrina src/coach-knowledge/02-corrida-prova.md Bloco 2.3 #1 (janela de polimento)
// @doutrina src/coach-knowledge/02-corrida-prova.md Bloco 2.3 #2 (janela de recuperação)
//
// PORQUÊ UMA FUNÇÃO PURA. O papel de cada jornada (atacar, controlar, trote,
// saltar) é SEMPRE calculado (§5, "Nunca: a classificação de cabeça"): o
// servidor põe-no no bloco da Carol e o cliente mostra-o no ecrã, e os dois
// têm de dizer o mesmo. A Carol recebe o papel feito e a regra de não o
// refazer. O golden das personas A–K (seriesPersonas.golden.json) fixa a
// tabela inteira.
//
// AS PRINCIPAIS MANDAM SEMPRE. Primeiro as janelas de cada principal (o dia,
// os 2 antes e os 4 depois: saltar; o polimento: controlar; a recuperação:
// trote), só depois as regras do nível. Principal = qualquer race_events com
// data e prioridade 'a' — incluindo race_priority null (a omissão da BD,
// racePriorityOf) e as já concluídas (a recuperação delas ainda conta). As
// provas das jornadas são criadas com 'b' explícito pela sincronização.
//
// A ESCOLHA DELE. O papel devolvido é o PROPOSTO: a intenção que o atleta
// gravou (intent_source 'atleta') nunca o muda nessa jornada — só entra na
// sequência das seguintes (se escolheu atacar, a seguinte vê um ataque).
//
// Sem imports de cup.ts (evita o ciclo): as formas das jornadas são locais e
// estruturais — aceitam as linhas de cup_rounds + cup_participations juntas.

import { getTaperDays, taperCategoryFor, isSeriesIntent, type SeriesIntent, type TaperCategory } from "./taper.ts";
import { getRecoveryDaysAfterRace } from "./recovery.ts";
import { categorizeDistance, isExperienceLevel } from "./vocabulary.ts";
import { racePriorityOf } from "./mainRace.ts";

export type { SeriesIntent } from "./taper.ts";
export { SERIES_INTENTS, isSeriesIntent } from "./taper.ts";

export type SeriesLevel = "iniciante" | "basico" | "medio" | "avancado";

export type RoleReason =
  | "sem_data"                 // provável, adiada ou sem data → sem papel (a Carol não calcula)
  | "cancelada"
  | "passada"                  // antes de hoje → sem papel (entra na sequência, se foi feita)
  | "nao_vai"                  // decisão 'nao_vou' ou 'nao_fui'
  | "e_principal"              // a própria jornada foi promovida a principal → atacar
  | "dia_da_principal"         // d = 0 → saltar
  | "encostada_a_principal"    // d ∈ [−2, −1] ∪ [1, 4] → saltar
  | "polimento_da_principal"   // d ∈ [−W, −3] → controlar
  | "recuperacao_da_principal" // d ∈ [5, R] → trote
  | "recuperacao_da_maratona"  // 1.ª jornada com d ∈ [5, R] depois de maratona/ultra, iniciante/básico → saltar
  | "par_curto"                // iniciante/básico: a última com esforço foi atacada há ≤ 7 dias → controlar
  | "recuperacao_da_jornada"   // a última atacada ainda está na recuperação (#2) → controlar
  | "progressao"               // iniciante/básico: controlar, à espera da vez
  | "progressao_atacar"        // iniciante/básico: a vez de atacar (1 em N)
  | "livre";                   // médio/avançado fora das janelas → atacar

export interface ArbitrationRound {
  id: string;
  round_no?: number | null;
  date?: string | null;               // YYYY-MM-DD
  date_status?: string | null;        // só 'confirmada' tem papel
  distance_km?: number | null;        // o percurso DO ATLETA (race_events.distance_km, senão courseFor)
  decision?: string | null;           // cup_participations.decision
  intent?: SeriesIntent | string | null; // cup_participations.intent
  intent_source?: string | null;      // 'atleta' | 'sugerida' | null
  done?: boolean;                     // prova da jornada concluída ou com corrida ligada (régua de attendanceCount)
  [k: string]: unknown;
}

export interface ArbitrationRace {    // qualquer race_events do atleta; filtra-se cá dentro
  id?: string | null;
  name?: string | null;
  date?: string | null;
  distance_km?: number | null;
  race_type?: string | null;
  race_priority?: string | null;      // null conta como 'a' (racePriorityOf)
  status?: string | null;
  cup_round_id?: string | null;
  [k: string]: unknown;
}

export interface ArbitrationInput {
  rounds: ArbitrationRound[];
  races: ArbitrationRace[];
  level: string | null | undefined;   // resolveExperienceLevel(null, profile); inválido → 'iniciante'
  seasonGoal?: string | null;         // cup_enrollments.season_goal
  todayISO: string;
}

export interface RoundRole {
  roundId: string;
  intent: SeriesIntent | null;        // o papel PROPOSTO; null = sem papel
  reason: RoleReason;
  principal: { id: string | null; name: string | null; date: string } | null; // nas razões de janela
  offsetDays: number | null;          // jornada − principal (dias); negativo = antes
  gapDays: number | null;             // par_curto / recuperacao_da_jornada: dias desde a referência
  refRoundId: string | null;          // a jornada atacada de referência; null = era a principal
  every: number | null;               // N da cadência (progressao*)
}

export interface PrincipalWindow {
  controlDays: number;
  recoveryDays: number;
  skipNextAfter: boolean;
}

// Saltar: o dia da principal, os 2 dias antes e os 4 depois.
export const SKIP_BEFORE_DAYS = 2;
export const SKIP_AFTER_DAYS = 4;
// "Pares de jornadas a 6–7 dias: iniciante e básico atacam só uma" (§5).
export const SHORT_PAIR_DAYS = 7;
// Iniciante e básico atacam 1 em N; "melhorar marcas" encurta N em um.
export const ATTACK_EVERY: Readonly<Record<"iniciante" | "basico", number>> = { iniciante: 3, basico: 2 };
// O polimento de uma principal nunca é mais curto do que isto (P−7 numa
// 5k/10k, P−14 numa meia, maratona ou trail, §5), mesmo quando o taper A do
// nível é menor (iniciante: 10k 7 dias, meia 10).
export const CONTROL_WINDOW_MIN_DAYS: Readonly<Record<TaperCategory, number>> = {
  "5k": 7,
  "10k": 7,
  meia: 14,
  maratona: 14,
  ultra_trail: 14,
};

// ── Utilitários de datas (strings ISO, sem fusos) ─────────────────────────

function dayOf(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

/** a − b em dias de calendário (UTC, sem horas de verão). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

function levelOf(level: string | null | undefined): SeriesLevel {
  return isExperienceLevel(level) ? level : "iniciante";
}

// ── As janelas de uma principal ───────────────────────────────────────────

/** As janelas de uma principal P para um nível (A.2 do desenho da Fase 2):
 *  - controlDays W = max(taper A de P, o mínimo da distância): de P−W a P−3,
 *    controlar;
 *  - recoveryDays R = a recuperação de P (#2): de P+5 a P+R, trote;
 *  - skipNextAfter: numa maratona ou ultra, o iniciante e o básico saltam a
 *    primeira jornada dessa recuperação.
 *  O taper vê um trail como ultra_trail; a recuperação vê só a distância (um
 *  trail de 25 km recupera como uma maratona) — é o que taper.ts e
 *  recovery.ts já fazem, não se muda aqui. */
export function principalWindow(principal: ArbitrationRace, level: string | null | undefined): PrincipalWindow {
  const lvl = levelOf(level);
  const km = principal?.distance_km ?? null;
  const type = principal?.race_type ?? null;
  const controlDays = Math.max(getTaperDays(km, "a", lvl, type), CONTROL_WINDOW_MIN_DAYS[taperCategoryFor(km, type)]);
  const recoveryDays = getRecoveryDaysAfterRace(km, lvl);
  const cat = categorizeDistance(km);
  const skipNextAfter = (lvl === "iniciante" || lvl === "basico") && (cat === "maratona" || cat === "ultra");
  return { controlDays, recoveryDays, skipNextAfter };
}

// ── A arbitragem ──────────────────────────────────────────────────────────

interface Principal {
  race: ArbitrationRace;
  date: string;
  win: PrincipalWindow;
}

interface WindowHit {
  intent: SeriesIntent;
  reason: RoleReason;
  p: Principal;
  d: number;
}

/** A última participação com esforço (ou a última principal). */
interface Effort {
  date: string;
  intent: SeriesIntent;
  distanceKm: number | null;
  roundId: string | null; // null = foi uma principal de fora da lista
}

// Com várias principais, ganha o papel mais severo.
const SEVERITY: Record<SeriesIntent, number> = { saltar: 3, trote: 2, controlar: 1, atacar: 0 };

const notGoing = (r: ArbitrationRound) => r.decision === "nao_vou" || r.decision === "nao_fui";
const confirmedDay = (r: ArbitrationRound) => (r.date_status === "confirmada" ? dayOf(r.date) : null);

/** O papel de cada jornada — um por jornada, PELA ORDEM de `input.rounds`.
 *
 *  Caminha pelas jornadas por data (sem data no fim), depois `round_no`,
 *  com o estado k (controladas seguidas desde o último ataque) e a última
 *  participação com esforço. Para cada jornada, por esta ordem: cancelada;
 *  sem data confirmada; as principais de fora da lista que ficaram para trás
 *  contam como um ataque (a progressão recomeça); passada (a feita entra na
 *  sequência com o que ele fez, `controlar` por omissão); não vai; a janela
 *  de uma principal; o nível. */
export function arbitrateSeries(input: ArbitrationInput): RoundRole[] {
  const rounds = (input?.rounds || []).filter((r): r is ArbitrationRound => !!r && typeof r === "object");
  const lvl = levelOf(input?.level);
  const today = dayOf(input?.todayISO) ?? "";

  const principals: Principal[] = (input?.races || [])
    .filter((r) => r && dayOf(r.date) && racePriorityOf(r) === "a")
    .map((r) => ({ race: r, date: dayOf(r.date)!, win: principalWindow(r, lvl) }))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.race.id ?? "").localeCompare(String(b.race.id ?? "")));

  const ownPrincipal = (r: ArbitrationRound) =>
    principals.find((p) => p.race.cup_round_id != null && p.race.cup_round_id === r.id) ?? null;

  // "A seguinte" de cada maratona/ultra (iniciante/básico): a 1.ª jornada
  // contada — confirmada, com data, a que ele não disse que não vai, e que
  // não é a própria principal — com d ∈ [5, R]. Uma já passada também conta
  // (se ele já fez a primeira, a seguinte é trote).
  const skipNext = new Map<ArbitrationRound, Principal>();
  for (const p of principals) {
    if (!p.win.skipNextAfter) continue;
    const next = rounds
      .filter((r) => confirmedDay(r) && !notGoing(r) && r.id !== p.race.cup_round_id)
      .map((r) => ({ r, d: daysBetween(confirmedDay(r)!, p.date) }))
      .filter((x) => x.d >= SKIP_AFTER_DAYS + 1 && x.d <= p.win.recoveryDays)
      .sort((a, b) => a.d - b.d || (a.r.round_no ?? 0) - (b.r.round_no ?? 0) || String(a.r.id).localeCompare(String(b.r.id)))[0];
    if (next && !skipNext.has(next.r)) skipNext.set(next.r, p);
  }

  const windowRole = (r: ArbitrationRound, D: string): WindowHit | null => {
    const own = ownPrincipal(r);
    if (own) return { intent: "atacar", reason: "e_principal", p: own, d: daysBetween(D, own.date) };
    let best: WindowHit | null = null;
    for (const p of principals) {
      const d = daysBetween(D, p.date);
      let hit: Pick<WindowHit, "intent" | "reason"> | null = null;
      if (d === 0) hit = { intent: "saltar", reason: "dia_da_principal" };
      else if (d >= -SKIP_BEFORE_DAYS && d <= SKIP_AFTER_DAYS) hit = { intent: "saltar", reason: "encostada_a_principal" };
      else if (d >= -p.win.controlDays && d <= -(SKIP_BEFORE_DAYS + 1)) hit = { intent: "controlar", reason: "polimento_da_principal" };
      else if (d >= SKIP_AFTER_DAYS + 1 && d <= p.win.recoveryDays) {
        hit = skipNext.get(r) === p
          ? { intent: "saltar", reason: "recuperacao_da_maratona" }
          : { intent: "trote", reason: "recuperacao_da_principal" };
      }
      if (!hit) continue;
      // Empate de severidade → a mais próxima; empate de distância → a mais
      // cedo (as principais já vêm por data e id).
      if (
        !best ||
        SEVERITY[hit.intent] > SEVERITY[best.intent] ||
        (SEVERITY[hit.intent] === SEVERITY[best.intent] && Math.abs(d) < Math.abs(best.d))
      ) best = { ...hit, p, d };
    }
    return best;
  };

  // As principais que são jornadas desta lista (confirmadas, com data) entram
  // na sequência pela própria jornada (e_principal → atacar); as outras,
  // quando ficam para trás.
  const roundsAsPrincipal = new Set(rounds.filter((r) => confirmedDay(r)).map((r) => r.id));

  const order = rounds
    .map((_, i) => i)
    .sort((a, b) => {
      const ra = rounds[a];
      const rb = rounds[b];
      return (dayOf(ra.date) ?? "9999").localeCompare(dayOf(rb.date) ?? "9999") ||
        (ra.round_no ?? 0) - (rb.round_no ?? 0) ||
        String(ra.id).localeCompare(String(rb.id));
    });

  const out: RoundRole[] = new Array(rounds.length);
  let k = 0;
  let last: Effort | null = null;
  let pi = 0;

  const apply = (r: ArbitrationRound, date: string, eff: SeriesIntent) => {
    const effort = { date, intent: eff, distanceKm: r.distance_km ?? null, roundId: r.id };
    if (eff === "atacar") { k = 0; last = effort; }
    else if (eff === "controlar") { k += 1; last = effort; }
    else if (eff === "trote") last = effort; // comparecer não é esforço: k não mexe
    // saltar: nada
  };

  for (const i of order) {
    const r = rounds[i];
    const role: RoundRole = {
      roundId: r.id,
      intent: null,
      reason: "sem_data",
      principal: null,
      offsetDays: null,
      gapDays: null,
      refRoundId: null,
      every: null,
    };
    out[i] = role;

    if (r.date_status === "cancelada") { role.reason = "cancelada"; continue; }
    const D = confirmedDay(r);
    if (!D) { role.reason = "sem_data"; continue; }

    // Uma principal é um ataque: a progressão recomeça depois dela.
    while (pi < principals.length && principals[pi].date < D) {
      const p = principals[pi++];
      if (p.race.cup_round_id != null && roundsAsPrincipal.has(p.race.cup_round_id)) continue;
      k = 0;
      last = { date: p.date, intent: "atacar", distanceKm: p.race.distance_km ?? null, roundId: null };
    }

    if (D < today) {
      role.reason = "passada";
      if (r.done) {
        // O que ele gravou; sem nada, controlar — e uma principal é um ataque.
        const eff: SeriesIntent = isSeriesIntent(r.intent) ? r.intent : ownPrincipal(r) ? "atacar" : "controlar";
        apply(r, D, eff);
      }
      continue;
    }

    if (notGoing(r)) { role.reason = "nao_vai"; continue; }

    const hit = windowRole(r, D);
    const prev = last as Effort | null;
    const gap = prev ? daysBetween(D, prev.date) : null;
    if (hit) {
      role.intent = hit.intent;
      role.reason = hit.reason;
      role.principal = { id: hit.p.race.id ?? null, name: hit.p.race.name ?? null, date: hit.p.date };
      role.offsetDays = hit.d;
    } else if (lvl === "medio" || lvl === "avancado") {
      if (prev?.intent === "atacar" && gap! <= getRecoveryDaysAfterRace(prev.distanceKm, lvl)) {
        role.intent = "controlar";
        role.reason = "recuperacao_da_jornada";
        role.gapDays = gap;
        role.refRoundId = prev.roundId;
      } else {
        role.intent = "atacar";
        role.reason = "livre";
      }
    } else {
      const N = Math.max(1, ATTACK_EVERY[lvl] - (input?.seasonGoal === "marcas" ? 1 : 0));
      if (prev?.intent === "atacar" && gap! <= SHORT_PAIR_DAYS) {
        role.intent = "controlar";
        role.reason = "par_curto";
        role.gapDays = gap;
        role.refRoundId = prev.roundId;
      } else if (prev?.intent === "atacar" && gap! <= getRecoveryDaysAfterRace(prev.distanceKm, lvl)) {
        role.intent = "controlar";
        role.reason = "recuperacao_da_jornada";
        role.gapDays = gap;
        role.refRoundId = prev.roundId;
      } else if (k >= N - 1) {
        role.intent = "atacar";
        role.reason = "progressao_atacar";
        role.every = N;
      } else {
        role.intent = "controlar";
        role.reason = "progressao";
        role.every = N;
      }
    }

    // A escolha dele não muda o papel proposto desta jornada; só a sequência.
    const eff: SeriesIntent = r.intent_source === "atleta" && isSeriesIntent(r.intent) ? r.intent : role.intent!;
    apply(r, D, eff);
  }

  return out;
}
