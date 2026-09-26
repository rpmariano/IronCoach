import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useAppStore } from '../../store';
import Admin from './Admin';

/* Regressão de acesso ao separador "Competições" (specs/trofeu.md §6, Fase
   1b, 2026-09-26): só is_admin o vê — bug_reviewer fica preso ao separador
   de bugs, como já acontecia para todos os outros separadores. O conteúdo
   do separador em si (CompetitionsTab) tem os seus próprios testes em
   Competitions/Competitions.test.jsx; aqui interessa só a "porta". */

vi.mock('../../store', () => ({ useAppStore: vi.fn() }));

vi.mock('./Competitions', () => ({ default: () => <div data-testid="competitions-tab">Competitions</div> }));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
    from: () => ({
      select: () => ({
        order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  },
}));

function mockStore(profile) {
  useAppStore.mockReturnValue({ profile });
}

describe('Admin — separador "Competições"', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('is_admin vê o separador e consegue abri-lo', async () => {
    mockStore({ id: 'admin-1', is_admin: true });
    render(<Admin />);
    const tab = await screen.findByText('Competições');
    fireEvent.click(tab);
    expect(await screen.findByTestId('competitions-tab')).toBeInTheDocument();
  });

  it('bug_reviewer (sem is_admin) não vê o separador — só bugs', async () => {
    mockStore({ id: 'reviewer-1', is_admin: false, bug_reviewer: true });
    render(<Admin />);
    await waitFor(() => expect(screen.getByText('Modo Revisor de Bugs — Acesso limitado a relatórios de erros apenas')).toBeInTheDocument());
    expect(screen.queryByText('Competições')).not.toBeInTheDocument();
  });

  it('sem is_admin nem bug_reviewer não acede a nada do Admin', async () => {
    mockStore({ id: 'user-1' });
    render(<Admin />);
    expect(await screen.findByText(/Acesso negado/)).toBeInTheDocument();
    expect(screen.queryByText('Competições')).not.toBeInTheDocument();
  });
});
