import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* 2026-11-09 (a Patty): sem rede no arranque, com a sessão guardada, a app mostrava o login com
   «Failed to fetch». O getSession devolvia session null com um erro de rede (o access token tinha
   expirado e a renovação não saiu) — e isso não é «sem sessão». Só um refresh token recusado
   (400/401) ou um SIGNED_OUT real levam ao login. */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  authCallback: null,
}));

vi.mock('./lib/supabase', () => {
  const chain = new Proxy({}, {
    get: (_t, prop) => (prop === 'then' ? undefined : () => chain),
  });
  return {
    supabase: {
      auth: {
        getSession: (...a) => mocks.getSession(...a),
        onAuthStateChange: (cb) => { mocks.authCallback = cb; return { data: { subscription: { unsubscribe() {} } } }; },
        signInWithPassword: vi.fn(),
        signUp: vi.fn(),
        signInWithOAuth: vi.fn(),
      },
      from: () => chain,
      storage: { from: () => chain },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {},
    },
    logAppEvent: vi.fn(),
    sendPendingAppLogs: vi.fn(),
    invokeEdgeFunctionWithTimeout: vi.fn(async () => ({ data: null, error: null })),
  };
});

import App from './App';

function retryableFetchError() {
  const err = new Error('Failed to fetch');
  err.name = 'AuthRetryableFetchError';
  err.status = 0;
  return err;
}
function storeSession() {
  localStorage.setItem('sb-roxfzsiciizkevopgpnl-auth-token', JSON.stringify({ access_token: 'expirado', refresh_token: 'rt-1', expires_at: 1, user: { id: 'u1' } }));
}

const waitLong = { timeout: 8000 };

describe('App — arranque sem rede com a sessão guardada', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.getSession.mockReset();
    mocks.authCallback = null;
  });
  afterEach(() => { localStorage.clear(); });

  it('não mostra o login: mostra «sem ligação» e volta a tentar quando a rede volta', async () => {
    storeSession();
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: retryableFetchError() });
    render(<App />);
    expect(await screen.findByTestId('boot-offline', {}, waitLong)).toHaveTextContent('Sem ligação à internet');
    expect(screen.queryByLabelText(/palavra-passe/i)).toBeNull();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();

    // A rede volta, mas a renovação ainda falha por rede: continua no ecrã sem ligação.
    const calls = mocks.getSession.mock.calls.length;
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(mocks.getSession.mock.calls.length).toBe(calls + 1));
    expect(screen.getByTestId('boot-offline')).toBeInTheDocument();
  });

  it('refresh token recusado (400): o login', async () => {
    storeSession();
    const err = new Error('Invalid Refresh Token: Refresh Token Not Found');
    err.name = 'AuthApiError';
    err.status = 400;
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: err });
    render(<App />);
    expect(await screen.findByText(/Entra na tua conta/, {}, waitLong)).toBeInTheDocument();
    expect(screen.queryByTestId('boot-offline')).toBeNull();
  });

  it('sem sessão guardada e sem rede: o login (não há sessão para esperar)', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: retryableFetchError() });
    render(<App />);
    expect(await screen.findByText(/Entra na tua conta/, {}, waitLong)).toBeInTheDocument();
  });

  it('um SIGNED_OUT real, com o ecrã sem ligação à vista, leva ao login', async () => {
    storeSession();
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: retryableFetchError() });
    render(<App />);
    await screen.findByTestId('boot-offline', {}, waitLong);
    await act(async () => { mocks.authCallback('SIGNED_OUT', null); });
    expect(await screen.findByText(/Entra na tua conta/, {}, waitLong)).toBeInTheDocument();
  });
});
