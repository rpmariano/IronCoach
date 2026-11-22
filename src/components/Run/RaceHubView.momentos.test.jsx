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
    expect(document.body.textContent).not.toMatch(/Z1\/Z2|polarizado|Z4\/Z5|Z3\/Z4/);
  });
});
