import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// "Hoje" fixo: domingo 4 out 2026 (o dia do mock-up). O motor de períodos é o real.
vi.mock('../../../utils/useTodayISO', () => ({ useTodayISO: () => '2026-10-04' }));

import PeriodHeader, { PeriodNav } from './PeriodHeader';
import PeriodSummary from './PeriodSummary';
import { NUTRICAO, GINASIO } from '../TimeFilterBar';
import { usePeriodStore } from '../../../store/periodStore';
import { useCalendarPeriod } from '../../../utils/useCalendarPeriod';

describe('PeriodHeader', () => {
  beforeEach(() => act(() => usePeriodStore.getState().reset()));

  it('mostra as opções do separador e o navegador da semana em curso (mock-up Main)', () => {
    render(<PeriodHeader tab="nutricao" options={NUTRICAO} />);
    const group = screen.getByRole('group', { name: 'Período' });
    expect(group).toBeInTheDocument();
    ['Dia', 'Semana', 'Mês', 'Trimestre'].forEach((l) => expect(screen.getByRole('button', { name: l })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '6 Meses' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Esta semana')).toBeInTheDocument();
    expect(screen.getByText('28 set – 4 out · em curso')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semana seguinte' })).toBeDisabled();
  });

  it('Ginásio não tem Dia', () => {
    render(<PeriodHeader tab="ginasio" options={GINASIO} />);
    expect(screen.queryByRole('button', { name: 'Dia' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mês' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('mudar de granularidade escreve no store do separador e avisa quem chama', () => {
    const onKindChange = vi.fn();
    render(<PeriodHeader tab="nutricao" options={NUTRICAO} onKindChange={onKindChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mês' }));
    expect(usePeriodStore.getState().tabs.nutricao).toEqual({ kind: 'mes', offset: 0 });
    expect(onKindChange).toHaveBeenCalledWith('mes');
    expect(screen.getByText('outubro 2026')).toBeInTheDocument();
    // os outros separadores não mexem
    expect(usePeriodStore.getState().tabs.corrida.kind).toBe('mes');
    expect(usePeriodStore.getState().tabs.ginasio.offset).toBe(0);
  });

  it('‹ recua; num período passado aparece "Voltar a este mês" e repõe o atual', () => {
    act(() => usePeriodStore.getState().setKind('nutricao', 'mes'));
    render(<PeriodHeader tab="nutricao" options={NUTRICAO} />);
    expect(screen.queryByRole('button', { name: 'Voltar a este mês' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(screen.getByText('setembro 2026')).toBeInTheDocument();
    const back = screen.getByRole('button', { name: 'Voltar a este mês' });
    expect(back.style.minHeight).toBe('var(--tap)');
    fireEvent.click(back);
    expect(usePeriodStore.getState().tabs.nutricao).toEqual({ kind: 'mes', offset: 0 });
    expect(screen.getByText('outubro 2026')).toBeInTheDocument();
  });

  it('"Voltar a esta semana" concorda em género', () => {
    act(() => usePeriodStore.getState().shift('nutricao', -1));
    render(<PeriodHeader tab="nutricao" options={NUTRICAO} />);
    expect(screen.getByText('Semana passada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar a esta semana' })).toBeInTheDocument();
  });

  it('navigator="none" deixa o navegador para o resumo (forma do mock-up), com o mesmo cal', () => {
    function Tab() {
      const cal = useCalendarPeriod('nutricao', { daysWithData: 6 });
      return (
        <>
          <PeriodHeader tab="nutricao" options={NUTRICAO} cal={cal} navigator="none" />
          <PeriodSummary navigator={<PeriodNav cal={cal} module="nutricao" />} rows={[]} />
        </>
      );
    }
    render(<Tab />);
    expect(screen.getAllByTestId('period-navigator')).toHaveLength(1);
    const summary = screen.getByRole('region', { name: 'Resumo do período' });
    expect(summary).toContainElement(screen.getByTestId('period-navigator'));
    fireEvent.click(screen.getByRole('button', { name: 'Trimestre' }));
    expect(screen.getByText('out – dez 2026')).toBeInTheDocument();
  });

  it('cor do módulo passa para o seletor', () => {
    render(<PeriodHeader tab="corrida" options={GINASIO} />);
    expect(screen.getByRole('button', { name: 'Mês' }).style.background).toBe('var(--run)');
  });
});
