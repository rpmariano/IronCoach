import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import EarlyPeriodState from './EarlyPeriodState';
import { earlyVerdict, whereOf } from './periodText';
import { calendarPeriod } from '@formulas/calendarPeriod.ts';

const cal = (kind, today, title) => ({ kind, period: calendarPeriod(kind, today, 0), label: { title } });

describe('EarlyPeriodState — a começar (mock-up SemanaInicio)', () => {
  it('título, frase, botões e resumo do anterior', () => {
    const onViewToday = vi.fn();
    const onViewPrevious = vi.fn();
    render(
      <EarlyPeriodState
        state="a_comecar"
        kind="semana"
        text="Os dias contam quando acabarem — hoje já vais em 640 kcal."
        onViewToday={onViewToday}
        onViewPrevious={onViewPrevious}
        previousSummary="Semana passada (28 set – 4 out): 2 300 kcal/dia · calorias e proteína no objetivo em 2 de 7 dias"
      />,
    );
    expect(screen.getByRole('heading', { name: 'A semana começou hoje' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'A semana começou hoje' })).toBeInTheDocument();
    expect(screen.getByText('Os dias contam quando acabarem — hoje já vais em 640 kcal.')).toBeInTheDocument();
    const today = screen.getByRole('button', { name: 'Ver hoje' });
    const prev = screen.getByRole('button', { name: 'Ver semana passada' });
    expect(today.style.minHeight).toBe('var(--tap)');
    expect(prev.style.minHeight).toBe('var(--tap)');
    expect(today.style.color).toBe('var(--nutrition)');
    fireEvent.click(today);
    fireEvent.click(prev);
    expect(onViewToday).toHaveBeenCalledTimes(1);
    expect(onViewPrevious).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('early-previous-summary')).toHaveTextContent('Semana passada (28 set – 4 out): 2 300 kcal/dia');
  });

  it('sem Dia (Corrida/Ginásio) não há "Ver hoje"; títulos por período e cor do módulo', () => {
    const { rerender } = render(<EarlyPeriodState state="a_comecar" kind="mes" module="corrida" onViewPrevious={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Ver hoje' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'O mês começou hoje' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver mês passado' })).toBeInTheDocument();
    expect(screen.getByText('Os dias contam quando acabarem.')).toBeInTheDocument();
    rerender(<EarlyPeriodState state="a_comecar" kind="trimestre" module="ginasio" onViewToday={() => {}} onViewPrevious={() => {}} />);
    expect(screen.getByRole('heading', { name: 'O trimestre começou hoje' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver trimestre passado' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver hoje' }).style.color).toBe('var(--gym)');
  });

  it('state="ok" não desenha nada', () => {
    const { container } = render(<EarlyPeriodState state="ok" kind="semana" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('EarlyPeriodState — cedo (mock-up MesOutubro / TrimestreOutDez)', () => {
  it('mês em curso com 3 dias fechados: diz o nome do mês, traço neutro', () => {
    render(<EarlyPeriodState state="cedo" cal={cal('mes', '2026-10-04', 'outubro 2026')} />);
    const line = screen.getByTestId('early-cedo');
    expect(line).toHaveAttribute('data-tone', 'neutral');
    expect(line).toHaveTextContent('Só 3 dias fechados em outubro — ainda é cedo para conclusões.');
  });

  it('trimestre em curso: "neste trimestre"', () => {
    render(<EarlyPeriodState state="cedo" cal={cal('trimestre', '2026-10-04', 'out – dez 2026')} />);
    expect(screen.getByText('Só 3 dias fechados neste trimestre — ainda é cedo para conclusões.')).toBeInTheDocument();
  });

  it('sem cal nunca escreve "Só 0 dias"', () => {
    render(<EarlyPeriodState state="cedo" kind="mes" />);
    expect(screen.getByText('Ainda é cedo para conclusões.')).toBeInTheDocument();
  });

  it('earlyVerdict: singular, sessões e semana', () => {
    expect(earlyVerdict(cal('semana', '2026-09-29', 'Esta semana')).text).toBe('Só 1 dia fechado nesta semana — ainda é cedo para conclusões.');
    expect(earlyVerdict(cal('mes', '2026-10-04', 'outubro 2026'), { count: 2, one: 'sessão de força', many: 'sessões de força' }))
      .toEqual({ text: 'Só 2 sessões de força em outubro — ainda é cedo para conclusões.', tone: 'neutral' });
  });

  it('whereOf em períodos passados diz o nome', () => {
    expect(whereOf('semana', 'Semana passada', false)).toBe('na semana passada');
    expect(whereOf('trimestre', 'jul – set 2026', false)).toBe('em jul – set 2026');
    expect(whereOf('ano', '2026', true)).toBe('neste ano');
  });
});
