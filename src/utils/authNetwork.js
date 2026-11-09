/* Sem rede, a autenticação não pode parecer outra coisa (2026-11-09). A Patty abriu a app sem rede e
   viu o ecrã de login com «Failed to fetch» por cima do email — com a sessão válida no telemóvel
   (os logs têm o token_refreshed às 12:01 e às 12:08, e às 12:08 a app arrancou normal).

   A causa: com o access token expirado, o getSession() do arranque tenta renovar a sessão; sem rede
   a renovação falha com um AuthRetryableFetchError e o auth-js devolve `session: null` — mas a sessão
   (e o refresh token) continua guardada. O App lia isso como «sem sessão» e mostrava o login.

   Aqui: distinguir uma falha de rede de uma sessão que acabou de facto. Só um SIGNED_OUT ou um
   refresh token recusado pelo servidor (400/401) levam ao login. */

/** A frase do login quando o pedido nem chegou ao servidor. */
export const AUTH_OFFLINE_TEXT = 'Sem ligação à internet — verifica a rede e tenta de novo.';

/** A falha é de rede (o pedido não chegou, ou o servidor não respondeu), não uma recusa. */
export function isNetworkAuthError(err) {
  if (!err) return false;
  const name = String(err.name || '');
  const status = Number(err.status);
  // Uma recusa do servidor (credenciais, refresh token inválido) nunca é rede.
  if (status === 400 || status === 401 || status === 403 || status === 422) return false;
  if (name === 'AuthRetryableFetchError') return true;
  if (name === 'TypeError') return true;
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected/i.test(String(err.message || ''));
}

/** A mensagem do login para um erro: a de rede numa frase clara; as outras como vêm. */
export function authErrorText(err, fallback = 'Erro ao efetuar autenticação.') {
  if (isNetworkAuthError(err)) return AUTH_OFFLINE_TEXT;
  return err?.message || fallback;
}

/** A sessão guardada pelo auth-js no localStorage (sb-<ref>-auth-token), ou null. Só para saber
 *  se há um refresh token — nunca para entrar com ela. */
export function readStoredAuthSession(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage) return null;
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key || !/^sb-[a-z0-9]+-auth-token$/i.test(key)) continue;
      const parsed = JSON.parse(storage.getItem(key) || 'null');
      const session = parsed?.currentSession || parsed;
      if (session?.refresh_token) return session;
    }
  } catch { /* storage bloqueado ou estragado: sem sessão guardada */ }
  return null;
}

/**
 * O que o arranque faz com o resultado do getSession().
 * @returns 'session' (entra), 'offline' (sessão guardada, sem rede: espera pela rede — nunca o
 *   login), 'signed-out' (o login)
 */
export function bootSessionState({ session, error, storedSession }) {
  if (session?.user) return 'session';
  if (error && isNetworkAuthError(error) && storedSession?.refresh_token) return 'offline';
  return 'signed-out';
}
