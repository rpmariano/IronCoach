import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ calls: [] }));
vi.mock('react-chartjs-2', () => ({
  Scatter: (props) => { h.calls.push(props); return <div data-testid="c-scatter" />; },
  Line: (props) => { h.calls.push(props); return <div data-testid="c-line" />; },
}));
vi.mock('../../store', () => ({ useAppStore: (sel) => sel({}), sliceReady: () => true }));

const { default: ScatterTrendChart, trendLine } = await import('./ScatterTrendChart');
const { default: RacePredictionChart } = await import('./RacePredictionChart');

/* Pedido do Rui (2026-11-01): «estes dois gráficos parecem faltar informação para conseguir
   interpretar decentemente». */

const SESSOES = [
  { date: '2026-10-05', paceSecondsPerKm: 390, avgHR: 128, label: 'Rodagem' },
  { date: '2026-10-12', paceSecondsPerKm: 345, avgHR: 150, label: 'Tempo' },
  { date: '2026-10-28', paceSecondsPerKm: 293, avgHR: 165, label: 'Prova' },
  { date: '2026-10-20', paceSecondsPerKm: 331, avgHR: 147, label: 'Rodagem' },
];

describe('Eficiência aeróbica (dispersão ritmo × FC)', () => {
  beforeEach(() => { h.calls.length = 0; });

  it('a FC tem escala no eixo y; cada sessão tem data no tooltip; a mais recente destaca-se e nomeia-se', () => {
    render(<ScatterTrendChart data={SESSOES} scope="em outubro" />);
    const { data, options } = h.calls.at(-1);
    expect(options.scales.y.ticks.display).toBe(true);
    expect(options.scales.y.ticks.callback(147.6)).toBe('148');
    const sessions = data.datasets[0];
    // Ordenadas por data: a última é 28 out — maior, cheia, contorno branco.
    expect(sessions.pointRadius.at(-1)).toBeGreaterThan(sessions.pointRadius[0]);
    expect(sessions.borderColor.at(-1)).toBe('#ffffff');
    const title = options.plugins.tooltip.callbacks.title([{ raw: sessions.data[1] }]);
    expect(title).toBe('12 out 2026');
    expect(screen.getByTestId('chart-frame-legend')).toHaveTextContent('Última · 28 out');
  });

  it('a direção «melhor» está escrita, e a linha de tendência entra a partir de 3 sessões', () => {
    render(<ScatterTrendChart data={SESSOES} />);
    expect(screen.getByTestId('scatter-better')).toHaveTextContent('Melhor ↘: mais rápido (para a direita) com a FC mais baixa (para baixo).');
    const { data, options } = h.calls.at(-1);
    expect(data.datasets).toHaveLength(2);
    expect(data.datasets[1]).toMatchObject({ label: 'Tendência', showLine: true });
    expect(options.plugins.tooltip.filter({ datasetIndex: 1 })).toBe(false);
    expect(screen.getByTestId('chart-frame-legend')).toHaveTextContent('Tendência');
  });

  it('trendLine: mínimos quadrados entre o ritmo mais lento e o mais rápido; nada com menos de 3', () => {
    const pts = [{ paceSecondsPerKm: 300, avgHR: 160 }, { paceSecondsPerKm: 330, avgHR: 150 }, { paceSecondsPerKm: 360, avgHR: 140 }];
    expect(trendLine(pts)).toEqual([{ x: 360, y: 140 }, { x: 300, y: 160 }]);
    expect(trendLine(pts.slice(0, 2))).toBeNull();
    expect(trendLine([{ paceSecondsPerKm: 300, avgHR: 150 }, { paceSecondsPerKm: 300, avgHR: 160 }, { paceSecondsPerKm: 300, avgHR: 170 }])).toBeNull();
  });
});

describe('Previsão de prova (VDOT)', () => {
  beforeEach(() => { h.calls.length = 0; });
  const VDOT = [
    { date: '2026-09-12', vdot: 39.2 },
    { date: '2026-10-25', vdot: 41.1 },
    { date: '2026-11-01', vdot: 28.0 },
  ];
  const PREV = { predictedSeconds: 6588, confidence: 0.4, raceName: 'Meia dos Descobrimentos', basedOn: { distance: 10.12, time: 2969, date: '2026-10-25' } };

  it('o eixo x tem as datas (não o mínimo e o máximo do VDOT); o VDOT tem escala no eixo y', () => {
    render(<RacePredictionChart vdotTrend={VDOT} prediction={PREV} />);
    const axis = screen.getByTestId('chart-frame-axis');
    expect(axis).toHaveTextContent('12 set');
    expect(axis).toHaveTextContent('1 nov');
    expect(axis).not.toHaveTextContent('28,0');
    const { options } = h.calls.at(-1);
    expect(options.scales.y.ticks.display).toBe(true);
  });

  it('a legenda já não tem «Previsão da prova» (não há série âmbar); diz que a previsão vem do melhor ritmo', () => {
    render(<RacePredictionChart vdotTrend={VDOT} prediction={PREV} />);
    const legend = screen.getByTestId('chart-frame-legend');
    expect(legend).not.toHaveTextContent('Previsão da prova');
    expect(legend).toHaveTextContent('VDOT · último 28,0');
    expect(screen.getByTestId('race-prediction-fonte')).toHaveTextContent('A previsão vem do teu melhor ritmo, não da linha do VDOT');
  });
});
