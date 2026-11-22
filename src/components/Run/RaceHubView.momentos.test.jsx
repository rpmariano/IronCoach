import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* O hub da prova por momento (pedido do Rui, 2026-11-22): um bloco principal no topo, conforme o
   momento, e o resto recolhido. A distância e a frase do objetivo ambicioso dizem-se uma vez, o
   macrociclo só com a fase atual aberta e as concluídas numa linha, o foco das fases sem siglas. */

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => { throw new Error('sem rede nos testes'); },
    storage: { from: () => ({ createSignedUrl: (p) => Promise.resolve({ data: { signedUrl: `https://s/${p}` }, error: null }) }) },
  },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const { default: RaceHubView } = await import('./RaceHubView');
const { useAppStore } = await import('../../store');

const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const PROFILE = { experience_level: 'medio' };
const race = (days, over = {}) => ({
  id: 'r1', name: 'Meia do Porto', date: inDays(days), distance_km: 21.0975, race_type: 'estrada', race_priority: 'a',
  target_time: '1:45:00', target_time_seconds: 6300, status: 'agendada', location: 'Porto', created_at: `${inDays(-120)}T10:00:00Z`, ...over,
});
// Um treino que aponta mais devagar do que o objetivo: o objetivo é ambicioso.
const TREINO = [
  { id: 'a', kind: 'normal', date: inDays(-20), distance_km: 10, duration_seconds: 3000 },
  { id: 'b', kind: 'normal', date: inDays(-10), distance_km: 15, duration_seconds: 4700 },
];

beforeEach(() => {
  useAppStore.setState({ session: { user: { id: 'u1' } }, profile: { id: 'u1' }, raceEvents: [], coachPlans: [], coachPlanItems: [], runs: [] });
});

const SIGLAS = /Z[1-5]\b|Z1\/Z2|polarizado|VDOT/;
const ordem = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('RaceHubView — um hub por momento', () => {
  it('longe: a contagem, a fase e o objetivo vs a previsão no topo; o macrociclo, o GPX e o site recolhidos', () => {
    render(<RaceHubView race={race(70)} runs={TREINO} profile={PROFILE} />);
    const hub = screen.getByTestId('race-hub-prerace');
    expect(hub).toHaveAttribute('data-moment', 'longe');
    expect(screen.getByTestId('race-hub-countdown')).toHaveTextContent('70 dias');
    expect(screen.queryByTestId('race-pacing-card')).toBeNull();
    // A distância uma vez, em pt-PT; sem o cartão «Distância» nem a «Meia Maratona» repetida.
    expect(screen.getByTestId('race-hub-meta')).toHaveTextContent('21,1 km');
    expect(hub.textContent.match(/21,1 km/g)).toHaveLength(1);
    expect(screen.queryByText('Distância')).toBeNull();
    expect(screen.queryByText('Meia Maratona')).toBeNull();
    // O objetivo ambicioso: uma frase só, a da leitura.
    expect(screen.getByTestId('race-forecast-line')).toBeInTheDocument();
    expect(hub.textContent.match(/ambicioso/gi) || []).toHaveLength(1);
    // Recolhidos, com aria-expanded.
    const macro = within(screen.getByTestId('race-hub-macro')).getAllByRole('button')[0];
    expect(macro).toHaveAttribute('aria-expanded', 'false');
    expect(within(screen.getByTestId('race-hub-site')).getAllByRole('button')[0]).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(macro);
    expect(macro).toHaveAttribute('aria-expanded', 'true');
  });

  it('longe sem objetivo: um link curto para o marcar, que vai aos Detalhes', () => {
    const onGoToEdit = vi.fn();
    render(<RaceHubView race={race(70, { target_time: null, target_time_seconds: null })} runs={TREINO} profile={PROFILE} onGoToEdit={onGoToEdit} />);
    fireEvent.click(screen.getByTestId('race-forecast-set-target'));
    expect(onGoToEdit).toHaveBeenCalled();
  });

  it('última semana: o Plano para o dia no topo (com «Ver todos os km»), a frase do ambicioso só nele', () => {
    render(<RaceHubView race={race(4)} runs={TREINO} profile={PROFILE} />);
    expect(screen.getByTestId('race-hub-prerace')).toHaveAttribute('data-moment', 'semana');
    const plano = screen.getByTestId('race-pacing-card');
    expect(ordem(plano, screen.getByTestId('race-hub-summary'))).toBe(true);
    expect(screen.getByTestId('race-pacing-ambitious')).toBeInTheDocument();
    expect(screen.queryByTestId('race-forecast-line')).toBeNull();
    // Os primeiros km, e o resto num toque.
    const ver = screen.getByTestId('race-pacing-all-rows');
    expect(ver).toHaveAttribute('aria-expanded', 'false');
    const antes = screen.getByTestId('race-pacing-rows').children.length;
    fireEvent.click(ver);
    expect(screen.getByTestId('race-pacing-rows').children.length).toBeGreaterThan(antes);
  });

  it('dia da prova: «Registar a prova» primeiro, o plano, a frase da Carol do dia; o resto recolhido', () => {
    render(<RaceHubView race={race(0)} runs={TREINO} profile={PROFILE} />);
    expect(screen.getByTestId('race-hub-prerace')).toHaveAttribute('data-moment', 'dia');
    const registar = screen.getByTestId('race-hub-register');
    expect(ordem(screen.getByTestId('race-hub-header'), registar)).toBe(true);
    expect(ordem(registar, screen.getByTestId('race-pacing-card'))).toBe(true);
    // A frase da Carol do dia (o texto muda com a situação: «É dia de prova…», «A prova é hoje…»).
    expect(screen.getByTestId('race-hub-day-line').textContent).toMatch(/prova/i);
    expect(within(screen.getByTestId('race-hub-carol-section')).getAllByRole('button')[0]).toHaveAttribute('aria-expanded', 'false');
  });

  it('o macrociclo: as fases que passaram numa linha, sem «Sem registos · 40%»; o foco sem siglas', () => {
    // A 10 dias: a base, a construção e o pico já passaram.
    render(<RaceHubView race={race(10)} runs={TREINO} profile={PROFILE} />);
    fireEvent.click(within(screen.getByTestId('race-hub-macro')).getAllByRole('button')[0]);
    const feitas = screen.getByTestId('race-hub-phases-done');
    expect(within(feitas).getAllByRole('button')[0]).toHaveTextContent(/\d+ fases? concluídas?/);
    expect(document.body.textContent).not.toMatch(/Sem Registos · \d+%/);
    expect(document.body.textContent).not.toMatch(SIGLAS);
  });

  /* As fronteiras do momento: a 8 dias ainda é «longe»; a 7 já é a última semana; a 1, «Amanhã» e
     ainda a semana (o «dia» é só a 0). */
  it.each([
    [8, 'longe', '8 dias'],
    [7, 'semana', '7 dias'],
    [1, 'semana', 'Amanhã'],
  ])('a %i dias: o momento é «%s»', (dias, momento, contagem) => {
    render(<RaceHubView race={race(dias)} runs={TREINO} profile={PROFILE} />);
    expect(screen.getByTestId('race-hub-prerace')).toHaveAttribute('data-moment', momento);
    expect(screen.getByTestId('race-hub-countdown')).toHaveTextContent(contagem);
    if (momento === 'semana') expect(screen.getByTestId('race-pacing-card')).toBeInTheDocument();
    else expect(screen.queryByTestId('race-pacing-card')).toBeNull();
  });

  // Na base (a prova a 20 semanas) e na construção (a 10): o macrociclo aberto, sem siglas nenhumas.
  it.each([[16 * 7, 'Base'], [10 * 7, 'Construção']])('a %i dias (fase %s): o macrociclo sem siglas', (dias) => {
    render(<RaceHubView race={race(dias, { created_at: `${inDays(-200)}T10:00:00Z` })} runs={TREINO} profile={PROFILE} />);
    fireEvent.click(within(screen.getByTestId('race-hub-macro')).getAllByRole('button')[0]);
    // Todas as fases abertas: o foco e a avaliação de cada uma.
    within(screen.getByTestId('race-hub-macro')).getAllByRole('button', { expanded: false }).forEach((b) => fireEvent.click(b));
    expect(screen.getByTestId('race-hub-macro').textContent).not.toMatch(SIGLAS);
    expect(screen.getByTestId('race-hub-prerace').textContent).not.toMatch(SIGLAS);
  });

  it('as fases: o aria-controls aponta sempre para um painel que existe (escondido quando fechado)', () => {
    render(<RaceHubView race={race(70)} runs={TREINO} profile={PROFILE} />);
    const macro = screen.getByTestId('race-hub-macro');
    within(macro).getAllByRole('button').forEach((b) => {
      const id = b.getAttribute('aria-controls');
      expect(id && document.getElementById(id)).toBeTruthy();
      expect(document.getElementById(id).hidden).toBe(b.getAttribute('aria-expanded') !== 'true');
    });
  });

  it('a diferença do objetivo dita por extenso a quem usa leitor de ecrã', () => {
    render(<RaceHubView race={race(70)} runs={TREINO} profile={PROFILE} />);
    expect(screen.getByTestId('race-forecast-delta')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('race-forecast-delta-sr').textContent).toMatch(/^\(\d+:\d\d mais (lento|rápido) do que o objetivo\)$/);
  });

  it('última semana sem objetivo: o pedido do objetivo uma vez só, o do Plano para o dia', () => {
    render(<RaceHubView race={race(4, { target_time: null, target_time_seconds: null })} runs={TREINO} profile={PROFILE} onGoToEdit={vi.fn()} />);
    expect(screen.queryByTestId('race-forecast-set-target')).toBeNull();
    expect(screen.getByTestId('race-pacing-card')).toHaveTextContent(/Sem objetivo marcado/);
  });

  it('trail: o D+ em pt-PT e os km equivalentes no cabeçalho; a ajuda da previsão no ⓘ', () => {
    render(<RaceHubView race={race(70, { race_type: 'trail', distance_km: 42, elevation_gain_m: 2350 })} runs={TREINO} profile={PROFILE} />);
    const meta = screen.getByTestId('race-hub-meta').textContent;
    expect(meta).toMatch(/42 km · \+2\s350 m D\+ \(≈ [\d\s]+(,\d)? km equivalentes\)/);
    const ajuda = screen.getByTestId('race-forecast-help');
    expect(ajuda).not.toBeVisible();
    const i = screen.getByRole('button', { name: 'Como é calculada a previsão' });
    expect(i).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(i);
    expect(i).toHaveAttribute('aria-expanded', 'true');
    expect(ajuda).toBeVisible();
    expect(ajuda.textContent).toMatch(/Riegel/);
    expect(ajuda.textContent).toMatch(/km — a distância real mais o desnível/);
  });
});
