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
const uploadMock = vi.fn(() => Promise.resolve({ error: null }));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ insert: insertMock })),
    storage: { from: vi.fn(() => ({ upload: uploadMock })) },
  },
}));

// A captura real usa DOM->canvas; para os testes só interessa que o blob
// resultante flui até ao upload, não o pixel a pixel do html2canvas.
vi.mock('html2canvas', () => ({
  default: vi.fn(() =>
    Promise.resolve({
      toBlob: (cb) => cb(new Blob(['fake-screenshot'], { type: 'image/png' })),
    }),
  ),
}));

function renderButton() {
  return render(
    <ToastProvider>
      <ReportIssueButton />
    </ToastProvider>,
  );
}

async function openAndWaitForCapture() {
  fireEvent.click(screen.getByLabelText('Reportar um problema'));
  await waitFor(() => expect(screen.queryByText(/A capturar o ecrã/)).not.toBeInTheDocument());
}

describe('ReportIssueButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockResolvedValue({ error: null });
    uploadMock.mockResolvedValue({ error: null });
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-preview');
    global.URL.revokeObjectURL = vi.fn();

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

  it('ao clicar, abre a caixa de descrição imediatamente e captura o screenshot em segundo plano', async () => {
    renderButton();
    fireEvent.click(screen.getByLabelText('Reportar um problema'));

    // A caixa de texto já está disponível antes da captura terminar.
    expect(screen.getByPlaceholderText(/Descreve o problema/)).toBeInTheDocument();
    expect(screen.getByText(/A capturar o ecrã/)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByAltText('Pré-visualização do screenshot anexado')).toBeInTheDocument());
  });

  it('recusa submeter sem descrição e não chama o Supabase', async () => {
    renderButton();
    await openAndWaitForCapture();

    fireEvent.click(screen.getByRole('button', { name: /Enviar report/ }));

    expect(await screen.findByText('Descreve o problema antes de enviar.')).toBeInTheDocument();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('submete a descrição, faz upload do screenshot e regista a página atual', async () => {
    renderButton();
    await openAndWaitForCapture();

    fireEvent.change(screen.getByPlaceholderText(/Descreve o problema/), {
      target: { value: 'O botão de guardar não responde.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Enviar report/ }));

    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        user_email: 'atleta@ironcoach.app',
        user_name: 'Atleta Teste',
        description: 'O botão de guardar não responde.',
        page: 'Coach',
        screenshot_path: expect.stringContaining('user-1/'),
      }),
    );

    expect(await screen.findByText('Obrigado! O teu report foi enviado à equipa.')).toBeInTheDocument();
    // Modal fecha e limpa o estado após o sucesso.
    await waitFor(() => expect(screen.queryByText('O que aconteceu?')).not.toBeInTheDocument());
  });

  it('segue sem screenshot quando o upload falha, mas ainda envia a descrição', async () => {
    uploadMock.mockResolvedValueOnce({ error: { message: 'boom' } });
    renderButton();
    await openAndWaitForCapture();

    fireEvent.change(screen.getByPlaceholderText(/Descreve o problema/), {
      target: { value: 'Falha ao carregar o dashboard.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Enviar report/ }));

    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ screenshot_path: null }));
  });
});
