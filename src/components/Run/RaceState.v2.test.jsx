import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useAppStore } from '../../store';
import { setDesignV2 } from '../../utils/designV2';
import { calculateRaceTrainingPlan } from '../../utils/racePlanEngine';
import { readinessTextV2, trainingTodayOf } from '../../utils/raceReadinessV2';
import RaceAgendaCardV2 from './RaceAgendaCardV2';
import { RaceDoneV2 } from './RaceHubV2';

/* P2 da 2.ª crítica (2026-11-28): depois da prova, um estado de cada vez, e a prontidão com uma só
   fonte e uma só frase. Só no v2. */

const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const RACE = { id: 'r1', name: 'Corrida do Tejo', date: inDays(-3), distance_km: 10, race_type: 'estrada', race_priority: 'a', location: 'Lisboa', target_time: '50:00', status: 'agendada' };

beforeEach(() => {
  useAppStore.setState({ profile: { experience_level: 'medio' }, runs: [], meals: [], bodyAssessments: [], gymSessions: [], dailyCheckins: [], coachPlans: [], coachPlanItems: [], goalHistory: null });
  act(() => setDesignV2(true));
});
afterEach(() => act(() => setDesignV2(false)));

const card = (ev, extra = {}) => {
  const plan = calculateRaceTrainingPlan({ race: ev, profile: { experience_level: 'medio' }, runs: [] });
  return render(
    <RaceAgendaCardV2
      ev={ev} plan={plan} raceRun={null} done={ev.status === 'concluida'} isPast canRegister raceDayReached
      dateLabel="25 nov" onEdit={vi.fn()} onToggleStatus={vi.fn()} onDelete={vi.fn()} onRegisterRace={vi.fn()} {...extra}
    />,
  );
};

describe('O hub depois da prova (RaceDoneV2): um estado de cada vez', () => {
  it('por registar: «Por registar» e «Registar a prova»; «Marcar como concluída» só como saída secundária; nada de «Concluída»', () => {
    render(<RaceDoneV2 race={RACE} finalSeconds={0} breakdown={null} details={{}} onRegister={vi.fn()} markCompleted={<button type="button">Marcar como concluída</button>} />);
    expect(screen.getByTestId('race-done-v2-por-registar')).toHaveTextContent('Por registar');
    expect(screen.getByRole('button', { name: 'Registar a prova' })).toHaveClass('is-race');
    expect(screen.getByTestId('race-done-v2-mark')).toContainElement(screen.getByRole('button', { name: 'Marcar como concluída' }));
    expect(screen.queryByText('Concluída')).toBeNull();
  });

  it('registada: «Concluída» e o tempo; sem «Por registar» nem «Marcar como concluída»', () => {
    render(<RaceDoneV2 race={RACE} finalSeconds={2950} breakdown={null} details={{}} onRegister={vi.fn()} markCompleted={<button type="button">Marcar como concluída</button>} />);
    expect(screen.getByTestId('race-done-v2-state')).toHaveTextContent('Concluída');
    expect(screen.getByTestId('race-final-time')).toHaveTextContent('49:10');
    expect(screen.queryByText('Por registar')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Marcar como concluída' })).toBeNull();
  });

  it('marcada à mão, sem tempo: «Concluída», sem «Por registar» e sem o «Marcar» outra vez', () => {
    render(<RaceDoneV2 race={{ ...RACE, status: 'concluida' }} finalSeconds={0} breakdown={null} details={{}} onRegister={vi.fn()} markCompleted={<button type="button">Marcar como concluída</button>} />);
    expect(screen.getByTestId('race-done-v2-state')).toHaveTextContent('Concluída');
    expect(screen.getByTestId('race-done-v2-no-time')).toBeInTheDocument();
    expect(screen.queryByText('Por registar')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Marcar como concluída' })).toBeNull();
  });
});

describe('O cartão da prova (Calendário e Início): um estado de cada vez', () => {
  it('passada, sem corrida: «por registar» (não «já passou») e «Registar a prova»; «Marcar» só dentro de «Ver tudo»', () => {
    card(RACE);
    const quando = screen.getByTestId('race-agenda-v2').querySelector('.v2-card-race-when');
    expect(quando).toHaveTextContent(/^25 nov, por registar$/);
    expect(screen.getByRole('button', { name: 'Registar a prova' })).toBeInTheDocument();
    expect(screen.getByText('Marcar como concluída').closest('[hidden]')).not.toBeNull();
    expect(screen.queryByText('Concluída')).toBeNull();
  });

  it('marcada como concluída: sem «Registar a prova» nem «por registar»', () => {
    card({ ...RACE, status: 'concluida' });
    expect(screen.queryByRole('button', { name: 'Registar a prova' })).toBeNull();
    expect(screen.getByTestId('race-agenda-v2')).not.toHaveTextContent('por registar');
  });
});

describe('A prontidão: uma só fonte e uma só frase', () => {
  it('a frase única', () => {
    expect(readinessTextV2({ calibrating: true })).toBe('Prontidão a calibrar');
    expect(readinessTextV2(null)).toBe('Prontidão a calibrar');
    expect(readinessTextV2({ level: 'high', score: 72 })).toBe('Prontidão alta, 72%');
    expect(readinessTextV2({ level: 'medium', score: 55.4 })).toBe('Prontidão média, 55%');
    expect(readinessTextV2({ level: 'low', score: 20 })).toBe('Prontidão baixa, 20%');
  });

  it('o treino de hoje (o que o Geral sempre usou): sem plano em vigor, undefined', () => {
    expect(trainingTodayOf([], [])).toBeUndefined();
    const hoje = inDays(0);
    const plans = [{ id: 'p', status: 'aceite', period_start: inDays(-2), period_end: inDays(5) }];
    expect(trainingTodayOf(plans, [{ plan_id: 'p', kind: 'corrida', planned_date: hoje, status: 'pendente' }], hoje)).toBe(true);
    expect(trainingTodayOf(plans, [{ plan_id: 'p', kind: 'corrida', planned_date: inDays(1), status: 'pendente' }], hoje)).toBe(false);
  });
});
