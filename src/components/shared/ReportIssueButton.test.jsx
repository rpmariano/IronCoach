import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { ToastProvider } from './ToastProvider';
import ReportIssueButton, { clampBottom } from './ReportIssueButton';

vi.mock('../../store', () => ({
  useAppStore: vi.fn(),
}));

const insertMock = vi.fn(() => Promise.resolve({ error: null }));
const uploadMock = vi.fn(() => Promise.resolve({ error: null }));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ insert: insertMock })),
    storage: {
      from: vi.fn(() => ({
        upload: uploadMock,
      })),
    },
  },
}));

function renderButton() {
  return render(
    <ToastProvider>
      <ReportIssueButton />
    </ToastProvider>,
  );
}

function fillTitle(value) {
  fireEvent.change(screen.getByPlaceholderText(/Resume o problema/), {
    target: { value },
  });
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

    expect(screen.getByPlaceholderText(/Resume o problema/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Descreve o problema/)).toBeInTheDocument();
    expect(screen.queryByText(/screenshot/i)).not.toBeInTheDocument();
  });

  it('recusa submeter sem título e não chama o Supabase', async () => {
    renderButton();
    fireEvent.click(screen.getByLabelText('Reportar um problema'));

    fireEvent.change(screen.getByPlaceholderText(/Descreve o problema/), {
      target: { value: 'O botão de guardar não responde.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Enviar report/ }));

    expect(await screen.findByText('Dá um título ao problema antes de enviar.')).toBeInTheDocument();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('recusa submeter sem descrição e não chama o Supabase', async () => {
    renderButton();
    fireEvent.click(screen.getByLabelText('Reportar um problema'));

    fillTitle('Botão não responde');
    fireEvent.click(screen.getByRole('button', { name: /Enviar report/ }));

    expect(await screen.findByText('Descreve o problema antes de enviar.')).toBeInTheDocument();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('submete título e descrição e regista utilizador/página/data — sem qualquer screenshot', async () => {
    renderButton();
    fireEvent.click(screen.getByLabelText('Reportar um problema'));

    fillTitle('Botão de guardar sem resposta');
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
      title: 'Botão de guardar sem resposta',
      description: 'O botão de guardar não responde.',
      page: 'Coach',
      user_agent: expect.any(String),
      attachment_urls: null,
    });
    expect(payload).not.toHaveProperty('screenshot_path');

    expect(await screen.findByText('Obrigado! O teu report foi enviado à equipa.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('O que aconteceu?')).not.toBeInTheDocument());
  });

  it('mostra o motivo real do erro e não fecha o modal quando o Supabase falha', async () => {
    insertMock.mockResolvedValueOnce({ error: { message: 'new row violates row-level security policy' } });
    renderButton();
    fireEvent.click(screen.getByLabelText('Reportar um problema'));

    fillTitle('Dashboard não carrega');
    fireEvent.change(screen.getByPlaceholderText(/Descreve o problema/), {
      target: { value: 'Falha ao carregar o dashboard.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Enviar report/ }));

    // O motivo concreto tem de chegar ao utilizador — um "tenta novamente"
    // genérico esconde exatamente a informação necessária para diagnosticar.
    expect(
      await screen.findByText(/new row violates row-level security policy/),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Descreve o problema/)).toBeInTheDocument();
  });

  it('guarda o report mesmo quando o upload do anexo falha, avisando o utilizador', async () => {
    uploadMock.mockResolvedValueOnce({ error: { message: 'RLS: not allowed' } });
    renderButton();
    fireEvent.click(screen.getByLabelText('Reportar um problema'));

    fillTitle('Erro ao gravar treino');
    fireEvent.change(screen.getByPlaceholderText(/Descreve o problema/), {
      target: { value: 'O treino não grava.' },
    });

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const fileInput = document.querySelector('input[type="file"]');
    if (!fileInput) return;

    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText('1 ficheiro(s) selecionado(s)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Enviar report/ }));

    // A descrição escrita pelo utilizador não se perde por causa do anexo.
    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
    expect(insertMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        title: 'Erro ao gravar treino',
        description: 'O treino não grava.',
        attachment_urls: null,
      }),
    );
    expect(await screen.findByText(/1 ficheiro\(s\) não foram anexados/)).toBeInTheDocument();
  });

  it('permite selecionar ficheiros (imagens/vídeos)', async () => {
    renderButton();
    fireEvent.click(screen.getByLabelText('Reportar um problema'));

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const fileInput = document.querySelector('input[type="file"]');

    if (fileInput) {
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText('1 ficheiro(s) selecionado(s)')).toBeInTheDocument();
        expect(screen.getByText('test.jpg')).toBeInTheDocument();
      });
    }
  });

  it('rejeita ficheiros com tipo não suportado', async () => {
    renderButton();
    fireEvent.click(screen.getByLabelText('Reportar um problema'));

    const file = new File(['test'], 'test.txt', { type: 'text/plain' });
    const fileInput = document.querySelector('input[type="file"]');

    if (fileInput) {
      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(await screen.findByText(/Tipo de ficheiro não suportado/)).toBeInTheDocument();
    }
  });

  it('submete título, descrição e o caminho do ficheiro anexado no storage', async () => {
    renderButton();
    fireEvent.click(screen.getByLabelText('Reportar um problema'));

    fillTitle('Upload de ficheiro falha');
    fireEvent.change(screen.getByPlaceholderText(/Descreve o problema/), {
      target: { value: 'Problema com upload.' },
    });

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const fileInput = document.querySelector('input[type="file"]');

    if (fileInput) {
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText('1 ficheiro(s) selecionado(s)')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Enviar report/ }));

      await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));

      // O upload tem de acontecer com a primeira pasta a ser o id do
      // utilizador (é o que a RLS do bucket exige) — sem prefixo extra.
      expect(uploadMock).toHaveBeenCalledWith(expect.stringMatching(/^user-1\/.+test\.jpg$/), file);

      const payload = insertMock.mock.calls[0][0];
      expect(payload).toEqual(
        expect.objectContaining({
          user_id: 'user-1',
          title: 'Upload de ficheiro falha',
          description: 'Problema com upload.',
          attachment_urls: [expect.stringMatching(/^user-1\/.+test\.jpg$/)],
        }),
      );
    }
  });
});

describe('ReportIssueButton — arrastar', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAppStore.mockReturnValue({
      session: { user: { id: 'user-1' } }, profile: { id: 'user-1' },
      activeTab: 'coach', openCreationMode: null, editingRaceId: null,
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 400 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  });

  it('arrastar para a direita encosta-o à margem direita, guarda a posição e não abre o report', () => {
    renderButton();
    const btn = screen.getByTestId('report-issue-button');
    btn.getBoundingClientRect = () => ({ left: 12, top: 668, width: 36, height: 36 });
    fireEvent.pointerDown(btn, { clientX: 30, clientY: 686, pointerId: 1, button: 0 });
    fireEvent.pointerMove(btn, { clientX: 350, clientY: 400, pointerId: 1 });
    fireEvent.pointerUp(btn, { clientX: 350, clientY: 400, pointerId: 1 });
    fireEvent.click(btn);

    expect(screen.queryByPlaceholderText(/Resume o problema/)).not.toBeInTheDocument();
    expect(btn.style.right).toBe('12px');
    const saved = JSON.parse(window.localStorage.getItem('ironcoach_bug_button_pos'));
    expect(saved.side).toBe('right');
    // y do canto = 400 - 18 = 382 → bottom = 800 - 382 - 36 = 382
    expect(saved.bottom).toBe(382);
  });

  it('um toque sem arrastar abre o report como sempre', () => {
    renderButton();
    const btn = screen.getByTestId('report-issue-button');
    fireEvent.pointerDown(btn, { clientX: 30, clientY: 686, pointerId: 1, button: 0 });
    fireEvent.pointerMove(btn, { clientX: 32, clientY: 687, pointerId: 1 });
    fireEvent.pointerUp(btn, { clientX: 32, clientY: 687, pointerId: 1 });
    fireEvent.click(btn);
    expect(screen.getByPlaceholderText(/Resume o problema/)).toBeInTheDocument();
  });

  it('nunca fica por cima da barra de baixo nem do cabeçalho', () => {
    expect(clampBottom(10, 800)).toBe(84);
    expect(clampBottom(5000, 800)).toBe(800 - 85 - 36 - 8);
  });
});
