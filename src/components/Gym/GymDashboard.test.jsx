import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import GymDashboard from './GymDashboard';
import { todayISO, addDaysISO } from '../../lib/utils';

/* Ginásio: factos reais em vez de fogo de artifício (2026-10-04).
   G1 — séries por músculo sem duplicar sessões de vários grupos;
   G6 — RPE por modalidade a aparecer, com vírgula decimal;
   G7 — "Tempo Total" das aulas sem "0 min" quando ninguém registou duração. */

const sets = (n) => Array.from({ length: n }, () => ({ reps: 10, weight: 50 }));
const aula = (daysAgo, extra = {}) => ({
  id: `a${daysAgo}${Math.random()}`,
  date: addDaysISO(todayISO(), -daysAgo),
  kind: 'aula',
  name: 'Pilates',
  class_types: ['Pilates'],
  categories: [],
  workout_session_sets: [],
  ...extra,
});

describe('GymDashboard — Séries por músculo (G1)', () => {
  beforeEach(() => {
    useAppStore.setState({ runs: [], meals: [], bodyAssessments: [], profile: {} });
  });

  it('não duplica as séries de uma sessão Peito+Tríceps: fica de fora e avisa', () => {
    useAppStore.setState({
      gymSessions: [
        { id: 's1', date: addDaysISO(todayISO(), -2), kind: 'forca', categories: ['Peito', 'Tríceps'], workout_session_sets: sets(20) },
        { id: 's2', date: addDaysISO(todayISO(), -1), kind: 'forca', categories: ['Costas'], workout_session_sets: sets(6) },
      ],
    });
    render(<GymDashboard />);
    expect(screen.getByText('séries em Costas')).toBeInTheDocument();
    expect(screen.queryByText(/séries em Peito/)).not.toBeInTheDocument();
    expect(screen.getByText(/1 sessão com vários grupos não entra/)).toBeInTheDocument();
  });

  it('com várias sessões de vários grupos, o aviso vai no plural', () => {
    useAppStore.setState({
      gymSessions: [
        { id: 's1', date: addDaysISO(todayISO(), -2), kind: 'forca', categories: ['Peito', 'Tríceps'], workout_session_sets: sets(5) },
        { id: 's2', date: addDaysISO(todayISO(), -1), kind: 'forca', categories: ['Pernas Superiores', 'Glúteos'], workout_session_sets: sets(5) },
      ],
    });
    render(<GymDashboard />);
    expect(screen.getByText(/2 sessões com vários grupos não entram/)).toBeInTheDocument();
  });
});

describe('GymDashboard — Aulas & Modalidades (G6, G7)', () => {
  beforeEach(() => {
    useAppStore.setState({ runs: [], meals: [], bodyAssessments: [], profile: {} });
  });

  it('G6: mostra o RPE médio por modalidade, com vírgula decimal', () => {
    useAppStore.setState({
      gymSessions: [
        aula(1, { name: 'HIIT', class_types: ['HIIT'], duration_seconds: 1800, exertion: 8 }),
        aula(2, { name: 'HIIT', class_types: ['HIIT'], duration_seconds: 1800, exertion: 7 }),
      ],
    });
    render(<GymDashboard />);
    expect(screen.getByText('RPE 7,5')).toBeInTheDocument();
    expect(screen.getByText('7,5 / 10')).toBeInTheDocument();
  });

  it('G7: sem nenhuma duração registada, o Tempo Total é "—" e não "0 min"', () => {
    useAppStore.setState({ gymSessions: [aula(1), aula(2)] });
    render(<GymDashboard />);
    expect(screen.queryByText('0 min')).not.toBeInTheDocument();
    const label = screen.getByText('Tempo Total');
    expect(label.previousSibling).toHaveTextContent('—');
  });

  it('G7: com duração só em parte das aulas, avisa "em N de M aulas"', () => {
    useAppStore.setState({
      gymSessions: [aula(1, { duration_seconds: 3600 }), aula(2)],
    });
    render(<GymDashboard />);
    expect(screen.getByText('Tempo Total').previousSibling).toHaveTextContent('1h');
    expect(screen.getByText('em 1 de 2 aulas')).toBeInTheDocument();
  });

  it('G7: com duração em todas as aulas, não há aviso', () => {
    useAppStore.setState({ gymSessions: [aula(1, { duration_seconds: 1800 }), aula(2, { duration_seconds: 1800 })] });
    render(<GymDashboard />);
    expect(screen.getByText('Tempo Total').previousSibling).toHaveTextContent('1h');
    expect(screen.queryByText(/em \d+ de \d+ aulas/)).not.toBeInTheDocument();
  });
});
