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

export type PlanResumeCandidate = Omit<ServerProactiveCandidate, "trigger"> & {
  trigger: typeof PLAN_RESUME_TRIGGER;
  resume: PlanContinuationData & { message_id: string };
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

export type PlanResumeInput = {
  /** A mensagem do modelo mais recente com plan_continuation. */
  lastContinuation: { id: string; created_at: string; plan_continuation: unknown } | null;
  /** Propostas de treino pendentes (status proposto, com corrida/ginásio). */
  pendingTrainingPlans: number;
  /** As datas dos itens de planos ACEITES (qualquer tipo). */
  acceptedItemDates: string[];
  /** As mensagens dele depois da mensagem da continuação. */
  userMessagesAfter: { content: string | null; created_at: string }[];
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
  if (input.acceptedItemDates.some((d) => d >= c.from && d <= c.to)) return null;
  if (input.userMessagesAfter.some((m) => Date.parse(m.created_at) > at && isPlanRequest(m.content))) return null;
  return {
    trigger: PLAN_RESUME_TRIGGER,
    key: planResumeKey(msg.id),
    raceId: null,
    raceName: null,
    hasRun: false,
    silenceDays: null,
    anchorDate: null,
    anchorAt: msg.created_at,
    resume: { ...c, message_id: msg.id },
  };
}

const ddmm = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

/** Os factos da parte que falta, para a Carol (e para a notificação). */
export function planResumeFacts(c: PlanContinuationData): string {
  return `falta a parte ${c.part} de ${c.of} do plano que ele pediu: a semana de ${ddmm(c.from)} a ${ddmm(c.to)}; o plano vai até ${ddmm(c.until)}`;
}

/* A notificação: frase fixa, sem Gemini (como os avisos do Troféu).
   PROVISÓRIA — a frase definitiva vem da Carol especialista. */
export function planResumePushMessage(c: PlanResumeCandidate): { title: string; body: string } {
  return { title: "Carol", body: `Falta a semana de ${ddmm(c.resume.from)} a ${ddmm(c.resume.to)} do teu plano. Mando-ta?` };
}
