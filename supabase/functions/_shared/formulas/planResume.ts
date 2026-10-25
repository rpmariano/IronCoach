// Retomar um plano partido que ficou a meio (pedido do Rui, 2026-10-25).
//
// Um plano longo propõe-se em partes de 7 dias, e a mensagem da Carol que
// propõe uma parte guarda a seguinte em coach_messages.plan_continuation
// (coach-chat, MAX_PLAN_SPAN_DAYS). Se o cliente perde a cadeia — caso real:
// a parte 1 de 5 aceite como plano normal a 25/10, e nunca se pediu a parte 2
// —, a Carol retoma-a por iniciativa dela: trigger plan_resume, pelo canal
// proativo de sempre (o coach-proactive-tick, com horário e limites).
//
// Como os avisos do Troféu, plan_resume não passa por carol_push_types (a
// cadeia é dele: foi ele que pediu o plano) nem por listServerProactive (a
// paridade de chaves com o cliente não muda): é um candidato a mais do tick,
// no fim da lista.
//
// Pura, para se testar sem rede.

import type { ServerProactiveCandidate } from "./proactiveTriggers.ts";

export const PLAN_RESUME_TRIGGER = "plan_resume" as const;
/** Os chips da mensagem dela. */
export const PLAN_RESUME_SEND = "Manda a próxima semana";
export const PLAN_RESUME_LATER = "Agora não";
/** Só depois de 2 h — dá tempo a quem está a ver a proposta — e até 3 dias
 *  depois do início da parte prometida (mais tarde, a semana já passou). */
export const PLAN_RESUME_MIN_AGE_MS = 2 * 3600 * 1000;
export const PLAN_RESUME_MAX_LATE_DAYS = 3;

export type PlanContinuationData = { from: string; to: string; part: number; of: number; until: string };

/** O que a Carol precisa para escrever (textos dela, carol-plan-resume-textos.md):
 *  a semana anterior (prevFrom/prevTo), se está no calendário (applied: há
 *  itens ACEITES antes do from, desde o início da cadeia), a que falta
 *  (from/to), até onde vai o plano e a prova, se se souber. */
export type PlanResumeInfo = PlanContinuationData & {
  message_id: string;
  prevFrom: string;
  prevTo: string;
  applied: boolean;
  raceName: string | null;
};

export type PlanResumeCandidate = Omit<ServerProactiveCandidate, "trigger"> & {
  trigger: typeof PLAN_RESUME_TRIGGER;
  resume: PlanResumeInfo;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Um pedido de plano numa mensagem dele: um verbo de pedido E o que se pede
   (o mesmo critério do isPlanTurn do coach-chat, que o importa daqui — só a
   palavra dava falsos positivos: «Como correu a minha semana?»). */
const PLAN_VERB_RE = /\b(?:faz(?:e|es|er)?|monta(?:r)?|planeia|planear|prepara(?:r)?|quero|queria|gostava|ajusta(?:r)?|refaz(?:er)?|refazes|cria(?:r)?|organiza(?:r)?|prop[õo]e|propor|prefiro|preciso)\b|\bd[áa]-me\b|pr[óo]xim[oa]s?\b/i;
const PLAN_TARGET_RE = /\bplan(?:o|os)\b|\bprograma\b|\bsemanas?\b|\b\d+\s*dias\b|\bm[eê]s(?:es)?\b|\bbloco\b|\btreinos?\b/i;

export function isPlanRequest(message: string | null | undefined): boolean {
  const m = message || "";
  return PLAN_VERB_RE.test(m) && PLAN_TARGET_RE.test(m);
}

/** A continuação guardada numa mensagem, validada; null se não serve. */
export function parseStoredContinuation(raw: unknown): PlanContinuationData | null {
  if (!raw || typeof raw !== "object") return null;
  // deno-lint-ignore no-explicit-any
  const r = raw as any;
  const part = Number(r.part), of = Number(r.of);
  if (![r.from, r.to, r.until].every((d) => typeof d === "string" && ISO_DATE_RE.test(d))) return null;
  if (!Number.isInteger(part) || !Number.isInteger(of) || part < 2 || part > of || r.from > r.to || r.to > r.until) return null;
  return { from: r.from, to: r.to, part, of, until: r.until };
}

export const planResumeKey = (messageId: string): string => `plan_resume:${messageId}`;

/** O id da mensagem numa chave plan_resume:<id>, ou null. */
export function messageIdOfPlanResumeKey(key: string | null | undefined): string | null {
  const m = /^plan_resume:([0-9a-f-]{36})$/i.exec(key || "");
  return m && UUID_RE.test(m[1]) ? m[1] : null;
}

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Um item de um plano ACEITE, como a regra o lê. */
export type AcceptedPlanItem = { planned_date?: string | null; kind?: string | null; status?: string | null };

export type PlanResumeInput = {
  /** A mensagem do modelo mais recente com plan_continuation. */
  lastContinuation: { id: string; created_at: string; plan_continuation: unknown } | null;
  /** Propostas de treino pendentes (status proposto, com corrida/ginásio). */
  pendingTrainingPlans: number;
  /** Os itens dos planos ACEITES (desde o início da cadeia). A regra filtra
   *  ela própria: só corrida/ginásio e não cancelados (revisão do 69d1cc8c,
   *  B2 — um dia de descanso ou um treino cancelado não põe nada no calendário). */
  acceptedItems: AcceptedPlanItem[];
  /** As mensagens dele depois da mensagem da continuação. */
  userMessagesAfter: { content: string | null; created_at: string }[];
  /** Planos dele criados DEPOIS da mensagem (qualquer estado): uma proposta
   *  nova, recusada ou não, ou um plano pedido por botão (B1). */
  plansCreatedAfter: number;
  /** O estado do plano que a própria mensagem propôs (a parte dela), se se
   *  souber: 'recusado' é a cadeia recusada (B1). */
  continuationPlanStatus: string | null;
  /** O nome da prova do plano, se se souber (a do dia do until, agendada). */
  raceName?: string | null;
};

/** Os dias com treino a sério de planos aceites (B2). */
export function acceptedTrainingDates(items: AcceptedPlanItem[]): string[] {
  return (items || [])
    .filter((i) => (i?.kind === "corrida" || i?.kind === "ginasio") && i?.status !== "cancelado" && typeof i?.planned_date === "string")
    .map((i) => i.planned_date as string);
}

/** A semana anterior à que falta, e se está no calendário (treinos aceites
 *  desde o início da cadeia até à véspera do from, a semana anterior incluída). */
export function previousWeekOf(c: PlanContinuationData, acceptedDates: string[]): { prevFrom: string; prevTo: string; applied: boolean } {
  const prevFrom = addDays(c.from, -7);
  const prevTo = addDays(c.from, -1);
  const chainStart = addDays(c.from, -7 * (c.part - 1));
  return { prevFrom, prevTo, applied: acceptedDates.some((d) => d >= chainStart && d < c.from) };
}

/** Os chips da própria retoma não contam como «ele pediu outro plano». */
const isResumeChip = (text: string | null | undefined): boolean => {
  const t = (text || "").trim().replace(/[.!]+$/, "").toLowerCase();
  return t === PLAN_RESUME_SEND.toLowerCase() || t === PLAN_RESUME_LATER.toLowerCase();
};

/**
 * A cadeia ficou a meio? Sim quando: a parte prometida ainda serve (until ≥
 * hoje, e não passaram mais de 3 dias do início dela), não há proposta de
 * treino pendente (a cadeia está viva), nenhum plano aceite já tem treinos
 * nessa semana, passaram 2 h da mensagem, e ele não pediu entretanto outro
 * plano. Uma vez por parte: a chave é a da mensagem.
 */
export function detectPlanResume(input: PlanResumeInput, nowMs: number, todayISO: string): PlanResumeCandidate | null {
  const msg = input.lastContinuation;
  if (!msg?.id || !UUID_RE.test(msg.id)) return null;
  const c = parseStoredContinuation(msg.plan_continuation);
  if (!c) return null;
  if (c.until < todayISO) return null;
  if (todayISO > addDays(c.from, PLAN_RESUME_MAX_LATE_DAYS)) return null;
  const at = Date.parse(msg.created_at);
  if (!Number.isFinite(at) || nowMs - at < PLAN_RESUME_MIN_AGE_MS) return null;
  if (input.pendingTrainingPlans > 0) return null;
  // A cadeia recusada, ou um plano novo entretanto (pedido por botão, por
  // outra conversa): já não há nada a retomar (B1).
  if (input.continuationPlanStatus === "recusado" || input.plansCreatedAfter > 0) return null;
  const accepted = acceptedTrainingDates(input.acceptedItems);
  if (accepted.some((d) => d >= c.from && d <= c.to)) return null;
  if (input.userMessagesAfter.some((m) => Date.parse(m.created_at) > at && !isResumeChip(m.content) && isPlanRequest(m.content))) return null;
  return {
    trigger: PLAN_RESUME_TRIGGER,
    key: planResumeKey(msg.id),
    raceId: null,
    raceName: null,
    hasRun: false,
    silenceDays: null,
    anchorDate: null,
    anchorAt: msg.created_at,
    resume: { ...c, message_id: msg.id, ...previousWeekOf(c, accepted), raceName: input.raceName ?? null },
  };
}

const ddmm = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

/** Duas datas como a Carol as diz: «26/10 a 1/11», «2 a 8/11». */
export function weekText(from: string, to: string): string {
  return from.slice(5, 7) === to.slice(5, 7) ? `${Number(from.slice(8, 10))} a ${ddmm(to)}` : `${ddmm(from)} a ${ddmm(to)}`;
}

/** Os factos para o Contexto do turno (os textos são dela). Sem `applied`
 *  conhecido, a linha do calendário não vai — e ela não fala dele. */
export function planResumeFacts(r: PlanContinuationData & Partial<Pick<PlanResumeInfo, "prevFrom" | "prevTo" | "applied" | "raceName">>): string {
  const lines = [
    r.prevFrom && r.prevTo ? `semana anterior: ${weekText(r.prevFrom, r.prevTo)}` : null,
    typeof r.applied === "boolean" ? `a semana anterior está no calendário: ${r.applied ? "sim" : "não"}` : null,
    `semana que falta: ${weekText(r.from, r.to)} (parte ${r.part} de ${r.of})`,
    `o plano vai até ${ddmm(r.until)}`,
    r.raceName ? `prova: ${r.raceName}` : null,
  ];
  return lines.filter(Boolean).join("; ");
}

/* A notificação: frase fixa da Carol, sem Gemini (como os avisos do Troféu).
   Não fala do calendário: serve os dois casos (carol-plan-resume-textos.md). */
export function planResumePushMessage(c: PlanResumeCandidate): { title: string; body: string } {
  const week = weekText(c.resume.from, c.resume.to);
  // Com mais partes depois desta, não falta só uma semana.
  return c.resume.part < c.resume.of
    ? { title: "Carol", body: `O teu plano ficou a meio. Faltam a semana de ${week} e as seguintes, e eu preparo-tas quando abrires a conversa.` }
    : { title: "Carol", body: `O teu plano ficou a meio. Falta a semana de ${week}, e eu preparo-ta quando abrires a conversa.` };
}

/** A resposta dela ao «Agora não» (frase da Carol). */
export const PLAN_RESUME_LATER_REPLY = "Fica para quando quiseres. Quando for altura, pede-me no chat e eu continuo de onde ficámos.";
