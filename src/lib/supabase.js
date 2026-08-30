import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://roxfzsiciizkevopgpnl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJveGZ6c2ljaWl6a2V2b3BncG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNjg0NDksImV4cCI6MjA5ODg0NDQ0OX0.bS7FyzDIqj4Aov18OXw6SsJrx1hT1DxYQfzmeHHH7bw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Regista um evento em app_logs para auditoria e cálculo de custos de tokens
 */
export async function logAppEvent(level, event, message = null, meta = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;
    const { error } = await supabase.from('app_logs').insert({
      user_id: userId,
      level,
      event,
      message,
      meta,
    });
    if (error) {
      console.warn('[logAppEvent] Falha ao registar log:', error);
    }
  } catch (err) {
    console.warn('[logAppEvent] Falha ao registar log:', err);
  }
}

/**
 * Invoca uma Edge Function do Supabase garantindo um tempo limite (timeoutMs).
 *
 * O erro devolvido vem sempre acompanhado de `isTimeout`: só é `true` quando
 * o PRÓPRIO CLIENTE desistiu de esperar — nesse caso o pedido pode
 * legitimamente ainda estar em processamento no servidor (ver comentário
 * grande sobre POLL_MAX_MS em Coach.jsx), e vale a pena aguardar/sondar.
 * Qualquer outro erro (falha de rede antes de o pedido sequer sair — ex.:
 * "Failed to send a request to the Edge Function" — ou um erro devolvido
 * pelo próprio servidor) significa que NÃO há nada em curso para esperar;
 * tratá-lo como se fosse um timeout mostra ao atleta um aviso de "demora"
 * enganador (a resposta nunca vai chegar) e o mantém à espera até 3 minutos
 * por nada.
 *
 * BUG CORRIGIDO (2026-08-30, relatado como "erro de comunicação" na Carol
 * mesmo com rede no telemóvel): a deteção de timeout comparava `err.name
 * === 'AbortError'`, mas `supabase.functions.invoke()` NUNCA deixa esse
 * nome sobreviver — o FunctionsClient da própria livraria envolve QUALQUER
 * falha do fetch (a nossa própria AbortController incluída) num
 * `FunctionsFetchError` genérico, com a mensagem fixa "Failed to send a
 * request to the Edge Function" e nome "FunctionsFetchError" (ver
 * node_modules/@supabase/functions-js — `.catch((fetchError) => { throw
 * new FunctionsFetchError(fetchError); })`, sem exceção para AbortError).
 * Ou seja: a comparação por nome era sempre falsa, e um pedido que o
 * PRÓPRIO cliente desistiu de esperar (ex.: o coach-chat a repetir uma
 * chamada ao Gemini que veio 503, facilmente ultrapassando os 45s daqui)
 * caía sempre no ramo genérico "Falha de rede ou de comunicação com o
 * servidor" em vez do aviso de demora com sondagem (handleAsyncFallback em
 * Coach.jsx) — dava exatamente a mesma mensagem de uma falha de rede real,
 * por isso "tinha rede no telemóvel" não batia certo com o que se via.
 * Correção: verificar `controller.signal.aborted` diretamente — é o NOSSO
 * temporizador, não depende de a livraria preservar o tipo do erro.
 */
export async function invokeEdgeFunctionWithTimeout(fnName, options = {}, timeoutMs = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const invokeOptions = {
      ...options,
      signal: controller.signal
    };
    const { data, error } = await supabase.functions.invoke(fnName, invokeOptions);
    clearTimeout(timer);

    if (error) {
      let detailedMsg = error.message;
      if (error.context && typeof error.context.json === 'function') {
        try {
          const bodyJson = await error.context.json();
          if (bodyJson?.error) detailedMsg = bodyJson.error;
        } catch (_) {}
      }
      console.error(`[EdgeFunction:${fnName}] Erro na execução:`, detailedMsg, error);
      logAppEvent('error', fnName, detailedMsg || 'Erro na execução', { fnName });
      // O servidor respondeu (mesmo que com erro) — não há timeout nem
      // processamento em curso a aguardar.
      return { data: null, error: detailedMsg || 'Erro ao processar o pedido no servidor.', isTimeout: false };
    }

    if (data?.usage) {
      logAppEvent('success', fnName, null, data.usage);
    }

    return { data, error: null };
  } catch (err) {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      console.warn(`[EdgeFunction:${fnName}] Tempo limite excedido (${timeoutMs}ms).`);
      logAppEvent('error', fnName, 'Timeout excedido', { timeoutMs });
      return { data: null, error: 'A operação demorou demasiado tempo a responder (timeout). Por favor, tente novamente.', isTimeout: true };
    }
    // Falha antes/sem resposta do servidor (rede, DNS, CORS...) — ex.:
    // "Failed to send a request to the Edge Function". O pedido nunca
    // chegou a ser processado, por isso NÃO é um timeout.
    console.error(`[EdgeFunction:${fnName}] Exceção não tratada:`, err);
    logAppEvent('error', fnName, err.message || 'Exceção não tratada', { error: String(err) });
    return { data: null, error: err.message || 'Falha de rede ou de comunicação com o servidor.', isTimeout: false };
  }
}
