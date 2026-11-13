import { logAppEvent } from '../lib/supabase';
import { technicalMessage } from '../lib/saveTelemetry';
import { saveErrorText } from './clientRequestId';

/* #116 (2026-11-07): uma gravação que falha no cliente. O Rui viu «Erro» com «Edge Function» à
   vista — a mensagem técnica da supabase-js — e nada ficou em app_logs. Três coisas:
   - o atleta lê uma frase clara (saveErrorText) e tem o «Tentar de novo» — a idempotência
     (client_request_id) garante que repetir não duplica;
   - as falhas no invoke regista-as o invokeEdgeFunctionWithTimeout (save_failed, stage «invoke»);
   - as que acontecem fora dele (um erro de JS antes do envio, um update direto à tabela que falha)
     regista-as reportSaveFailure (save_failed, stage «client»). Uma falha regista-se uma só vez. */

const LOGGED = Symbol.for('ironhealth.saveFailureLogged');

function markLogged(err) {
  try { Object.defineProperty(err, LOGGED, { value: true }); } catch { /* objeto congelado: paciência */ }
  return err;
}

/** O erro de uma gravação que o invoke devolveu com erro: a frase para o atleta (já registado). */
export function saveError(res) {
  const err = new Error(saveErrorText(res));
  err.name = 'SaveError';
  // A quota do dia (429): a frase da Carol, sem «Tentar de novo» (repetir dava o mesmo 429).
  if (res?.isQuota) err.quota = true;
  return markLogged(err);
}

/** A falha é a quota do dia (429): mostra-se a frase, sem «Tentar de novo». */
export const isQuotaError = (err) => !!(err && typeof err === 'object' && err.quota === true);

/** O servidor respondeu e recusou (data.error, já na voz da Carol): chegou lá, não é para registar aqui. */
export function saveRefusal(message) {
  return markLogged(new Error(message || 'Falha a gravar. Tenta novamente.'));
}

/** A frase de uma falha que não traz texto próprio para o atleta: erros de JS e de rede, que em inglês
 *  não dizem nada a quem os lê. As frases da app (em português) passam. */
const TECHNICAL = /edge function|failed to (send|fetch)|networkerror|network request failed|load failed|non-2xx|typeerror|cannot read|undefined|is not a function|fetch/i;
export const SAVE_GENERIC_TEXT = 'Não consegui gravar agora. Tenta de novo — não fica repetido.';

export function saveFailureMessage(err, fallback = SAVE_GENERIC_TEXT) {
  const msg = err?.message ? String(err.message) : '';
  if (err?.[LOGGED]) return msg || fallback;
  if (!msg || TECHNICAL.test(msg) || err?.name === 'TypeError') return fallback;
  return msg;
}

/**
 * Regista em app_logs (save_failed) uma gravação que falhou fora do invoke. Sem conteúdo do atleta:
 * o tipo de registo, o nome do erro e a mensagem técnica (curta). Nunca lança.
 * @param {'meal'|'run'|'gym'|'body'} kind
 * @param {unknown} err
 * @param {{ saveMode?: 'create'|'edit', step?: string }} [extra]
 */
export function reportSaveFailure(kind, err, extra = {}) {
  try {
    if (err && typeof err === 'object' && err[LOGGED]) return false;
    const errorName = (err && err.name) || typeof err;
    const code = err && typeof err === 'object' && typeof err.code === 'string' ? err.code : null;
    logAppEvent('error', 'save_failed', `${kind}: ${errorName}`, {
      kind,
      stage: 'client',
      errorName,
      message: technicalMessage(err?.message ?? (typeof err === 'string' ? err : null)),
      ...(code ? { code } : {}),
      online: typeof navigator === 'undefined' ? null : navigator.onLine !== false,
      ...extra,
    });
    if (err && typeof err === 'object') markLogged(err);
    return true;
  } catch {
    return false;
  }
}
