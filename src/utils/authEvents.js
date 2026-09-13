/* O que o App faz com cada evento de autenticação do Supabase.

   Ao voltar à app depois de estar noutra, o Supabase recupera a sessão e
   emite SIGNED_IN (auth-js, _onVisibilityChanged → _recoverAndRefresh) — e,
   se o token expirou entretanto, TOKEN_REFRESHED — com o MESMO utilizador.
   Tratar isso como um login novo desmontava o ecrã aberto e perdia as fotos
   de um registo a meio; recarregar os dados por baixo, com o formulário
   aberto, repunha o rascunho de uma prova ou corrida em edição com os
   valores do servidor (revisão pré-deploy, 2026-09-13).

   Por isso, com o mesmo utilizador cujos dados já estão carregados, qualquer
   evento só atualiza a sessão. Os dados carregam-se quando o utilizador muda:
   com o ecrã de carregamento num SIGNED_IN (login a sério, em que o perfil
   chega antes das listas), e sem ele nos outros eventos. */

/**
 * @param event    o evento do onAuthStateChange
 * @param options.hasUser   a sessão traz utilizador
 * @param options.sameUser  é o utilizador cujos dados já estão carregados
 * @returns 'signed-out' | 'ignore' | 'session-only' | 'load-with-loader' | 'load'
 */
export function authEventAction(event, { hasUser, sameUser }) {
  if (!hasUser) return event === 'SIGNED_OUT' ? 'signed-out' : 'ignore';
  if (sameUser) return 'session-only';
  return event === 'SIGNED_IN' ? 'load-with-loader' : 'load';
}
