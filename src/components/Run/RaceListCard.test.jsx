import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import RaceListCard from './RaceListCard';

/* "As tuas provas" no módulo Corrida (pedido 2026-09-13): todas as provas num
   sítio só, cada uma a um toque do hub. */

const isoInDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const race = (id, days, extra = {}) => ({
  id, name: `Prova ${id}`, date: isoInDays(days), distance_km: 10, race_type: 'estrada', status: 'agendada', ...extra,
});

const montar = (raceEvents = [], runs = []) => {
  useAppStore.setState({ raceEvents, runs, profile: { id: 'user-1' }, editingRaceId: null, openCreationMode: null });
  return render(<RaceListCard />);
};

beforeEach(() => {
  useAppStore.setState({ raceEvents: [], runs: [], editingRaceId: null, openCreationMode: null });
});

describe('RaceListCard', () => {
  it('sem provas, diz que não há nenhuma e deixa marcar a primeira', () => {
    montar();
    expect(screen.getByTestId('race-list-resumo')).toHaveTextContent('Ainda sem provas marcadas.');
    expect(screen.queryByTestId('race-list-ver-todas')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('race-list-nova'));
    expect(useAppStore.getState().openCreationMode).toBe('race');
  });

  it('mostra os três grupos com a contagem, e tocar numa prova abre o hub dela', () => {
    const runs = [{ id: 'run-1', race_id: 'feita', kind: 'competicao', date: isoInDays(-20), distance_km: 10, duration_seconds: 2950, details: { official_time_seconds: 2950 } }];
    montar([
      race('amanha', 1, { target_time: '50:00' }),
      race('esquecida', -3),
      race('feita', -20, { status: 'concluida' }),
    ], runs);

    expect(screen.getByTestId('race-list-resumo')).toHaveTextContent('1 por fazer · 1 por registar · 1 concluída');

    const proxima = screen.getByTestId('race-list-amanha');
    expect(proxima).toHaveTextContent('amanhã');
    expect(proxima).toHaveTextContent('objetivo 50:00');
    expect(screen.getByTestId('race-list-esquecida')).toHaveTextContent('Registar');
    expect(screen.getByTestId('race-list-feita')).toHaveTextContent('49:10');

    // Cada linha é um alvo de toque inteiro.
    expect(proxima).toHaveStyle({ minHeight: '56px' });

    fireEvent.click(screen.getByTestId('race-list-feita'));
    expect(useAppStore.getState().editingRaceId).toBe('feita');
  });

  it('com mais de três num grupo, o resto está em "Ver todas", na persiana', () => {
    montar([1, 10, 20, 30, 40].map((d) => race(`p${d}`, d)));

    // No cartão só as três mais perto.
    expect(screen.getByTestId('race-list-card')).not.toHaveTextContent('Prova p40');
    expect(screen.getByTestId('race-list-card')).toHaveTextContent('Prova p20');

    fireEvent.click(screen.getByTestId('race-list-ver-todas'));
    const persiana = screen.getByTestId('race-list-sheet');
    expect(within(persiana).getByText('Prova p40')).toBeInTheDocument();
    expect(within(persiana).getByText('Prova p30')).toBeInTheDocument();

    fireEvent.click(within(persiana).getByTestId('race-list-p40'));
    expect(useAppStore.getState().editingRaceId).toBe('p40');
  });
});
