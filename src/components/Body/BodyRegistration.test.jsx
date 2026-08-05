import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import BodyRegistration from './BodyRegistration';

// analyze-body é a única coisa que estes testes exercitam de facto — tanto
// a foto como o manual gravam a avaliação e geram o comentário do Coach
// numa só chamada à Edge Function, sem tocar diretamente no supabase.
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
  const file = new File(['conteudo'], 'pesagem.jpg', { type: 'image/jpeg' });
  await fireEvent.change(input, { target: { files: [file] } });
  await screen.findByAltText('Print 1');
};

describe('BodyRegistration — cartão único: alternar entre Foto e Manual', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, bodyAssessments: [] });
  });

  it('mostra o upload de fotos por omissão e esconde os campos manuais', () => {
    render(<BodyRegistration onClose={onClose} />);
    expect(screen.getByText(/Escolhe os prints da app Renpho Health/)).toBeInTheDocument();
    expect(screen.queryByText('Peso (kg)')).not.toBeInTheDocument();
  });

  it('ao escolher Manual, esconde o upload e mostra os campos de métricas', () => {
    render(<BodyRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Manual' }));

    expect(screen.queryByText(/Escolhe os prints da app Renpho Health/)).not.toBeInTheDocument();
    expect(screen.getByText('Peso (kg)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analisar Avaliação' })).toBeInTheDocument();
  });
});

describe('BodyRegistration — Analisar Avaliação por foto (analyze-body)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, bodyAssessments: [] });
  });

  it('envia o payload correto (imagens, data, observações)', async () => {
    mocks.invoke.mockResolvedValue({ data: { assessment: { id: 'assess-1' } }, error: null });
    render(<BodyRegistration onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('Contexto da pesagem...'), { target: { value: 'em jejum' } });
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Avaliação/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-body');
    expect(body.images).toEqual(['AAA']);
    expect(body.mime_type).toBe('image/jpeg');
    expect(body.notes).toBe('em jejum');
  });

  it('acrescenta a avaliação devolvida (já com ai_summary) ao store e fecha o formulário', async () => {
    const newAssessment = { id: 'assess-1', ai_summary: 'O peso desceu 0.4kg desde a última pesagem.' };
    mocks.invoke.mockResolvedValue({ data: { assessment: newAssessment }, error: null });
    render(<BodyRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Avaliação/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().bodyAssessments).toEqual([newAssessment]);
  });

  it('mostra o erro da Edge Function e não fecha o formulário', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha na análise.' });
    render(<BodyRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Avaliação/ }));

    await screen.findByText('Falha na análise.');
    expect(onClose).not.toHaveBeenCalled();
    expect(useAppStore.getState().bodyAssessments).toEqual([]);
  });
});

describe('BodyRegistration — registo manual também passa pelo Coach (analyze-body, modo manual)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, bodyAssessments: [] });
  });

  const goManual = () => fireEvent.click(screen.getByRole('button', { name: 'Manual' }));

  it('envia o registo manual para analyze-body em modo manual, sem imagens', async () => {
    mocks.invoke.mockResolvedValue({ data: { assessment: { id: 'assess-2' } }, error: null });
    render(<BodyRegistration onClose={onClose} />);
    goManual();
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '78.5' } });
    fireEvent.change(screen.getByLabelText('Gordura corporal (%)'), { target: { value: '18.2' } });

    fireEvent.click(screen.getByRole('button', { name: 'Analisar Avaliação' }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-body');
    expect(body.mode).toBe('manual');
    expect(body.images).toBeUndefined();
    expect(body.metrics.weight_kg).toBe(78.5);
    expect(body.metrics.body_fat_pct).toBe(18.2);
  });

  it('acrescenta a avaliação devolvida (já com ai_summary) ao store e fecha o formulário', async () => {
    const newAssessment = { id: 'assess-2', ai_summary: 'Boa evolução na massa muscular.' };
    mocks.invoke.mockResolvedValue({ data: { assessment: newAssessment }, error: null });
    render(<BodyRegistration onClose={onClose} />);
    goManual();
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '78.5' } });

    fireEvent.click(screen.getByRole('button', { name: 'Analisar Avaliação' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().bodyAssessments).toEqual([newAssessment]);
  });

  it('mostra o erro da Edge Function e não fecha o formulário', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha a gravar avaliação.' });
    render(<BodyRegistration onClose={onClose} />);
    goManual();
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '78.5' } });

    fireEvent.click(screen.getByRole('button', { name: 'Analisar Avaliação' }));

    await screen.findByText('Falha a gravar avaliação.');
    expect(onClose).not.toHaveBeenCalled();
  });
});
