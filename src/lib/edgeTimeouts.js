/* Quanto a app espera por Edge Functions que podem demorar mais do que os
   45 s por omissão de invokeEdgeFunctionWithTimeout. */

/** analyze-run: tem de passar o prazo do servidor (COACH_BUDGET_MS, 88 s —
 *  repetições quando o Gemini está ocupado, gravação e comentário da Carol)
 *  com folga para o arranque a frio e o envio de até 6 prints. Se a app
 *  desistisse antes e o servidor acabasse por gravar a corrida, o "Tentar de
 *  novo" gravava-a outra vez. Abaixo dos ~150 s da plataforma. */
export const ANALYZE_RUN_TIMEOUT_MS = 130000;
