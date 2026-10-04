import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

/* C3 (2026-10-04): o cartão "Composição corporal" só conta avaliações com
   gordura medida e só desenha com ≥2. */

vi.mock('react-chartjs-2', () => ({ Line: () => <div data-testid="chart-line" /> }));

import StackedAreaChart from './StackedAreaChart';
import { computeCompositionTrend } from '@formulas/compositionTrend.ts';

describe('StackedAreaChart — C3', () => {
  it('com 2 avaliações válidas desenha, com total, delta e legenda em vírgula', () => {
    render(<StackedAreaChart data={computeCompositionTrend([
      { date: '2026-08-01', weight_kg: 80, body_fat_pct: 20 },
      { date: '2026-10-01', weight_kg: 78, body_fat_pct: 19 },
    ])} />);
    expect(screen.getByTestId('chart-line')).toBeInTheDocument();
    expect(screen.getByText('2 avaliações')).toBeInTheDocument();
    expect(screen.getByTestId('chart-frame-value')).toHaveTextContent('78,0');
    expect(screen.getByText('−0,8 kg de massa magra')).toBeInTheDocument();
    expect(screen.getByText('Massa gorda 14,8 kg')).toBeInTheDocument();
  });

  it('com 1 avaliação: "1 avaliação", sem gráfico, diz o que falta', () => {
    render(<StackedAreaChart data={{ dates: ['2026-08-01'], fatMassKg: [16], leanMassKg: [64] }} />);
    expect(screen.queryByTestId('chart-line')).not.toBeInTheDocument();
    expect(screen.getByText('1 avaliação')).toBeInTheDocument();
    expect(screen.getByText(/Preciso de 2 avaliações com gordura medida/)).toBeInTheDocument();
  });

  it('`emptyText` substitui o rodapé quando não há evolução (períodos fechados)', () => {
    render(<StackedAreaChart
      data={{ dates: ['2026-09-20'], fatMassKg: [15.4], leanMassKg: [61.6] }}
      hint="1 avaliação com gordura medida"
      emptyText="Só houve 1 avaliação com gordura medida em setembro — a evolução precisa de 2."
    />);
    expect(screen.getByText('1 avaliação com gordura medida')).toBeInTheDocument();
    expect(screen.getByText('Só houve 1 avaliação com gordura medida em setembro — a evolução precisa de 2.')).toBeInTheDocument();
    expect(screen.queryByText(/Preciso de 2/)).not.toBeInTheDocument();
  });

  it('pontos sem gordura (0 ou NaN) que cheguem de outra origem não contam', () => {
    render(<StackedAreaChart data={{
      dates: ['2026-08-01', '2026-09-01', '2026-10-01'],
      fatMassKg: [16, 0, NaN],
      leanMassKg: [64, 78, NaN],
    }} />);
    expect(screen.getByText('1 avaliação')).toBeInTheDocument();
    expect(screen.queryByText(/Massa gorda 0,0/)).not.toBeInTheDocument();
    expect(screen.queryByText(/de massa magra/)).not.toBeInTheDocument();
  });
});

/* Eixo temporal real (2026-10-04, fase 5 do Corpo): os pontos levam x = dia,
   e o eixo pode ir do 1.º ao último dia do período. */
describe('StackedAreaChart — eixo temporal', () => {
  it('pontos espaçados pelas datas e eixo do período', async () => {
    const calls = [];
    vi.resetModules();
    vi.doMock('react-chartjs-2', () => ({ Line: (p) => { calls.push(p); return <div data-testid="chart-line" />; } }));
    const { default: Chart } = await import('./StackedAreaChart');
    render(<Chart start="2026-07-01" end="2026-09-30" data={{
      dates: ['2026-07-05', '2026-07-12', '2026-09-20'],
      fatMassKg: [16, 15.8, 15],
      leanMassKg: [64, 64.1, 64.5],
    }} />);
    const { data, options } = calls.at(-1);
    const xs = data.datasets[0].data.map((p) => p.x);
    expect([xs[1] - xs[0], xs[2] - xs[1]]).toEqual([7, 70]);
    expect(options.scales.x.type).toBe('linear');
    expect(options.scales.x.max - options.scales.x.min).toBe(91);
    vi.doUnmock('react-chartjs-2');
  });
});
