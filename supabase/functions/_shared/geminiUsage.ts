/* O consumo de tokens de uma ou mais chamadas ao Gemini, num só formato.

   Porquê (auditoria de custos de 2026-09-27): cada função lia o
   usageMetadata à sua maneira, e duas coisas ficavam sempre de fora do que o
   Admin → Custos API mostra:

   1. thoughtsTokenCount — o raciocínio interno do modelo. O alias
      "gemini-flash-latest" pensa por omissão (só o analyze-body o limita), e
      a Google cobra estes tokens ao preço de OUTPUT, mas não entram em
      candidatesTokenCount. Ficavam invisíveis.
   2. As segundas chamadas de cada registo (o comentário da Carol em
      analyze-meal/-gym/-run, o resumo do analyze-body): a função só devolvia
      o usage da extração, e o comentário — prompt maior, até 8192 tokens de
      saída — não era contado.

   output_tokens continua a ser SÓ o candidatesTokenCount (compatível com as
   linhas antigas de app_logs, que não têm thoughts_tokens); quem calcula o
   custo soma os dois (src/utils/aiCosts.js). toolUsePromptTokenCount (o texto
   que uma ferramenta, ex. google_search, devolve ao modelo) é cobrado como
   input e não vem em promptTokenCount — por isso entra em input_tokens.
   `calls` é o nº de respostas do Gemini que contaram para este total. */

export type GeminiUsage = {
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  thoughts_tokens: number;
  calls: number;
  /** modelVersion da resposta (o alias "-latest" muda de modelo e de preço). */
  model?: string | null;
  /** Os mesmos tokens por modelo. Com o Flash de recurso (29-10-2026) um pedido
   *  pode somar chamadas de dois modelos, com preços diferentes: o registo grava
   *  uma linha por modelo (usageRows, revisão de fa525453). */
  by_model?: Record<string, ModelUsage>;
};

export type ModelUsage = { input_tokens: number; output_tokens: number; cached_tokens: number; thoughts_tokens: number; calls: number };

export function emptyUsage(): GeminiUsage {
  return { input_tokens: 0, output_tokens: 0, cached_tokens: 0, thoughts_tokens: 0, calls: 0 };
}

// deno-lint-ignore no-explicit-any
export function usageFromGemini(json: any): GeminiUsage {
  const m = json?.usageMetadata ?? {};
  const counts: ModelUsage = {
    input_tokens: (Number(m.promptTokenCount) || 0) + (Number(m.toolUsePromptTokenCount) || 0),
    output_tokens: Number(m.candidatesTokenCount) || 0,
    cached_tokens: Number(m.cachedContentTokenCount) || 0,
    thoughts_tokens: Number(m.thoughtsTokenCount) || 0,
    calls: 1,
  };
  const model = typeof json?.modelVersion === "string" && json.modelVersion ? json.modelVersion : null;
  return { ...counts, model, ...(model ? { by_model: { [model]: { ...counts } } } : {}) };
}

function addModelUsage(a: ModelUsage | undefined, b: ModelUsage): ModelUsage {
  return {
    input_tokens: (a?.input_tokens ?? 0) + b.input_tokens,
    output_tokens: (a?.output_tokens ?? 0) + b.output_tokens,
    cached_tokens: (a?.cached_tokens ?? 0) + b.cached_tokens,
    thoughts_tokens: (a?.thoughts_tokens ?? 0) + b.thoughts_tokens,
    calls: (a?.calls ?? 0) + b.calls,
  };
}

/** Soma dois consumos; `null`/`undefined` conta como zero (chamada que não aconteceu). */
export function addUsage(a: GeminiUsage | null | undefined, b: GeminiUsage | null | undefined): GeminiUsage {
  const x = a ?? emptyUsage();
  const y = b ?? emptyUsage();
  return {
    input_tokens: x.input_tokens + y.input_tokens,
    output_tokens: x.output_tokens + y.output_tokens,
    cached_tokens: x.cached_tokens + y.cached_tokens,
    thoughts_tokens: x.thoughts_tokens + y.thoughts_tokens,
    calls: x.calls + y.calls,
    // O modelo mais recente que respondeu (numa soma é quase sempre o mesmo).
    model: y.model ?? x.model ?? null,
    ...mergeByModel(x.by_model, y.by_model),
  };
}

function mergeByModel(a?: Record<string, ModelUsage>, b?: Record<string, ModelUsage>): { by_model?: Record<string, ModelUsage> } {
  if (!a && !b) return {};
  const out: Record<string, ModelUsage> = {};
  for (const src of [a, b]) {
    for (const [k, v] of Object.entries(src ?? {})) out[k] = addModelUsage(out[k], v);
  }
  return { by_model: out };
}
