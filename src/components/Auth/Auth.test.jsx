import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: (...a) => mocks.signIn(...a), signUp: vi.fn(), signInWithOAuth: vi.fn() } },
}));

import Auth from './Auth';

/* 2026-11-09 (a Patty): sem rede, o login mostrava «Failed to fetch» por cima do email. */
describe('Auth — erros de rede', () => {
  beforeEach(() => mocks.signIn.mockReset());

  const submit = () => {
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'a@b.pt' } });
    fireEvent.change(document.querySelector('input[type="password"]'), { target: { value: 'segredo' } });
    fireEvent.submit(document.querySelector('form'));
  };

  it('sem rede: a frase clara, nunca «Failed to fetch»', async () => {
    mocks.signIn.mockResolvedValue({ data: null, error: Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError', status: 0 }) });
    render(<Auth />);
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem ligação à internet — verifica a rede e tenta de novo.');
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });

  it('um TypeError de fetch como erro também', async () => {
    mocks.signIn.mockResolvedValue({ data: null, error: new TypeError('Failed to fetch') });
    render(<Auth />);
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem ligação à internet');
  });

  it('credenciais erradas: a mensagem do servidor, como antes', async () => {
    mocks.signIn.mockResolvedValue({ data: null, error: Object.assign(new Error('Invalid login credentials'), { name: 'AuthApiError', status: 400 }) });
    render(<Auth />);
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials');
  });
});
