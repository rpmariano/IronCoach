import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RaceReadinessCard from './RaceReadinessCard';
import { useAppStore } from '../../store';

/* Fase 0 do Troféu (2026-09-26): igual ao teste do ramo "Reta Final" em
   biEngine.test.js — entre as provas futuras, a PRINCIPAL manda sobre a
   mais próxima por data. Aqui isola-se só a escolha de `nextRace`; o resto
   do cálculo de prontidão (calculateReadinessIndex, o plano de treino) é
   mockado para o teste não depender de macrociclos reais. */
vi.mock('../../utils/biEngine', () => ({
  calculateReadinessIndex: vi.fn(() => ({ score: 50, level: 'medium', pillars: [] })),
}));
vi.mock('../../utils/racePlanEngine', () => ({
  calculateRaceTrainingPlan: vi.fn(() => null),
}));
vi.mock('../../utils/homeModels', () => ({
  buildTrailModel: vi.fn(() => null),
}));

const iso = (daysFromNow) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
};

describe('RaceReadinessCard — escolha da próxima prova', () => {
  it('prefere a próxima prova PRINCIPAL, mesmo que não seja a mais próxima por data', () => {
    useAppStore.setState?.({ dailyCheckins: [] });
    const raceEvents = [
      { id: 'treino-amanha', date: iso(1), name: 'Corrida de treino', race_priority: 'c', distance_km: 10 },
      { id: 'objetivo', date: iso(9), name: 'Meia Maratona', race_priority: 'a', distance_km: 21 },
    ];
    render(<RaceReadinessCard runs={[]} meals={[]} bodyAssessments={[]} gymSessions={[]} raceEvents={raceEvents} profile={{}} />);
    expect(screen.getByText('Meia Maratona')).toBeInTheDocument();
    expect(screen.queryByText('Corrida de treino')).not.toBeInTheDocument();
  });

  it('sem nenhuma prova principal no futuro, mantém-se a mais próxima por data', () => {
    useAppStore.setState?.({ dailyCheckins: [] });
    const raceEvents = [
      { id: 'perto', date: iso(5), name: 'Meia B', race_priority: 'b', distance_km: 21 },
      { id: 'longe', date: iso(20), name: 'Maratona C', race_priority: 'c', distance_km: 42 },
    ];
    render(<RaceReadinessCard runs={[]} meals={[]} bodyAssessments={[]} gymSessions={[]} raceEvents={raceEvents} profile={{}} />);
    expect(screen.getByText('Meia B')).toBeInTheDocument();
  });
});
