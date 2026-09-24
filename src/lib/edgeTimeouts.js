/* Quanto a app espera por Edge Functions que podem demorar mais do que os
   45 s por omissão de invokeEdgeFunctionWithTimeout. */

/** As funções de registo com IA (analyze-run, -meal, -gym, -body e
 *  -diploma): tem de passar o prazo do servidor (COACH_BUDGET_MS, 88 s, em
 *  supabase/functions/_shared/geminiFetch.ts — repetições quando o Gemini
 *  está ocupado, gravação e comentário da Carol) com folga para o arranque a
 *  frio e o envio das imagens. Se a app desistisse antes e o servidor
 *  acabasse por gravar o registo, o "Tentar de novo" gravava-o outra vez.
 *  Abaixo dos ~150 s da plataforma. */
export const ANALYZE_TIMEOUT_MS = 130000;
