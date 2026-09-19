import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import { weekDone, weekDoneLine } from './weekDone';
import WeekDoneRibbon from './WeekDoneRibbon';

/* A semana cumprida: a semana do PLANO (a do "semana N de M"), todos os
   treinos dela concluídos, pelo menos dois. CAROL.md: uma frase. */

const plan = { id: 'p1', status: 'aceite', period_start: '2026-09-14', period_end: '2026-10-11' };
const item = (id, planned_date, o = {}) => ({ id, plan_id: 'p1', planned_date, kind: 'corrida', status: 'concluido', ...o });

describe('weekDone', () => {
  it('a semana 1 com os três treinos feitos: cumprida', () => {
    const items = [item('a', '2026-09-14'), item('b', '2026-09-16', { kind: 'ginasio' }), item('c', '2026-09-18'), item('r', '2026-09-15', { kind: 'descanso', status: 'pendente' })];
    const d = weekDone({ plans: [plan], planItems: items, today: '2026-09-19' });
    expect(d).toMatchObject({ week: 1, count: 3, weekStart: '2026-09-14' });
    expect(d.days.map((x) => x.state)).toEqual(['done', 'rest', 'done', 'rest', 'done', 'rest', 'rest']);
    expect(d.days[5]).toMatchObject({ dateISO: '2026-09-19', isToday: true, initial: 'S' });
  });

  it('um treino por fazer: ainda não', () => {
    const items = [item('a', '2026-09-14'), item('b', '2026-09-18', { status: 'pendente' })];
    expect(weekDone({ plans: [plan], planItems: items, today: '2026-09-19' })).toBeNull();
  });

  it('os cancelados não contam, mas um treino sozinho não faz semana', () => {
    const items = [item('a', '2026-09-14'), item('b', '2026-09-18', { status: 'cancelado' })];
    expect(weekDone({ plans: [plan], planItems: items, today: '2026-09-19' })).toBeNull();
  });

  it('conta pela semana do plano, não do calendário; e pelo dia em que foi feito', () => {
    // Semana 2 do plano: 21 a 27. O treino de dia 20 feito a 21 conta na semana 2.
    const items = [item('a', '2026-09-20', { actual_date: '2026-09-21' }), item('b', '2026-09-23'), item('c', '2026-09-14')];
    const d = weekDone({ plans: [plan], planItems: items, today: '2026-09-24' });
    expect(d).toMatchObject({ week: 2, count: 2, weekStart: '2026-09-21' });
  });

  it('um plano só proposto não conta', () => {
    const items = [item('a', '2026-09-14'), item('b', '2026-09-16')];
    expect(weekDone({ plans: [{ ...plan, status: 'proposto' }], planItems: items, today: '2026-09-19' })).toBeNull();
  });
});

describe('weekDoneLine', () => {
  it('uma frase, o número por extenso, sem exclamação', () => {
    expect(weekDoneLine({ week: 6, count: 5 })).toBe('Semana 6 cumprida. Cinco treinos, cinco feitos.');
    expect(weekDoneLine({ week: 2, count: 12 })).toBe('Semana 2 cumprida. 12 treinos, 12 feitos.');
  });
});

describe('WeekDoneRibbon', () => {
  const done = weekDone({ plans: [plan], planItems: [item('a', '2026-09-14'), item('b', '2026-09-16')], today: '2026-09-19' });
  beforeEach(() => {
    window.localStorage.clear();
    useAppStore.setState({ session: { user: { id: 'u1' } }, profile: { id: 'u1' } });
  });

  it('a primeira vez é o momento; da segunda, fica só lá', () => {
    const { unmount } = render(<WeekDoneRibbon done={done} />);
    expect(screen.getByTestId('week-done')).toHaveAttribute('data-celebrate', 'true');
    expect(screen.getByText('Semana 1 cumprida. Dois treinos, dois feitos.')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Os sete dias da semana 1' }).querySelectorAll('li')).toHaveLength(7);
    unmount();
    render(<WeekDoneRibbon done={done} />);
    expect(screen.getByTestId('week-done')).not.toHaveAttribute('data-celebrate');
  });
});
