import { describe, it, expect } from 'vitest';
import { authEventAction } from './authEvents';

/* Voltar à app não pode desmontar nem recarregar por baixo um formulário
   aberto (2026-09-13). */

describe('authEventAction', () => {
  it('voltar à app com o mesmo utilizador só atualiza a sessão, seja qual for o evento', () => {
    ['SIGNED_IN', 'TOKEN_REFRESHED', 'INITIAL_SESSION', 'USER_UPDATED'].forEach((event) => {
      expect(authEventAction(event, { hasUser: true, sameUser: true })).toBe('session-only');
    });
  });

  it('o login de outro utilizador (ou o primeiro) carrega com o ecrã de carregamento', () => {
    expect(authEventAction('SIGNED_IN', { hasUser: true, sameUser: false })).toBe('load-with-loader');
  });

  it('outros eventos com um utilizador ainda por carregar carregam sem ecrã de carregamento', () => {
    expect(authEventAction('INITIAL_SESSION', { hasUser: true, sameUser: false })).toBe('load');
    expect(authEventAction('TOKEN_REFRESHED', { hasUser: true, sameUser: false })).toBe('load');
  });

  it('sem utilizador: SIGNED_OUT limpa a sessão, o resto ignora-se', () => {
    expect(authEventAction('SIGNED_OUT', { hasUser: false, sameUser: false })).toBe('signed-out');
    expect(authEventAction('INITIAL_SESSION', { hasUser: false, sameUser: false })).toBe('ignore');
  });
});
