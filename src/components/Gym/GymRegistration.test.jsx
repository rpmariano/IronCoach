import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import GymRegistration from './GymRegistration';

// analyze-gym é a única coisa que estes testes exercitam de facto — tanto
// a foto como o manual gravam a sessão e geram o comentário do Coach numa só
// chamada à Edge Function, sem tocar diretamente no supabase.
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: {},
  invokeEdgeFunctionWithTimeout: (...args) => mocks.invoke(...args),
}));

// Evita FileReader/Image/canvas do jsdom — a compressão em si já está fora
// deste ficheiro, em src/lib/image.js.
vi.mock('../../lib/image', () => ({
  compressImage: () => Promise.resolve({ dataUrl: 'data:image/jpeg;base64,AAA', base64: 'AAA' }),
}));

const PROFILE = { id: 'user-1' };

const selectPhoto = async () => {
  const input = document.querySelector('input[type="file"]');
  const file = new File(['conteudo'], 'treino.jpg', { type: 'image/jpeg' });
  await fireEvent.change(input, { target: { files: [file] } });
  await screen.findByAltText('Print 1');
};

describe('GymRegistration — cartão único: alternar entre Foto e Manual', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, gymSessions: [] });
  });

  it('mostra o upload de fotos por omissão e esconde os campos manuais', () => {
    render(<GymRegistration onClose={onClose} />);
    expect(screen.getByText(/Escolhe os prints da app de treino/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Duração (43m ou 37:57)')).not.toBeInTheDocument();
  });

  it('ao escolher Manual, esconde o upload e mostra as métricas do relógio', () => {
    render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Manual' }));

    expect(screen.queryByText(/Escolhe os prints da app de treino/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Duração (43m ou 37:57)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analisar Treino' })).toBeInTheDocument();
  });
});

describe('GymRegistration — Analisar Treino por foto (analyze-gym)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, gymSessions: [] });
  });

  it('envia o payload correto (imagens, data, tipo, categorias, observações)', async () => {
    mocks.invoke.mockResolvedValue({ data: { session: { id: 'sess-1' } }, error: null });
    render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Peito' }));
    fireEvent.change(screen.getByPlaceholderText('Contexto do treino...'), { target: { value: 'treino pesado' } });
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Treino/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-gym');
    expect(body.images).toEqual(['AAA']);
    expect(body.mime_type).toBe('image/jpeg');
    expect(body.kind).toBe('forca');
    expect(body.categories).toEqual(['Peito']);
    expect(body.notes).toBe('treino pesado');
  });

  it('acrescenta a sessão devolvida (já com coach_notes) ao store e fecha o formulário', async () => {
    const newSession = { id: 'sess-1', coach_notes: 'Volume consistente com o habitual.' };
    mocks.invoke.mockResolvedValue({ data: { session: newSession }, error: null });
    render(<GymRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Treino/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().gymSessions).toEqual([newSession]);
  });

  it('mostra o erro da Edge Function e não fecha o formulário', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha na análise.' });
    render(<GymRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Treino/ }));

    await screen.findByText('Falha na análise.');
    expect(onClose).not.toHaveBeenCalled();
    expect(useAppStore.getState().gymSessions).toEqual([]);
  });
});

describe('GymRegistration — registo manual também passa pelo Coach (analyze-gym, modo manual)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, gymSessions: [] });
  });

  const goManual = () => fireEvent.click(screen.getByRole('button', { name: 'Manual' }));

  it('envia o registo manual para analyze-gym em modo manual, sem imagens', async () => {
    mocks.invoke.mockResolvedValue({ data: { session: { id: 'sess-2' } }, error: null });
    render(<GymRegistration onClose={onClose} />);
    goManual();
    fireEvent.change(screen.getByPlaceholderText('Duração (43m ou 37:57)'), { target: { value: '50:00' } });
    fireEvent.change(screen.getByPlaceholderText('Esforço (1-10)'), { target: { value: '7' } });

    fireEvent.click(screen.getByRole('button', { name: 'Analisar Treino' }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-gym');
    expect(body.mode).toBe('manual');
    expect(body.images).toBeUndefined();
    expect(body.duration_seconds).toBe(3000);
    expect(body.exertion).toBe(7);
    expect(body.kind).toBe('forca');
  });

  it('acrescenta a sessão devolvida (já com coach_notes) ao store e fecha o formulário', async () => {
    const newSession = { id: 'sess-2', coach_notes: 'Boa consistência de esforço.' };
    mocks.invoke.mockResolvedValue({ data: { session: newSession }, error: null });
    render(<GymRegistration onClose={onClose} />);
    goManual();

    fireEvent.click(screen.getByRole('button', { name: 'Analisar Treino' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().gymSessions).toEqual([newSession]);
  });

  it('mostra o erro da Edge Function e não fecha o formulário', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha a gravar treino.' });
    render(<GymRegistration onClose={onClose} />);
    goManual();

    fireEvent.click(screen.getByRole('button', { name: 'Analisar Treino' }));

    await screen.findByText('Falha a gravar treino.');
    expect(onClose).not.toHaveBeenCalled();
  });
});
