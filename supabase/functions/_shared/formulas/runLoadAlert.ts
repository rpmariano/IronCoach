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
import { runsOnly, isWalkPlanItem } from "./runKinds.ts";
import { ACWR_DANGER, ACWR_SAFE_MAX } from "./acwr.ts";

export const RUN_LOAD_INTERVENTION_TAG = "[carga]";


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
  kind?: string | null;
  training_type?: string | null;
}

export interface LoadPlanItem {
  /** O plano a que pertence: um plano só de refeições não é plano de treino. */
  plan_id?: string | null;
  planned_date: string;
  kind: string;
  training_type?: string | null;
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
  /** Desde quando o plano responde pela carga: o início da janela, ou o dia
   *  em que um plano novo começou dentro dela. null sem plano. */
  planFrom: string | null;
  /** Km corridos desde planFrom — é isto que se compara com prescribedKm. */
  kmOnPlanDays: number;
  /** Há um plano de TREINO aceite (com corridas ou ginásio) nestes 7 dias,
   *  mesmo que só com descanso nesses dias. */
  hasPlan: boolean;
  historyWeeks: number;
  enoughHistory: boolean;
  followsPlan: boolean;
  /** O rácio passa do perigo, há histórico e a carga não é a do plano.
   *  Com o perfil Mais volume: a carga passa o limite DESSE perfil
   *  (acuteLimitKm) — a base baixa sobe até +15 km sem alerta. */
  alert: boolean;
  /** O perfil de carga com que se leu (o da próxima prova principal). */
  profile: LoadProfile;
  /** O limite seguro da janela de 7 dias, em km, para esse perfil, e se é o
   *  da base baixa (acuteLimitKm). */
  limitKm: number;
  lowBase: boolean;
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
  { runs, planItems, today, profile = "prudente" }: { runs: LoadRun[]; planItems: LoadPlanItem[]; today: string; profile?: LoadProfile },
): RunLoadReading {
  // Caminhadas fora — dos km feitos e dos previstos (runKinds.ts, 2026-10-05):
  // a carga de corrida é de corrida, e o ritmo de uma caminhada estragava a
  // régua de athletePaceMinPerKm.
  const list = runsOnly(runs).filter((r) => r && typeof r.date === "string" && r.date.slice(0, 10) <= today);
  const acwr = computeRunAcwr(list.map((r) => ({ date: r.date.slice(0, 10), distance_km: Number(r.distance_km) || 0 })), today);
  const ratio = acwr.chronicWeeklyKm > 0 ? acwr.ratio : null;

  const { historyWeeks, hasEnoughData: enoughHistory } = acwr;

  const acuteStart = addDaysISO(today, -6);
  const live = (planItems || []).filter((i) => i && i.status !== "cancelado" && typeof i.planned_date === "string");
  // Um plano só de refeições (itens de descanso com sugestões) não é plano
  // de treino: não responde pela carga (revisão pré-deploy de aa00b8b).
  const trainingPlans = new Set(live.filter((i) => i.kind === "corrida" || i.kind === "ginasio").map((i) => i.plan_id ?? null));
  const training = live.filter((i) => trainingPlans.has(i.plan_id ?? null));
  const inPlanWindow = training.filter((i) => i.planned_date >= acuteStart && i.planned_date <= today);
  const planned = inPlanWindow.filter((i) => i.kind === "corrida" && !isWalkPlanItem(i));
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
  // corridas de antes não são "acima do que o plano previa". Mas os dias de
  // descanso sem nada a dizer não têm item — com itens antes da janela, o
  // plano já estava ativo e responde pela janela inteira; sem isto, uma
  // corrida extra num descanso à cabeça da janela saía da conta
  // (revisão pré-deploy de aa00b8b).
  const activeBefore = training.some((i) => i.planned_date < acuteStart);
  const planFrom = !inPlanWindow.length
    ? null
    : activeBefore
      ? acuteStart
      : inPlanWindow.reduce((min, i) => (i.planned_date < min ? i.planned_date : min), today);
  const kmOnPlanDays = planFrom === null ? acwr.acuteKm : list
    .filter((r) => r.date.slice(0, 10) >= planFrom)
    .reduce((sum, r) => sum + (Number(r.distance_km) || 0), 0);
  const followsPlan = prescribedKm !== null && prescribedKm > 0 && kmOnPlanDays <= prescribedKm * LOAD_PLAN_TOLERANCE;
  // O limite do perfil: os km das 3 semanas antes da janela de 7 dias.
  const olderKm = list
    .filter((r) => r.date.slice(0, 10) >= addDaysISO(today, -27) && r.date.slice(0, 10) <= addDaysISO(today, -7))
    .reduce((sum, r) => sum + (Number(r.distance_km) || 0), 0);
  const { limitKm, lowBase } = acuteLimitKm(olderKm, profile);
  // Prudente: o ACWR 1,50 — e com base baixa, só acima da subida de +10 km
  // (a mesma que a guarda do plano deixa: revisão de 5fea1e4e). Mais volume:
  // o limite dele — com base baixa, a subida de +15 km não é alerta.
  const overLimit = profile === "mais_volume"
    ? acwr.acuteKm > limitKm + 0.05
    : ratio !== null && ratio > ACWR_DANGER && (!lowBase || acwr.acuteKm > limitKm + 0.05);

  return {
    ratio: ratio !== null ? Math.round(ratio * 100) / 100 : null,
    acuteKm: round1(acwr.acuteKm),
    chronicWeeklyKm: round1(acwr.chronicWeeklyKm),
    prescribedKm: prescribedKm !== null ? round1(prescribedKm) : null,
    planFrom,
    kmOnPlanDays: round1(kmOnPlanDays),
    hasPlan: inPlanWindow.length > 0,
    historyWeeks,
    enoughHistory,
    followsPlan,
    alert: ratio !== null && overLimit && enoughHistory && !followsPlan,
    profile,
    limitKm: round1(limitKm),
    lowBase,
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
export function runLoadInterventionReason(r: RunLoadReading, today: string): string {
  // Os números da decisão (followsPlan), não outros: a Carol cita-os no chat.
  const desde = r.planFrom && r.planFrom > addDaysISO(today, -6) ? `desde ${r.planFrom}, quando o plano começou` : "nos últimos 7 dias";
  const feito = r.prescribedKm !== null && r.prescribedKm > 0
    ? `${num(r.kmOnPlanDays)} km ${desde}, quando ${ABOVE_PLAN_MARKER} ${num(r.prescribedKm)} km`
    : `${num(r.acuteKm)} km nos últimos 7 dias, sem corridas no plano para esses dias`;
  return `${RUN_LOAD_INTERVENTION_TAG} Carga de corrida: ${feito}; ` +
    `a média das últimas 4 semanas é ${num(r.chronicWeeklyKm)} km/semana (ACWR ${num(r.ratio ?? 0)}). ` +
    `Vê com ele como se sente e se os próximos dias do plano devem mudar.`;
}

const PENDING = ["needed", "in_progress"];

/** Quantos dias para trás se procura um alerta que já tenha estado vivo. */
export const LOAD_ALERT_LOOKBACK_DAYS = 7;
/** Dias calmos seguidos que fecham um episódio de carga. */
export const LOAD_EPISODE_CALM_DAYS = 3;

type RunWithCreated = LoadRun & { created_at?: string | null };

/** A leitura tal como se via em `day`, com as corridas registadas até `cutoffMs`. */
function readingAsOf(runs: RunWithCreated[], planItems: LoadPlanItem[], day: string, cutoffMs: number, profile: LoadProfile): RunLoadReading {
  const known = (runs || []).filter((r) => {
    const at = r?.created_at ? Date.parse(r.created_at) : NaN;
    return Number.isFinite(at) && at <= cutoffMs;
  });
  return runLoadReading({ runs: known, planItems, today: day, profile });
}

/** Carga sem nada a dizer: zona segura, sem histórico, ou a do plano. */
function isCalm(r: RunLoadReading): boolean {
  return r.ratio === null || !r.enoughHistory || r.followsPlan || r.ratio <= ACWR_SAFE_MAX;
}

/** Abre-se o assunto só na passagem para alerta, não enquanto o alerta dura.
 *  O resumo refaz-se várias vezes por dia e a carga fica alta dias seguidos:
 *  sem isto, o atleta resolvia o assunto no chat e o resumo seguinte abria-o
 *  outra vez. Não abre se:
 *  - já estava em alerta no resumo anterior de hoje (com as corridas que
 *    estavam registadas nessa altura);
 *  - o mesmo episódio já vinha de trás: para trás, dia a dia (até 7), cada
 *    um lido como se lia nesse dia — a sua janela e só as corridas
 *    registadas até ao fim dele —, um dia em alerta com plano cala; 3 dias
 *    calmos seguidos (≤1,30, sem histórico ou dentro do plano) fecham o
 *    episódio e um pico depois deles é novo.
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
  { runs, planItems, today, previousSummaryAt, interventionStatus, profile = "prudente" }: {
    runs: RunWithCreated[];
    planItems: LoadPlanItem[];
    today: string;
    previousSummaryAt: string | null | undefined;
    interventionStatus: string | null | undefined;
    /** O perfil de carga da próxima prova principal (loadProfile.ts). */
    profile?: LoadProfile;
  },
): RunLoadReading | null {
  if (interventionStatus && PENDING.includes(interventionStatus)) return null;
  const now = runLoadReading({ runs, planItems, today, profile });
  if (!now.alert || !now.hasPlan) return null;

  const since = previousSummaryAt ? Date.parse(previousSummaryAt) : NaN;
  if (Number.isFinite(since) && new Date(since).toISOString().slice(0, 10) >= addDaysISO(today, -1)) {
    // O resumo anterior pode ser de ontem ao fim do dia (em UTC); a janela é
    // a de hoje, o que conta é se as corridas de então já davam alerta.
    const before = readingAsOf(runs, planItems, today, since, profile);
    // Um alerta sem plano nesse dia não conta: aí não se abre nada, e
    // contá-lo calava o assunto na semana em que o plano começa.
    if (before.alert && before.hasPlan) return null;
  }
  // Para trás, dia a dia: um dia em que o assunto podia ter aberto cala-o
  // (o episódio é o mesmo); LOAD_EPISODE_CALM_DAYS dias calmos seguidos
  // fecham o episódio anterior e um pico depois deles é novo. Um dia calmo
  // sozinho não chega: quem corre dia sim, dia não tem 3 ou 4 corridas na
  // janela conforme o dia, e o rácio oscila entre 1,25 e 1,55 sem nada ter
  // mudado — cada descida reabria o assunto.
  let calmStreak = 0;
  for (let back = 1; back <= LOAD_ALERT_LOOKBACK_DAYS; back++) {
    const day = addDaysISO(today, -back);
    const r = readingAsOf(runs, planItems, day, Date.parse(`${day}T23:59:59Z`), profile);
    if (r.alert && r.hasPlan) return null;
    calmStreak = isCalm(r) ? calmStreak + 1 : 0;
    if (calmStreak >= LOAD_EPISODE_CALM_DAYS) break;
  }
  return now;
}

// ── A guarda de carga dos planos (pedido 2026-09-24) ─────────────────────────
//
// A doutrina da Carol manda respeitar o ACWR ao propor um plano, mas era só
// uma instrução ao modelo: nada a verificava. Aqui fica a regra. Projeta a
// carga dia a dia com tudo cumprido — as corridas registadas, os treinos
// ainda por fazer do plano em curso (fixos: a proposta não lhes mexe) e os
// da proposta — e aponta as janelas de 7 dias em que é A PROPOSTA que leva o
// ACWR acima de 1,50: o mesmo dia, sem ela, ficaria ≤1,50.
//
// - Sem histórico (corridas em menos de 3 das 4 semanas) não há regra: o
//   rácio não existe e a app não o usa para nada.
// - O que já vinha de trás (as corridas ou o plano em curso, sem a proposta,
//   já passam de 1,50) não é da proposta. Antes contava-se só com as
//   corridas registadas, e a carga do plano em curso caía em cima de
//   qualquer proposta — nem uma rodagem de 1 km passava (revisão pré-deploy
//   de bf21a2b, bloqueada).
// - Avalia-se do primeiro dia da proposta até 6 dias depois do último: o
//   rácio ainda sobe enquanto as corridas antigas saem da janela crónica.
// - A prova não entra: é um dado, o plano não a pode encurtar, e uma meia
//   maratona passa sozinha o 1,50 no dia dela. As provas JÁ CORRIDAS contam
//   a 100% (estão nas corridas registadas): a carga foi real.
// - Um item de hoje só conta se ainda não houver corrida registada hoje.
// - Base baixa (#113/#114, 2026-11-06): com menos de LOW_BASE_WEEKLY_KM
//   km/semana nas 3 semanas antes da janela, o rácio sozinho não deixava
//   nada — 1,5 × uma base pequena é quase nada, e duas provas comiam a
//   margem toda (o Rui, com 5, 6, 19 e 27 km, ficava com 2 km de ativação
//   e semanas vazias entre provas, e o hub pedia-lhe mais km). Aí o limite
//   é uma subida absoluta: a semana pode chegar à média dessas 3 semanas +
//   LOW_BASE_RAMP_KM, ou ao ACWR 1,50, o que for maior. Acima da base
//   baixa, o ACWR 1,50 como sempre.
//   Consequência aceite (decisão do Rui, revisão do lote e3901569): com base
//   muito baixa a subida absoluta passa muito o rácio. A 2 km/semana a regra
//   deixa uma semana de 12 km — ACWR 12 ÷ ((12 + 6) ÷ 4) ≈ 2,7. É de
//   propósito: com tão pouca base, o rácio não diz nada de útil e só proibia
//   as sessões úteis.

//
// - O perfil de carga (2026-11-09, loadProfile.ts): a decisão é do atleta, por
//   prova. Prudente é tudo o que está acima. Mais volume: com base baixa a
//   subida absoluta é LOW_BASE_RAMP_KM_MORE_VOLUME (+15 km); acima da base
//   baixa, o ACWR 1,50 — que nunca se passa. Os 20% por semana do pedido são
//   a progressão que a doutrina pede ao plano, não o limite: 20% sobre a
//   média das 3 semanas (×1,2) é mais apertado do que o ACWR 1,50 (×1,8), e
//   um limite de 20% deixava o Mais volume abaixo do Prudente.

export type LoadProfile = "prudente" | "mais_volume";

/** Abaixo disto (km/semana, média das 3 semanas antes da janela de 7 dias)
 *  é base baixa: o limite passa a ser uma subida absoluta. */
export const LOW_BASE_WEEKLY_KM = 20;
/** Quanto a semana pode subir sobre essa média com base baixa: 10 km — duas
 *  corridas fáceis de 5 km (a sessão mínima útil do plano). 8 km já não
 *  deixava duas sessões úteis a quem tem uma semana de 12 km; mais do que 10
 *  é mais do que dobrar a base de quem corre 8 km por semana. */
export const LOW_BASE_RAMP_KM = 10;
/** A mesma subida com o perfil Mais volume (2026-11-09). */
export const LOW_BASE_RAMP_KM_MORE_VOLUME = 15;
/** A progressão por semana que a doutrina pede com Mais volume acima da base
 *  baixa (só no texto do plano; o limite é o ACWR 1,50). */
export const MORE_VOLUME_WEEKLY_GROWTH = 0.2;

/**
 * O máximo de km na janela aguda (7 dias): ACWR ≤ 1,50 dá
 *   aguda ≤ L × anterior ÷ (4 − L) = 0,6 × anterior
 * (anterior = os km dos 21 dias antes da janela); com base baixa (média
 * dessas 3 semanas < LOW_BASE_WEEKLY_KM), o maior entre esse e a média +
 * LOW_BASE_RAMP_KM (+15 km com o perfil Mais volume).
 */
export function acuteLimitKm(olderKm: number, profile: LoadProfile = "prudente"): { limitKm: number; lowBase: boolean } {
  const byRatio = (ACWR_DANGER * olderKm) / (4 - ACWR_DANGER);
  const priorWeekly = olderKm / 3;
  if (priorWeekly >= LOW_BASE_WEEKLY_KM) return { limitKm: byRatio, lowBase: false };
  const byRamp = priorWeekly + (profile === "mais_volume" ? LOW_BASE_RAMP_KM_MORE_VOLUME : LOW_BASE_RAMP_KM);
  return byRamp > byRatio ? { limitKm: byRamp, lowBase: true } : { limitKm: byRatio, lowBase: false };
}

export interface PlanLoadViolation {
  /** A janela de 7 dias: de `from` a `date`. */
  from: string;
  date: string;
  /** Arredondado para cima (1,501 diz-se 1,51, não 1,50 ao lado de "≤1,50"). */
  ratio: number;
  /** Km dessa janela: já corridos, do plano em curso, e da proposta. */
  doneKm: number;
  fixedKm: number;
  proposedKm: number;
  /** O máximo da proposta nessa janela para caber no limite (0 se nada cabe). */
  maxProposedKm: number;
  /** O limite da janela, em km, e se é o da base baixa (acuteLimitKm). */
  limitKm: number;
  lowBase: boolean;
}

type DayKm = { date: string; distance_km: number; duration_seconds?: number | null };

function plannedRuns(items: LoadPlanItem[], today: string, ranToday: boolean, pace: number): DayKm[] {
  return (items || [])
    .filter((i) => i && i.kind === "corrida" && !isWalkPlanItem(i) && i.status !== "cancelado" && i.training_type !== "prova" &&
      typeof i.planned_date === "string" && (i.planned_date > today || (i.planned_date === today && !ranToday)))
    .map((i) => {
      const km = Number(i.target_distance_km) || 0;
      const min = Number(i.target_duration_min) || 0;
      return { date: i.planned_date, distance_km: km > 0 ? km : min > 0 ? min / pace : 0 };
    })
    .filter((r) => r.distance_km > 0);
}

const kmIn = (list: DayKm[], from: string, to: string) =>
  list.filter((r) => r.date >= from && r.date <= to).reduce((sum, r) => sum + r.distance_km, 0);

export function planLoadViolations(
  { runs, fixedItems, proposedItems, today, profile = "prudente" }: {
    runs: LoadRun[]; fixedItems: LoadPlanItem[]; proposedItems: LoadPlanItem[]; today: string;
    /** O perfil de carga da próxima prova principal (loadProfile.ts). */
    profile?: LoadProfile;
  },
): PlanLoadViolation[] {
  const past: DayKm[] = runsOnly(runs)
    .filter((r) => r && typeof r.date === "string" && r.date.slice(0, 10) <= today)
    .map((r) => ({ date: r.date.slice(0, 10), distance_km: Number(r.distance_km) || 0, duration_seconds: r.duration_seconds ?? null }));
  if (!computeRunAcwr(past, today).hasEnoughData) return [];

  const pace = athletePaceMinPerKm(past);
  const ranToday = past.some((r) => r.date === today && r.distance_km > 0);
  const fixed = plannedRuns(fixedItems, today, ranToday, pace);
  const proposed = plannedRuns(proposedItems, today, ranToday, pace);
  if (!proposed.length) return [];

  const baseline = [...past, ...fixed];
  const projected = [...baseline, ...proposed];
  const first = proposed.reduce((min, r) => (r.date < min ? r.date : min), proposed[0].date);
  const last = addDaysISO(proposed.reduce((max, r) => (r.date > max ? r.date : max), first), 6);
  const out: PlanLoadViolation[] = [];
  // Um pouco de folga no arredondamento: 22,0 km contra um limite de 21,99.
  const EPS = 0.05;
  for (let d = first; d <= last; d = addDaysISO(d, 1)) {
    const from = addDaysISO(d, -6);
    // A janela aguda com a proposta, contra o limite (acuteLimitKm) dos 21
    // dias antes dela — o ACWR 1,50, ou com base baixa a subida absoluta.
    const olderKm = kmIn(projected, addDaysISO(d, -27), addDaysISO(d, -7));
    const { limitKm, lowBase } = acuteLimitKm(olderKm, profile);
    const acuteWith = kmIn(projected, from, d);
    if (!(acuteWith > limitKm + EPS)) continue;
    // O que já vinha de trás (sem a proposta) não é da proposta.
    const olderWithout = kmIn(baseline, addDaysISO(d, -27), addDaysISO(d, -7));
    if (kmIn(baseline, from, d) > acuteLimitKm(olderWithout, profile).limitKm + EPS) continue;
    const withPlan = computeRunAcwr(projected, d);
    const done = kmIn(past, from, d);
    const fixedKm = kmIn(fixed, from, d);
    const proposedKm = kmIn(proposed, from, d);
    out.push({
      from,
      date: d,
      ratio: Math.ceil(withPlan.ratio * 100) / 100,
      doneKm: round1(done),
      fixedKm: round1(fixedKm),
      proposedKm: round1(proposedKm),
      // O que sobra para a proposta: o limite menos o que já lá está e o que
      // o plano em curso lá tem.
      maxProposedKm: Math.max(0, Math.floor((limitKm - done - fixedKm) * 10) / 10),
      limitKm: round1(limitKm),
      lowBase,
    });
    // A janela seguinte que se reporta começa depois desta: a mesma carga
    // não se conta duas vezes.
    d = addDaysISO(d, 6);
  }
  return out;
}
