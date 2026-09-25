// A decisão de notificar um atleta — pura, para os testes não precisarem de
// rede (specs/carol-omnisciencia-omnipresenca.md, ação P.3).

import { ALL_PROACTIVE_TRIGGERS, isWithinProactiveWindow, type PushPreferences, type ServerProactiveCandidate } from "../_shared/formulas/proactiveTriggers.ts";

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
  | { send: false; reason: "sem_momento" | "tipo_desligado" | "depois_da_partida" | "fora_de_horas" | "ja_entregue" | "ja_notificado" | "ja_visto" | "limite_diario" | "falou_ha_pouco" | "ja_falou_depois" | "balanco_feito" };

export function decidePush(input: {
  candidate: ServerProactiveCandidate | null;
  lisbonHour: number;
  /** A hora de Lisboa em minutos desde a meia-noite — para a partida da
   *  prova (P.10). Sem ela, conta a hora certa. */
  minuteOfDay?: number | null;
  deliveredKeys: Set<string>;   // coach_proactive_log: a conversa já aconteceu
  pushedKeys: Set<string>;      // coach_proactive_pushes: já se notificou esta
  /** coach_impressions de hoje (kind 'alert'): o Início já mostrou este
   *  aviso, ou o atleta dispensou-o (P.10). */
  seenKeys?: Set<string>;
  /** Quantas notificações dela já saíram hoje (dia de Lisboa). */
  pushedTodayCount: number;
  /** As preferências do atleta (P.6); sem elas, os valores por omissão. */
  prefs?: PushPreferences;
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
  const prefs = input.prefs ?? {};
  const types = Array.isArray(prefs.types) ? prefs.types : ALL_PROACTIVE_TRIGGERS;
  if (!types.includes(c.trigger)) return { send: false, reason: "tipo_desligado" };
  // A manhã da prova não sai depois da partida: a meio da prova só distrai.
  const minuteOfDay = input.minuteOfDay ?? null;
  if (c.trigger === "race_morning" && c.startMinutes != null && minuteOfDay != null && minuteOfDay >= c.startMinutes) {
    return { send: false, reason: "depois_da_partida" };
  }
  if (!isWithinProactiveWindow(c.trigger, input.lisbonHour, prefs, { minuteOfDay, raceStartMinutes: c.startMinutes ?? null })) {
    return { send: false, reason: "fora_de_horas" };
  }
  if (input.deliveredKeys.has(c.key)) return { send: false, reason: "ja_entregue" };
  if (input.pushedKeys.has(c.key)) return { send: false, reason: "ja_notificado" };
  // O atleta já viu este aviso hoje no Início (ou dispensou-o): a notificação
  // só repetia o que ele acabou de ler. Amanhã volta a poder sair (P.10).
  if (input.seenKeys?.has(c.key)) return { send: false, reason: "ja_visto" };
  const maxPerDay = Number.isInteger(prefs.maxPerDay) && prefs.maxPerDay! >= 1 ? Math.min(prefs.maxPerDay!, 3) : 1;
  if (input.pushedTodayCount >= maxPerDay) return { send: false, reason: "limite_diario" };
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

/* Os motivos que valem para o atleta, não para um momento: o limite do dia e
   "ela falou há pouco". Com um destes, nenhum momento da lista sai agora. */
const GLOBAL_REASONS = new Set(["limite_diario", "falou_ha_pouco"]);

/** Percorre os momentos por ordem de prioridade (listServerProactive) e fica
 *  com o primeiro que pode sair. Um momento já notificado, já entregue,
 *  desligado ou fora da sua janela passa a vez ao seguinte; o limite do dia e
 *  a regra das 6 horas param a lista toda (e são esse o motivo). Sem nenhum,
 *  o motivo devolvido é o do primeiro — o mais importante — para a contagem
 *  do tick. */
export function choosePush(
  candidates: ServerProactiveCandidate[],
  ctx: Omit<Parameters<typeof decidePush>[0], "candidate" | "balanceDone"> & {
    balanceDoneFor?: (c: ServerProactiveCandidate) => boolean;
  },
): { candidate: ServerProactiveCandidate | null; decision: PushDecision } {
  if (!candidates.length) return { candidate: null, decision: { send: false, reason: "sem_momento" } };
  let first: PushDecision | null = null;
  for (const candidate of candidates) {
    const decision = decidePush({ ...ctx, candidate, balanceDone: ctx.balanceDoneFor?.(candidate) ?? false });
    if (decision.send) return { candidate, decision };
    // O motivo global é o verdadeiro: é ele que cala a lista inteira.
    if (GLOBAL_REASONS.has(decision.reason)) return { candidate: null, decision };
    first ??= decision;
  }
  return { candidate: null, decision: first! };
}

/* ── O registo da decisão em app_logs (P.10) ────────────────────────────────
   O tick passa a ser o primeiro escritor server-side do app_logs. Uma linha
   por atleta e por hora, e só quando houve algum candidato — sem nada para
   dizer não há decisão para registar. O usage vai no topo do meta
   (input_tokens/output_tokens), como nos logs do cliente, para o painel
   Custos o contar; esse painel só lê o nível 'success', por isso é esse o
   nível sempre que houve chamada ao modelo (mesmo que o envio falhe: o
   custo existiu). Sem chamada, 'info'.

   Três motivos ficam de fora: repetem-se de hora a hora sem dizer nada de
   novo (de noite, fora da janela; depois de notificado ou entregue, até ao
   fim do dia) e enchiam o app_logs, que o Admin lê pelas últimas 300 linhas.
   O que se regista é o que explica um envio, ou a falta dele.

   Os outros motivos também se repetem enquanto o momento existir (ja_visto,
   limite_diario, falou_ha_pouco…): sem custo, cada decisão — atleta, momento
   e motivo — fica uma vez por dia (`loggedToday`, lido pelo tick no
   arranque). Só se viu isto quando o app_logs passou a aceitar 'info'
   (revisão pré-deploy de 2026-09-25): até aí o check recusava estas linhas
   todas e o registo ficava só com os envios. */
const QUIET_LOG_REASONS = new Set(["fora_de_horas", "ja_notificado", "ja_entregue"]);

/** A identidade de uma decisão sem custo no registo do dia. */
export function tickLogSignature(userId: string, key: string | null | undefined, reason: string): string {
  return `${userId}|${key ?? ""}|${reason}`;
}

export interface TickLogInput {
  userId: string;
  candidates: ServerProactiveCandidate[];
  candidate: ServerProactiveCandidate | null;
  /** "enviada", "falhou", ou o motivo de não enviar. */
  reason: string;
  usage?: { input_tokens: number; output_tokens: number } | null;
  generated?: boolean;
  lisbonHour: number;
  /** As decisões sem custo já registadas hoje (tickLogSignature). */
  loggedToday?: Set<string>;
}

export function tickLogRow(input: TickLogInput): {
  user_id: string; level: "success" | "info"; event: string; message: string; meta: Record<string, unknown>;
} | null {
  if (!input.candidates.length) return null;
  const usage = input.usage ?? null;
  // Com custo, regista-se sempre (o painel Custos tem de o contar).
  if (!usage && QUIET_LOG_REASONS.has(input.reason)) return null;
  if (!usage && input.loggedToday?.has(tickLogSignature(input.userId, input.candidate?.key, input.reason))) return null;
  return {
    user_id: input.userId,
    level: usage ? "success" : "info",
    event: "coach-proactive-tick",
    message: input.reason,
    meta: {
      ...(usage ? { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens } : {}),
      reason: input.reason,
      trigger: input.candidate?.trigger ?? null,
      key: input.candidate?.key ?? null,
      generated: !!input.generated,
      candidates: input.candidates.map((c) => c.key),
      hour: input.lisbonHour,
    },
  };
}
