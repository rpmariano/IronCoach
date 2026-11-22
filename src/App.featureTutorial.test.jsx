import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* O tutorial com interruptor («v1 lite», revisão pré-deploy): o primeiro acesso decide-o UMA vez
   (os interruptores podem chegar depois, e o arranque não pode saltar a meio para o tutorial), e um
   ?tutorial=1 com o tutorial desligado não o deixa pedido. Pelo modo demo do primeiro acesso
   (?demo=true&onboarding=1), que não precisa de servidor. */

vi.mock('./lib/supabase', () => {
  const chain = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : () => chain) });
  return {
    supabase: {
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
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
import { useAppStore } from './store';
import { FEATURE_BASE } from './store/featureFlagsSlice';

const waitLong = { timeout: 8000 };
const setUrl = (search) => window.history.replaceState(null, '', `/${search}`);

describe('App — o tutorial com interruptor (v1 lite)', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ session: null, tutorialOpen: false, onboardingOpen: false });
  });
  afterEach(() => {
    useAppStore.setState({ featureFlags: { ...FEATURE_BASE }, tutorialOpen: false });
    setUrl('');
  });

  it('desligado no primeiro acesso: o arranque; ligar depois não salta para o tutorial a meio', async () => {
    useAppStore.setState({ featureFlags: { ...FEATURE_BASE, tutorial: false } });
    setUrl('?demo=true&onboarding=1');
    render(<App />);
    expect(await screen.findByTestId('onboarding', {}, waitLong)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Passos do tutorial' })).toBeNull();
    // Os interruptores chegam depois, com o tutorial ligado: a decisão já está tomada.
    act(() => { useAppStore.setState({ featureFlags: { ...FEATURE_BASE, tutorial: true } }); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.queryByRole('navigation', { name: 'Passos do tutorial' })).toBeNull();
    expect(screen.getByTestId('onboarding')).toBeInTheDocument();
  });

  it('ligado no primeiro acesso: o tutorial primeiro', async () => {
    useAppStore.setState({ featureFlags: { ...FEATURE_BASE, tutorial: true } });
    setUrl('?demo=true&onboarding=1');
    render(<App />);
    expect(await screen.findByRole('navigation', { name: 'Passos do tutorial' }, waitLong)).toBeInTheDocument();
  });

  it('?tutorial=1 com o tutorial desligado: não fica pedido', async () => {
    useAppStore.setState({ featureFlags: { ...FEATURE_BASE, tutorial: false } });
    setUrl('?demo=true&tutorial=1');
    render(<App />);
    await waitFor(() => expect(screen.queryByTestId('boot-splash')).toBeNull(), waitLong);
    expect(useAppStore.getState().tutorialOpen).toBe(false);
    expect(screen.queryByRole('navigation', { name: 'Passos do tutorial' })).toBeNull();
  });
});
