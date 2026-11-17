/* Os pedidos ao Auth do Supabase com prazo (bug de 2026-11-17: a app presa no logo ao voltar).

   O auth-js não põe prazo nos pedidos. Ao voltar à app com o access token expirado (mais de uma
   hora fora), o arranque espera pelo refresh do token: o getSession espera pelo initialize, que
   espera pelo POST /token. No Android, logo a seguir a acordar, a rede pode deixar esse pedido
   pendurado — sem resposta e sem erro — e o arranque ficava no logo até o atleta deitar a app
   abaixo. O mesmo initialize prende todos os pedidos à base de dados (precisam do token).

   Com prazo, um pedido pendurado vira uma falha de rede: o auth-js tenta outra vez (até ~30 s,
   AUTO_REFRESH_TICK_DURATION_MS) e depois devolve o erro, que o arranque já sabe tratar.

   Só os pedidos ao Auth do NOSSO projeto (`<origin>/auth/v1/`, revisão pré-deploy de a78b80bb):
   o /token, que é o do arranque, com 10 s; os outros (signup, OTP, recuperar a palavra-passe)
   enviam emails e podem demorar — 30 s. Os da base de dados e das Edge Functions têm os seus
   prazos. Um pedido que já traz um signal fica como está. */

export const AUTH_TOKEN_TIMEOUT_MS = 10000;
export const AUTH_OTHER_TIMEOUT_MS = 30000;
/** Compatibilidade: o prazo do /token. */
export const AUTH_FETCH_TIMEOUT_MS = AUTH_TOKEN_TIMEOUT_MS;

function urlOf(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input.url === 'string') return input.url;
  try { return String(input); } catch { return ''; }
}

function originOf(base) {
  try { return new URL(base).origin; } catch { return null; }
}

/** É um pedido ao Auth deste projeto? */
export function isAuthRequest(url, origin) {
  const o = originOf(origin);
  return !!o && typeof url === 'string' && url.startsWith(`${o}/auth/v1/`);
}

/** O prazo para um pedido ao Auth: o /token curto, os outros mais longos. */
export function authTimeoutFor(url, origin, { tokenMs = AUTH_TOKEN_TIMEOUT_MS, otherMs = AUTH_OTHER_TIMEOUT_MS } = {}) {
  const o = originOf(origin);
  return url.startsWith(`${o}/auth/v1/token`) ? tokenMs : otherMs;
}

/** Um fetch que corta os pedidos ao Auth de `origin` ao fim do prazo. */
export function createAuthTimeoutFetch({
  origin,
  baseFetch = (...a) => globalThis.fetch(...a),
  tokenMs = AUTH_TOKEN_TIMEOUT_MS,
  otherMs = AUTH_OTHER_TIMEOUT_MS,
} = {}) {
  return (input, init = {}) => {
    const url = urlOf(input);
    if (!isAuthRequest(url, origin) || init?.signal || typeof AbortController === 'undefined') return baseFetch(input, init);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), authTimeoutFor(url, origin, { tokenMs, otherMs }));
    return Promise.resolve(baseFetch(input, { ...init, signal: controller.signal }))
      .finally(() => clearTimeout(timer));
  };
}
