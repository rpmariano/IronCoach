import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({ calls: [] }));
vi.mock('react-chartjs-2', () => ({ Line: (props) => { h.calls.push(props); return <div data-testid="c-line" />; } }));

import CrossMetricsChart from './CrossMetricsChart';

/* Pedido do Rui (2026-11-01): o Peso vs. VDOT não tinha datas nem escala, e as curvas pareciam
   a mesma régua. */
const left = { label: 'Peso (kg)', unit: 'kg', color: '#ff5fa8', data: [{ x: '2026-09-08', y: 80 }, { x: '2026-11-01', y: 76.5 }] };
const right = { label: 'VDOT', unit: '', color: '#2ee0ff', data: [{ x: '2026-09-08', y: 30 }, { x: '2026-11-01', y: 28 }] };

describe('CrossMetricsChart — datas, escalas e período', () => {
  it('as datas do primeiro e do último ponto nos cantos; o período e a nota das escalas por baixo', () => {
    render(<CrossMetricsChart title="Eficiência Aeróbica vs. Peso" leftData={left} rightData={right} period="Todo o histórico · 8 set – 1 nov" />);
    const axis = screen.getByTestId('chart-frame-axis');
    expect(axis).toHaveTextContent('8 set');
    expect(axis).toHaveTextContent('1 nov');
    expect(screen.getByTestId('cross-chart-period')).toHaveTextContent('Todo o histórico · 8 set – 1 nov');
    expect(screen.getByText('Escalas independentes: Peso (kg) à esquerda, VDOT à direita.')).toBeInTheDocument();
  });

  it('cada eixo y mostra a escala na cor da sua série; o ano entra quando a série atravessa anos', () => {
    h.calls.length = 0;
    render(<CrossMetricsChart title="x" leftData={{ ...left, data: [{ x: '2025-12-20', y: 80 }, { x: '2026-01-10', y: 79 }] }} rightData={right} />);
    const { scales } = h.calls.at(-1).options;
    expect(scales.yLeft.ticks).toMatchObject({ display: true, color: '#ff5fa8' });
    expect(scales.yRight.ticks).toMatchObject({ display: true, color: '#2ee0ff' });
    expect(scales.yLeft.ticks.callback(76.5)).toBe('76,5');
    expect(screen.getByTestId('chart-frame-axis')).toHaveTextContent('20 dez 2025');
    expect(screen.queryByTestId('cross-chart-period')).not.toBeInTheDocument();
  });
});
