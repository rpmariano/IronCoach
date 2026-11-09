/* Voltar a tentar o arranque sem rede (revisão do 0c1a88af, 2026-11-09).

   O auth-js 2.111 guarda um refresh falhado durante 60 s (REFRESH_FAILURE_COOLDOWN_MS, a
   propriedade `lastRefreshFailure` do GoTrueClient): dentro desse tempo, o getSession com o mesmo
   refresh token devolve a falha guardada, sem ir à rede. Com a rede já de volta, o «Tentar agora»
   e o evento online recebiam essa falha e o atleta esperava até um minuto.

   A solução escolhida: antes de cada tentativa, confirma-se a rede com um pedido leve (o
   version.json, sem cache). Sem resposta, não se tenta nada (continua «sem ligação»). Com
   resposta, a falha guardada já não vale — limpa-se, e o getSession tenta o refresh logo.
   `lastRefreshFailure` é interna do auth-js: o teste bootRetry.test.js confirma que o cliente a
   tem, para uma atualização da biblioteca não a tornar num no-op em silêncio.

   Uma só tentativa de cada vez: o botão, o evento online e o temporizador partilham a mesma. */

/** A rede chega ao nosso servidor? (qualquer resposta HTTP conta; só uma falha de fetch não) */
export async function probeNetwork({ fetchImpl = globalThis.fetch, base = (import.meta.env?.BASE_URL || '/'), timeoutMs = 5000 } = {}) {
  if (typeof fetchImpl !== 'function') return false;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    await fetchImpl(`${base}version.json?t=${Date.now()}`, { cache: 'no-store', ...(controller ? { signal: controller.signal } : {}) });
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Esquece o refresh falhado que o auth-js guarda (só se o cliente tiver a propriedade). */
export function clearRefreshFailureCache(auth) {
  if (auth && Object.prototype.hasOwnProperty.call(auth, 'lastRefreshFailure')) {
    auth.lastRefreshFailure = null;
    return true;
  }
  return false;
}

/** Quanto se espera por uma tentativa antes de largar a guarda (o botão não fica em «A tentar»). */
export const BOOT_ATTEMPT_TIMEOUT_MS = 20000;

/**
 * Uma tentativa de arranque de cada vez.
 * - `canClearCooldown`: com o Supabase em baixo (5xx) não se esquece o refresh falhado — o probe vai
 *   ao GitHub Pages, não ao Supabase, e cada cliente pediria o /token a cada tentativa (revisão do
 *   ff955623). Aí a tentativa respeita o cooldown do auth-js.
 * - `timeoutMs`: a tentativa que não responde larga a guarda ao fim deste tempo.
 * @returns {{ run: () => Promise<'offline'|'attempted'|'timeout'>, isBusy: () => boolean }}
 */
export function createBootRetry({ probe, clearCooldown, attempt, onBusy = () => {}, canClearCooldown = () => true, timeoutMs = BOOT_ATTEMPT_TIMEOUT_MS }) {
  let inFlight = null;
  const run = () => {
    if (inFlight) return inFlight;
    onBusy(true);
    inFlight = (async () => {
      let timer = null;
      try {
        if (!(await probe())) return 'offline';
        if (canClearCooldown()) clearCooldown();
        const timedOut = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), timeoutMs); });
        const outcome = await Promise.race([Promise.resolve(attempt()).then(() => 'attempted'), timedOut]);
        return outcome;
      } catch {
        return 'attempted';
      } finally {
        if (timer) clearTimeout(timer);
        inFlight = null;
        onBusy(false);
      }
    })();
    return inFlight;
  };
  return { run, isBusy: () => !!inFlight };
}
