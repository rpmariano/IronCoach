// Os momentos em que a Carol fala primeiro, avaliados no servidor
// (specs/carol-omnisciencia-omnipresenca.md, ação P.3).
//
// A decisão vivia só no cliente (src/utils/coachProactive.js,
// pickProactiveTrigger): só corria quando o atleta abria o Coach. Esta é a
// mesma régua para o servidor, que corre de hora a hora sem a app aberta. As
// CHAVES têm de ser exatamente as do cliente — é por elas que o
// coach_proactive_log sabe que uma mensagem já foi entregue, venha de onde
// vier. Um teste no cliente (src/utils/proactiveParity.test.js) compara as
// duas funções com os mesmos dados.
//
// Prioridade, como no cliente: manhã da prova > véspera > depois da prova >
// fim de bloco > silêncio > balanço da semana — e o balanço só num dia sem
// mais nenhum; sem balanço, o treino de ontem por registar (P.10) vem por
// último (ver o fim de listServerProactive). O servidor tem mais dois
// momentos que o cliente trata pelo Início, não pelo chat (P.5): um assunto
// por resolver (intervenção — dor no check-in, desvio num registo) passa à
// frente de tudo, e o conflito de provas vem logo a seguir à véspera.

import type { Segment } from "./percentileSegments.ts";
import { type LeaderboardEntryRow, leaderboardMoment, percentileAvailability, percentileReadyMoment, type SnapshotRow } from "./vitrina.ts";
import { PAIN_ALARM_THRESHOLD } from "./checkinAlarms.ts";
import { buildRacePacingPlan } from "./racePacing.ts";
import { isRunLoadIntervention, runLoadInterventionKind } from "./runLoadAlert.ts";
import { INTERVENTION_ORIGIN } from "./interventionOutcomes.ts";
import { pickRaceOfDay } from "./mainRace.ts";

export const SILENCE_DAYS = 3;
// Sem plano nenhum a cobrir o período, um "está tudo bem?" só depois de uma
// semana — três dias sem plano nem registo é normal (revisão de 2026-09-26).
export const SILENCE_DAYS_SEM_PLANO = 7;
export const RACE_AFTER_DAYS_WITH_RUN = 7;
/** O início do Contexto do "depois da prova" quando a corrida desse dia
 *  existe mas não está ligada à prova (chave `race_after:<id>:por-ligar`):
 *  o chat escolhe a instrução por ele, para não pedir o registo de uma
 *  corrida que já existe (revisão pré-deploy de 2026-09-26). */
export const UNLINKED_RUN_DETAILS_PREFIX = "Corrida por ligar:";
export const RACE_AFTER_DAYS_WITHOUT_RUN = 3;

export type ProactiveTriggerName = "intervention" | "race_morning" | "race_eve" | "race_conflict" | "race_after" | "block_end" | "silence" | "missed_workout" | "week_review" | "leaderboard" | "percentile_ready";

export interface TriggerRace {
  id: string;
  name?: string | null;
  date: string;
  status?: string | null;
  distance_km?: number | string | null;
  race_priority?: string | null;
  conflict_acknowledged_at?: string | null;
  /** A hora de partida ("HH:MM" ou "HH:MM:SS"), para a manhã da prova (P.10). */
  start_time?: string | null;
  /** O objetivo de tempo: com a distância, há plano de ritmo para o dia. */
  target_time_seconds?: number | string | null;
  /** O balanço que ela escreveu depois da prova (race_events.coach_balance):
   *  a prova de que o "como correu?" com corrida já foi entregue, em
   *  qualquer dispositivo — a mesma que decide.ts usa (balanceDone). */
  coach_balance?: string | null;
}

/** Um plano, com a informação de ter treinos (e não só refeições). */
export interface TriggerPlan {
  id: string;
  status?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  race_id?: string | null;
  hasTraining?: boolean;
}

/** Um item de plano — para o treino de ontem por registar (P.10). */
export interface TriggerPlanItem {
  plan_id?: string | null;
  planned_date?: string | null;
  kind?: string | null;
  status?: string | null;
  training_type?: string | null;
  created_at?: string | null;
}

/** Quantos dias antes do fim de um bloco a Carol chama por ele. */
export const BLOCK_END_DAYS = 2;

export interface TriggerRun {
  id?: string | null;
  date?: string | null;
  race_id?: string | null;
  kind?: string | null;
  created_at?: string | null;
}

export interface ServerProactiveCandidate {
  trigger: ProactiveTriggerName;
  key: string;
  raceId: string | null;
  raceName: string | null;
  hasRun: boolean;
  /** Só no silêncio: dias desde o último registo. */
  silenceDays: number | null;
  /** O dia do acontecimento: a prova, ou o último registo no silêncio. Se a
   *  Carol já falou depois dele, a conversa provavelmente já aconteceu. */
  anchorDate: string | null;
  /** No balanço com corrida: quando a corrida foi registada. O balanço
   *  acontece depois disso — se a Carol já falou depois, já o fez. */
  anchorAt: string | null;
  /** Conflito de provas e fim de bloco: o plano em causa. */
  planId?: string | null;
  /** Fim de bloco: o último dia do plano. */
  blockEnd?: string | null;
  /** Conflito de provas: as outras principais dentro do bloco. */
  conflictRaceNames?: string[];
  /** Balanço da semana: a semana revista (segunda e domingo). */
  weekStart?: string | null;
  weekEnd?: string | null;
  /** Manhã e véspera da prova: a hora de partida em minutos desde a
   *  meia-noite de Lisboa, ou null sem hora marcada (P.10). */
  startMinutes?: number | null;
  /** Manhã da prova: há plano de ritmo (e com ele o ritmo do primeiro km)
   *  para lhe deixar (revisão de 2026-09-26). */
  hasFirstKmPace?: boolean;
  /** Depois da prova, com corrida (revisão de 2026-09-26): o dia da prova
   *  ("hoje", "ontem" ou o dia da semana) e a distância, para a frase sem
   *  nome próprio. */
  raceDay?: string | null;
  raceDistanceKm?: number | null;
  /** Silêncio sem check-ins (revisão de 2026-09-26): a última água
   *  registada, quando é DEPOIS do último registo — ele abre a app. */
  lastWaterDate?: string | null;
  /** O assunto por resolver: de onde veio, sem o motivo (revisão de
   *  2026-09-26). */
  interventionTopic?: "checkin" | "carga_acima_do_plano" | "carga" | null;
  /** Percentil "perto": o primeiro grupo ao lado que já tem números, pela
   *  ordem do "Onde estás" (neighbourSegments). */
  nearSegment?: { step: "modalidade" | "escalao" | "genero"; terrain: string; gender: string } | null;
  /** Silêncio (P.10): o último check-in, quando é DEPOIS do último registo —
   *  ele está por cá, o que falta são os treinos. */
  lastCheckinDate?: string | null;
  /** Silêncio com check-in: dias desde o último treino (corrida ou ginásio),
   *  ou null se não houver nenhum. */
  trainingSilenceDays?: number | null;
  /** A Vitrina (2026-09-25). Tabelas: "entrou" ou "saiu" do top 10 do
   *  escalão; percentil: "perto" (há dados ao lado do escalão dele) ou "meu"
   *  (o escalão dele já tem). */
  vitrinaStage?: "entrou" | "saiu" | "perto" | "meu";
  /** Tabelas, ao entrar: a posição (1-10). Nunca vai para a notificação. */
  leaderboardRank?: number | null;
  /** A janela publicada de que o momento fala. */
  windowStart?: string | null;
  /** Depois da prova (revisão de 2026-09-26): há uma corrida nesse dia,
   *  mas ainda não ligada à prova (kind diferente de "competicao", ou sem
   *  o campo `race_id`) — pergunta-se se é ela, em vez de pedir um registo
   *  que já existe. */
  unlinkedRun?: boolean;
  /** Silêncio (revisão de 2026-09-26): quantos treinos o plano tinha desde
   *  o último registo, e desde que dia da semana — null sem plano nesse
   *  período (o silêncio conta então a partir de SILENCE_DAYS_SEM_PLANO). */
  plannedTrainingsSince?: number | null;
  sinceWeekday?: string | null;
  /** Treino de ontem por registar (revisão de 2026-09-26): "corrida (longo)"
   *  em vez de um "treino" genérico — nomeia-se o que estava previsto. */
  missedLabel?: string | null;
}

/** "08:30" / "08:30:00" → 510. null se não for uma hora válida. */
export function startTimeMinutes(value: unknown): number | null {
  const m = typeof value === "string" ? /^(\d{1,2}):(\d{2})/.exec(value.trim()) : null;
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}

/* As chaves que o Início também calcula (P.10): ao mostrar o aviso de um
   assunto por resolver ou de um conflito de provas, regista a chave do
   candidato, para o tick não notificar o que o atleta acabou de ver. Vivem
   aqui para as duas pontas nunca discordarem. */
export function interventionKey(reason: string | null | undefined): string {
  return `intervention:${shortHash(reason || "")}`;
}

export function raceConflictKey(planId: string, raceIds: string[]): string {
  return `race_conflict:${planId}:${[...raceIds].sort().join(",")}`;
}

/** De onde veio o assunto por resolver. A origem no perfil é de passagem (o
 *  trigger track_coach_intervention limpa-a), por isso, sem ela, vale a
 *  mesma dedução que o trigger faz pelo início do motivo ("Check-in…",
 *  "[carga]…"). A carga distingue "acima do plano" de "sem plano nesses
 *  dias": aí dizer "acima do plano" era falso. */
export function interventionTopic(
  intervention: { reason?: string | null; origin?: string | null } | null | undefined,
): "checkin" | "carga_acima_do_plano" | "carga" | null {
  const reason = intervention?.reason ?? "";
  const origin = intervention?.origin
    ?? (reason.startsWith("Check-in") ? INTERVENTION_ORIGIN.CHECKIN : isRunLoadIntervention(reason) ? INTERVENTION_ORIGIN.LOAD : null);
  if (origin === INTERVENTION_ORIGIN.CHECKIN) return "checkin";
  if (origin === INTERVENTION_ORIGIN.LOAD) return runLoadInterventionKind(reason) === "acima_do_plano" ? "carga_acima_do_plano" : "carga";
  return null;
}

/** Há plano de ritmo para o dia (racePacing.ts)? O tick não tem a previsão
 *  pelas corridas, só o objetivo: sem ele não se promete um ritmo que pode
 *  não existir (revisão de 2026-09-26). */
function hasFirstKmPace(race: TriggerRace): boolean {
  return buildRacePacingPlan({ distanceKm: Number(race.distance_km) || null, targetSeconds: Number(race.target_time_seconds) || null }) !== null;
}

const DAY_MS = 86400000;

/** Um resumo curto e estável de um texto — a chave da intervenção muda
 *  quando o motivo muda, e só aí (djb2, em base 36). */
export function shortHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function dayOf(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

/** A mesma regra de src/utils/planDivergence.js detectRaceConflict: uma
 *  segunda prova principal, ainda por correr e não reconhecida, dentro de um
 *  bloco aceite vinculado a outra prova (intervalo fechado nos dois lados). */
export function detectRaceConflictServer(plans: TriggerPlan[] | null | undefined, races: TriggerRace[] | null | undefined, todayISO: string): { plan: TriggerPlan; races: TriggerRace[] } | null {
  const bound = (plans || []).filter((p) => p && p.status === "aceite" && p.race_id && dayOf(p.period_start) && dayOf(p.period_end) && dayOf(p.period_end)! >= todayISO);
  for (const plan of bound) {
    const start = dayOf(plan.period_start)!;
    const end = dayOf(plan.period_end)!;
    const others = (races || []).filter((r) => {
      if (!r || r.id === plan.race_id) return false;
      if (r.status === "concluida" || r.conflict_acknowledged_at) return false;
      const d = dayOf(r.date);
      return !!d && d >= todayISO && d >= start && d <= end && (r.race_priority || "a") === "a";
    }).sort((a, b) => a.date.localeCompare(b.date));
    if (others.length) return { plan, races: others };
  }
  return null;
}

/** O bloco de treino (sem prova) que acaba hoje ou nos próximos dias, sem
 *  outro plano de treino a seguir. Com prova, o fim do bloco é a prova — e
 *  essa já tem os seus momentos. */
export function findEndingBlock(plans: TriggerPlan[] | null | undefined, todayISO: string): TriggerPlan | null {
  const training = (plans || []).filter((p) => p && p.hasTraining && (p.status === "aceite" || p.status === "proposto") && dayOf(p.period_end));
  const limit = new Date(Date.parse(`${todayISO}T00:00:00Z`) + BLOCK_END_DAYS * DAY_MS).toISOString().slice(0, 10);
  const ending = training
    .filter((p) => p.status === "aceite" && !p.race_id && dayOf(p.period_end)! >= todayISO && dayOf(p.period_end)! <= limit)
    .sort((a, b) => dayOf(a.period_end)!.localeCompare(dayOf(b.period_end)!));
  for (const plan of ending) {
    const end = dayOf(plan.period_end)!;
    const next = training.some((p) => p.id !== plan.id && dayOf(p.period_end)! > end);
    if (!next) return plan;
  }
  return null;
}

/* ── O treino de ontem por registar (P.10) ──────────────────────────────────
   Um treino do plano aceite (corrida ou ginásio) planeado para ontem, ainda
   pendente, e sem nenhuma corrida nem sessão registada nesse dia (a data conta
   pelo calendário, como em src/utils/planDivergence.js). A Carol pergunta o
   que aconteceu — sem reagendar: pode ter treinado e não registado.
   Fica de fora:
   - num dia de prova: a prova manda no dia;
   - o item que é a própria prova: esse é o "como correu?";
   - o que foi planeado antes da última reescrita do plano (o dia do item mais
     recente): ao reescrevê-lo ela já o teve à frente — a mesma guarda do
     aviso de ajuste do Início.
   Duas sessões falhadas numa semana continuam a ser o aviso "O plano precisa
   de um ajuste" do Início, que leva a ajustar o plano; isto é só a pergunta. */

/** O dia de Lisboa de um instante — a reescrita conta pelo dia em que aconteceu. */
function lisbonDayOf(iso: string): string | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date(t)) : null;
}

/** Minutos desde a meia-noite de Lisboa de um instante. */
function lisbonMinutesOf(iso: string): number | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t));
  const h = Number(parts.find((x) => x.type === "hour")?.value);
  const m = Number(parts.find((x) => x.type === "minute")?.value);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

/** Uma corrida do dia da prova que não está ligada a ela (a "por ligar"),
 *  a mesma régua nos dois lados. No próprio dia, com hora de partida, uma
 *  corrida registada antes da partida — o aquecimento da manhã de uma prova
 *  às 18h — ainda não é a prova: ela não pergunta "foi essa?" antes de a
 *  prova começar (segunda revisão pré-deploy de 2026-09-26). */
export function findUnlinkedRaceDayRun<R extends TriggerRun>(runs: R[] | null | undefined, race: TriggerRace, todayISO: string): R | null {
  const day = race.date.slice(0, 10);
  const start = day === todayISO ? startTimeMinutes(race.start_time) : null;
  return (runs || []).find((r) => {
    if (!r || r.race_id || dayOf(r.date ?? null) !== day) return false;
    if (start == null || !r.created_at) return true;
    const createdDay = lisbonDayOf(r.created_at);
    const at = lisbonMinutesOf(r.created_at);
    if (createdDay == null || at == null) return true;
    return createdDay > day || (createdDay === day && at >= start);
  }) ?? null;
}

export function isRacePlanItemServer(item: TriggerPlanItem): boolean {
  return item?.kind === "corrida" && (item.training_type === "prova" || item.training_type === "competicao");
}

const MISSED_KIND_LABEL: Record<string, string> = { corrida: "corrida", ginasio: "ginásio" };

/** "corrida (longo)" — o mesmo formato de src/utils/coachProactive.js
 *  (missedItemLabel), aqui sem a distância: o servidor não a tem em
 *  TriggerPlanItem, e o nome do tipo já basta para a notificação nomear o
 *  treino em vez de dizer só "o treino" (revisão de 2026-09-26). */
export function missedWorkoutLabel(items: TriggerPlanItem[]): string {
  return items
    .map((i) => {
      const kind = MISSED_KIND_LABEL[i.kind ?? ""] || i.kind || "treino";
      return i.training_type ? `${kind} (${i.training_type})` : kind;
    })
    .join(" + ");
}

/** A dor acima do alarme só explica o silêncio se for recente: o último
 *  check-in de hoje ou de ontem. Uma dor de há semanas, sem nada depois,
 *  calava o "Estás bem?" para sempre (revisão pré-deploy de 2026-09-26). Um
 *  assunto por resolver aberto explica-o sempre. Exportada para o cliente
 *  (coachProactive.js) decidir pela mesma régua. */
export function knowsWhySilent(
  input: { intervention?: { status?: string | null } | null; lastCheckinPain?: number | null; lastCheckinDate?: string | null },
  todayISO: string,
): boolean {
  if (input.intervention?.status === "needed" || input.intervention?.status === "in_progress") return true;
  const day = dayOf(input.lastCheckinDate ?? null);
  const recent = !!day && day >= addDaysISO(todayISO, -1);
  return recent && (Number(input.lastCheckinPain) || 0) >= PAIN_ALARM_THRESHOLD;
}

export function findMissedWorkout(
  input: { plans?: TriggerPlan[] | null; planItems?: TriggerPlanItem[] | null; trainingDates?: Array<string | null | undefined> | null; raceEvents?: TriggerRace[] | null },
  todayISO: string,
): { date: string; items: TriggerPlanItem[] } | null {
  const yesterday = addDaysISO(todayISO, -1);
  if ((input.raceEvents || []).some((r) => r && r.status !== "concluida" && dayOf(r.date) === todayISO)) return null;
  // Ontem, ou hoje de manhã pelo "+" (o treino de ontem feito hoje): não se
  // pergunta o que aconteceu (revisão pré-deploy de 2026-09-26).
  if ((input.trainingDates || []).some((d) => { const day = dayOf(d ?? null); return day === yesterday || day === todayISO; })) return null;
  const accepted = new Set((input.plans || []).filter((p) => p?.status === "aceite").map((p) => p.id));
  const items = (input.planItems || []).filter((i) => i && i.plan_id && accepted.has(i.plan_id));
  const rewriteByPlan = new Map<string, string>();
  for (const i of items) {
    const day = i.created_at ? lisbonDayOf(i.created_at) : null;
    if (!day) continue;
    const prev = rewriteByPlan.get(i.plan_id!);
    if (!prev || day > prev) rewriteByPlan.set(i.plan_id!, day);
  }
  const missed = items.filter((i) => {
    if ((i.kind !== "corrida" && i.kind !== "ginasio") || i.status !== "pendente") return false;
    if (dayOf(i.planned_date ?? null) !== yesterday || isRacePlanItemServer(i)) return false;
    const rewrite = rewriteByPlan.get(i.plan_id!);
    return !rewrite || yesterday >= rewrite;
  });
  return missed.length ? { date: yesterday, items: missed } : null;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`)) / DAY_MS);
}

/** A mesma regra de src/utils/run.js findRaceRun: a corrida ligada à prova;
 *  por data só numa prova já concluída, e só uma competição sem ligação. */
export function findRaceRunServer(runs: TriggerRun[] | null | undefined, race: TriggerRace): TriggerRun | null {
  if (!race?.id) return null;
  const list = runs || [];
  const linked = list.find((r) => r?.race_id === race.id);
  if (linked) return linked;
  if (race.status !== "concluida") return null;
  return list.find((r) => !r?.race_id && r?.kind === "competicao" && r?.date === race.date) || null;
}

/* ── Balanço da semana (pedido de produto 2026-09-24) ───────────────────────
   CAROL.md §3: "Semana cumprida a 100% — uma frase de reconhecimento no
   resumo de segunda-feira". À segunda-feira a Carol faz o balanço da semana
   que acabou no domingo: o que foi feito face ao plano, o que ficou bem e a
   faltar, e o foco da semana que começa. Vale também à terça, para quem não
   abriu a app na segunda; depois disso já não é "o balanço", é história.

   Duas condições (revisão pré-deploy de 2026-09-24):
   - tem de haver pelo menos um registo DENTRO da semana revista. Um registo
     de hoje não conta: quem começa a usar a app numa segunda, ou volta de
     uma ausência, não recebe o balanço de uma semana vazia;
   - só quando não há mais nenhum momento. O dia da prova, a véspera, o
     "como correu?", o conflito de provas, o fim de bloco, um assunto por
     resolver ou um "Estás bem?" ficam com o dia inteiro: o balanço não lhes
     aparece por trás.
   A chave é a segunda-feira da semana revista: uma por semana. */
export const WEEK_REVIEW_DAYS = 2;

/** A semana que se revê hoje (segunda a domingo), só pelas datas: null fora
 *  de segunda e terça. `todayISO` é um dia de Lisboa. */
export function weekToReviewBounds(todayISO: string): { weekStart: string; weekEnd: string } | null {
  const today = dayOf(todayISO);
  if (!today) return null;
  // Dia da semana do próprio dia (0 domingo … 6 sábado), sem fuso: a data já é de Lisboa.
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const sinceMonday = (dow + 6) % 7; // 0 à segunda, 1 à terça…
  if (sinceMonday >= WEEK_REVIEW_DAYS) return null;
  const weekStart = addDaysISO(today, -sinceMonday - 7);
  return { weekStart, weekEnd: addDaysISO(weekStart, 6) };
}

/** A semana a rever hoje, se houver algum registo dentro dela. `recordDates`
 *  são datas de registos (corridas, refeições, ginásio, avaliações) — basta
 *  que incluam as dessa semana. */
export function findWeekToReview(todayISO: string, recordDates: Array<string | null | undefined> | null | undefined): { weekStart: string; weekEnd: string } | null {
  const bounds = weekToReviewBounds(todayISO);
  if (!bounds) return null;
  const inWeek = (recordDates || []).some((d) => {
    const day = dayOf(d ?? null);
    return !!day && day >= bounds.weekStart && day <= bounds.weekEnd;
  });
  return inWeek ? bounds : null;
}

/** O treino em falta é da semana que o balanço revê (à segunda, o de
 *  domingo)? Então é assunto do balanço e não um momento à parte. À terça, o
 *  de segunda já é da semana nova. Servidor e cliente usam esta régua. */
export function missedWorkoutInReview(
  missedDate: string,
  week: { weekStart: string; weekEnd: string } | null | undefined,
): boolean {
  return !!week && missedDate >= week.weekStart && missedDate <= week.weekEnd;
}

const DIAS_DA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
function diaCurto(iso: string): string {
  return DIAS_DA_SEMANA[new Date(`${iso}T00:00:00Z`).getUTCDay()];
}

/** Quantos treinos (corrida/ginásio, não cancelados, de um plano aceite) o
 *  plano tinha entre `fromExclusiveISO` e `toExclusiveISO` (os dias do
 *  silêncio) — e se algum plano aceite cobria esse período. Sem plano no
 *  período, o silêncio não sabe se houve descanso decidido ou nada: conta
 *  só a partir de SILENCE_DAYS_SEM_PLANO (revisão de 2026-09-26; a mesma
 *  ideia de liveItems, homeModels.js, do lado do cliente). */
function plannedTrainingsBetween(
  input: { plans?: TriggerPlan[] | null; planItems?: TriggerPlanItem[] | null },
  fromExclusiveISO: string,
  toExclusiveISO: string,
): { count: number; hasPlan: boolean } {
  const accepted = new Set((input.plans || []).filter((p) => p?.status === "aceite").map((p) => p.id));
  const hasPlan = (input.plans || []).some((p) => {
    // Um plano só de refeições (save_meal_suggestions) não decide descansos:
    // não cala o silêncio (segunda revisão pré-deploy de 2026-09-26).
    if (p?.status !== "aceite" || p.hasTraining === false) return false;
    const ps = dayOf(p.period_start ?? null);
    const pe = dayOf(p.period_end ?? null);
    // Em vigor até ontem, pelo menos — a régua da consulta do tick
    // (period_end >= ontem). Um bloco que acabou a meio do silêncio não o
    // calava para sempre no cliente, que lê todos os planos (revisão
    // pré-deploy de 2026-09-26).
    return ps != null && pe != null && pe >= addDaysISO(toExclusiveISO, -1) && ps <= toExclusiveISO;
  });
  const count = (input.planItems || []).filter((i) => {
    if (!i || !i.plan_id || !accepted.has(i.plan_id)) return false;
    if ((i.kind !== "corrida" && i.kind !== "ginasio") || i.status === "cancelado") return false;
    const d = dayOf(i.planned_date ?? null);
    return d != null && d > fromExclusiveISO && d < toExclusiveISO;
  }).length;
  return { count, hasPlan };
}

function addDaysISO(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** O input dos momentos proativos do servidor. */
export type ServerProactiveInput = {
    raceEvents: TriggerRace[] | null | undefined;
    runs: TriggerRun[] | null | undefined;
    lastRecordDate: string | null;
    /** P.5: o assunto por resolver do perfil (coach_intervention_*), e a
     *  origem guardada em coach_interventions quando quem chama a tiver. */
    intervention?: { status?: string | null; reason?: string | null; origin?: string | null } | null;
    /** P.5: os planos, para o conflito de provas e o fim de bloco. */
    plans?: TriggerPlan[] | null;
    /** P.6: os momentos que o atleta aceita. Um desligado não esconde os
     *  seguintes — passa-se ao próximo da lista. Sem isto, todos contam.
     *  A exceção é o balanço da semana: só entra num dia sem mais nenhum
     *  momento, ligado ou não. Um desligado que se aplique não é notificado,
     *  e o balanço não sai no lugar dele (P.14). */
    allowed?: string[] | null;
    /** Balanço da semana: datas de registos que cubram a semana revista (o
     *  tick só as lê à segunda e à terça — weekToReviewBounds). */
    weekRecordDates?: Array<string | null | undefined> | null;
    /** As chaves já entregues (coach_proactive_log), quando quem chama as
     *  tem — só o tick. Servem ao balanço da semana: um "como correu?" com
     *  corrida já entregue não lhe tira o dia (ver `holdsTheDay`). */
    deliveredKeys?: Iterable<string> | null;
    /** P.10, treino de ontem por registar: os itens dos planos (basta que
     *  incluam os dos planos aceites que cobrem ontem) e as datas das corridas
     *  e sessões de ginásio (basta que incluam ontem). */
    planItems?: TriggerPlanItem[] | null;
    trainingDates?: Array<string | null | undefined> | null;
    /** P.10, silêncio: o último check-in e o último treino (corrida ou ginásio). */
    lastCheckinDate?: string | null;
    lastTrainingDate?: string | null;
    /** A dor desse último check-in (revisão de 2026-09-26): acima do
     *  alarme, nem o silêncio nem o treino de ontem por registar se
     *  perguntam — ela já sabe porquê. */
    lastCheckinPain?: number | null;
    /** Silêncio (revisão de 2026-09-26): a última água registada
     *  (water_logs) — quem só regista água está por cá. */
    lastWaterDate?: string | null;
    /** A Vitrina (2026-09-25): as distribuições publicadas, o segmento do
     *  atleta, os dois consentimentos e as linhas DELE nas tabelas. */
    vitrina?: {
      snapshots: SnapshotRow[] | null | undefined;
      own: Segment | null;
      statsPoolConsent: boolean;
      leaderboardConsent: boolean;
      leaderboardEntries: LeaderboardEntryRow[] | null | undefined;
    } | null;
};

/** O momento mais importante agora, ou null. */
export function pickServerProactive(input: ServerProactiveInput, todayISO: string): ServerProactiveCandidate | null {
  return listServerProactive(input, todayISO)[0] ?? null;
}

/** TODOS os momentos que se aplicam agora, por ordem de prioridade (um por
 *  tipo). A notificação não pode ficar só com o primeiro: um assunto por
 *  resolver que o atleta não abre repete a mesma chave em todas as horas, e
 *  depois de notificado uma vez tapava a véspera e a manhã da prova para
 *  sempre (revisão pré-master de 2026-09-19). Quem notifica percorre a lista
 *  e fica com o primeiro que ainda pode sair — coach-proactive-tick/decide.ts
 *  (choosePush). */
export function listServerProactive(input: ServerProactiveInput, todayISO: string): ServerProactiveCandidate[] {
  const out: ServerProactiveCandidate[] = [];
  const ok = (t: ProactiveTriggerName) => !Array.isArray(input.allowed) || input.allowed.includes(t);
  const races = (input.raceEvents || []).filter((r) => r && typeof r.date === "string");
  const scheduled = races.filter((r) => r.status !== "concluida");
  const base = { raceId: null, raceName: null, hasRun: false, silenceDays: null, anchorDate: null, anchorAt: null };

  /* A lista monta-se com TODOS os momentos e só no fim se tiram os que o
     atleta desligou (`allowed`). O balanço da semana decide-se sobre a lista
     inteira: se o "Estás bem?" está desligado mas se aplica, o dia continua
     a ser dele — senão a notificação prometia o balanço e o chat, ao abrir,
     escrevia o "Estás bem?" (revisão pré-deploy de 2026-09-24). */

  // Um assunto por resolver passa à frente de tudo: é saúde ou um desvio
  // que ela já decidiu que precisa de conversa.
  if (input.intervention?.status === "needed") {
    out.push({ ...base, trigger: "intervention", key: interventionKey(input.intervention.reason), interventionTopic: interventionTopic(input.intervention) });
  }

  /* Num dia com mais do que uma prova, a véspera e a manhã são da PRINCIPAL
     (2026-09-26, Fase 0 do Troféu): uma prova de treino ou uma jornada de
     taça no mesmo dia não pode ficar com o momento — e a escolha já não
     depende da ordem em que o select devolveu as provas (pickRaceOfDay). */
  const morning = pickRaceOfDay(scheduled, todayISO);
  if (morning) {
    out.push({
      ...base, trigger: "race_morning", key: `race_morning:${morning.id}`, raceId: morning.id, raceName: morning.name ?? null,
      startMinutes: startTimeMinutes(morning.start_time), hasFirstKmPace: hasFirstKmPace(morning),
    });
  }

  const eve = pickRaceOfDay(scheduled, addDaysISO(todayISO, 1));
  if (eve) {
    out.push({ ...base, trigger: "race_eve", key: `race_eve:${eve.id}`, raceId: eve.id, raceName: eve.name ?? null, startMinutes: startTimeMinutes(eve.start_time) });
  }

  const conflict = detectRaceConflictServer(input.plans, races, todayISO);
  if (conflict) {
    const target = races.find((r) => r.id === conflict.plan.race_id) ?? null;
    out.push({
      ...base,
      trigger: "race_conflict",
      key: raceConflictKey(conflict.plan.id, conflict.races.map((r) => r.id)),
      raceId: target?.id ?? null,
      raceName: target?.name ?? null,
      planId: conflict.plan.id,
      conflictRaceNames: conflict.races.map((r) => r.name || "outra prova"),
    });
  }

  const past = races
    .map((race) => ({ race, gap: daysBetween(race.date.slice(0, 10), todayISO) }))
    .filter(({ gap }) => gap >= 0 && gap <= RACE_AFTER_DAYS_WITH_RUN)
    .sort((a, b) => a.gap - b.gap);
  // A prova mais recente ganha: um só "depois da prova" na lista.
  for (const { race, gap } of past) {
    const run = findRaceRunServer(input.runs, race);
    const raceDay = gap === 0 ? "hoje" : gap === 1 ? "ontem" : diaCurto(race.date.slice(0, 10));
    if (run) {
      out.push({
        ...base, trigger: "race_after", key: `race_after:${race.id}:${run.id || "corrida"}`, raceId: race.id, raceName: race.name ?? null, hasRun: true, anchorDate: race.date.slice(0, 10), anchorAt: run.created_at ?? null,
        raceDay,
        raceDistanceKm: Number(race.distance_km) > 0 ? Number(race.distance_km) : null,
      });
      break;
    }
    /* Uma corrida nesse dia, registada pelo separador normal (sem
       `race_id`, e sem ser "competicao" — findRaceRunServer só apanha essa
       combinação): não se pede o registo de uma prova já registada — pede-se
       para a ligar (revisão de 2026-09-26). */
    const unlinked = findUnlinkedRaceDayRun(input.runs, race, todayISO);
    if (unlinked) {
      out.push({ ...base, trigger: "race_after", key: `race_after:${race.id}:por-ligar`, raceId: race.id, raceName: race.name ?? null, hasRun: true, unlinkedRun: true, raceDay, anchorDate: race.date.slice(0, 10), anchorAt: unlinked.created_at ?? null });
      break;
    }
    if (gap >= 1 && gap <= RACE_AFTER_DAYS_WITHOUT_RUN) {
      out.push({ ...base, trigger: "race_after", key: `race_after:${race.id}:sem-registo`, raceId: race.id, raceName: race.name ?? null, raceDay, anchorDate: race.date.slice(0, 10) });
      break;
    }
  }

  const block = findEndingBlock(input.plans, todayISO);
  if (block) {
    out.push({ ...base, trigger: "block_end", key: `block_end:${block.id}`, planId: block.id, blockEnd: dayOf(block.period_end), anchorDate: dayOf(block.period_end) });
  }

  // Uma dor acima do alarme, ou um assunto já aberto (P.5), explicam o
  // silêncio e o treino de ontem por registar — ela já sabe porquê, e
  // perguntar "está tudo bem?" ou "aconteceu alguma coisa?" ignorava o que
  // o atleta já lhe tinha dito (revisão de 2026-09-26).
  const jaSabePorque = knowsWhySilent(input, todayISO);

  const last = input.lastRecordDate ? input.lastRecordDate.slice(0, 10) : null;
  if (last && !jaSabePorque) {
    const gap = daysBetween(last, todayISO);
    const { count: plannedCount, hasPlan } = plannedTrainingsBetween(input, last, todayISO);
    const threshold = hasPlan ? SILENCE_DAYS : SILENCE_DAYS_SEM_PLANO;
    // Com plano no período e nenhum treino previsto (só descanso decidido),
    // o silêncio não é assunto: não se pergunta "está tudo bem?" a quem só
    // teve dias de descanso.
    if (gap >= threshold && !(hasPlan && plannedCount === 0)) {
      /* Com check-ins depois do último registo, ele está por cá: o que falta
         são os treinos, não notícias dele (P.10). Os dias contam então desde
         o último treino — o último registo pode ter sido uma refeição. */
      const checkin = dayOf(input.lastCheckinDate ?? null);
      const checkinAfter = checkin && checkin > last ? checkin : null;
      const training = dayOf(input.lastTrainingDate ?? null);
      // Sem check-ins, a água depois do último registo também diz que ele
      // abre a app: "não vejo nada teu" era falso (revisão de 2026-09-26).
      const water = dayOf(input.lastWaterDate ?? null);
      out.push({
        ...base, trigger: "silence", key: `silence:${last}`, silenceDays: gap, anchorDate: last,
        ...(hasPlan ? { plannedTrainingsSince: plannedCount, sinceWeekday: diaCurto(addDaysISO(last, 1)) } : {}),
        ...(checkinAfter ? { lastCheckinDate: checkinAfter, trainingSilenceDays: training ? daysBetween(training, todayISO) : null } : {}),
        ...(!checkinAfter && water && water > last ? { lastWaterDate: water } : {}),
      });
    }
  }

  // O balanço da semana só entra num dia sem mais nada: a prova, a véspera,
  // o "como correu?", o conflito de provas, um assunto por resolver, o fim
  // de bloco ou um "Estás bem?" ficam com o dia — mesmo desligados no
  // Perfil, porque o filtro das preferências só vem a seguir (P.14).
  //
  // A exceção é o "como correu?" COM corrida já entregue (2026-09-26, Fase
  // 0 do Troféu). Esse candidato fica na lista durante os
  // RACE_AFTER_DAYS_WITH_RUN dias seguintes à prova, mesmo depois de a
  // conversa ter acontecido — quem o cala é decide.ts (ja_entregue,
  // balanco_feito). Uma prova ao sábado com o balanço feito no domingo
  // tapava o balanço da semana de segunda e de terça, e com uma prova (ou
  // jornada) por fim de semana não havia balanço nunca. "Entregue" é o que
  // decide.ts já lê: a chave no coach_proactive_log (só o tick a tem) ou o
  // balanço gravado na prova (race_events.coach_balance — que o cliente
  // também tem, e é por aí que a notificação e o chat continuam a concordar).
  // O "como correu?" SEM registo continua a ficar com o dia: não há no
  // cliente prova de que já foi dito, e a notificação prometia um balanço
  // que o chat não escrevia.
  //
  // Caso conhecido e aceite (revisão da Fase 0, 2026-09-26): se a chave do
  // race_after está no log mas a escrita de race_events.coach_balance falhou
  // (coach-chat, ao gravar o balanço), só o servidor sabe que foi entregue.
  // O tick envia então o balanço da semana, que a lista do cliente não tem
  // (para ele, o "como correu?" ainda fica com o dia); o toque cai no
  // race_after, que responde already_sent, e o loop do Coach.jsx não
  // encontra o week_review a seguir. Efeito: uma notificação que abre o chat
  // sem mensagem nova, só nesse dia e só depois de uma falha de escrita que
  // já é avisada no log. Corrigir exigia dar ao cliente as chaves entregues
  // (coach_proactive_log), e isso não cabe na Fase 0.
  const delivered = new Set(input.deliveredKeys ?? []);
  // A corrida por ligar também fica com o dia, como o "como correu?" sem
  // registo: não grava coach_balance, e o cliente, sem as chaves entregues,
  // não teria como a largar — a notificação prometia o balanço da semana que
  // o chat não abria (segunda revisão pré-deploy de 2026-09-26).
  const holdsTheDay = (c: ServerProactiveCandidate) => {
    if (c.trigger !== "race_after" || !c.hasRun || c.unlinkedRun) return true;
    if (delivered.has(c.key)) return false;
    return !races.find((r) => r.id === c.raceId)?.coach_balance;
  };
  const week = !out.some(holdsTheDay) ? findWeekToReview(todayISO, input.weekRecordDates) : null;
  if (week) {
    out.push({ ...base, trigger: "week_review", key: `week_review:${week.weekStart}`, anchorDate: week.weekEnd, weekStart: week.weekStart, weekEnd: week.weekEnd });
  }
  /* O treino de ontem por registar (P.10) vem por último e não tira o dia ao
     balanço da semana. À segunda, o treino de domingo que ficou por fazer é
     da semana revista: é assunto do balanço, e não entra. À terça, o de
     segunda já é da semana nova e entra a seguir ao balanço — quem já o
     teve na segunda é perguntado; quem não abriu a app, tem o balanço
     primeiro (revisão pré-deploy de 2026-09-25: à terça nunca saía). */
  const missed = jaSabePorque ? null : findMissedWorkout(input, todayISO);
  if (missed && !missedWorkoutInReview(missed.date, week)) {
    out.push({ ...base, trigger: "missed_workout", key: `missed_workout:${missed.date}`, anchorDate: missed.date, missedLabel: missedWorkoutLabel(missed.items) });
  }
  /* A Vitrina (2026-09-25) vem no fim: é novidade, não urgência — espera
     pelo dia em que não há mais nada, e não tira o dia ao balanço da semana
     (entra depois dele ser decidido). As tabelas antes do percentil: é mais
     pessoal. Sem consentimento, nenhum dos dois (vitrina.ts). */
  const v = input.vitrina;
  if (v) {
    const board = leaderboardMoment(v.leaderboardEntries, v.snapshots, v.own, v.leaderboardConsent);
    if (board) {
      out.push({ ...base, trigger: "leaderboard", key: board.key, vitrinaStage: board.stage, leaderboardRank: board.rank ?? null, windowStart: board.windowStart, anchorDate: board.windowStart });
    }
    const ready = percentileReadyMoment(v.snapshots, v.own, v.statsPoolConsent);
    if (ready) {
      const near = ready.stage === "perto" ? percentileAvailability(v.snapshots, v.own)?.near[0] ?? null : null;
      out.push({
        ...base, trigger: "percentile_ready", key: ready.key, vitrinaStage: ready.stage, windowStart: ready.windowStart, anchorDate: ready.windowStart,
        ...(near ? { nearSegment: { step: near.step, terrain: near.segment.terrain, gender: near.segment.gender } } : {}),
      });
    }
  }
  return out.filter((c) => ok(c.trigger));
}

/** O balanço da semana de hoje, pela mesma régua do servidor — é a função
 *  que o cliente (src/utils/coachProactive.js) usa, para a regra "só num dia
 *  sem mais nenhum momento" existir num sítio só. Ignora `allowed`: o
 *  interruptor do Perfil só cala a notificação (decisão de produto). */
export function weekReviewCandidate(input: ServerProactiveInput, todayISO: string): ServerProactiveCandidate | null {
  return listServerProactive({ ...input, allowed: null }, todayISO).find((c) => c.trigger === "week_review") ?? null;
}

/** O silêncio de hoje, pela mesma régua do servidor — para o cliente
 *  (src/utils/coachProactive.js) nunca discordar do tick sobre quando um
 *  "Estás bem?" faz sentido (plano no período, dor no check-in, assunto já
 *  aberto — revisão de 2026-09-26). Ignora `allowed`, como weekReviewCandidate. */
export function silenceCandidate(input: ServerProactiveInput, todayISO: string): ServerProactiveCandidate | null {
  return listServerProactive({ ...input, allowed: null }, todayISO).find((c) => c.trigger === "silence") ?? null;
}

/* Os nomes que a app dá a uma prova sem nome (RunRegistration: "Corrida de
   Hoje", "Prova"), e o que o conflito de provas põe no lugar de um nome em
   falta, não são nomes: "Vi o registo da prova Corrida de Hoje", dias
   depois, soava a formulário (revisão de 2026-09-26). */
const NOMES_POR_OMISSAO = new Set(["corrida de hoje", "prova", "outra prova"]);
export function nomeProprio(name: string | null | undefined): string {
  const n = (name || "").trim().slice(0, 60);
  return n && !NOMES_POR_OMISSAO.has(n.toLowerCase()) ? n : "";
}

export function kmTexto(v: number): string {
  return `${String(Math.round(v * 10) / 10).replace(".", ",")} km`;
}

function horaDe(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Na véspera, uma partida a partir desta hora já não é "amanhã de manhã". */
export const RACE_EVE_AFTERNOON_MINUTES = 12 * 60;

const GENERO_DO_GRUPO: Record<string, string> = { F: "feminino", M: "masculino" };

/* O texto da notificação, na voz dela (carolTone): sem emoji, sem ponto de
   exclamação, sem frase de manual. É curto porque o que ela tem a dizer a
   sério é escrito no chat, com o contexto todo, quando o atleta abre. */
export function proactivePushMessage(c: ServerProactiveCandidate): { title: string; body: string } {
  const name = nomeProprio(c.raceName);
  const title = "Carol";
  switch (c.trigger) {
    // "Tenho duas coisas para te dizer" era isco; agora diz o que deixou —
    // o ritmo do primeiro km só quando há plano de ritmo (revisão de 2026-09-26).
    case "race_morning":
      return {
        title,
        body: `Hoje é dia de prova${name ? `: ${name}` : ""}. ${c.hasFirstKmPace ? "Deixei-te o ritmo do primeiro km." : "Fala comigo antes da partida."}`,
      };
    // Uma partida à tarde não tem "amanhã de manhã" (a São Silvestre às
    // 17:30), e sem hora marcada não se sabe (revisão de 2026-09-26).
    case "race_eve": {
      const tarde = c.startMinutes != null && c.startMinutes >= RACE_EVE_AFTERNOON_MINUTES;
      const partida = tarde ? `, partida às ${horaDe(c.startMinutes!)}` : "";
      const amanha = c.startMinutes == null ? "para amanhã" : tarde ? "para amanhã até à partida" : "para amanhã de manhã";
      return { title, body: `Amanhã é dia de prova${name ? `: ${name}` : ""}${partida}. Tenho o plano para hoje à noite e ${amanha}.` };
    }
    case "race_after":
      if (c.unlinkedRun) {
        return { title, body: `Vi uma corrida no dia da ${name ? `prova ${name}` : "tua prova"}. É ela? Vem confirmar e faço o balanço contigo.` };
      }
      if (c.hasRun && !name) {
        const dia = c.raceDay ? ` de ${c.raceDay}` : "";
        const km = c.raceDistanceKm ? `, ${kmTexto(c.raceDistanceKm)}` : "";
        return { title, body: `Vi o registo da tua prova${dia}${km}. Quero fazer o balanço contigo.` };
      }
      return {
        title,
        body: c.hasRun
          ? `Vi o registo da prova ${name}. Quero fazer o balanço contigo.`
          : `Como correu a prova${name ? ` ${name}` : ""}? Conta-me, e regista a corrida.`,
      };
    case "silence":
      // Com check-ins recentes ele está por cá: o que falta são os treinos (P.10).
      if (c.lastCheckinDate) {
        /* Sem nenhum treino registado, não há "há N dias": os dias do
           silêncio contam desde o último registo (uma refeição), e o chat,
           no mesmo caso, diz "não há treinos registados" (revisão pré-deploy
           de 2026-09-25). */
        return c.trainingSilenceDays == null
          ? { title, body: "Ainda não vejo nenhum treino teu registado. Está tudo bem?" }
          : { title, body: `Não vejo nenhum treino teu há ${c.trainingSilenceDays} dias. Está tudo bem?` };
      }
      /* Com plano no período (revisão de 2026-09-26): nomear os treinos que
         ficaram por fazer desde esse dia, em vez do "não vejo nada teu"
         genérico — ela sabe o que estava previsto. */
      if (c.plannedTrainingsSince != null && c.plannedTrainingsSince > 0) {
        // Pergunta, não acusa (P.10): pode ter treinado sem registar.
        const desde = c.sinceWeekday ? ` desde ${c.sinceWeekday}` : "";
        return c.plannedTrainingsSince === 1
          ? { title, body: `O plano tinha 1 treino${desde} e não o vejo registado. Está tudo bem?` }
          : { title, body: `O plano tinha ${c.plannedTrainingsSince} treinos${desde} e não vejo nenhum registado. Está tudo bem?` };
      }
      if (c.lastWaterDate) {
        return { title, body: `Vejo a água registada, mas nenhum treino nem refeição há ${c.silenceDays ?? SILENCE_DAYS} dias. Está tudo bem?` };
      }
      return { title, body: `Não vejo nada teu há ${c.silenceDays ?? SILENCE_DAYS} dias. Estás bem?` };
    // A frase fixa de propósito (P.10): pergunta, não acusa — pode ter treinado e não registado.
    // Nomear o treino (revisão de 2026-09-26): "o treino" genérico soava a automatismo.
    case "missed_workout":
      return {
        title,
        body: c.missedLabel
          ? `Não vi o treino de ontem (${c.missedLabel}) registado. Aconteceu alguma coisa?`
          : "Não vi o treino de ontem registado. Aconteceu alguma coisa?",
      };
    /* Nunca o motivo: pode ser de saúde (uma dor), e o ecrã bloqueado não é
       sítio para o dizer. Só de onde veio, e "antes do próximo treino" em vez
       de "quando puderes" — uma dor no check-in não espera (revisão de
       2026-09-26). */
    case "intervention":
      if (c.interventionTopic === "checkin") return { title, body: "Li o teu check-in. Quero falar contigo antes do próximo treino." };
      if (c.interventionTopic === "carga_acima_do_plano") return { title, body: "A carga destes dias subiu acima do plano. Quero ver isso contigo antes do próximo treino." };
      if (c.interventionTopic === "carga") return { title, body: "A carga destes dias subiu acima do habitual. Quero ver isso contigo antes do próximo treino." };
      return { title, body: "Quero falar contigo antes do próximo treino." };
    case "race_conflict": {
      const outras = c.conflictRaceNames ?? [];
      if (outras.length >= 2) {
        const quantas = ["duas", "três", "quatro"][outras.length - 2] ?? String(outras.length);
        return { title, body: `Tens mais ${quantas} provas principais a meio deste bloco. Temos de decidir qual é o objetivo.` };
      }
      const outra = nomeProprio(outras[0]);
      return { title, body: `Há outra prova principal a meio deste bloco${outra ? `: ${outra}` : ""}. Temos de decidir qual é o objetivo.` };
    }
    case "block_end":
      return { title, body: "O teu bloco de treino está a acabar. Vamos ver como correu e preparar o próximo." };
    case "week_review":
      return { title, body: "A semana fechou. Vem ver comigo como correu e o que fica para esta." };
    /* A Vitrina: frases fixas, sem posição nem percentil — o ecrã bloqueado
       não é sítio para números de comparação com outros atletas. O número
       diz-se no chat, a ele. */
    // Sai à terça, sobre a quinzena que fechou no domingo: "nesta quinzena"
    // já era a nova (revisão de 2026-09-26).
    case "leaderboard":
      return c.vitrinaStage === "saiu"
        ? { title, body: "Na quinzena que fechou saíste das tabelas do teu escalão. Vem ver comigo o que mudou." }
        : { title, body: "Entraste nas tabelas do teu escalão. Vem ver onde ficaste." };
    // "Grupos ao lado" era vocabulário da app: diz-se qual é o grupo, como o
    // "Onde estás" o oferece (revisão de 2026-09-26).
    case "percentile_ready": {
      if (c.vitrinaStage === "meu") return { title, body: "O teu escalão já tem números publicados. Vem ver onde estás." };
      const near = c.nearSegment;
      const grupo = near?.step === "modalidade" ? `o de ${near.terrain}`
        : near?.step === "escalao" ? "o escalão ao lado"
          : near?.step === "genero" && GENERO_DO_GRUPO[near.gender] ? `o ${GENERO_DO_GRUPO[near.gender]} da tua idade`
            : null;
      return grupo
        ? { title, body: `O teu escalão ainda não tem números, mas ${grupo} já tem. Vem ver onde ficas nesse.` }
        : { title, body: "O teu escalão ainda não tem números, mas já há outros com números publicados. Vem ver onde ficas." };
    }
  }
}

/** O separador que o toque abre. O assunto por resolver e o conflito de
 *  provas têm o seu aviso no Início, com "Falar com a Carol" — que abre a
 *  conversa certa. Os outros abrem o Coach, onde ela escreve a mensagem. */
export function proactiveTab(trigger: ProactiveTriggerName): "coach" | "home" {
  return trigger === "intervention" || trigger === "race_conflict" ? "home" : "coach";
}

export const DEFAULT_PUSH_START_HOUR = 9;
export const DEFAULT_PUSH_END_HOUR = 21;
export const RACE_MORNING_EARLIEST_HOUR = 6;
/** Com hora de partida, a manhã da prova sai no máximo 2 h antes dela (P.10). */
export const RACE_MORNING_LEAD_MINUTES = 120;
/** Sem hora de partida, a manhã da prova não sai a partir das 10h: a prova
 *  pode já estar a decorrer (revisão de 2026-09-26). */
export const RACE_MORNING_NO_START_LATEST_HOUR = 10;
/** A véspera não sai de madrugada: às 0h30, para quem ainda está acordado,
 *  "amanhã" é o dia que está a viver (revisão de 2026-09-26). */
export const RACE_EVE_EARLIEST_HOUR = 6;
export const ALL_PROACTIVE_TRIGGERS: ProactiveTriggerName[] = ["intervention", "race_morning", "race_eve", "race_conflict", "race_after", "block_end", "silence", "missed_workout", "week_review", "leaderboard", "percentile_ready"];

/** As preferências do atleta (P.6): a janela em horas de Lisboa, o máximo
 *  por dia e os momentos que aceita. Tudo opcional, com os valores por omissão
 *  da migration carol_push_preferences. */
export interface PushPreferences {
  startHour?: number | null;
  endHour?: number | null;
  maxPerDay?: number | null;
  types?: string[] | null;
}

function inWindow(hour: number, start: number, end: number): boolean {
  if (start === end) return true;                       // 24 horas
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;                   // atravessa a meia-noite
}

/** Janela de envio, em horas de Lisboa, a do atleta (9h–21h por omissão). A
 *  manhã da prova é a exceção: a prova não espera, e pode sair a partir das
 *  6h mesmo que a janela dele comece mais tarde — nunca depois do fim dela.
 *
 *  Com a hora de partida conhecida (P.10, confirmado pelo produto a
 *  2026-09-24), a manhã da prova sai entre 2 h antes da partida (nunca antes
 *  das 6h) e a própria partida — nem cedo de mais, nem a meio da prova —, e
 *  nunca depois do fim da janela. Sem ela, nunca a partir das 10h. A véspera
 *  nunca entre as 0h e as 6h, mesmo numa janela que atravesse a meia-noite.
 *  `minuteOfDay` é a hora de Lisboa em minutos; sem ele conta a hora certa. */
export function isWithinProactiveWindow(
  trigger: ProactiveTriggerName,
  lisbonHour: number,
  prefs: PushPreferences = {},
  opts: { minuteOfDay?: number | null; raceStartMinutes?: number | null } = {},
): boolean {
  let start = Number.isInteger(prefs.startHour) ? prefs.startHour! : DEFAULT_PUSH_START_HOUR;
  let end = Number.isInteger(prefs.endHour) ? prefs.endHour! : DEFAULT_PUSH_END_HOUR;
  /* Início igual ao fim é, quase sempre, um engano no Perfil — e na Carol
     não pode querer dizer "24 horas": um "Estás bem?" às 3h da manhã. Cai na
     janela por omissão (revisão pré-master da P.6). */
  if (start === end) { start = DEFAULT_PUSH_START_HOUR; end = DEFAULT_PUSH_END_HOUR; }
  if (trigger === "race_eve" && lisbonHour < RACE_EVE_EARLIEST_HOUR) return false;
  // Às 0h30, para quem ainda está acordado, "ontem" é o dia que está a viver.
  if (trigger === "missed_workout" && lisbonHour < RACE_EVE_EARLIEST_HOUR) return false;
  if (trigger === "race_morning" && opts.raceStartMinutes != null) {
    const now = opts.minuteOfDay ?? lisbonHour * 60;
    const earliest = Math.max(RACE_MORNING_EARLIEST_HOUR * 60, opts.raceStartMinutes - RACE_MORNING_LEAD_MINUTES);
    // Uma janela que atravessa a meia-noite não tem "fim" de manhã.
    const beforeWindowEnd = start < end ? lisbonHour < end : true;
    return now >= earliest && now < opts.raceStartMinutes && beforeWindowEnd;
  }
  if (trigger === "race_morning" && lisbonHour >= RACE_MORNING_NO_START_LATEST_HOUR) return false;
  if (inWindow(lisbonHour, start, end)) return true;
  if (trigger === "race_morning" && start < end && start > RACE_MORNING_EARLIEST_HOUR) {
    return lisbonHour >= RACE_MORNING_EARLIEST_HOUR && lisbonHour < end;
  }
  return false;
}
