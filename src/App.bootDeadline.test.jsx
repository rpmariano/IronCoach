import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* Bug de 2026-11-17 (o Rui, Android, PWA): «quase sempre que volto à app ela reinicia e a maior
   parte das vezes fica preso no logotipo». Ao voltar com o token expirado, o getSession espera pelo
   refresh — e com a rede a acordar isso podia não acabar. O logo do index.html já tinha sido
   adotado (a rede de segurança dos 30 s desligada): ficava para sempre.

   Aqui os prazos são curtos (o módulo dos prazos vem trocado): o que se fixa é o comportamento. */

vi.mock('./utils/bootDeadline', async (orig) => ({
  ...(await orig()),
  BOOT_SESSION_TIMEOUT_MS: 150,
  BOOT_DEADLINE_MS: 600,
}));

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), authCallback: null }));

vi.mock('./lib/supabase', () => {
  const chain = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : () => chain) });
  return {
    supabase: {
      auth: {
        lastRefreshFailure: null,
        getSession: (...a) => mocks.getSession(...a),
        onAuthStateChange: (cb) => { mocks.authCallback = cb; return { data: { subscription: { unsubscribe() {} } } }; },
        signInWithPassword: vi.fn(), signUp: vi.fn(), signInWithOAuth: vi.fn(),
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
import { BOOT_TRACE_KEY, readBootTraces, resetBootTrace } from './utils/bootTrace';

function storeSession() {
  localStorage.setItem('sb-roxfzsiciizkevopgpnl-auth-token', JSON.stringify({ access_token: 'expirado', refresh_token: 'rt-1', expires_at: 1, user: { id: 'u1' } }));
}
const waitLong = { timeout: 5000 };

describe('App — o arranque sai sempre do logo', () => {
  let originalLoad;
  beforeEach(() => {
    localStorage.clear();
    resetBootTrace();
    mocks.getSession.mockReset();
    logAppEvent.mockClear();
    originalLoad = useAppStore.getState().loadInitialData;
    useAppStore.setState({ session: null });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ build: 'x' }), { status: 200 })));
  });
  afterEach(() => {
    useAppStore.setState({ loadInitialData: originalLoad, session: null });
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('o getSession pendurado (refresh do token sem resposta): sai para «a ligação está lenta», e a resposta tardia ainda entra', async () => {
    storeSession();
    let answer;
    // As tentativas seguintes (o ecrã «lenta» volta a tentar) respondem já com a sessão.
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' }, access_token: 'novo' } }, error: null });
    mocks.getSession.mockImplementationOnce(() => new Promise((r) => { answer = r; }));
    useAppStore.setState({ loadInitialData: async () => {} });
    render(<App />);

    const slow = await screen.findByTestId('boot-offline', {}, waitLong);
    expect(slow).toHaveAttribute('data-reason', 'slow');
    expect(slow).toHaveTextContent('A ligação está lenta');
    expect(screen.queryByLabelText(/palavra-passe/i)).toBeNull();
    const trace = readBootTraces().at(-1);
    expect(trace.exit).toBe('session-timeout');
    expect(trace.p).toEqual(expect.objectContaining({ 'session-start': expect.any(Number), 'session-timeout': expect.any(Number) }));

    // O refresh acaba por responder: a app entra sem o atleta fazer nada.
    await act(async () => { answer({ data: { session: { user: { id: 'u1' }, access_token: 'novo' } }, error: null }); });
    await waitFor(() => expect(screen.queryByTestId('boot-offline')).toBeNull(), waitLong);
    expect(useAppStore.getState().session?.user?.id).toBe('u1');
  });

  it('com a sessão, mas os dados presos: o prazo duro tira o logo na mesma (e fica em app_logs)', async () => {
    storeSession();
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' }, access_token: 'a' } }, error: null });
    useAppStore.setState({ loadInitialData: () => new Promise(() => {}) });
    render(<App />);
    await waitFor(() => expect(screen.queryByTestId('boot-splash')).toBeNull(), waitLong);
    expect(screen.queryByTestId('boot-offline')).toBeNull();
    expect(readBootTraces().at(-1).exit).toBe('deadline');
    expect(logAppEvent).toHaveBeenCalledWith('error', 'boot_deadline', expect.any(String), expect.objectContaining({ hasSession: true }));
  });

  it('o arranque anterior que ficou preso vai para app_logs (boot_stuck) com a fase onde parou', async () => {
    localStorage.setItem(BOOT_TRACE_KEY, JSON.stringify([{ at: 1, p: { html: 30, main: 420, adopted: 470, 'session-start': 480 }, exit: null }]));
    storeSession();
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' }, access_token: 'a' } }, error: null });
    useAppStore.setState({ loadInitialData: async () => {} });
    render(<App />);
    await waitFor(() => expect(logAppEvent).toHaveBeenCalledWith('error', 'boot_stuck', expect.any(String), {
      trace: expect.objectContaining({ at: 1, p: expect.objectContaining({ 'session-start': 480 }) }),
    }), waitLong);
    const boot = logAppEvent.mock.calls.find((c) => c[1] === 'app_boot');
    expect(boot[3].trace).toEqual(expect.objectContaining({ p: expect.objectContaining({ 'session-end': expect.any(Number) }) }));
  });
});
