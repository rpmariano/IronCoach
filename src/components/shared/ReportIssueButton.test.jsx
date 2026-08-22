import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { ToastProvider } from './ToastProvider';
import ReportIssueButton from './ReportIssueButton';

vi.mock('../../store', () => ({
  useAppStore: vi.fn(),
}));

const insertMock = vi.fn(() => Promise.resolve({ error: null }));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ insert: insertMock })),
  },
}));

function renderButton() {
  return render(
    <ToastProvider>
      <ReportIssueButton />
    </ToastProvider>,
  );
}

describe('ReportIssueButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockResolvedValue({ error: null });

    useAppStore.mockReturnValue({
      session: { user: { id: 'user-1', email: 'atleta@ironcoach.app' } },
      profile: { id: 'user-1', full_name: 'Atleta Teste' },
      activeTab: 'coach',
      openCreationMode: null,
      editingRaceId: null,
    });
  });

  it('mostra o botão discreto e mantém o modal fechado por omissão', () => {
    renderButton();
    expect(screen.getByLabelText('Reportar um problema')).toBeInTheDocument();
    expect(screen.queryByText('O que aconteceu?')).not.toBeInTheDocument();
  });

  it('ao clicar, abre a caixa de descrição sem pedir mais nada (sem screenshot)', () => {
    renderButton();
    fireEvent.click(screen.getByLabelText('Reportar um problema'));

    expect(screen.getByPlaceholderText(/Descreve o problema/)).toBeInTheDocument();
    expect(screen.queryByText(/screenshot/i)).not.toBeInTheDocument();
  });

  it('recusa submeter sem descrição e não chama o Supabase', async () => {
    renderButton();
    fireEvent.click(screen.getByLabelText('Reportar um problema'));

    fireEvent.click(screen.getByRole('button', { name: /Enviar report/ }));

    expect(await screen.findByText('Descreve o problema antes de enviar.')).toBeInTheDocument();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('submete a descrição e regista utilizador/página/data — sem qualquer screenshot', async () => {
    renderButton();
    fireEvent.click(screen.getByLabelText('Reportar um problema'));

    fireEvent.change(screen.getByPlaceholderText(/Descreve o problema/), {
      target: { value: 'O botão de guardar não responde.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Enviar report/ }));

    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));

    const payload = insertMock.mock.calls[0][0];
    expect(payload).toEqual({
      user_id: 'user-1',
      user_email: 'atleta@ironcoach.app',
      user_name: 'Atleta Teste',
      description: 'O botão de guardar não responde.',
      page: 'Coach',
      user_agent: expect.any(String),
    });
    expect(payload).not.toHaveProperty('screenshot_path');

    expect(await screen.findByText('Obrigado! O teu report foi enviado à equipa.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('O que aconteceu?')).not.toBeInTheDocument());
  });

  it('mostra erro e não fecha o modal quando o Supabase falha', async () => {
    insertMock.mockResolvedValueOnce({ error: { message: 'boom' } });
    renderButton();
    fireEvent.click(screen.getByLabelText('Reportar um problema'));

    fireEvent.change(screen.getByPlaceholderText(/Descreve o problema/), {
      target: { value: 'Falha ao carregar o dashboard.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Enviar report/ }));

    expect(await screen.findByText('Não foi possível enviar o report. Tenta novamente.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Descreve o problema/)).toBeInTheDocument();
  });
});
