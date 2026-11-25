import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import RunRegistration from './RunRegistration';
import { setDesignV2 } from '../../utils/designV2';
import { todayISO } from '../../lib/utils';

/* «Registar a prova» no Design v2 (P1): secções lisas com títulos em texto simples, a prova num
   bloco liso (sem pílulas nem a caixa do objetivo), o «Registar a prova» âmbar na ActionBar e,
   depois de gravar, o que acontece a seguir. Mocks de RunRegistration.test.jsx. */
vi.setConfig({ testTimeout: 15000 });

vi.mock('../../utils/firstRecord', () => ({ firstRecordMoment: () => null }));
vi.mock('@formulas/runRecord.ts', () => ({ runRecordMoment: () => null }));

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), updates: [] }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => ({
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
      update: (payload) => ({
        eq: (col, val) => { mocks.updates.push({ table, payload, id: val }); return Promise.resolve({ error: null }); },
      }),
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
  race_type: 'estrada', status: 'agendada', target_time: '1:52:00', target_pace_seconds_per_km: 318,
};
const entrarPeloPrefill = () => useAppStore.setState({
  profile: PROFILE, runs: [], raceEvents: [PROVA], shoes: [], coachPlans: [], coachPlanItems: [],
  runRacePrefill: { raceId: 'race-1' },
});

describe('Registar a prova · Design v2 (P1)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.invoke.mockReset().mockResolvedValue({ data: { run: { id: 'run-race-1' } }, error: null });
    mocks.updates.length = 0;
    act(() => setDesignV2(true));
  });
  afterEach(() => {
    act(() => setDesignV2(false));
  });

  it('a prova é um bloco liso: nome, data · local e os números em texto, sem pílulas nem caixa do objetivo', () => {
    entrarPeloPrefill();
    render(<RunRegistration onClose={vi.fn()} />);
    const bloco = screen.getByTestId('race-mode-header');
    expect(bloco.tagName).toBe('SECTION');
    expect(within(bloco).getByRole('heading', { name: 'A prova' })).toHaveClass('v2-label');
    expect(within(bloco).getByText('Meia de Lisboa')).toBeInTheDocument();
    expect(bloco).toHaveTextContent('Lisboa');
    expect(within(bloco).getByText('Distância').nextElementSibling).toHaveTextContent('Meia Maratona');
    expect(within(screen.getByTestId('v2-runreg-objetivo')).getByText('Objetivo').nextElementSibling).toHaveTextContent('1:52:00');
    // Sem o cartão de vidro com brilho, sem pílulas com estilo inline.
    expect(bloco.querySelector('[style*="border-radius"]')).toBeNull();
    expect(bloco).not.toHaveTextContent('—');
  });

  it('os títulos das secções são texto simples (sem a etiqueta em maiúsculas), pela ordem de sempre', () => {
    entrarPeloPrefill();
    render(<RunRegistration onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('v2-reg-manual')); // P2a: o manual abre por «Preencher à mão»
    const titulos = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
      .filter((t) => /^(A prova|O resultado|Como correu|Memórias|Diploma)$/.test(t));
    expect(titulos).toEqual(['A prova', 'O resultado', 'Como correu', 'Memórias']);
    const raiz = screen.getByTestId('run-race-mode');
    expect(raiz.querySelectorAll('.uppercase')).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'Do diploma (opcional)' })).toBeInTheDocument();
  });

  it('o resultado não tem caixas dentro: os grupos do relógio só com o título', () => {
    entrarPeloPrefill();
    render(<RunRegistration onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('v2-reg-manual')); // P2a: o manual abre por «Preencher à mão»
    expect(screen.getByText('Fisiologia e relógio')).toBeInTheDocument();
    expect(screen.queryByText('Fisiologia & Relógio')).not.toBeInTheDocument();
    const zonas = screen.getByRole('group', { name: /Zonas de frequência cardíaca/ });
    expect(zonas.className).toBe('');
    const parciais = screen.getByRole('group', { name: /Parciais/ });
    expect(parciais.className).toBe('');
  });

  it('o «Registar a prova» vai embrulhado para ficar âmbar na ActionBar', () => {
    entrarPeloPrefill();
    render(<RunRegistration onClose={vi.fn()} />);
    const go = screen.getByTestId('v2-runreg-go');
    expect(within(go).getByRole('button', { name: /Registar a prova/ })).toBeInTheDocument();
  });

  it('depois de gravar, diz o que acontece a seguir', async () => {
    entrarPeloPrefill();
    render(<RunRegistration onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('v2-reg-manual')); // P2a: o manual abre por «Preencher à mão»
    fireEvent.change(screen.getByLabelText(/Tempo oficial/), { target: { value: '1:53:42' } });
    fireEvent.change(screen.getByPlaceholderText('00:00'), { target: { value: '1:53:50' } });
    fireEvent.click(screen.getByRole('button', { name: /Registar a prova/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Prosseguir sem estas métricas/i }));
    const confirmacao = await screen.findByTestId('record-confirmation');
    expect(confirmacao).toHaveAttribute('data-tone', 'race');
    expect(confirmacao).toHaveTextContent('Meia de Lisboa concluída · 1:53:42. A Carol analisa a prova e escreve o balanço.');
  });

  it('na corrida normal, o v2 não leva o invólucro âmbar', () => {
    useAppStore.setState({ profile: PROFILE, runs: [], raceEvents: [], shoes: [], runRacePrefill: null });
    render(<RunRegistration onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('v2-reg-manual')); // P2a: o manual abre por «Preencher à mão»
    expect(screen.queryByTestId('v2-runreg-go')).not.toBeInTheDocument();
    // «Adicionar parcial» e «Adicionar zona» em texto normal (o AddButton punha-os em maiúsculas).
    for (const nome of [/Adicionar parcial/, /Adicionar zona/]) {
      expect(screen.getByRole('button', { name: nome })).not.toHaveClass('uppercase');
    }
  });
});

describe('Registar a prova · v2 desligado', () => {
  beforeEach(() => {
    window.localStorage.clear();
    act(() => setDesignV2(false));
  });

  it('fica o desenho de sempre: etiquetas, o cartão da prova com pílulas e a caixa do objetivo', () => {
    entrarPeloPrefill();
    render(<RunRegistration onClose={vi.fn()} />);
    const cabecalho = screen.getByTestId('race-mode-header');
    expect(cabecalho.tagName).not.toBe('SECTION');
    expect(cabecalho).toHaveTextContent('Estes dados vêm da agenda — é lá que se mudam.');
    expect(within(cabecalho).getByText('Objetivo')).toBeInTheDocument();
    expect(screen.getByText('Do diploma (opcional)')).toHaveClass('uppercase');
    expect(screen.getByText('Fisiologia & Relógio')).toBeInTheDocument();
    expect(screen.queryByTestId('v2-runreg-go')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Adicionar parcial/ })).toHaveClass('uppercase');
  });
});
