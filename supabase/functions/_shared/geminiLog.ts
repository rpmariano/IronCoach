// O que um log de erro guarda de uma resposta do Gemini (2.ª auditoria de
// segurança, 2026-11-14, B6).
//
// Os logs de "JSON inválido" e de "resposta vazia" guardavam a resposta
// inteira — com o que o modelo leu das fotos e do perfil do atleta (pesos,
// refeições, medidas, mensagens). Os logs das Edge Functions não são sítio
// para isso. Fica só o necessário para perceber a falha: o tamanho, o
// finishReason (MAX_TOKENS, SAFETY…) e os primeiros 200 caracteres SEM os
// dados — os valores de texto passam a "…" e os números a "#", ficam as
// chaves e a pontuação (ex.: {"items":[{"name":"…","grams":#,"kcal":# —
// basta para ver se veio cortado, mal fechado ou com outra forma).

const HEAD_CHARS = 200;

/** A forma do texto, sem os valores: strings que não são chaves → "…", números → #. */
export function redactValues(text: string): string {
  return text
    // Uma string JSON seguida de ":" é uma chave — fica; as outras são valores.
    .replace(/"(?:[^"\\]|\\.)*"(\s*:)?/g, (m, colon) => (colon ? m : '"…"'))
    // Uma string que ficou aberta no fim (resposta cortada).
    .replace(/"(?:[^"\\]|\\.)*$/, '"…')
    .replace(/-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, "#");
}

/** O resumo de uma resposta (o JSON da API, ou só o texto do modelo). */
// deno-lint-ignore no-explicit-any
export function geminiResponseSummary(json: any, text?: string | null): string {
  const raw = typeof text === "string" ? text : null;
  const finishReason = json?.candidates?.[0]?.finishReason ?? null;
  const blockReason = json?.promptFeedback?.blockReason ?? null;
  const size = raw !== null ? raw.length : (() => {
    try {
      return JSON.stringify(json)?.length ?? 0;
    } catch {
      return 0;
    }
  })();
  const head = raw !== null ? redactValues(raw.slice(0, HEAD_CHARS)) : null;
  return JSON.stringify({ size, finishReason, ...(blockReason ? { blockReason } : {}), ...(head !== null ? { head } : {}) });
}
