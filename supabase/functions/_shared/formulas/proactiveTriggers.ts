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
import { type LeaderboardEntryRow, leaderboardMoment, percentileReadyMoment, type SnapshotRow } from "./vitrina.ts";

export const SILENCE_DAYS = 3;
export const RACE_AFTER_DAYS_WITH_RUN = 7;
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
  /** Manhã da prova: a hora de partida em minutos desde a meia-noite de
   *  Lisboa, ou null sem hora marcada (P.10). */
  startMinutes?: number | null;
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

export function isRacePlanItemServer(item: TriggerPlanItem): boolean {
  return item?.kind === "corrida" && (item.training_type === "prova" || item.training_type === "competicao");
}

export function findMissedWorkout(
  input: { plans?: TriggerPlan[] | null; planItems?: TriggerPlanItem[] | null; trainingDates?: Array<string | null | undefined> | null; raceEvents?: TriggerRace[] | null },
  todayISO: string,
): { date: string; items: TriggerPlanItem[] } | null {
  const yesterday = addDaysISO(todayISO, -1);
  if ((input.raceEvents || []).some((r) => r && r.status !== "concluida" && dayOf(r.date) === todayISO)) return null;
  if ((input.trainingDates || []).some((d) => dayOf(d ?? null) === yesterday)) return null;
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

function addDaysISO(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** O input dos momentos proativos do servidor. */
export type ServerProactiveInput = {
    raceEvents: TriggerRace[] | null | undefined;
    runs: TriggerRun[] | null | undefined;
    lastRecordDate: string | null;
    /** P.5: o assunto por resolver do perfil (coach_intervention_*). */
    intervention?: { status?: string | null; reason?: string | null } | null;
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
    /** P.10, treino de ontem por registar: os itens dos planos (basta que
     *  incluam os dos planos aceites que cobrem ontem) e as datas das corridas
     *  e sessões de ginásio (basta que incluam ontem). */
    planItems?: TriggerPlanItem[] | null;
    trainingDates?: Array<string | null | undefined> | null;
    /** P.10, silêncio: o último check-in e o último treino (corrida ou ginásio). */
    lastCheckinDate?: string | null;
    lastTrainingDate?: string | null;
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
    out.push({ ...base, trigger: "intervention", key: interventionKey(input.intervention.reason) });
  }

  const morning = scheduled.find((r) => r.date.slice(0, 10) === todayISO);
  if (morning) {
    out.push({
      ...base, trigger: "race_morning", key: `race_morning:${morning.id}`, raceId: morning.id, raceName: morning.name ?? null,
      startMinutes: startTimeMinutes(morning.start_time),
    });
  }

  const eve = scheduled.find((r) => daysBetween(todayISO, r.date.slice(0, 10)) === 1);
  if (eve) out.push({ ...base, trigger: "race_eve", key: `race_eve:${eve.id}`, raceId: eve.id, raceName: eve.name ?? null });

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
    if (run) {
      out.push({ ...base, trigger: "race_after", key: `race_after:${race.id}:${run.id || "corrida"}`, raceId: race.id, raceName: race.name ?? null, hasRun: true, anchorDate: race.date.slice(0, 10), anchorAt: run.created_at ?? null });
      break;
    }
    if (gap >= 1 && gap <= RACE_AFTER_DAYS_WITHOUT_RUN) {
      out.push({ ...base, trigger: "race_after", key: `race_after:${race.id}:sem-registo`, raceId: race.id, raceName: race.name ?? null, anchorDate: race.date.slice(0, 10) });
      break;
    }
  }

  const block = findEndingBlock(input.plans, todayISO);
  if (block) {
    out.push({ ...base, trigger: "block_end", key: `block_end:${block.id}`, planId: block.id, blockEnd: dayOf(block.period_end), anchorDate: dayOf(block.period_end) });
  }

  const last = input.lastRecordDate ? input.lastRecordDate.slice(0, 10) : null;
  if (last) {
    const gap = daysBetween(last, todayISO);
    if (gap >= SILENCE_DAYS) {
      /* Com check-ins depois do último registo, ele está por cá: o que falta
         são os treinos, não notícias dele (P.10). Os dias contam então desde
         o último treino — o último registo pode ter sido uma refeição. */
      const checkin = dayOf(input.lastCheckinDate ?? null);
      const checkinAfter = checkin && checkin > last ? checkin : null;
      const training = dayOf(input.lastTrainingDate ?? null);
      out.push({
        ...base, trigger: "silence", key: `silence:${last}`, silenceDays: gap, anchorDate: last,
        ...(checkinAfter ? { lastCheckinDate: checkinAfter, trainingSilenceDays: training ? daysBetween(training, todayISO) : null } : {}),
      });
    }
  }

  // O balanço da semana só entra num dia sem mais nada: a prova, a véspera,
  // o "como correu?", o conflito de provas, um assunto por resolver, o fim
  // de bloco ou um "Estás bem?" ficam com o dia — mesmo desligados no
  // Perfil, porque o filtro das preferências só vem a seguir (P.14).
  const week = out.length === 0 ? findWeekToReview(todayISO, input.weekRecordDates) : null;
  if (week) {
    out.push({ ...base, trigger: "week_review", key: `week_review:${week.weekStart}`, anchorDate: week.weekEnd, weekStart: week.weekStart, weekEnd: week.weekEnd });
  }
  /* O treino de ontem por registar (P.10) vem por último e não tira o dia ao
     balanço da semana. À segunda, o treino de domingo que ficou por fazer é
     da semana revista: é assunto do balanço, e não entra. À terça, o de
     segunda já é da semana nova e entra a seguir ao balanço — quem já o
     teve na segunda é perguntado; quem não abriu a app, tem o balanço
     primeiro (revisão pré-deploy de 2026-09-25: à terça nunca saía). */
  const missed = findMissedWorkout(input, todayISO);
  if (missed && !missedWorkoutInReview(missed.date, week)) {
    out.push({ ...base, trigger: "missed_workout", key: `missed_workout:${missed.date}`, anchorDate: missed.date });
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
      out.push({ ...base, trigger: "percentile_ready", key: ready.key, vitrinaStage: ready.stage, windowStart: ready.windowStart, anchorDate: ready.windowStart });
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

/* O texto da notificação, na voz dela (carolTone): sem emoji, sem ponto de
   exclamação, sem frase de manual. É curto porque o que ela tem a dizer a
   sério é escrito no chat, com o contexto todo, quando o atleta abre. */
export function proactivePushMessage(c: ServerProactiveCandidate): { title: string; body: string } {
  const name = (c.raceName || "").trim().slice(0, 60);
  const title = "Carol";
  switch (c.trigger) {
    case "race_morning":
      return { title, body: `Hoje é dia de prova${name ? `: ${name}` : ""}. Tenho duas coisas para te dizer antes da partida.` };
    case "race_eve":
      return { title, body: `Amanhã é dia de prova${name ? `: ${name}` : ""}. Tenho o plano para hoje à noite e para amanhã de manhã.` };
    case "race_after":
      return {
        title,
        body: c.hasRun
          ? `Vi o registo da prova${name ? ` ${name}` : ""}. Quero fazer o balanço contigo.`
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
      return { title, body: `Não vejo nada teu há ${c.silenceDays ?? SILENCE_DAYS} dias. Estás bem?` };
    // A frase fixa de propósito (P.10): pergunta, não acusa — pode ter treinado e não registado.
    case "missed_workout":
      return { title, body: "Não vi o treino de ontem registado. Aconteceu alguma coisa?" };
    // Genérica de propósito: o motivo pode ser de saúde (uma dor), e o
    // ecrã bloqueado não é sítio para o dizer.
    case "intervention":
      return { title, body: "Preciso de falar contigo sobre uma coisa que vi. Abre a app quando puderes." };
    case "race_conflict":
      return { title, body: "Tens duas provas principais no mesmo bloco. Temos de decidir qual é o objetivo." };
    case "block_end":
      return { title, body: "O teu bloco de treino está a acabar. Vamos ver como correu e preparar o próximo." };
    case "week_review":
      return { title, body: "A semana fechou. Vem ver comigo como correu e o que fica para esta." };
    /* A Vitrina: frases fixas, sem posição nem percentil — o ecrã bloqueado
       não é sítio para números de comparação com outros atletas. O número
       diz-se no chat, a ele. */
    case "leaderboard":
      return c.vitrinaStage === "saiu"
        ? { title, body: "Nesta quinzena saíste das tabelas do teu escalão. Vem ver comigo o que mudou." }
        : { title, body: "Entraste nas tabelas do teu escalão. Vem ver onde ficaste." };
    case "percentile_ready":
      return c.vitrinaStage === "meu"
        ? { title, body: "O teu escalão já tem números publicados. Vem ver onde estás." }
        : { title, body: "Já há números publicados de grupos ao lado do teu escalão. Vem ver onde estás." };
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
 *  nunca depois do fim da janela. `minuteOfDay` é a hora de Lisboa em
 *  minutos; sem ele conta a hora certa. */
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
  if (trigger === "race_morning" && opts.raceStartMinutes != null) {
    const now = opts.minuteOfDay ?? lisbonHour * 60;
    const earliest = Math.max(RACE_MORNING_EARLIEST_HOUR * 60, opts.raceStartMinutes - RACE_MORNING_LEAD_MINUTES);
    // Uma janela que atravessa a meia-noite não tem "fim" de manhã.
    const beforeWindowEnd = start < end ? lisbonHour < end : true;
    return now >= earliest && now < opts.raceStartMinutes && beforeWindowEnd;
  }
  if (inWindow(lisbonHour, start, end)) return true;
  if (trigger === "race_morning" && start < end && start > RACE_MORNING_EARLIEST_HOUR) {
    return lisbonHour >= RACE_MORNING_EARLIEST_HOUR && lisbonHour < end;
  }
  return false;
}
