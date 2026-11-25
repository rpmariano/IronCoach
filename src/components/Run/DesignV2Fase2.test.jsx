import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* Design v2, fase 2 (2026-11-25): a lista de provas, o seletor plano do hub e o depois da prova. */

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => { throw new Error('sem rede nos testes'); },
    rpc: () => Promise.resolve({ data: null, error: null }),
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    storage: { from: () => ({ createSignedUrl: (p) => Promise.resolve({ data: { signedUrl: `https://s/${p}` }, error: null }) }) },
  },
  invokeEdgeFunctionWithTimeout: (...a) => mocks.invoke(...a),
}));

const { default: RacesV2 } = await import('./RacesV2');
const { default: RacesScreen } = await import('./RacesScreen');
const { default: RaceHubView } = await import('./RaceHubView');
const { doneSentence } = await import('./RaceHubV2');
const { default: SegmentedV2 } = await import('../shared/SegmentedV2');
const { useAppStore } = await import('../../store');
const { setDesignV2 } = await import('../../utils/designV2');

const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

beforeEach(() => {
  window.localStorage.clear();
  mocks.invoke.mockReset().mockResolvedValue({ data: { model_message: { id: 'm1', content: 'Balanço de teste.' }, suggestions: [] }, error: null });
  useAppStore.setState({ session: { user: { id: 'u1' } }, profile: { id: 'u1' }, raceEvents: [], runs: [], coachPlans: [], coachPlanItems: [] });
});
afterEach(() => act(() => setDesignV2(false)));

describe('Lista de provas v2', () => {
  const PROVAS = [
    { id: 'a', name: 'Meia Maratona dos Descobrimentos de Lisboa', date: inDays(12), distance_km: 21.0975, target_time: '1:45:00', status: 'agendada' },
    { id: 'b', name: 'Corrida do Tejo', date: inDays(40), distance_km: 10, status: 'agendada' },
    { id: 'c', name: 'Trail dos Moinhos', date: inDays(-2), distance_km: 15, status: 'agendada' },
    { id: 'd', name: 'São Silvestre', date: inDays(-60), distance_km: 10, status: 'concluida' },
  ];
  const RUNS = [{ id: 'r-d', race_id: 'd', kind: 'competicao', date: inDays(-60), distance_km: 10, duration_seconds: 2998, details: { official_time_seconds: 2998 } }];

  it('desligado: o ecrã de sempre, com o «Para onde vou»', () => {
    useAppStore.setState({ raceEvents: PROVAS, runs: RUNS });
    render(<RacesScreen />);
    expect(screen.getByText('Para onde vou')).toBeInTheDocument();
    expect(screen.queryByTestId('races-v2')).toBeNull();
  });

  it('ligado: sem o carrossel; a lista é o ecrã', async () => {
    act(() => setDesignV2(true));
    useAppStore.setState({ raceEvents: PROVAS, runs: RUNS });
    render(<RacesScreen />);
    await screen.findByTestId('races-v2');
    expect(screen.queryByText('Para onde vou')).toBeNull();
  });

  it('a próxima a âmbar, o nome inteiro, a distância e o objetivo, os dias à direita', () => {
    const setEditingRaceId = vi.fn();
    useAppStore.setState({ raceEvents: PROVAS, runs: RUNS, setEditingRaceId });
    render(<RacesV2 />);
    const prox = within(screen.getByTestId('races-v2-proximas'));
    const a = screen.getByTestId('race-list-a');
    expect(a).toHaveClass('is-next');
    expect(a).toHaveTextContent('Meia Maratona dos Descobrimentos de Lisboa');
    expect(a).toHaveTextContent('21,1 km · objetivo 1:45:00');
    expect(a).toHaveTextContent('12 d');
    expect(screen.getByTestId('race-list-b')).not.toHaveClass('is-next');
    expect(screen.getByTestId('race-list-b')).toHaveTextContent('sem objetivo');
    fireEvent.click(prox.getAllByRole('button')[0]);
    expect(setEditingRaceId).toHaveBeenCalledWith('a');
  });

  it('«Por registar» à parte, com a ação; as concluídas com o tempo final à direita', () => {
    const openRaceRun = vi.fn();
    useAppStore.setState({ raceEvents: PROVAS, runs: RUNS, openRaceRun });
    render(<RacesV2 />);
    const pr = screen.getByTestId('races-v2-por-registar');
    expect(pr).toHaveTextContent('Trail dos Moinhos');
    fireEvent.click(screen.getByTestId('race-list-registar-c'));
    expect(openRaceRun).toHaveBeenCalledWith('c');
    expect(screen.getByTestId('race-list-d')).toHaveTextContent('49:58');
    expect(screen.getByTestId('races-v2').textContent).not.toMatch(/—/);
  });
});

describe('SegmentedV2', () => {
  it('o ativo com aria-current; um toque muda', () => {
    const onChange = vi.fn();
    render(<SegmentedV2 label="Páginas" items={[{ key: 'hub', label: 'Treino e Evolução' }, { key: 'details', label: 'Detalhes da prova' }]} activeIndex={0} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Treino e Evolução' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Detalhes da prova' }));
    expect(onChange).toHaveBeenCalledWith(1, expect.objectContaining({ key: 'details' }));
  });
});

describe('Depois da prova v2', () => {
  const RACE = { id: 'race-1', name: 'Meia de Lisboa', date: inDays(-10), distance_km: 21.1, race_type: 'estrada', race_priority: 'a', target_time: '1:52:00', target_time_seconds: 6720, status: 'concluida' };
  const RUN = {
    id: 'run-1', race_id: 'race-1', kind: 'competicao', date: inDays(-10), name: 'Meia de Lisboa', distance_km: 21.4, duration_seconds: 6830,
    details: { official_time_seconds: 6822, position: 412, participants: 5000, age_group: 'M40', age_group_position: 38 },
  };

  it('o tempo oficial gigante, a frase, a posição numa linha de três e um só ritmo (o oficial, sobre a distância da prova)', async () => {
    act(() => setDesignV2(true));
    render(<RaceHubView race={RACE} runs={[RUN]} profile={{ experience_level: 'medio' }} />);
    await screen.findByTestId('race-done-v2-main');
    expect(screen.getByTestId('race-hub-completed')).toHaveAttribute('data-design', 'v2');
    expect(screen.getByTestId('race-final-time')).toHaveTextContent('1:53:42');
    expect(screen.getByTestId('race-done-v2-sentence')).toHaveTextContent(/^Tempo oficial\. (.*; )?[oO] objetivo de 1:52:00 ficou a 1:42\.$/);
    const hero = screen.getByTestId('race-done-v2-hero');
    expect(hero).toHaveTextContent('412.º');
    expect(hero).toHaveTextContent(/geral, de 5\s000/);
    expect(hero).toHaveTextContent('38.º');
    expect(hero).toHaveTextContent('escalão M40');
    // 6822 s ÷ 21,1 km = 323 s/km: o oficial, não o da corrida (21,4 km).
    expect(screen.getByTestId('race-done-v2-pace')).toHaveTextContent(/5[.:]23/);
    expect(hero).toHaveTextContent('pelos 21,1 km da prova');
    expect(screen.getByTestId('race-done-v2-main').textContent).not.toMatch(/—/);
  });

  it('a Carol numa linha que expande; «E agora?» e o «Editar o registo» discreto', async () => {
    act(() => setDesignV2(true));
    const openRaceRun = vi.fn();
    useAppStore.setState({ openRaceRun });
    render(<RaceHubView race={{ ...RACE, coach_balance: 'Saíste como combinado e aguentaste a subida.' }} runs={[RUN]} profile={{ experience_level: 'medio' }} />);
    await screen.findByTestId('race-done-v2-main');
    const carol = screen.getByTestId('race-done-v2-carol');
    expect(carol).toHaveTextContent('Carol. Saíste como combinado');
    const b = within(carol).getByRole('button');
    expect(b).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(b);
    expect(b).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('E agora?')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('race-hub-edit-run'));
    expect(openRaceRun).toHaveBeenCalledWith('race-1', 'run-1');
  });

  it('desligado: o hub de sempre', () => {
    render(<RaceHubView race={RACE} runs={[RUN]} profile={{ experience_level: 'medio' }} />);
    expect(screen.getByTestId('race-hub-completed')).not.toHaveAttribute('data-design');
    expect(screen.getByTestId('race-hub-eyebrow')).toBeInTheDocument();
  });
});

describe('doneSentence', () => {
  it('abaixo da previsão e o objetivo cumprido com margem', () => {
    expect(doneSentence({ rows: [
      { key: 'objetivo', timeLabel: '48:00', delta: -30 },
      { key: 'previsao', timeLabel: '50:40', delta: -42 },
    ] })).toBe('42 s abaixo do que o treino apontava; o objetivo de 48:00 ficou cumprido, com 30 s de margem.');
  });
  it('só o objetivo, falhado', () => {
    expect(doneSentence({ rows: [{ key: 'objetivo', timeLabel: '48:00', delta: 118 }] })).toBe('O objetivo de 48:00 ficou a 1:58.');
  });
});
