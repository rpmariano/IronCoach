import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import RunRegistration from './RunRegistration';
import MissingMetricsBottomSheet from './MissingMetricsBottomSheet';
import { setDesignV2 } from '../../utils/designV2';
import { todayISO } from '../../lib/utils';

/* 2.ª crítica do Design v2 (2026-11-25), P1.2: registar sem print criava uma corrida vazia. No v2,
   «Analisar corrida» fica desativado sem imagem (o caminho sem print é «Preencher à mão»), e uma
   corrida sem distância nem tempo nunca se grava, nem pelo «Prosseguir» da folha das métricas.
   Na v1, como sempre. Mocks de RunRegistration.p2.v2.test.jsx. */
vi.setConfig({ testTimeout: 15000 });

vi.mock('../../utils/firstRecord', () => ({ firstRecordMoment: () => null }));
vi.mock('@formulas/runRecord.ts', () => ({ runRecordMoment: () => null }));

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
    storage: {
      from: () => ({
        upload: (path) => Promise.resolve({ data: { path }, error: null }),
        createSignedUrl: (path) => Promise.resolve({ data: { signedUrl: `https://signed/${path}` }, error: null }),
        createSignedUrls: (paths) => Promise.resolve({ data: paths.map((p) => ({ signedUrl: `https://signed/${p}` })), error: null }),
        remove: () => Promise.resolve({ data: null, error: null }),
      }),
    },
  },
  invokeEdgeFunctionWithTimeout: (...args) => mocks.invoke(...args),
}));
vi.mock('../../lib/image', () => ({
  compressImage: () => Promise.resolve({ dataUrl: 'data:image/jpeg;base64,AAA', base64: 'AAA' }),
}));

const PROFILE = { id: 'user-1' };
const PROVA = {
  id: 'race-1', name: 'Meia de Lisboa', date: todayISO(), location: 'Lisboa', distance_km: 21.0975,
  race_type: 'estrada', status: 'agendada', target_time: '1:52:00',
};

describe('Registar sem print · Design v2', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.invoke.mockReset();
    useAppStore.setState({ profile: PROFILE, runs: [], raceEvents: [], shoes: [], runRacePrefill: null });
    act(() => setDesignV2(true));
  });
  afterEach(() => act(() => setDesignV2(false)));

  it('sem imagem, «Analisar corrida» fica desativado e diz porquê; com imagem, ativa', async () => {
    render(<RunRegistration onClose={vi.fn()} />);
    const analisar = screen.getByRole('button', { name: /Analisar corrida/ });
    expect(analisar).toBeDisabled();
    expect(analisar).toHaveAttribute('aria-describedby', 'v2-reg-shot-hint');
    expect(screen.getByTestId('v2-reg-shot-hint')).toHaveTextContent('Para analisar, carrega o print do relógio. Sem print, preenche à mão.');
    const input = document.querySelector('input[type="file"]');
    await fireEvent.change(input, { target: { files: [new File(['x'], 'print.jpg', { type: 'image/jpeg' })] } });
    await screen.findByAltText('Print 1');
    expect(screen.queryByTestId('v2-reg-shot-hint')).toBeNull();
  });

  it('na prova, «Registar a prova» também fica desativado sem imagem', () => {
    useAppStore.setState({ raceEvents: [PROVA], runRacePrefill: { raceId: 'race-1' } });
    render(<RunRegistration onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Registar a prova/ })).toBeDisabled();
  });

  it('à mão, sem distância nem tempo, não grava e diz o que falta', async () => {
    render(<RunRegistration onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('v2-reg-manual'));
    fireEvent.click(screen.getByRole('button', { name: /Analisar corrida/ }));
    expect((await screen.findAllByText('Para gravar, faltam a distância e o tempo.')).length).toBeGreaterThan(0);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(screen.queryByTestId('missing-metrics-bottom-sheet')).toBeNull();
  });

  it('à mão, só com a distância: falta o tempo', async () => {
    render(<RunRegistration onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('v2-reg-manual'));
    fireEvent.change(screen.getByLabelText(/Distância/), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: /Analisar corrida/ }));
    expect((await screen.findAllByText('Para gravar, falta o tempo.')).length).toBeGreaterThan(0);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});

describe('Registar sem print · v1 igual', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.invoke.mockReset();
    useAppStore.setState({ profile: PROFILE, runs: [], raceEvents: [], shoes: [], runRacePrefill: null });
    act(() => setDesignV2(false));
  });

  it('«Analisar corrida» ativo sem imagem e sem a frase do v2', () => {
    render(<RunRegistration onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Analisar corrida/ })).toBeEnabled();
    expect(screen.queryByTestId('v2-reg-shot-hint')).toBeNull();
  });

  it('sem distância nem tempo, a v1 segue para a folha das métricas, como sempre', async () => {
    render(<RunRegistration onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Analisar corrida/ }));
    expect(await screen.findByTestId('missing-metrics-bottom-sheet')).toBeInTheDocument();
    expect(screen.queryByText('Para gravar, faltam a distância e o tempo.')).toBeNull();
  });
});

describe('A folha «Métricas em falta»', () => {
  const props = { isOpen: true, onAddPhotos: vi.fn(), onGoManual: vi.fn(), onProceedAnyway: vi.fn(), onClose: vi.fn() };
  afterEach(() => act(() => setDesignV2(false)));

  it('v2, sem a distância e o tempo: não há «Prosseguir»; a frase do que falta', () => {
    act(() => setDesignV2(true));
    render(<MissingMetricsBottomSheet {...props} missingKeys={['distance_km', 'duration_seconds', 'cadence_spm']} />);
    expect(screen.queryByText('Prosseguir sem estas métricas')).toBeNull();
    expect(screen.getByTestId('missing-metrics-core')).toHaveTextContent('Sem a distância e o tempo a corrida não se grava.');
  });

  it('v2, só métricas opcionais: «Prosseguir» em caixa normal, sem caixas aninhadas nem maiúsculas', () => {
    act(() => setDesignV2(true));
    render(<MissingMetricsBottomSheet {...props} missingKeys={['cadence_spm', 'splits']} />);
    const sheet = screen.getByTestId('missing-metrics-bottom-sheet');
    expect(screen.getByText('Prosseguir sem estas métricas').closest('button')).toHaveClass('v2-mm-proceed');
    expect(sheet.querySelector('.uppercase')).toBeNull();
    expect(sheet.querySelector('.v2-mm-body .rounded-2xl, .v2-mm-body .rounded-xl')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Métricas sugeridas (2)' })).toHaveClass('v2-label');
    expect(sheet.querySelectorAll('.v2-mm-row')).toHaveLength(2);
  });

  it('v1: a folha de sempre, com «Prosseguir» mesmo sem a distância', () => {
    render(<MissingMetricsBottomSheet {...props} missingKeys={['distance_km']} />);
    expect(screen.getByText('Prosseguir sem estas métricas')).toBeInTheDocument();
    expect(screen.getByText(/Métricas sugeridas \(1\):/)).toHaveClass('uppercase');
    expect(screen.queryByTestId('missing-metrics-core')).toBeNull();
  });
});
