import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import RunRegistration from './RunRegistration';

// analyze-run é a única coisa que estes testes exercitam de facto — supabase
// (usado só pelo registo manual/Provas, não pelo caminho de IA) fica com um
// stub inerte.
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => ({ insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }) },
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
  const file = new File(['conteudo'], 'print.jpg', { type: 'image/jpeg' });
  await fireEvent.change(input, { target: { files: [file] } });
  // handlePhotoSelected é assíncrono (compressImage) — espera o print aparecer.
  await screen.findByAltText('Print 1');
};

describe('RunRegistration — Analisar Corrida (analyze-run)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, runs: [], raceEvents: [] });
  });

  it('envia o payload correto para um treino, com a chave nova de training_type', async () => {
    mocks.invoke.mockResolvedValue({ data: { run: { id: 'run-1', name: 'Corrida de Hoje' } }, error: null });
    render(<RunRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Corrida/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-run');
    expect(body.images).toEqual(['AAA']);
    expect(body.mime_type).toBe('image/jpeg');
    expect(body.kind).toBe('treino');
    // 'continuo' é o valor por omissão do select — tem de ser uma das chaves
    // que a Edge Function reconhece (TRAINING_TYPE_KEYS), não o enum antigo
    // (intervalado/progressivo/series) que ela descartava em silêncio.
    expect(body.training_type).toBe('continuo');
    expect(body.race_type).toBeNull();
  });

  it('envia race_type (não training_type) para uma competição', async () => {
    mocks.invoke.mockResolvedValue({ data: { run: { id: 'run-1' } }, error: null });
    render(<RunRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Competição' }));
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Corrida/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [, { body }] = mocks.invoke.mock.calls[0];
    expect(body.kind).toBe('competicao');
    expect(body.training_type).toBeNull();
    // '10k' é o valor por omissão de completedRaceType — tem de ser uma
    // chave de RACE_TYPE_KEYS da Edge Function (não do RACE_TYPES da Agenda
    // de Provas, que é uma tabela e um enum diferentes).
    expect(body.race_type).toBe('10k');
  });

  it('não invoca a análise sem nome de corrida preenchido', async () => {
    render(<RunRegistration onClose={onClose} />);
    fireEvent.change(screen.getByDisplayValue('Corrida de Hoje'), { target: { value: '' } });
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Corrida/ }));

    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(screen.getByText('Preenche o nome da corrida.')).toBeInTheDocument();
  });

  it('acrescenta a corrida devolvida ao store e fecha o formulário', async () => {
    const newRun = { id: 'run-1', name: 'Corrida de Hoje', coach_notes: 'Bom ritmo, mantém a recuperação.' };
    mocks.invoke.mockResolvedValue({ data: { run: newRun }, error: null });
    render(<RunRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Corrida/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().runs).toEqual([newRun]);
  });

  it('mostra o erro da Edge Function e não fecha o formulário', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha na análise.' });
    render(<RunRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Corrida/ }));

    await screen.findByText('Falha na análise.');
    expect(onClose).not.toHaveBeenCalled();
    expect(useAppStore.getState().runs).toEqual([]);
  });
});
