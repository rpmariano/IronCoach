import { describe, it, expect } from 'vitest';
import { AUTH_OFFLINE_TEXT, authErrorText, bootSessionState, isNetworkAuthError, readStoredAuthSession } from './authNetwork';

/* 2026-11-09: sem rede, a autenticação não pode parecer «sessão acabada» nem mostrar «Failed to fetch». */
const named = (name, message, status) => Object.assign(new Error(message), { name, ...(status != null ? { status } : {}) });

describe('isNetworkAuthError / authErrorText', () => {
  it('rede: AuthRetryableFetchError, TypeError e «Failed to fetch» → a frase clara', () => {
    expect(isNetworkAuthError(named('AuthRetryableFetchError', 'Failed to fetch', 0))).toBe(true);
    expect(isNetworkAuthError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkAuthError(new Error('Load failed'))).toBe(true);
    expect(authErrorText(new TypeError('Failed to fetch'))).toBe(AUTH_OFFLINE_TEXT);
    expect(AUTH_OFFLINE_TEXT).toBe('Sem ligação à internet — verifica a rede e tenta de novo.');
  });
  it('recusas do servidor não são rede: a mensagem passa', () => {
    const bad = named('AuthApiError', 'Invalid login credentials', 400);
    expect(isNetworkAuthError(bad)).toBe(false);
    expect(authErrorText(bad)).toBe('Invalid login credentials');
    expect(isNetworkAuthError(named('AuthApiError', 'Failed to fetch', 401))).toBe(false);
    expect(authErrorText(null, 'X')).toBe('X');
  });
});

describe('bootSessionState', () => {
  const stored = { refresh_token: 'rt' };
  it('com sessão entra; sem rede e com a sessão guardada espera; o resto é o login', () => {
    expect(bootSessionState({ session: { user: { id: 'u' } } })).toBe('session');
    expect(bootSessionState({ session: null, error: named('AuthRetryableFetchError', 'Failed to fetch', 0), storedSession: stored })).toBe('offline');
    expect(bootSessionState({ session: null, error: named('AuthApiError', 'Invalid Refresh Token', 400), storedSession: stored })).toBe('signed-out');
    expect(bootSessionState({ session: null, error: named('AuthRetryableFetchError', 'Failed to fetch', 0), storedSession: null })).toBe('signed-out');
    expect(bootSessionState({ session: null, error: null, storedSession: stored })).toBe('signed-out');
  });
});

describe('readStoredAuthSession', () => {
  const fake = (entries) => ({
    get length() { return Object.keys(entries).length; },
    key: (i) => Object.keys(entries)[i],
    getItem: (k) => entries[k] ?? null,
  });
  it('lê a sessão do auth-js (sb-<ref>-auth-token) só se tiver refresh token', () => {
    expect(readStoredAuthSession(fake({ 'sb-abc-auth-token': JSON.stringify({ refresh_token: 'rt', user: { id: 'u' } }) }))?.refresh_token).toBe('rt');
    expect(readStoredAuthSession(fake({ 'sb-abc-auth-token': JSON.stringify({ access_token: 'x' }) }))).toBeNull();
    expect(readStoredAuthSession(fake({ outra: 'x' }))).toBeNull();
    expect(readStoredAuthSession(fake({ 'sb-abc-auth-token': '{estragado' }))).toBeNull();
    expect(readStoredAuthSession(null)).toBeNull();
  });
});
