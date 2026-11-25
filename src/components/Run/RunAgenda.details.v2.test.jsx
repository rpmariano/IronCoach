import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import { ToastProvider } from '../shared/ToastProvider';
import RunAgenda from './RunAgenda';
import { todayISO, addDaysISO } from '../../lib/utils';
import { setDesignV2 } from '../../utils/designV2';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
  },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const RACE = {
  id: 'race-1',
  date: addDaysISO(todayISO(), 30),
  location: 'Lisboa',
  name: 'Corrida do Tejo',
  race_type: 'estrada',
  distance_km: 10,
  elevation_gain_m: null,
  experience_level: 'medio',
  race_priority: 'a',
  target_time: '55:00',
  target_time_seconds: 3300,
  target_pace_seconds_per_km: 330,
  website: null,
  web_info: null,
  notes: null,
};

function renderAgenda() {
  return render(
    <ToastProvider>
      <RunAgenda onClose={() => {}} />
    </ToastProvider>,
  );
}

describe('RunAgenda — Detalhes da prova no Design v2', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAppStore.setState({
      raceEvents: [RACE],
      profile: { id: 'user-1' },
      runs: [],
      editingRaceId: 'race-1',
      activeTab: 'holistica',
      pendingCalendarDate: null,
      setRaceEvents: (events) => useAppStore.setState({ raceEvents: events }),
      setNavGuard: () => {},
      setEditingRaceId: (id) => useAppStore.setState({ editingRaceId: id }),
    });
  });

  afterEach(() => {
    act(() => { setDesignV2(false); });
    vi.restoreAllMocks();
  });

  it('v2: a página é plana e a avaliação da Carol é uma linha, não uma caixa', () => {
    act(() => { setDesignV2(true); });
    renderAgenda();
    expect(screen.getByTestId('race-details-v2')).toBeInTheDocument();
    expect(screen.queryByText('Avaliação da Carol')).toBeNull();
    const line = screen.getByTestId('race-details-carol-line');
    expect(line.querySelector('.v2-who')).toHaveTextContent('Carol.');
    expect(line.querySelector('i[aria-hidden="true"]')).not.toBeNull();
  });

  it('v2: «Eliminar prova» fica, discreto, e abre o mesmo diálogo', () => {
    act(() => { setDesignV2(true); });
    renderAgenda();
    const botao = screen.getByTestId('race-remove-button');
    expect(botao).toHaveTextContent('Eliminar prova');
    expect(botao).toHaveClass('v2-act', 'is-danger');
    fireEvent.click(botao);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('v2: a prova nova não tem o cartão de vidro âmbar e os atalhos de distância são planos', () => {
    useAppStore.setState({ editingRaceId: null });
    act(() => { setDesignV2(true); });
    const { container } = renderAgenda();
    expect(container.querySelector('.module-card-contrast')).toBeNull();
    expect(container.querySelector('.v2-details-screen')).not.toBeNull();
    expect(container.querySelectorAll('.v2-details-chip').length).toBeGreaterThan(0);
  });

  it('v2 desligado: o cartão e a caixa «Avaliação da Carol» continuam como estavam', () => {
    useAppStore.setState({ editingRaceId: null });
    const { container } = renderAgenda();
    expect(container.querySelector('.module-card-contrast')).not.toBeNull();
    expect(screen.queryByTestId('race-details-v2')).toBeNull();
    fireEvent.change(container.querySelector('#ra-data'), { target: { value: addDaysISO(todayISO(), 30) } });
    fireEvent.change(container.querySelector('#ra-distancia'), { target: { value: '10' } });
    const caixa = screen.getAllByText('Avaliação da Carol').filter((el) => el.classList.contains('tracking-wider'));
    expect(caixa).toHaveLength(1);
    expect(screen.queryByTestId('race-details-carol-line')).toBeNull();
  });
});

function abrirDetalhes() {
  const alvo = screen.getAllByText('Detalhes da prova').map((el) => el.closest('button,[role="tab"]')).find(Boolean);
  fireEvent.click(alvo);
}

describe('RunAgenda — «Guardar prova» desativado diz porquê', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAppStore.setState({
      raceEvents: [RACE], profile: { id: 'user-1' }, runs: [], editingRaceId: 'race-1',
      activeTab: 'holistica', pendingCalendarDate: null,
      setRaceEvents: (events) => useAppStore.setState({ raceEvents: events }),
      setNavGuard: () => {},
      setEditingRaceId: (id) => useAppStore.setState({ editingRaceId: id }),
    });
  });
  afterEach(() => { act(() => { setDesignV2(false); }); });

  it('v1: a barra fica como era (o botão sozinho, sem motivo nem invólucro)', () => {
    renderAgenda();
    abrirDetalhes();
    const guardar = screen.getByRole('button', { name: /Guardar prova/ });
    expect(guardar).toBeDisabled();
    expect(guardar).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByTestId('race-save-hint')).toBeNull();
    expect(guardar.parentElement).toBe(screen.getByTestId('action-bar'));
    fireEvent.change(screen.getByDisplayValue('Corrida do Tejo'), { target: { value: '' } });
    expect(screen.queryByTestId('race-save-hint')).toBeNull();
  });

  it('v2: sem alterações, o motivo é só para o leitor de ecrã (a barra não cresce)', () => {
    act(() => { setDesignV2(true); });
    renderAgenda();
    abrirDetalhes();
    const guardar = screen.getByRole('button', { name: /Guardar prova/ });
    expect(guardar).toBeDisabled();
    const hint = screen.getByTestId('race-save-hint');
    expect(hint).toHaveTextContent('Sem alterações para guardar');
    expect(hint).toHaveClass('sr-only');
    expect(guardar).toHaveAttribute('aria-describedby', 'race-save-hint');
  });

  it('v2: sem o nome, o motivo vê-se; com uma alteração válida, sai', () => {
    act(() => { setDesignV2(true); });
    renderAgenda();
    abrirDetalhes();
    const nome = screen.getByDisplayValue('Corrida do Tejo');
    fireEvent.change(nome, { target: { value: '' } });
    const hint = screen.getByTestId('race-save-hint');
    expect(hint).toHaveTextContent('Falta o nome da prova');
    expect(hint).not.toHaveClass('sr-only');
    fireEvent.change(nome, { target: { value: 'Corrida do Tejo 2' } });
    expect(screen.queryByTestId('race-save-hint')).toBeNull();
    expect(screen.getByRole('button', { name: /Guardar prova/ })).not.toHaveAttribute('aria-describedby');
  });
});
