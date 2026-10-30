/* Modelo e nível de raciocínio de cada chamada ao Gemini — num só sítio.
   (Auditoria de custos de 2026-09-27. O coach-chat continua no alias e só usa
   thinkingConfig("low") nos turnos de plano, desde 2026-10-25, com a rede
   dele: um 400 repete sem o campo e a instância deixa de o enviar — ver
   isPlanTurn e lowThinkingRejected no coach-chat.)

   Porquê: com o registo de consumo no servidor (ai_usage) viu-se que o
   raciocínio interno do modelo (thoughtsTokenCount, cobrado como OUTPUT) era
   a maior fatia do output — no coach-daily-summary, 1 640 tokens a pensar
   para 397 de resposta. Nenhuma função o limitava, exceto o resumo manual do
   analyze-body.

   Porque é que não se limitava: o campo mudou de nome entre gerações
   (thinkingBudget → thinkingLevel) e, com o alias "gemini-flash-latest", uma
   rotação de geração deu 400 INVALID_ARGUMENT em produção. Mas fixar o modelo
   também já correu mal: "gemini-2.5-flash" passou a dar 404 "no longer
   available to new users" dias depois (ver coach-chat).

   Solução: fixa-se o modelo (preço e parâmetros previsíveis) COM rede — se o
   modelo fixo der 404, ou 400 a queixar-se do thinking, repete-se uma vez no
   alias e sem thinkingConfig (geminiWithFallback). O registo continua a
   funcionar; fica um console.warn "[gemini] fallback" para se ver nos logs
   que é altura de atualizar GEMINI_MODEL. Num 404 o ai_usage.model passa a
   mostrar o modelo do alias; num 400 de thinking o modelo é provavelmente o
   mesmo, e só o aviso nos logs diz que o raciocínio deixou de estar limitado. */

import { hasTimeFor } from "./geminiFetch.ts";

/** O modelo que o alias apontava a 2026-09-27 (ai_usage.model). */
export const GEMINI_MODEL = "gemini-3.8-flash";
export const GEMINI_FALLBACK_MODEL = "gemini-flash-latest";

/* O Flash para onde se cai quando o modelo principal está ocupado (503 e
   afins, 429) ou não responde (incidente de 29-10-2026: o gemini-3.8-flash deu
   503 três vezes, e antes ficou 15 s sem responder com o pedido em paralelo —
   o analyze-meal acabou em 502). A geração 3.8 só tem um Flash; este é o Flash
   estável anterior (ai.google.dev/gemini-api/docs/models, 29-10-2026). Num
   só sítio — muda-se aqui quando sair outro. */
export const GEMINI_BUSY_FALLBACK_MODEL = "gemini-3.6-flash";
export const GEMINI_BUSY_FALLBACK_STATUSES: ReadonlySet<number> = new Set([429, 500, 502, 503, 504]);
/* Créditos pré-pagos esgotados (402 RESOURCE_EXHAUSTED, 29-10-2026 às 22:08).
   NÃO cai para outro modelo: a conta é a mesma, o outro dava o mesmo 402. */
export const GEMINI_CREDITS_STATUS = 402;

/* O que fica do prazo para o Flash de recurso (revisão de fa525453): sem
   isto, o principal gastava o prazo inteiro (40 s de tentativa numa leitura
   de 60 s) e, quando não respondia, já não cabia tentativa nenhuma — o «sem
   resposta» do incidente de 29-10 nunca chegava ao fallback. O principal fica
   até `deadline − reserva` (as repetições de «ocupado» e o pedido em
   paralelo continuam lá dentro); o de recurso tem o resto. */
export const GEMINI_FALLBACK_RESERVE_MS = 25000;

/* Num prazo curto, a parte do de recurso: o principal fica com 62%. A
   preparação (contexto, meteorologia, leitura do site) come parte do prazo,
   e com metade um resumo de 20-30 s caía no recurso sem precisar (revisão
   de 70ccd43f). */
export const GEMINI_FALLBACK_SHARE = 0.38;

/** O prazo da tentativa no modelo principal: o do pedido menos a reserva —
 *  25 s, ou 38% do que falta num prazo curto (as sapatilhas, o resumo) —, se
 *  ainda couber uma tentativa útil a cada um; senão o prazo todo. */
export function primaryDeadline(deadline: number, now = Date.now()): number {
  if (!Number.isFinite(deadline)) return deadline;
  const reserve = Math.min(GEMINI_FALLBACK_RESERVE_MS, (deadline - now) * GEMINI_FALLBACK_SHARE);
  const reserved = deadline - reserve;
  return hasTimeFor(reserved, now) && hasTimeFor(deadline, reserved) ? reserved : deadline;
}

/** O limite de um fetch simples (as funções que não usam o fetchGeminiWithTimeout)
 *  dentro do prazo da tentativa: nunca acima de `timeoutMs`, nunca abaixo de 1 s. */
export function attemptTimeoutMs(timeoutMs: number, attemptDeadline: number, now = Date.now()): number {
  return Math.max(1000, Math.min(timeoutMs, attemptDeadline - now));
}

/**
 * Chama `send(primary, prazo)` e, se o modelo estiver ocupado (GEMINI_BUSY_FALLBACK_STATUSES)
 * ou não responder (send lança: tempo ou rede), tenta uma vez `fallbackModel`
 * — só se ainda couber uma tentativa útil antes de `deadline`. O principal
 * corre com primaryDeadline(deadline), para sobrar tempo ao de recurso. O 402
 * e os outros erros devolvem-se tal como vieram. `send` recebe o prazo da
 * tentativa e passa-o ao fetchGeminiWithTimeout.
 */
export async function withBusyFallback(
  send: (model: string, attemptDeadline: number) => Promise<Response>,
  primary: string,
  deadline = Number.POSITIVE_INFINITY,
  fallbackModel = GEMINI_BUSY_FALLBACK_MODEL,
): Promise<Response> {
  let res: Response | null = null;
  let err: unknown = null;
  try {
    res = await send(primary, primary === fallbackModel ? deadline : primaryDeadline(deadline));
  } catch (e) {
    err = e;
  }
  if (res && !GEMINI_BUSY_FALLBACK_STATUSES.has(res.status)) return res;
  if (primary === fallbackModel || !hasTimeFor(deadline)) {
    if (res) return res;
    throw err;
  }
  const why = res ? `respondeu ${res.status}` : `não respondeu (${err instanceof Error ? err.message : String(err)})`;
  console.warn(`[gemini] ocupado: ${primary} ${why}; a tentar ${fallbackModel} — ver GEMINI_BUSY_FALLBACK_MODEL em _shared/geminiModel.ts`);
  if (res) {
    try { await res.body?.cancel(); } catch (_) { /* nada a libertar */ }
  }
  return await send(fallbackModel, deadline);
}

/* Níveis: todas as chamadas usam "low".
   "minimal" seria o natural para a extração de prints (ler números não ganha
   nada em pensar), mas o gemini-3.8-flash recusou-o com 400 em produção logo
   após o deploy de 27-09-2026 (analyze-meal: a extração caía sempre no
   fallback, sem limite nenhum), enquanto "low" passou no resumo diário e
   nos comentários da Carol. Só voltar a "minimal" depois de confirmar na
   documentação que o modelo fixo o aceita. */
export type ThinkingLevel = "low";

/* A chave vai no header x-goog-api-key, nunca na URL (?key=): quando a rede
   falha, a mensagem de erro do fetch do Deno traz a URL completa, e vários
   catch registam o erro inteiro — a chave acabava nos logs das Edge
   Functions (revisão pré-deploy de 27-09-2026). */
export function geminiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export function geminiHeaders(key: string): Record<string, string> {
  return { "Content-Type": "application/json", "x-goog-api-key": key };
}

/** O pedaço de generationConfig com o raciocínio — vazio no fallback. */
export function thinkingConfig(level: ThinkingLevel, enabled: boolean): { thinkingConfig?: { thinkingLevel: ThinkingLevel } } {
  return enabled ? { thinkingConfig: { thinkingLevel: level } } : {};
}

/** A resposta pede para repetir no alias sem thinkingConfig? */
export async function needsFallback(res: Response): Promise<boolean> {
  if (res.status === 404) return true;
  if (res.status !== 400) return false;
  try {
    const text = await res.clone().text();
    // Só os nomes dos campos de raciocínio — um 400 que fale de "thinking"
    // por outro motivo não deve mudar de modelo.
    return /thinking[_ ]?(config|level|budget)/i.test(text);
  } catch {
    return false;
  }
}

/**
 * Chama `send(model, withThinking, prazo)` com o modelo fixo; ocupado ou sem
 * resposta, tenta o GEMINI_BUSY_FALLBACK_MODEL (withBusyFallback, dentro de
 * `deadline`); e, se o modelo já não existir ou recusar o thinkingConfig,
 * repete uma vez no alias sem ele — também só dentro do prazo. `send` monta o
 * pedido (URL com geminiUrl(model, …), generationConfig com
 * ...thinkingConfig(nível, withThinking)) e passa o prazo ao fetchGeminiWithTimeout.
 */
export async function geminiWithFallback(
  send: (model: string, withThinking: boolean, attemptDeadline: number) => Promise<Response>,
  deadline = Number.POSITIVE_INFINITY,
): Promise<Response> {
  let answered = GEMINI_MODEL;
  const res = await withBusyFallback((model, d) => {
    answered = model;
    return send(model, true, d);
  }, GEMINI_MODEL, deadline);
  if (!(await needsFallback(res)) || !hasTimeFor(deadline)) return res;
  // O motivo do Google vai no aviso: sem ele não se sabia porquê (o 400 de
  // "minimal" em 27-09-2026 só se diagnosticou por exclusão). O modelo é o
  // que respondeu — pode ser já o de recurso.
  let reason = "";
  try { reason = (await res.clone().text()).replace(/\s+/g, " ").slice(0, 300); } catch (_) { /* sem corpo */ }
  console.warn(`[gemini] fallback: ${answered} respondeu ${res.status}; a repetir em ${GEMINI_FALLBACK_MODEL} sem thinkingConfig — atualizar GEMINI_MODEL/nível em _shared/geminiModel.ts. Motivo: ${reason}`);
  try { await res.body?.cancel(); } catch (_) { /* nada a libertar */ }
  return await send(GEMINI_FALLBACK_MODEL, false, deadline);
}
