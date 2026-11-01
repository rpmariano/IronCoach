import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import ExplainChartButton, { buildChartExplainText, seriesSummary } from './ExplainChartButton';
import ChartFrame from './ChartFrame';

/* «Pedir à Carol que explique» (pedido do Rui, 2026-11-01): cada gráfico leva o atleta à Carol com
   o pedido feito e o contexto do gráfico (nome, período, séries, unidades, números). */

describe('buildChartExplainText', () => {
  it('nome, período, cada série com unidade, início/fim/mín./máx. e tendência', () => {
    const t = buildChartExplainText({
      title: 'Eficiência Aeróbica vs. Peso',
      period: 'Todo o histórico · 6 set – 27 out',
      series: [
        { label: 'Peso (kg)', unit: 'kg', values: [80, 79.2, 78.4, 76.5], decimals: 1 },
        { label: 'VDOT', values: [37.2, null, 38.1, 39.4], decimals: 1 },
      ],
      note: 'As duas curvas têm escalas independentes.',
    });
    expect(t).toBe('Explica-me a leitura do gráfico «Eficiência Aeróbica vs. Peso» (Todo o histórico · 6 set – 27 out). '
      + 'Peso (kg): de 80,0 para 76,5 kg, mín. 76,5, máx. 80,0 — a descer (4 pontos); '
      + 'VDOT: de 37,2 para 39,4, mín. 37,2, máx. 39,4 — a subir (3 pontos). As duas curvas têm escalas independentes.');
  });

  it('format por série (o ritmo), um só ponto, e séries vazias ficam de fora', () => {
    const t = buildChartExplainText({
      title: 'X',
      series: [
        { label: 'Ritmo', values: [330], format: (v) => `${Math.floor(v / 60)}.${String(v % 60).padStart(2, '0')}/km` },
        { label: 'Nada', values: [null] },
      ],
    });
    expect(t).toBe('Explica-me a leitura do gráfico «X». Ritmo: 5.30/km (um só ponto).');
  });

  it('seriesSummary: estável quando quase não mexe', () => {
    expect(seriesSummary([100, 150, 101]).trend).toBe('estável');
    expect(seriesSummary([])).toBeNull();
  });
});

describe('ExplainChartButton', () => {
  beforeEach(() => {
    useAppStore.setState({ setCoachIntent: vi.fn(), setActiveTab: vi.fn(() => true) });
  });

  it('abre o chat da Carol com o pedido feito (coachIntent say)', () => {
    render(<ExplainChartButton explain={{ title: 'Volume-carga semanal', series: [{ label: 'Volume-carga', unit: 'kg', values: [5000, 6000], decimals: 0 }] }} />);
    const btn = screen.getByRole('button', { name: 'Pedir à Carol que explique o gráfico «Volume-carga semanal»' });
    expect(btn).toHaveTextContent('Pedir à Carol que explique');
    expect(btn.className).toContain('min-h-[44px]');
    fireEvent.click(btn);
    const { setCoachIntent, setActiveTab } = useAppStore.getState();
    expect(setCoachIntent).toHaveBeenCalledWith({ kind: 'say', text: expect.stringContaining('«Volume-carga semanal»') });
    expect(setCoachIntent.mock.calls[0][0].text).toMatch(/de 5\s000 para 6\s000 kg/);
    expect(setActiveTab).toHaveBeenCalledWith('coach');
  });

  it('com a saída travada (alterações por gravar), o pedido desfaz-se', () => {
    useAppStore.setState({ setActiveTab: vi.fn(() => false) });
    render(<ExplainChartButton explain={{ title: 'A', series: [] }} />);
    fireEvent.click(screen.getByTestId('explain-chart'));
    expect(useAppStore.getState().setCoachIntent).toHaveBeenLastCalledWith(null);
  });

  it('o ChartFrame mostra-o só com `explain`', () => {
    const { rerender } = render(<ChartFrame label="Sem" value="1" height={0} />);
    expect(screen.queryByTestId('explain-chart')).toBeNull();
    rerender(<ChartFrame label="Com" value="1" height={0} explain={{ title: 'Com', series: [] }} />);
    expect(screen.getByTestId('explain-chart')).toBeInTheDocument();
  });
});
