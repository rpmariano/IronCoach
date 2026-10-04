import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PeriodNavigator from './PeriodNavigator';

const label = { title: 'Esta semana', range: '28 set – 4 out', status: 'em curso' };

describe('PeriodNavigator', () => {
  it('mostra título e a linha intervalo · estado', () => {
    render(<PeriodNavigator kind="semana" label={label} />);
    expect(screen.getByText('Esta semana')).toBeInTheDocument();
    expect(screen.getByText('28 set – 4 out · em curso')).toBeInTheDocument();
  });

  it('mock-up: mês em curso mostra só a cobertura, com "em curso" uma única vez', () => {
    const { container } = render(<PeriodNavigator kind="mes" label={{ title: 'outubro 2026', range: '1 – 31 out', status: 'em curso', coverage: 'em curso · 3 de 31 dias fechados' }} />);
    expect(screen.getByText('em curso · 3 de 31 dias fechados')).toBeInTheDocument();
    expect(container.textContent.match(/em curso/g)).toHaveLength(1);
  });

  it('mock-up: mês fechado e trimestre com "desde"', () => {
    const { rerender } = render(<PeriodNavigator kind="mes" label={{ title: 'setembro 2026', range: '1 – 30 set', coverage: '28 de 30 dias com registo' }} />);
    expect(screen.getByText('28 de 30 dias com registo')).toBeInTheDocument();
    rerender(<PeriodNavigator kind="trimestre" label={{ title: 'Jul – Set 2026', range: 'jul – set', coverage: 'desde 13 jul · 72 de 80 dias com registo' }} />);
    expect(screen.getByText('desde 13 jul · 72 de 80 dias com registo')).toBeInTheDocument();
    expect(screen.queryByText('jul – set')).toBeNull();
  });

  it('semana em curso: só «intervalo · em curso» (o progresso do calendário não entra; mock-up)', () => {
    const { container } = render(<PeriodNavigator kind="semana" label={{ ...label, coverage: 'em curso · 6 de 7 dias fechados' }} />);
    expect(screen.getByText('28 set – 4 out · em curso')).toBeInTheDocument();
    expect(container.textContent.match(/em curso/g)).toHaveLength(1);
    expect(container.textContent).not.toMatch(/fechados/);
  });

  it('semana a começar (segunda): «5 – 11 out · em curso», sem «ainda sem dias fechados»', () => {
    const { container } = render(<PeriodNavigator kind="semana" label={{ title: 'Esta semana', range: '5 – 11 out', status: 'em curso', coverage: 'em curso · ainda sem dias fechados' }} />);
    expect(screen.getByText('5 – 11 out · em curso')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/ainda sem dias fechados/);
  });

  it('semana com «desde» (1.º registo a meio): intervalo · desde … · em curso', () => {
    const { container } = render(<PeriodNavigator kind="semana" label={{ ...label, coverage: 'desde 1 out · em curso · 3 dias fechados' }} />);
    expect(screen.getByText('28 set – 4 out · desde 1 out · em curso')).toBeInTheDocument();
    expect(container.textContent.match(/em curso/g)).toHaveLength(1);
  });

  it('semana do Corpo: «em curso · 2 avaliações» (cobertura que não é o calendário)', () => {
    render(<PeriodNavigator kind="semana" label={{ ...label, coverage: 'em curso · 2 avaliações' }} />);
    expect(screen.getByText('28 set – 4 out · em curso · 2 avaliações')).toBeInTheDocument();
  });

  it('semana passada com cobertura sem estado: intervalo · cobertura', () => {
    render(<PeriodNavigator kind="semana" label={{ title: 'Semana passada', range: '21 – 27 set', coverage: '5 de 7 dias com registo' }} />);
    expect(screen.getByText('21 – 27 set · 5 de 7 dias com registo')).toBeInTheDocument();
  });

  it('semana sem cobertura: continua "intervalo · estado"', () => {
    render(<PeriodNavigator kind="semana" label={label} />);
    expect(screen.getByText('28 set – 4 out · em curso')).toBeInTheDocument();
  });

  it('dia: intervalo · estado, sem cobertura', () => {
    render(<PeriodNavigator kind="dia" label={{ title: 'Hoje', range: '4 out', status: 'em curso', coverage: 'qualquer' }} />);
    expect(screen.getByText('4 out · em curso')).toBeInTheDocument();
  });

  it('mês sem cobertura recua para intervalo · estado', () => {
    render(<PeriodNavigator kind="mes" label={{ title: 'outubro 2026', range: '1 – 31 out', status: 'em curso' }} />);
    expect(screen.getByText('1 – 31 out · em curso')).toBeInTheDocument();
  });

  it('rótulos das setas seguem a unidade', () => {
    const { rerender } = render(<PeriodNavigator kind="semana" label={label} canGoNext />);
    expect(screen.getByRole('button', { name: 'Semana anterior' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semana seguinte' })).toBeInTheDocument();
    rerender(<PeriodNavigator kind="mes" label={label} canGoNext />);
    expect(screen.getByRole('button', { name: 'Mês anterior' })).toBeInTheDocument();
    rerender(<PeriodNavigator kind="trimestre" label={label} canGoNext />);
    expect(screen.getByRole('button', { name: 'Trimestre anterior' })).toBeInTheDocument();
  });

  it('› fica desativado no período atual e não dispara', () => {
    const onNext = vi.fn();
    render(<PeriodNavigator kind="semana" label={label} canGoNext={false} onNext={onNext} />);
    const next = screen.getByRole('button', { name: 'Semana seguinte' });
    expect(next).toBeDisabled();
    expect(next).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(next);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('setas ativas chamam os callbacks; alvos de 44 px; título em aria-live', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(<PeriodNavigator kind="semana" label={label} canGoNext onPrev={onPrev} onNext={onNext} />);
    const prev = screen.getByRole('button', { name: 'Semana anterior' });
    fireEvent.click(prev);
    fireEvent.click(screen.getByRole('button', { name: 'Semana seguinte' }));
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(prev.style.width).toBe('44px');
    expect(prev.style.height).toBe('44px');
    expect(screen.getByTestId('period-title').parentElement).toHaveAttribute('aria-live', 'polite');
  });

  it('marca o módulo', () => {
    render(<PeriodNavigator kind="mes" label={label} module="corrida" />);
    expect(screen.getByTestId('period-navigator')).toHaveAttribute('data-module', 'corrida');
  });
});
