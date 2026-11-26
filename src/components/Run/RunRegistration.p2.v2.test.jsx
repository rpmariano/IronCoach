import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import RunRegistration from './RunRegistration';
import { setDesignV2 } from '../../utils/designV2';
import { todayISO } from '../../lib/utils';

/* O registo a partir do print no Design v2 (P2a): ao abrir, só o print e «Preencher à mão»; depois
   da leitura, a distância, o tempo e o ritmo em grande e o resto fechado em «Mais dados do
   relógio». Mocks de RunRegistration.p1.v2.test.jsx. */
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

const READ = {
  distance_km: 10.04,
  duration_seconds: 2998,
  avg_heart_rate_bpm: 168,
  max_heart_rate_bpm: 181,
  cadence_spm: 172,
  elevation_gain_m: 54,
  splits: Array.from({ length: 10 }, (_, i) => ({ distance_km: 1, time_seconds: 290 + i })),
};

const selectPhoto = async () => {
  const input = document.querySelector('input[type="file"]');
  const file = new File(['conteudo'], 'print.jpg', { type: 'image/jpeg' });
  await fireEvent.change(input, { target: { files: [file] } });
  await screen.findByAltText('Print 1');
};
const lerPrint = async (preview) => {
  mocks.invoke.mockResolvedValueOnce({ data: { preview }, error: null });
  await selectPhoto();
  fireEvent.click(screen.getByRole('button', { name: 'Ler os prints e preencher' }));
  return screen.findByTestId('v2-reg-confirm');
};

describe('Registo de corrida a partir do print · Design v2 (P2a)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.invoke.mockReset();
    useAppStore.setState({ profile: PROFILE, runs: [], raceEvents: [], shoes: [], runRacePrefill: null });
    act(() => setDesignV2(true));
  });
  afterEach(() => {
    act(() => setDesignV2(false));
  });

  it('ao abrir, só o print e «Preencher à mão»: nenhuma secção do formulário à vista', () => {
    render(<RunRegistration onClose={vi.fn()} />);
    const ecra = screen.getByTestId('run-registration-v2');
    expect(ecra.firstElementChild).toHaveAttribute('data-testid', 'v2-reg-lead');
    expect(screen.getByText('Carregar o print do relógio')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preencher à mão' })).toHaveClass('v2-link');
    for (const t of ['Que corrida foi', 'Os números', 'Como te sentiste', 'Parciais e estrutura', 'Fisiologia e relógio']) {
      expect(screen.queryByText(t)).not.toBeInTheDocument();
    }
    expect(screen.queryByLabelText(/Distância/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Data da corrida')).not.toBeInTheDocument();
  });

  it('«Preencher à mão» mostra o formulário inteiro', () => {
    render(<RunRegistration onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preencher à mão' }));
    expect(screen.queryByRole('button', { name: 'Preencher à mão' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Distância (km)')).toBeInTheDocument();
    expect(screen.getByLabelText('Data da corrida')).toBeInTheDocument();
    expect(screen.getByText('Como te sentiste')).toBeInTheDocument();
    expect(screen.getByText('Fisiologia e relógio')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Analisar corrida/ })).toBeEnabled();
  });

  it('depois da leitura: distância, tempo e ritmo em grande; tipo, data e hora; o resto fechado com a contagem', async () => {
    render(<RunRegistration onClose={vi.fn()} />);
    const confirma = await lerPrint(READ);
    expect(mocks.invoke.mock.calls[0][1].body.mode).toBe('preview');

    const dist = within(confirma).getByLabelText('Distância');
    expect(dist).toHaveValue(10.04);
    expect(dist).toHaveClass('v2-num');
    expect(within(confirma).getByLabelText('Tempo')).toHaveValue('49:58');
    expect(within(confirma).getByTestId('v2-reg-pace')).toHaveTextContent('4:59/km');
    // Continua editável: corrigir a distância recalcula o ritmo.
    fireEvent.change(dist, { target: { value: '10' } });
    expect(within(confirma).getByTestId('v2-reg-pace')).not.toHaveTextContent('4:59/km');

    // Por baixo: o tipo de treino (Contínuo, como sempre), a data e a hora.
    expect(document.getElementById('rr-tipo-de-treino')).toHaveValue('continuo');
    expect(screen.getByLabelText('Data da corrida')).toBeInTheDocument();
    expect(screen.getByLabelText('Hora')).toBeInTheDocument();
    // O painel «A Carol leu isto do print» sai: a confirmação já o diz.
    expect(screen.queryByTestId('v2-reg-read')).not.toBeInTheDocument();

    // «Mais dados do relógio»: fechado, com quantos dados o print trouxe (FC média e máxima,
    // cadência, desnível e os parciais = 5), mesmo com os campos cheios lá dentro.
    const mais = screen.getByTestId('v2-reg-more');
    expect(mais.tagName).toBe('DETAILS');
    expect(mais).not.toHaveAttribute('open');
    expect(within(mais).getByText('5 dados lidos do relógio').tagName).toBe('SUMMARY');
    expect(within(mais).getByLabelText(/Frequência cardíaca média/)).toHaveValue(168);
    expect(within(mais).getByLabelText(/Frequência cardíaca média/)).not.toBeVisible();
    expect(within(mais).getByText('Fisiologia e relógio')).toBeInTheDocument();
    // O nome é obrigatório: fica à vista, fora do recolhido.
    expect(within(mais).queryByLabelText(/Nome da corrida/)).toBeNull();
    expect(within(screen.getByTestId('v2-reg-name')).getByLabelText(/Nome da corrida/)).toBeInTheDocument();

    fireEvent.click(within(mais).getByText('5 dados lidos do relógio'));
    expect(mais).toHaveAttribute('open');
  });

  it('o resumo no singular', async () => {
    render(<RunRegistration onClose={vi.fn()} />);
    await lerPrint({ distance_km: 8, duration_seconds: 2400, avg_heart_rate_bpm: 150 });
    expect(screen.getByTestId('v2-reg-more').querySelector('summary')).toHaveTextContent(/^1 dado lido do relógio$/);
  });

  it('o nome (obrigatório) fica à vista na confirmação, fora do «Mais dados do relógio» fechado', async () => {
    render(<RunRegistration onClose={vi.fn()} />);
    await lerPrint({ distance_km: 8, duration_seconds: 2400, avg_heart_rate_bpm: 150 });
    const nome = screen.getByLabelText(/Nome da corrida/);
    expect(screen.getByTestId('v2-reg-name')).toContainElement(nome);
    expect(screen.getByTestId('v2-reg-more')).not.toContainElement(nome);
    // Vazio, o aviso aponta para um campo que se vê.
    fireEvent.change(nome, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Analisar corrida/ }));
    expect((await screen.findAllByText('Preenche o nome da corrida.')).length).toBeGreaterThan(0);
    expect(nome.closest('details')).toBeNull();
  });

  it('sem dados lidos para lá da confirmação, só «Mais dados do relógio»', async () => {
    render(<RunRegistration onClose={vi.fn()} />);
    await lerPrint({ distance_km: 8, duration_seconds: 2400 });
    expect(screen.getByTestId('v2-reg-more').querySelector('summary')).toHaveTextContent(/^Mais dados do relógio$/);
  });

  it('a gravação fica desativada enquanto o print está a ser lido', async () => {
    let resolveRead;
    mocks.invoke.mockReturnValueOnce(new Promise((r) => { resolveRead = r; }));
    render(<RunRegistration onClose={vi.fn()} />);
    await selectPhoto();
    fireEvent.click(screen.getByRole('button', { name: 'Ler os prints e preencher' }));
    expect(await screen.findByRole('button', { name: 'A ler os prints…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Analisar corrida/ })).toBeDisabled();
    await act(async () => { resolveRead({ data: { preview: { distance_km: 8.2, duration_seconds: 2500 } }, error: null }); });
    await waitFor(() => expect(screen.getByRole('button', { name: /Analisar corrida/ })).toBeEnabled());
  });

  it('as etiquetas do v2 dizem as unidades por extenso, com vírgula decimal nos exemplos', () => {
    render(<RunRegistration onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preencher à mão' }));
    expect(screen.getByLabelText('Cadência média (passos por minuto)')).toBeInTheDocument();
    expect(screen.getByLabelText('Frequência cardíaca média (batimentos por minuto)')).toBeInTheDocument();
    expect(screen.getByLabelText('Desnível positivo (metros)')).toBeInTheDocument();
    expect(screen.getByLabelText('Desnível negativo (metros)')).toBeInTheDocument();
    expect(screen.getByText('Esforço (1 a 10, opcional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Oscilação vertical (centímetros)')).toHaveAttribute('placeholder', 'Ex.: 8,5');
    expect(screen.getByRole('group', { name: /Zonas de frequência cardíaca/ })).toBeInTheDocument();
    const ecra = screen.getByTestId('run-registration-v2');
    expect(ecra).not.toHaveTextContent(/\bspm\b|\bRPE\b|\bFC\b|D\+|&/);
  });

  it('na prova: só o print ao abrir; depois da leitura, também o tempo oficial e a posição', async () => {
    useAppStore.setState({ raceEvents: [PROVA], runRacePrefill: { raceId: 'race-1' } });
    render(<RunRegistration onClose={vi.fn()} />);
    expect(screen.getByTestId('race-mode-header')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preencher à mão' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Tempo oficial/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Como correu' })).not.toBeInTheDocument();

    const confirma = await lerPrint({ ...READ, official_time_seconds: 6822, position: 412 });
    expect(within(confirma).getByLabelText(/Tempo oficial/)).toHaveValue('1:53:42');
    expect(within(confirma).getByLabelText(/Posição/)).toHaveValue(412);
    expect(within(confirma).getByLabelText('Tempo pessoal')).toHaveValue('49:58');
    expect(screen.getByLabelText('Hora de partida')).toBeInTheDocument();
    const mais = screen.getByTestId('v2-reg-more');
    expect(mais).not.toHaveAttribute('open');
    expect(within(mais).getByText('Do diploma (opcional)')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Como correu' })).toBeInTheDocument();
    // O «Registar a prova» continua âmbar.
    expect(within(screen.getByTestId('v2-runreg-go')).getByRole('button', { name: /Registar a prova/ })).toBeInTheDocument();
  });
});

describe('Registo de corrida · v2 desligado (P2a)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAppStore.setState({ profile: PROFILE, runs: [], raceEvents: [], shoes: [], runRacePrefill: null });
    act(() => setDesignV2(false));
  });

  it('não há «Preencher à mão» e as etiquetas são as de sempre', () => {
    render(<RunRegistration onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Preencher à mão' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('v2-reg-more')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Cadência média (spm)')).toBeInTheDocument();
    expect(screen.getByText('Nível de esforço (RPE, opcional)')).toBeInTheDocument();
  });
});
