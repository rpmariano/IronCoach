import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/* O registo de corrida no Design v2 (RunRegistrationV2Parts): o print primeiro, o que a Carol leu,
   e o resto do formulário de sempre por baixo. Os mocks são os de RunRegistration.test.jsx. */
vi.setConfig({ testTimeout: 15000 });
import { useAppStore } from '../../store';
import RunRegistration from './RunRegistration';
import { setDesignV2 } from '../../utils/designV2';

vi.mock('../../utils/firstRecord', () => ({ firstRecordMoment: () => null }));
vi.mock('@formulas/runRecord.ts', () => ({ runRecordMoment: () => null }));

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
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

const ontem = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const selectPhoto = async () => {
  const input = document.querySelector('input[type="file"]');
  const file = new File(['conteudo'], 'print.jpg', { type: 'image/jpeg' });
  await fireEvent.change(input, { target: { files: [file] } });
  await screen.findByAltText('Print 1');
};

describe('RunRegistration · Design v2', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.invoke.mockReset();
    useAppStore.setState({ profile: PROFILE, runs: [], raceEvents: [] });
    act(() => setDesignV2(true));
  });
  afterEach(() => {
    act(() => setDesignV2(false));
  });

  it('o print é o primeiro bloco do ecrã, antes do tipo, da data e da hora', () => {
    render(<RunRegistration onClose={vi.fn()} />);
    // P2a (2026-11-25): ao abrir, só o print; o manual vem por «Preencher à mão».
    expect(screen.queryByLabelText('Data da corrida')).toBeNull();
    fireEvent.click(screen.getByTestId('v2-reg-manual'));
    const screenV2 = screen.getByTestId('run-registration-v2');
    const first = screenV2.firstElementChild;
    expect(first).toHaveAttribute('data-testid', 'v2-reg-lead');
    expect(within(first).getByText('Carregar o print do relógio')).toBeInTheDocument();
    // O input de ficheiros é o primeiro do ecrã; o tipo e a data vêm depois.
    const fileInput = document.querySelector('input[type="file"]');
    expect(first.contains(fileInput)).toBe(true);
    const date = screen.getByLabelText('Data da corrida');
    expect(fileInput.compareDocumentPosition(date) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // O PhotoReadSection de sempre não aparece no v2 (não há dois sítios para os prints).
    expect(screen.queryByText('Prints da app de corrida (opcional)')).not.toBeInTheDocument();
  });

  it('depois da leitura, a confirmação mostra os números e o tipo, a data e a hora ficam preenchidos', async () => {
    const dia = ontem();
    mocks.invoke.mockResolvedValueOnce({
      data: {
        preview: {
          distance_km: 10.04,
          duration_seconds: 2998,
          avg_heart_rate_bpm: 168,
          splits: Array.from({ length: 10 }, (_, i) => ({ distance_km: 1, time_seconds: 290 + i })),
          training_type: 'longo',
          date: dia,
          start_time: '07:30',
          source_app: 'garmin',
        },
      },
      error: null,
    });
    render(<RunRegistration onClose={vi.fn()} />);
    await selectPhoto();
    fireEvent.click(screen.getByRole('button', { name: 'Ler os prints e preencher' }));

    const panel = await screen.findByTestId('v2-reg-confirm');
    expect(mocks.invoke.mock.calls[0][1].body.mode).toBe('preview');
    // P2a: a distância, o tempo e o ritmo em grande, para confirmar ou corrigir.
    expect(document.getElementById('rr-distancia')).toHaveValue(10.04);
    expect(document.getElementById('rr-duracao')).toHaveValue('49:58');
    expect(screen.getByTestId('v2-reg-pace')).toHaveTextContent(/\/km$/);
    // O resto (a frequência cardíaca, os parciais) fica recolhido, com a conta do que se leu.
    const mais = screen.getByTestId('v2-reg-more');
    expect(mais).not.toHaveAttribute('open');
    expect(mais.querySelector('summary')).toHaveTextContent('2 dados lidos do relógio');

    // O tipo, a data e a hora vêm preenchidos, por baixo dos números.
    expect(document.getElementById('rr-tipo-de-treino')).toHaveValue('longo');
    expect(screen.getByLabelText('Data da corrida')).toHaveValue(dia);
    expect(screen.getByLabelText('Hora')).toHaveValue('07:30');
    expect(panel.compareDocumentPosition(screen.getByLabelText('Data da corrida')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('o tipo escolhido à mão não se troca pelo que a leitura trouxer', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { preview: { distance_km: 8, training_type: 'longo' } }, error: null });
    render(<RunRegistration onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('v2-reg-manual'));
    fireEvent.change(document.getElementById('rr-tipo-de-treino'), { target: { value: 'fartlek' } });
    await selectPhoto();
    fireEvent.click(screen.getByRole('button', { name: 'Ler os prints e preencher' }));
    await screen.findByTestId('v2-reg-read');
    expect(document.getElementById('rr-tipo-de-treino')).toHaveValue('fartlek');
  });

  it('a gravação fica desativada enquanto o print está a ser lido', async () => {
    let resolveRead;
    mocks.invoke.mockReturnValueOnce(new Promise((r) => { resolveRead = r; }));
    render(<RunRegistration onClose={vi.fn()} />);
    await selectPhoto();
    // Por ler: o «Analisar» está à vista mas desativado.
    expect(screen.getByRole('button', { name: /Analisar corrida/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Ler os prints e preencher' }));
    expect(await screen.findByRole('button', { name: 'A ler os prints…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Analisar corrida/ })).toBeDisabled();

    await act(async () => { resolveRead({ data: { preview: { distance_km: 8.2 } }, error: null }); });
    await waitFor(() => expect(screen.getByRole('button', { name: /Analisar corrida/ })).toBeEnabled());
  });

  it('os campos manuais continuam lá, sem print nenhum (por «Preencher à mão»)', () => {
    render(<RunRegistration onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('v2-reg-manual'));
    const dist = screen.getByLabelText('Distância (km)');
    fireEvent.change(dist, { target: { value: '7.5' } });
    expect(dist).toHaveValue(7.5);
    expect(document.getElementById('rr-duracao')).toBeInTheDocument();
    expect(screen.getByText('Como te sentiste')).toBeInTheDocument();
    expect(screen.getByText('Parciais e estrutura')).toBeInTheDocument();
    expect(screen.getByText('Fisiologia e relógio')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Analisar corrida/ })).toBeEnabled();
  });
});

describe('RunRegistration · Design v2, a data lida', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.invoke.mockReset();
    useAppStore.setState({ profile: PROFILE, runs: [], raceEvents: [] });
    act(() => setDesignV2(true));
  });
  afterEach(() => {
    act(() => setDesignV2(false));
  });

  const ler = async (date, props = {}) => {
    mocks.invoke.mockResolvedValueOnce({ data: { preview: { distance_km: 10, duration_seconds: 3000, date } }, error: null });
    render(<RunRegistration onClose={vi.fn()} {...props} />);
    await selectPhoto();
    fireEvent.click(screen.getByRole('button', { name: 'Ler os prints e preencher' }));
    await screen.findByTestId('v2-reg-confirm');
  };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  it('não passa por cima do dia que veio do calendário', async () => {
    const doCalendario = ontem();
    const d = new Date(); d.setDate(d.getDate() - 3);
    await ler(iso(d), { dateIso: doCalendario });
    expect(screen.getByLabelText('Data da corrida')).toHaveValue(doCalendario);
  });

  it('uma data no futuro ou com mais de um ano não entra', async () => {
    const antes = screen.queryByLabelText('Data da corrida');
    expect(antes).toBeNull();
    const velha = new Date(); velha.setFullYear(velha.getFullYear() - 2);
    await ler(iso(velha));
    expect(screen.getByLabelText('Data da corrida')).not.toHaveValue(iso(velha));
  });

  it('uma data no futuro não entra', async () => {
    const futuro = new Date(); futuro.setDate(futuro.getDate() + 5);
    await ler(iso(futuro));
    expect(screen.getByLabelText('Data da corrida')).not.toHaveValue(iso(futuro));
  });
});

describe('RunRegistration · v2 desligado', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.invoke.mockReset();
    useAppStore.setState({ profile: PROFILE, runs: [], raceEvents: [] });
  });

  it('fica a ordem de sempre: o tipo e a data primeiro, os prints dentro de «Os números»', () => {
    render(<RunRegistration onClose={vi.fn()} />);
    expect(screen.queryByTestId('run-registration-v2')).not.toBeInTheDocument();
    expect(screen.queryByText('Carregar o print do relógio')).not.toBeInTheDocument();
    expect(document.querySelector('[class*="v2-"]')).toBeNull();
    const prints = screen.getByText('Prints da app de corrida (opcional)');
    const date = screen.getByLabelText('Data da corrida');
    expect(date.compareDocumentPosition(prints) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
