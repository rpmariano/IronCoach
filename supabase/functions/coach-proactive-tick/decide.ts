// A decisão de notificar um atleta — pura, para os testes não precisarem de
// rede (specs/carol-omnisciencia-omnipresenca.md, ação P.3).

import { isWithinProactiveWindow, type ServerProactiveCandidate } from "../_shared/formulas/proactiveTriggers.ts";

/** A mesma regra do coach-chat (PROACTIVE_QUIET_HOURS): se ela falou há menos
 *  de 6 horas, o chat recusava a mensagem ao abrir — e a notificação ficava a
 *  prometer uma conversa que não ia acontecer. */
export const QUIET_HOURS = 6;

/** O dia de Lisboa de um instante — as datas dos acontecimentos são dias de
 *  Lisboa, e comparar com o dia UTC falhava entre as 00:00 e a 01:00. */
export function lisbonDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date(iso));
}

export type PushDecision =
  | { send: true }
  | { send: false; reason: "sem_momento" | "fora_de_horas" | "ja_entregue" | "ja_notificado" | "limite_diario" | "falou_ha_pouco" | "ja_falou_depois" | "balanco_feito" };

export function decidePush(input: {
  candidate: ServerProactiveCandidate | null;
  lisbonHour: number;
  deliveredKeys: Set<string>;   // coach_proactive_log: a conversa já aconteceu
  pushedKeys: Set<string>;      // coach_proactive_pushes: já se notificou esta
  pushedToday: boolean;         // no máximo uma notificação dela por dia
  /** A última mensagem da conversa, de quem for — só para a regra das 6
   *  horas, que tem de bater com o shouldSkipProactive do coach-chat. */
  lastMessage?: { role: string; created_at: string } | null;
  /** A última mensagem DELA — para saber se já falou depois do acontecimento.
   *  Não pode ser a última de todas: se o atleta escreveu por último (uma
   *  resposta que falhou, o off-topic), a verificação saltava em silêncio. */
  lastModelMessageAt: string | null;
  nowMs: number;
  /** O balanço desta prova já está gravado na prova (race_events.coach_balance). */
  balanceDone?: boolean;
}): PushDecision {
  const c = input.candidate;
  if (!c) return { send: false, reason: "sem_momento" };
  if (!isWithinProactiveWindow(c.trigger, input.lisbonHour)) return { send: false, reason: "fora_de_horas" };
  if (input.deliveredKeys.has(c.key)) return { send: false, reason: "ja_entregue" };
  if (input.pushedKeys.has(c.key)) return { send: false, reason: "ja_notificado" };
  if (input.pushedToday) return { send: false, reason: "limite_diario" };
  /* O coach_proactive_log só existe desde 2026-09-18: o que a Carol entregou
     antes disso só está no localStorage de cada telemóvel (revisão pré-deploy
     da P.3). Duas provas de que a conversa já aconteceu, lidas no servidor:
     - o balanço com corrida já está gravado na prova;
     - no "como correu?" sem registo e no silêncio, ela já falou depois do
       acontecimento (a prova, o último registo). */
  if (c.trigger === "race_after" && c.hasRun && input.balanceDone) return { send: false, reason: "balanco_feito" };
  // O balanço com corrida acontece depois de a corrida ser registada: se ela
  // já falou depois disso, o balanço (ou a conversa que o substituiu) já foi.
  if (c.trigger === "race_after" && c.hasRun && c.anchorAt && input.lastModelMessageAt
    && Date.parse(input.lastModelMessageAt) > Date.parse(c.anchorAt)) {
    return { send: false, reason: "ja_falou_depois" };
  }
  if ((c.trigger === "silence" || (c.trigger === "race_after" && !c.hasRun)) && c.anchorDate && input.lastModelMessageAt
    && lisbonDateOf(input.lastModelMessageAt) > c.anchorDate) {
    return { send: false, reason: "ja_falou_depois" };
  }
  const last = input.lastMessage;
  if (last?.role === "model" && last.created_at) {
    const ageH = (input.nowMs - Date.parse(last.created_at)) / 3600000;
    if (ageH >= 0 && ageH < QUIET_HOURS) return { send: false, reason: "falou_ha_pouco" };
  }
  return { send: true };
}
