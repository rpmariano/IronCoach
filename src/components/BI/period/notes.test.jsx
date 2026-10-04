import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TodayExcludedNote from './TodayExcludedNote';
import MinDataNote, { minDataText } from './MinDataNote';
import DeltaVsPrevious, { deltaDirection, deltaColor } from './DeltaVsPrevious';
import { calendarPeriod } from '@formulas/calendarPeriod.ts';

describe('TodayExcludedNote (R2)', () => {
  it('texto do mock-up com Dia', () => {
    render(<TodayExcludedNote />);
    expect(screen.getByText('Hoje ainda não acabou, por isso não entra nas contas. Para veres o dia de hoje, toca em Dia.')).toBeInTheDocument();
  });

  it('sem Dia fica só a 1.ª frase; texto próprio ganha', () => {
    const { rerender } = render(<TodayExcludedNote hasDayView={false} />);
    expect(screen.getByTestId('today-excluded-note')).toHaveTextContent(/^Hoje ainda não acabou, por isso não entra nas contas\.$/);
    rerender(<TodayExcludedNote text="Uma pesagem de hoje já conta." />);
    expect(screen.getByText('Uma pesagem de hoje já conta.')).toBeInTheDocument();
  });

  it('só aparece num período em curso', () => {
    const { rerender, container } = render(<TodayExcludedNote period={calendarPeriod('mes', '2026-10-04', -1)} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<TodayExcludedNote period={calendarPeriod('mes', '2026-10-04', 0)} />);
    expect(screen.getByTestId('today-excluded-note')).toBeInTheDocument();
  });
});

describe('MinDataNote (R6)', () => {
  it('frase do mock-up a partir das peças', () => {
    render(<MinDataNote what="Comer para treinar" min={7} kind="mes" />);
    expect(screen.getByText('Comer para treinar aparece a partir de 7 dias fechados neste mês.')).toBeInTheDocument();
  });

  it('trimestre, singular e unidade própria', () => {
    expect(minDataText({ what: 'Comer para treinar', min: 14, kind: 'trimestre' })).toBe('Comer para treinar aparece a partir de 14 dias fechados neste trimestre.');
    expect(minDataText({ what: 'A tendência', min: 1, kind: 'semana' })).toBe('A tendência aparece a partir de 1 dia fechado nesta semana.');
    expect(minDataText({ what: 'O ritmo', min: 3, one: 'corrida com tempo', many: 'corridas com tempo', scope: 'no período' }))
      .toBe('O ritmo aparece a partir de 3 corridas com tempo no período.');
  });

  it('texto livre e nada sem texto', () => {
    const msg = 'Calorias por dia da semana: preciso de pelo menos 4 registos de cada dia da semana para mostrar este padrão.';
    const { rerender, container } = render(<MinDataNote text={msg} />);
    expect(screen.getByText(msg)).toBeInTheDocument();
    expect(screen.getByTestId('min-data-note').style.border).toContain('dashed');
    rerender(<MinDataNote />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('DeltaVsPrevious (R5)', () => {
  it('forma "anterior por extenso", subida boa a verde (mock-up setembro)', () => {
    render(<DeltaVsPrevious current={50} previous={38} previousLabel="agosto" previousText="11 de 29 (38%)" />);
    const el = screen.getByTestId('delta-vs-previous');
    expect(el).toHaveAttribute('data-direction', 'up');
    expect(el.style.color).toBe('var(--ok)');
    expect(el).toHaveTextContent('▲ agosto: 11 de 29 (38%)');
    expect(screen.getByText('Subiu face a agosto, que teve 11 de 29 (38%)')).toHaveClass('sr-only');
  });

  it('forma "diferença", descida má a coral (mock-up semana: ▼ 1 face a 21 – 26 set)', () => {
    render(<DeltaVsPrevious current={2} previous={3} previousLabel="21 – 26 set" />);
    const el = screen.getByTestId('delta-vs-previous');
    expect(el).toHaveTextContent('▼ 1 face a 21 – 26 set');
    expect(el.style.color).toBe('var(--warn)');
  });

  it('unidade, decimais com vírgula e better="down"', () => {
    render(<DeltaVsPrevious current={72.1} previous={73.4} decimals={1} unit="kg" previousLabel="setembro" better="down" />);
    const el = screen.getByTestId('delta-vs-previous');
    expect(el).toHaveTextContent('▼ 1,3 kg face a setembro');
    expect(el.style.color).toBe('var(--ok)');
    expect(screen.getByText('Desceu 1,3 kg face a setembro')).toBeInTheDocument();
  });

  it('better="none" fica cinzento; igual diz "igual a"', () => {
    const { rerender } = render(<DeltaVsPrevious current={2310} previous={2220} unit="kcal" previousLabel="21 – 26 set" better="none" />);
    expect(screen.getByTestId('delta-vs-previous')).toHaveTextContent('▲ 90 kcal face a 21 – 26 set');
    expect(screen.getByTestId('delta-vs-previous').style.color).toBe('var(--text-4)');
    rerender(<DeltaVsPrevious current={5.2} previous={5} previousLabel="agosto" />);
    expect(screen.getByTestId('delta-vs-previous')).toHaveTextContent('= igual a agosto');
    expect(screen.getByTestId('delta-vs-previous').style.color).toBe('var(--text-4)');
  });

  it('sem anterior não desenha nada', () => {
    const { container, rerender } = render(<DeltaVsPrevious current={5} previous={null} previousLabel="agosto" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<DeltaVsPrevious current={5} previous={3} previousLabel="agosto" hasPrevious={false} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<DeltaVsPrevious current={5} previous={3} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('direction forçada e funções puras', () => {
    render(<DeltaVsPrevious current={14} previous={11} direction="down" previousLabel="agosto" previousText="11 de 29" />);
    expect(screen.getByTestId('delta-vs-previous')).toHaveTextContent('▼ agosto: 11 de 29');
    expect(deltaDirection(1, 1.4)).toBe('flat');
    expect(deltaDirection(1, 1.6)).toBe('down');
    expect(deltaDirection(NaN, 1)).toBeNull();
    expect(deltaColor('up', 'down')).toBe('var(--warn)');
    expect(deltaColor('flat', 'up')).toBe('var(--text-4)');
  });
});
