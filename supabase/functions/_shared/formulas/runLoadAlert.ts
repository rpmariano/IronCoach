// A carga de corrida que merece conversa (pedido 2026-09-24).
//
// Até aqui o coach-daily-summary punha no "Aviso de hoje" do cartão da Carol,
// sempre que o ACWR passava de 1,5: "Carga de treino desta semana muito
// elevada (…). Considera um dia de recuperação ativa." Errado de três formas,
// todas vistas no mesmo dia (ACWR 1,64 com 3 corridas em 4 semanas):
//   1. O atleta só tinha feito o que o plano da Carol mandava — 12 km em 7
//      dias contra 17 km prescritos. A "sobrecarga" era o plano dela.
//   2. Com registos em só 2 das 4 semanas, a média crónica é quase zero e o
//      rácio sobe sozinho: é falta de histórico, não risco.
//   3. Sugerir mudanças ao plano não é trabalho do cartão: é conversa, no chat.
//
// Aqui fica só a decisão (pura): o rácio conta como risco quando há
// histórico que o sustente E a carga passou do que o plano previa (ou não há
// plano de corrida nesses dias). Quando conta, o coach-daily-summary abre um
// assunto por resolver (profiles.coach_intervention_status) em vez de
// escrever no cartão — o Início leva-o ao chat. A etiqueta no início do
// motivo é o que o distingue das outras intervenções (como a de objetivos em
// goalsIntervention.ts): sem coluna nova, sem migração. Vive em formulas/
// para o frontend a importar pelo @formulas (utils/carolTopics.js).

import { computeRunAcwr } from "./runAcwr.ts";
import { ACWR_DANGER } from "./acwr.ts";

export const RUN_LOAD_INTERVENTION_TAG = "[carga]";

/** Semanas (de 4) com pelo menos uma corrida para o rácio valer alguma
 *  coisa. Com 2, a média crónica é metade do que o atleta corre de facto. */
export const LOAD_HISTORY_MIN_WEEKS = 3;

/** Folga sobre o prescrito antes de a carga deixar de ser "a do plano" —
 *  uma rodagem de 6 km que dá 6,5 não é desvio. */
export const LOAD_PLAN_TOLERANCE = 1.1;

/** Ritmo para estimar os km de um item do plano que só tem minutos, quando
 *  o atleta não tem corridas com distância e duração para dar o dele. */
const FALLBACK_MIN_PER_KM = 6;

export interface LoadRun {
  date: string;
  distance_km?: number | string | null;
  duration_seconds?: number | null;
}

export interface LoadPlanItem {
  planned_date: string;
  kind: string;
  status?: string | null;
  target_distance_km?: number | string | null;
  target_duration_min?: number | string | null;
}

export interface RunLoadReading {
  /** null quando não há base crónica (nem uma corrida em 4 semanas). */
  ratio: number | null;
  acuteKm: number;
  chronicWeeklyKm: number;
  /** Km que o plano aceite previa para os mesmos 7 dias; null sem corridas no plano. */
  prescribedKm: number | null;
  /** Há itens do plano aceite (de qualquer tipo) nestes 7 dias. */
  hasPlan: boolean;
  historyWeeks: number;
  enoughHistory: boolean;
  followsPlan: boolean;
  /** O rácio passa do perigo, há histórico e a carga não é a do plano. */
  alert: boolean;
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** O ritmo do atleta (min/km) nas corridas com distância e duração. */
function athletePaceMinPerKm(runs: LoadRun[]): number {
  let km = 0;
  let sec = 0;
  for (const r of runs) {
    const d = Number(r.distance_km) || 0;
    const s = Number(r.duration_seconds) || 0;
    if (d > 0 && s > 0) { km += d; sec += s; }
  }
  const pace = km > 0 ? sec / 60 / km : 0;
  // Um ritmo absurdo (dados estragados) não serve de régua.
  return pace >= 3 && pace <= 12 ? pace : FALLBACK_MIN_PER_KM;
}

export function runLoadReading(
  { runs, planItems, today }: { runs: LoadRun[]; planItems: LoadPlanItem[]; today: string },
): RunLoadReading {
  const list = (runs || []).filter((r) => r && typeof r.date === "string" && r.date.slice(0, 10) <= today);
  const acwr = computeRunAcwr(list.map((r) => ({ date: r.date.slice(0, 10), distance_km: Number(r.distance_km) || 0 })), today);
  const ratio = acwr.chronicWeeklyKm > 0 ? acwr.ratio : null;

  // As 4 semanas da janela crónica, da mais antiga à de hoje.
  let historyWeeks = 0;
  for (let w = 0; w < 4; w++) {
    const from = addDaysISO(today, -27 + w * 7);
    const to = addDaysISO(today, -21 + w * 7);
    if (list.some((r) => r.date.slice(0, 10) >= from && r.date.slice(0, 10) <= to && (Number(r.distance_km) || 0) > 0)) historyWeeks++;
  }
  const enoughHistory = historyWeeks >= LOAD_HISTORY_MIN_WEEKS;

  const acuteStart = addDaysISO(today, -6);
  const inPlanWindow = (planItems || []).filter((i) =>
    i && i.status !== "cancelado" && typeof i.planned_date === "string" &&
    i.planned_date >= acuteStart && i.planned_date <= today);
  const planned = inPlanWindow.filter((i) => i.kind === "corrida");
  let prescribedKm: number | null = null;
  if (planned.length) {
    const pace = athletePaceMinPerKm(list);
    prescribedKm = planned.reduce((sum, i) => {
      const km = Number(i.target_distance_km) || 0;
      if (km > 0) return sum + km;
      const min = Number(i.target_duration_min) || 0;
      return sum + (min > 0 ? min / pace : 0);
    }, 0);
  }
  // Um plano que começou a meio da semana só responde pelos dias dele: as
  // corridas de antes não são "acima do que o plano previa".
  const planFrom = inPlanWindow.reduce((min, i) => (i.planned_date < min ? i.planned_date : min), today);
  const kmOnPlanDays = list
    .filter((r) => r.date.slice(0, 10) >= planFrom)
    .reduce((sum, r) => sum + (Number(r.distance_km) || 0), 0);
  const followsPlan = prescribedKm !== null && prescribedKm > 0 && kmOnPlanDays <= prescribedKm * LOAD_PLAN_TOLERANCE;

  return {
    ratio: ratio !== null ? Math.round(ratio * 100) / 100 : null,
    acuteKm: round1(acwr.acuteKm),
    chronicWeeklyKm: round1(acwr.chronicWeeklyKm),
    prescribedKm: prescribedKm !== null ? round1(prescribedKm) : null,
    hasPlan: inPlanWindow.length > 0,
    historyWeeks,
    enoughHistory,
    followsPlan,
    alert: ratio !== null && ratio > ACWR_DANGER && enoughHistory && !followsPlan,
  };
}

export function isRunLoadIntervention(reason: string | null | undefined): boolean {
  return typeof reason === "string" && reason.startsWith(RUN_LOAD_INTERVENTION_TAG);
}

/* O que distingue os dois motivos — a mesma constante escreve-o e lê-o, para
   uma frase reescrita não mudar em silêncio o que o Início mostra. */
const ABOVE_PLAN_MARKER = "o plano previa";

/** Correu mais do que o plano previa, ou o plano não tinha corridas nesses dias. */
export function runLoadInterventionKind(reason: string | null | undefined): "acima_do_plano" | "sem_plano" | null {
  if (!isRunLoadIntervention(reason)) return null;
  return (reason as string).includes(ABOVE_PLAN_MARKER) ? "acima_do_plano" : "sem_plano";
}

const num = (n: number) => String(n).replace(".", ",");

/** O motivo, escrito para a Carol (o atleta nunca o vê tal e qual). */
export function runLoadInterventionReason(r: RunLoadReading): string {
  const plano = r.prescribedKm !== null && r.prescribedKm > 0
    ? `, quando ${ABOVE_PLAN_MARKER} ${num(r.prescribedKm)} km`
    : `, sem corridas no plano para esses dias`;
  return `${RUN_LOAD_INTERVENTION_TAG} Carga de corrida: ${num(r.acuteKm)} km nos últimos 7 dias${plano}; ` +
    `a média das últimas 4 semanas é ${num(r.chronicWeeklyKm)} km/semana (ACWR ${num(r.ratio ?? 0)}). ` +
    `Vê com ele como se sente e se os próximos dias do plano devem mudar.`;
}

const PENDING = ["needed", "in_progress"];

/** Quantos dias para trás se procura um alerta que já tenha estado vivo. */
export const LOAD_ALERT_LOOKBACK_DAYS = 7;

type RunWithCreated = LoadRun & { created_at?: string | null };

/** O assunto podia ter aberto em `day`, com as corridas registadas até
 *  `cutoffMs`? Um alerta sem plano nesse dia não conta: aí não se abre nada,
 *  e contá-lo calava o assunto na semana em que o plano começa. */
function couldOpenAsOf(runs: RunWithCreated[], planItems: LoadPlanItem[], day: string, cutoffMs: number): boolean {
  const known = (runs || []).filter((r) => {
    const at = r?.created_at ? Date.parse(r.created_at) : NaN;
    return Number.isFinite(at) && at <= cutoffMs;
  });
  const r = runLoadReading({ runs: known, planItems, today: day });
  return r.alert && r.hasPlan;
}

/** Abre-se o assunto só na passagem para alerta, não enquanto o alerta dura.
 *  O resumo refaz-se várias vezes por dia e a carga fica alta dias seguidos:
 *  sem isto, o atleta resolvia o assunto no chat e o resumo seguinte abria-o
 *  outra vez. Não abre se:
 *  - já estava em alerta no resumo anterior de hoje (com as corridas que
 *    estavam registadas nessa altura);
 *  - esteve em alerta, com plano, em algum dos 7 dias anteriores, lido como
 *    se lia nesse dia: a janela de cada dia e só as corridas registadas até
 *    ao fim dele.
 *    Ler o passado com a janela de hoje não serve — a janela avança, a
 *    corrida mais antiga sai e o "antes" parecia calmo todos os dias
 *    (revisão pré-deploy de 0743341);
 *  - não há plano aceite nesses dias: a conversa do chat é sobre desvios ao
 *    plano e confrontava-o com um plano que não existe; aí o recap diz o
 *    risco (conta_como_risco);
 *  - há outro assunto por resolver: só há um de cada vez
 *    (profiles.coach_intervention_*). Este não fica à espera — perde-se,
 *    porque no resumo seguinte as corridas já não são novas.
 *  O plano tem de cobrir 13 dias para trás (7 de janela + 7 de histórico).
 *  Devolve a leitura a usar no motivo, ou null. */
export function runLoadInterventionToOpen(
  { runs, planItems, today, previousSummaryAt, interventionStatus }: {
    runs: RunWithCreated[];
    planItems: LoadPlanItem[];
    today: string;
    previousSummaryAt: string | null | undefined;
    interventionStatus: string | null | undefined;
  },
): RunLoadReading | null {
  if (interventionStatus && PENDING.includes(interventionStatus)) return null;
  const now = runLoadReading({ runs, planItems, today });
  if (!now.alert || !now.hasPlan) return null;

  const since = previousSummaryAt ? Date.parse(previousSummaryAt) : NaN;
  if (Number.isFinite(since) && new Date(since).toISOString().slice(0, 10) >= addDaysISO(today, -1)) {
    // O resumo anterior pode ser de ontem ao fim do dia (em UTC); a janela é
    // a de hoje, o que conta é se as corridas de então já davam alerta.
    if (couldOpenAsOf(runs, planItems, today, since)) return null;
  }
  for (let back = 1; back <= LOAD_ALERT_LOOKBACK_DAYS; back++) {
    const day = addDaysISO(today, -back);
    if (couldOpenAsOf(runs, planItems, day, Date.parse(`${day}T23:59:59Z`))) return null;
  }
  return now;
}
