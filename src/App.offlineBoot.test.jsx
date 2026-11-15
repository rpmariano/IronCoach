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
  // O auth-js guarda aqui o refresh falhado (60 s); o retry tem de o esquecer.
  auth: null,
}));

vi.mock('./lib/supabase', () => {
  const chain = new Proxy({}, {
    get: (_t, prop) => (prop === 'then' ? undefined : () => chain),
  });
  return {
    supabase: {
      auth: mocks.auth = {
        lastRefreshFailure: null,
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
import { logAppEvent } from './lib/supabase';
import { useAppStore } from './store';

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
  // O retry confirma a rede pelo version.json antes do getSession (utils/bootRetry.js).
  let network;
  beforeEach(() => {
    localStorage.clear();
    mocks.getSession.mockReset();
    mocks.authCallback = null;
    mocks.auth.lastRefreshFailure = null;
    network = true;
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (!network) throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify({ build: 'x' }), { status: 200 });
    }));
  });
  afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });

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

  /* Revisão do 0c1a88af: o auth-js guarda o refresh falhado 60 s. Com a rede de volta, o retry
     confirma-a (version.json), esquece essa falha e tenta logo; sem rede, nem tenta. */
  it('sem rede, o retry não chama o getSession; com rede, esquece o refresh falhado guardado e tenta', async () => {
    storeSession();
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: retryableFetchError() });
    render(<App />);
    await screen.findByTestId('boot-offline', {}, waitLong);
    const calls = mocks.getSession.mock.calls.length;

    network = false;
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(mocks.getSession.mock.calls.length).toBe(calls);

    network = true;
    mocks.auth.lastRefreshFailure = { refreshToken: 'rt-1', result: {}, expiresAt: Date.now() + 60000 };
    await act(async () => { screen.getByRole('button', { name: 'Tentar agora' }).click(); });
    await waitFor(() => expect(mocks.getSession.mock.calls.length).toBe(calls + 1));
    expect(mocks.auth.lastRefreshFailure).toBeNull();
    expect(String(globalThis.fetch.mock.calls.at(-1)[0])).toMatch(/version\.json/);
  });

  it('o botão e o evento online partilham uma só tentativa (um getSession, não dois)', async () => {
    storeSession();
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: retryableFetchError() });
    render(<App />);
    await screen.findByTestId('boot-offline', {}, waitLong);
    const calls = mocks.getSession.mock.calls.length;
    let release;
    globalThis.fetch.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(await screen.findByText('A ligar…')).toBeInTheDocument();
    await act(async () => { screen.getByRole('button', { name: /A tentar/ }).click(); window.dispatchEvent(new Event('online')); });
    await act(async () => { release(new Response('{}', { status: 200 })); });
    await waitFor(() => expect(mocks.getSession.mock.calls.length).toBe(calls + 1));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(mocks.getSession.mock.calls.length).toBe(calls + 1);
  });

  it('um 5xx do auth: «o servidor não está a responder», sem o login', async () => {
    storeSession();
    const e503 = Object.assign(new Error('Service Unavailable'), { name: 'AuthRetryableFetchError', status: 503 });
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: e503 });
    render(<App />);
    const screenOff = await screen.findByTestId('boot-offline', {}, waitLong);
    expect(screenOff).toHaveAttribute('data-reason', 'server');
    expect(screenOff).toHaveTextContent('O servidor não está a responder');
  });

  it('servidor em baixo (5xx): o «Tentar agora» respeita o cooldown do auth-js (não esquece o refresh falhado)', async () => {
    storeSession();
    const e503 = Object.assign(new Error('Service Unavailable'), { name: 'AuthRetryableFetchError', status: 503 });
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: e503 });
    render(<App />);
    await screen.findByTestId('boot-offline', {}, waitLong);
    const cached = { refreshToken: 'rt-1', result: {}, expiresAt: Date.now() + 60000 };
    mocks.auth.lastRefreshFailure = cached;
    const calls = mocks.getSession.mock.calls.length;
    await act(async () => { screen.getByRole('button', { name: 'Tentar agora' }).click(); });
    await waitFor(() => expect(mocks.getSession.mock.calls.length).toBe(calls + 1));
    expect(mocks.auth.lastRefreshFailure).toBe(cached);
  });

  it('uma exceção do código do arranque (não da rede) não liga o ecrã sem ligação', async () => {
    const original = useAppStore.getState().loadInitialData;
    useAppStore.setState({ loadInitialData: () => { throw new TypeError("Cannot read properties of undefined (reading 'x')"); } });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      storeSession();
      mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' }, access_token: 'a' } }, error: null });
      render(<App />);
      await waitFor(() => expect(errSpy.mock.calls.some((c) => c[0] === '[arranque]')).toBe(true), waitLong);
      expect(screen.queryByTestId('boot-offline')).toBeNull();
      expect(mocks.getSession).toHaveBeenCalledTimes(1);
      // Revisão do ff955623: não fica preso no logo, e a exceção fica em app_logs.
      await waitFor(() => expect(screen.queryByTestId('boot-splash')).toBeNull(), waitLong);
      expect(logAppEvent).toHaveBeenCalledWith('error', 'boot_exception', expect.stringContaining('Cannot read properties'), expect.anything());
    } finally {
      errSpy.mockRestore();
      useAppStore.setState({ loadInitialData: original });
    }
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
