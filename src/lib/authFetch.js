/* Os pedidos ao Auth do Supabase com prazo (bug de 2026-11-17: a app presa no logo ao voltar).

   O auth-js não põe prazo nos pedidos. Ao voltar à app com o access token expirado (mais de uma
   hora fora), o arranque espera pelo refresh do token: o getSession espera pelo initialize, que
   espera pelo POST /token. No Android, logo a seguir a acordar, a rede pode deixar esse pedido
   pendurado — sem resposta e sem erro — e o arranque ficava no logo até o atleta deitar a app
   abaixo. O mesmo initialize prende todos os pedidos à base de dados (precisam do token).

   Com prazo, um pedido pendurado vira uma falha de rede: o auth-js tenta outra vez (até ~30 s,
   AUTO_REFRESH_TICK_DURATION_MS) e depois devolve o erro, que o arranque já sabe tratar (o ecrã
   «sem ligação», que volta a tentar sozinho). Só os pedidos de /auth/v1/ — os da base de dados e
   das Edge Functions têm os seus prazos. Um pedido que já traz um signal fica como está. */

export const AUTH_FETCH_TIMEOUT_MS = 10000;

function urlOf(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input.url === 'string') return input.url;
  try { return String(input); } catch { return ''; }
}

export function isAuthRequest(url) {
  return /\/auth\/v1\//.test(url || '');
}

/** Um fetch que corta os pedidos ao Auth ao fim de `timeoutMs`. */
export function createAuthTimeoutFetch({ baseFetch = (...a) => globalThis.fetch(...a), timeoutMs = AUTH_FETCH_TIMEOUT_MS } = {}) {
  return (input, init = {}) => {
    if (!isAuthRequest(urlOf(input)) || init?.signal || typeof AbortController === 'undefined') return baseFetch(input, init);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return Promise.resolve(baseFetch(input, { ...init, signal: controller.signal }))
      .finally(() => clearTimeout(timer));
  };
}
