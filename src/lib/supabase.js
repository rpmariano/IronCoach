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
 * mesmo com rede no telemóvel, persistente mesmo depois de uma primeira
 * tentativa de correção). Duas camadas do mesmo problema:
 *
 * 1.ª tentativa (insuficiente): a deteção comparava `err.name ===
 * 'AbortError'` num `catch`. Mas essa comparação era irrelevante — não
 * porque a livraria disfarçasse o nome do erro (ver types.js:
 * `FunctionsFetchError` fixa nome "FunctionsFetchError" e mensagem "Failed
 * to send a request to the Edge Function"), mas porque **o próprio
 * `FunctionsClient.invoke()` NUNCA REJEITA a promise**: envolve TODO o
 * corpo em try/catch e devolve sempre `{ data: null, error }` — incluindo
 * quando é a NOSSA AbortController a desistir (ver
 * node_modules/@supabase/functions-js/dist/main/FunctionsClient.js,
 * `catch (error) { return { data: null, error, ... } }`, sem excecionar
 * abort). Ou seja: o `catch` deste ficheiro é código morto para esta
 * falha — nunca é alcançado, porque não há exceção nenhuma para apanhar.
 * A resposta chega sempre pelo ramo `if (error)` mais abaixo, que
 * assumia `isTimeout: false` incondicionalmente.
 *
 * Confirmado em produção (app_logs): a mensagem gravada era sempre "Failed
 * to send a request to the Edge Function" com `meta: { fnName }` — a
 * assinatura exata do ramo `if (error)`, nunca do `catch`.
 *
 * Fix: verificar `controller.signal.aborted` logo a seguir a `await
 * supabase.functions.invoke(...)`, antes de examinar `error` — é o NOSSO
 * temporizador, a única fonte fiável de saber se fomos nós a desistir,
 * independentemente de a livraria rejeitar ou resolver.
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
      // supabase.functions.invoke() nunca rejeita — apanha SEMPRE a
      // exceção internamente e resolve com {data:null, error}, mesmo
      // quando é a NOSSA AbortController a desistir. Por isso é aqui, não
      // no catch mais abaixo, que se decide se isto é um timeout nosso.
      if (controller.signal.aborted) {
        console.warn(`[EdgeFunction:${fnName}] Tempo limite excedido (${timeoutMs}ms).`);
        logAppEvent('error', fnName, 'Timeout excedido', { timeoutMs });
        return { data: null, error: 'A operação demorou demasiado tempo a responder (timeout). Por favor, tente novamente.', isTimeout: true };
      }

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
    // Continua aqui por segurança (ex.: se a própria chamada a
    // supabase.functions.invoke lançar antes de devolver, ou logAppEvent
    // acima falhar) — mas na prática o ramo acima é que trata o caso real.
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
