import { createClient } from '@supabase/supabase-js';
import { queuePendingLog, flushPendingLogs } from './pendingLogs';
import { saveKindOf, describeBody, saveModeOf, technicalMessage } from './saveTelemetry';

const SUPABASE_URL = 'https://roxfzsiciizkevopgpnl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJveGZ6c2ljaWl6a2V2b3BncG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNjg0NDksImV4cCI6MjA5ODg0NDQ0OX0.bS7FyzDIqj4Aov18OXw6SsJrx1hT1DxYQfzmeHHH7bw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Regista um evento em app_logs para auditoria (os custos de tokens vivem em
 * ai_usage, gravados pelo servidor)
 */
export async function logAppEvent(level, event, message = null, meta = {}) {
  let row = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;
    row = { user_id: userId, level, event, message, meta };
    const { error } = await supabase.from('app_logs').insert(row);
    if (error) {
      console.warn('[logAppEvent] Falha ao registar log:', error);
      // #116: sem rede, o log da falha também não sai — fica no telemóvel e vai depois. Só as
      // falhas de rede (sem código); uma recusa da base de dados não passaria mais tarde.
      if (!error.code) queuePendingLog(row);
    } else {
      sendPendingAppLogs();
    }
  } catch (err) {
    console.warn('[logAppEvent] Falha ao registar log:', err);
    queuePendingLog(row || { user_id: null, level, event, message, meta });
  }
}

/** Envia os logs que ficaram no telemóvel por falta de rede (#116). Chamado no arranque, quando a
 *  rede volta e depois de cada log que sai bem. */
export function sendPendingAppLogs() {
  return flushPendingLogs((rows) => supabase.from('app_logs').insert(rows));
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
/* #116: uma gravação (analyze-meal/-run/-gym/-body, fora dos modos que não gravam) que falha
   regista-se como save_failed — o tipo de registo, o nome e a mensagem técnica do erro, o estado
   HTTP, o tamanho aproximado do corpo e se levava fotos. O texto que o servidor escreveu para o
   atleta não vai (pode ter o nome dele): só que o havia. Devolve false quando não é uma gravação,
   e aí fica o log de sempre (event = nome da função). */
function logSaveFailure(fnName, body, info) {
  const kind = saveKindOf(fnName, body);
  if (!kind) return false;
  const { bodyBytes, photoCount, hasPhotos } = describeBody(body);
  logAppEvent('error', 'save_failed', `${kind}: ${info.errorName}`, {
    kind,
    fn: fnName,
    stage: 'invoke',
    saveMode: saveModeOf(body),
    errorName: info.errorName,
    message: info.serverText ? null : technicalMessage(info.message),
    serverText: !!info.serverText,
    status: info.status ?? null,
    isNetwork: !!info.isNetwork,
    isTimeout: !!info.isTimeout,
    bodyBytes,
    photoCount,
    hasPhotos,
    online: typeof navigator === 'undefined' ? null : navigator.onLine !== false,
    ...(info.timeoutMs ? { timeoutMs: info.timeoutMs } : {}),
  });
  return true;
}

/** A frase de um 429 que não traz a da Carol (não devia acontecer: a função escreve-a sempre). */
export const QUOTA_FALLBACK_TEXT = 'Por hoje já não consigo ler mais nada. Amanhã continuamos.';

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
        if (!logSaveFailure(fnName, options.body, { errorName: 'Timeout', message: 'Timeout excedido', isTimeout: true, timeoutMs })) {
          logAppEvent('error', fnName, 'Timeout excedido', { timeoutMs });
        }
        return { data: null, error: 'A operação demorou demasiado tempo a responder (timeout). Por favor, tente novamente.', isTimeout: true };
      }

      let detailedMsg = error.message;
      // `busy: true` é o 409 do coach-chat ("Calma Rui, ainda estou a preparar
      // a resposta ao teu pedido anterior") — uma recusa escrita na voz da
      // Carol para ser MOSTRADA, não uma falha. Sem esta flag o Coach.jsx não
      // a distinguia de um erro de rede e escondia-a atrás de "A tua mensagem
      // não saiu" (incidente 2026-09-12).
      let isBusy = false;
      // O limite que o 429 bateu: 'hour' | 'day' — o campo `scope` do Backend (formato confirmado a
      // 2026-11-13: {error, scope, retry_after_minutes}; o `quota: 'hora'|'dia'` ignora-se).
      let quotaScope = null;
      let retryAfterMinutes = null;
      /* O texto que o servidor escreveu para o atleta ler — só quando é mesmo
         dele, uma string no campo `error`. Um erro do gateway (546
         WORKER_LIMIT, 503 BOOT_ERROR) não o traz, e aí `detailedMsg` fica com
         o error.message da supabase-js, em inglês ("Edge Function returned a
         non-2xx status code"): serve para o log, nunca para a bolha da Carol
         (revisão pré-deploy de 2026-09-25). `detail` é a causa técnica que o
         servidor acrescenta à frase dela, só para o log. */
      let serverText = null;
      let serverMessageId = null;
      let detail = null;
      if (error.context && typeof error.context.json === 'function') {
        try {
          const bodyJson = await error.context.json();
          if (bodyJson?.error) detailedMsg = bodyJson.error;
          if (typeof bodyJson?.error === 'string' && bodyJson.error.trim()) serverText = bodyJson.error;
          if (typeof bodyJson?.detail === 'string') detail = bodyJson.detail;
          // A frase de falha que o coach-chat gravou no histórico: com o id
          // dela, o recarregamento ao voltar à app não a repete.
          if (bodyJson?.model_message?.id) serverMessageId = bodyJson.model_message.id;
          isBusy = bodyJson?.busy === true;
          if (bodyJson?.scope === 'hour' || bodyJson?.scope === 'day') quotaScope = bodyJson.scope;
          if (Number(bodyJson?.retry_after_minutes) > 0) retryAfterMinutes = Number(bodyJson.retry_after_minutes);
        } catch (_) {}
      }
      const status = error.context?.status ?? null;
      /* Auditoria de segurança (2026-11-13): a quota diária do Gemini. A função responde 429 com
         uma frase da Carol (`error`) — é uma resposta, não uma falha: quem chama mostra-a como
         mensagem normal, sem «Tentar de novo» (repetir dá o mesmo 429). Não é save_failed nem
         erro de rede; fica um registo info em app_logs (o nível warn não existe na tabela) para se ver quem bate na quota. */
      if (status === 429) {
        console.warn(`[EdgeFunction:${fnName}] Quota atingida (429).`);
        logAppEvent('info', fnName, 'Quota atingida (429)', { fnName, status, ...(detail ? { detail } : {}) });
        return {
          data: null,
          error: serverText || QUOTA_FALLBACK_TEXT,
          isTimeout: false,
          isBusy: false,
          isQuota: true,
          quotaScope,
          retryAfterMinutes,
          serverText: serverText || QUOTA_FALLBACK_TEXT,
          serverMessageId,
          status,
          isNetwork: false,
        };
      }
      console.error(`[EdgeFunction:${fnName}] Erro na execução:`, detailedMsg, detail ?? '', error);
      const logged = logSaveFailure(fnName, options.body, {
        errorName: error?.name || 'Error',
        message: error?.message,
        serverText,
        status: error.context?.status ?? null,
        isNetwork: error?.name === 'FunctionsFetchError',
      });
      if (!logged) logAppEvent('error', fnName, detailedMsg || 'Erro na execução', detail ? { fnName, detail } : { fnName });
      // O servidor respondeu (mesmo que com erro) — não há timeout nem
      // processamento em curso a aguardar. `status` e `isNetwork` (ação
      // P.12) deixam quem chama distinguir "o servidor respondeu com um
      // erro" (mostra detailedMsg, já na voz dela) de "nunca chegou lá"
      // (FunctionsFetchError — classe fixa de @supabase/functions-js, nunca
      // navigator.onLine nem procurar "Failed to fetch" pelo texto).
      return {
        data: null,
        error: detailedMsg || 'Erro ao processar o pedido no servidor.',
        isTimeout: false,
        isBusy,
        serverText,
        serverMessageId,
        status: error.context?.status ?? null,
        isNetwork: error?.name === 'FunctionsFetchError',
      };
    }

    // O custo (data.usage) já não se regista aqui: desde 2026-09-27 é o
    // servidor que o grava em ai_usage (supabase/functions/_shared/
    // usageRecorder.ts) — a app perdia-o num timeout ou com a app fechada.

    return { data, error: null };
  } catch (err) {
    clearTimeout(timer);
    // Continua aqui por segurança (ex.: se a própria chamada a
    // supabase.functions.invoke lançar antes de devolver, ou logAppEvent
    // acima falhar) — mas na prática o ramo acima é que trata o caso real.
    if (controller.signal.aborted) {
      console.warn(`[EdgeFunction:${fnName}] Tempo limite excedido (${timeoutMs}ms).`);
      if (!logSaveFailure(fnName, options.body, { errorName: 'Timeout', message: 'Timeout excedido', isTimeout: true, timeoutMs })) {
        logAppEvent('error', fnName, 'Timeout excedido', { timeoutMs });
      }
      return { data: null, error: 'A operação demorou demasiado tempo a responder (timeout). Por favor, tente novamente.', isTimeout: true };
    }
    // Falha antes/sem resposta do servidor (rede, DNS, CORS...) — ex.:
    // "Failed to send a request to the Edge Function". O pedido nunca
    // chegou a ser processado, por isso NÃO é um timeout.
    console.error(`[EdgeFunction:${fnName}] Exceção não tratada:`, err);
    if (!logSaveFailure(fnName, options.body, { errorName: err?.name || 'Error', message: err?.message, isNetwork: true })) {
      logAppEvent('error', fnName, err.message || 'Exceção não tratada', { error: String(err) });
    }
    return { data: null, error: err.message || 'Falha de rede ou de comunicação com o servidor.', isTimeout: false, status: null, isNetwork: true };
  }
}
