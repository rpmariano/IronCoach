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
   que é altura de atualizar GEMINI_MODEL, e o ai_usage.model mostra-o. */

/** O modelo que o alias apontava a 2026-09-27 (ai_usage.model). */
export const GEMINI_MODEL = "gemini-3.8-flash";
export const GEMINI_FALLBACK_MODEL = "gemini-flash-latest";

/* Níveis:
   - "minimal": extração de prints/fotos para um esquema JSON fixo, e
     estimativas numéricas curtas. Ler números não ganha nada em pensar.
   - "low": texto curto da Carol (comentários, resumo do dia, notificações,
     enriquecimento de provas) que cruza vários dados. */
export type ThinkingLevel = "minimal" | "low";

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
    return /thinking/i.test(text);
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
  console.warn(`[gemini] fallback: ${GEMINI_MODEL} respondeu ${res.status}; a repetir em ${GEMINI_FALLBACK_MODEL} sem thinkingConfig — atualizar GEMINI_MODEL em _shared/geminiModel.ts`);
  try { await res.body?.cancel(); } catch (_) { /* nada a libertar */ }
  return await send(GEMINI_FALLBACK_MODEL, false);
}
