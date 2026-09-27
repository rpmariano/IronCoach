/* Modelo e nível de raciocínio de cada chamada ao Gemini — num só sítio.
   (Auditoria de custos de 2026-09-27; o coach-chat fica de fora de propósito:
   continua no alias e sem thinkingConfig, ver o comentário no topo dele.)

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

/** O modelo que o alias apontava a 2026-09-27 (ai_usage.model). */
export const GEMINI_MODEL = "gemini-3.8-flash";
export const GEMINI_FALLBACK_MODEL = "gemini-flash-latest";

/* Níveis: todas as chamadas usam "low".
   "minimal" seria o natural para a extração de prints (ler números não ganha
   nada em pensar), mas o gemini-3.8-flash recusou-o com 400 em produção logo
   após o deploy de 27-09-2026 (analyze-meal: a extração caía sempre no
   fallback, sem limite nenhum), enquanto "low" passou no resumo diário e
   nos comentários da Carol. Só voltar a "minimal" depois de confirmar na
   documentação que o modelo fixo o aceita. */
export type ThinkingLevel = "low";

export function geminiUrl(model: string, key: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
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
 * Chama `send(model, withThinking)` com o modelo fixo e, se ele já não
 * existir ou recusar o thinkingConfig, repete uma vez no alias sem ele.
 * `send` monta o pedido (URL com geminiUrl(model, …) e generationConfig com
 * ...thinkingConfig(nível, withThinking)).
 */
export async function geminiWithFallback(
  send: (model: string, withThinking: boolean) => Promise<Response>,
): Promise<Response> {
  const res = await send(GEMINI_MODEL, true);
  if (!(await needsFallback(res))) return res;
  // O motivo do Google vai no aviso: sem ele não se sabia porquê (o 400 de
  // "minimal" em 27-09-2026 só se diagnosticou por exclusão).
  let reason = "";
  try { reason = (await res.clone().text()).replace(/\s+/g, " ").slice(0, 300); } catch (_) { /* sem corpo */ }
  console.warn(`[gemini] fallback: ${GEMINI_MODEL} respondeu ${res.status}; a repetir em ${GEMINI_FALLBACK_MODEL} sem thinkingConfig — atualizar GEMINI_MODEL/nível em _shared/geminiModel.ts. Motivo: ${reason}`);
  try { await res.body?.cancel(); } catch (_) { /* nada a libertar */ }
  return await send(GEMINI_FALLBACK_MODEL, false);
}
