import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useAppStore } from '../../store';
import BugNotificationsHandler from './BugNotificationsHandler';

const NOTIF = { id: 'n1', message: 'Corrigimos o gráfico.', created_at: '2026-10-05T10:00:00Z', bug_reports: { id: 'b1', title: 'Gráfico vazio', bug_number: 54 } };

vi.mock('../../lib/supabase', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    order: () => Promise.resolve({ data: [NOTIF], error: null }),
  };
  return { supabase: { from: () => chain } };
});

/* Convenção única dos botões (2026-10-05): em linha, o positivo à esquerda
   e o negativo à direita — "Responder" à esquerda, "Cancelar" à direita. */
describe('BugNotificationsHandler', () => {
  beforeEach(() => {
    useAppStore.setState({ session: { user: { id: 'u1' } } });
  });

  it('"Responder" à esquerda, "Cancelar" à direita', async () => {
    render(<BugNotificationsHandler />);
    fireEvent.click(await screen.findByRole('button', { name: /1 notificação por ler/ }));
    const responder = await screen.findByRole('button', { name: 'Responder' });
    const cancelar = screen.getByRole('button', { name: 'Cancelar' });
    expect(responder.parentElement).toBe(cancelar.parentElement);
    expect(responder.nextElementSibling).toBe(cancelar);
  });
});
