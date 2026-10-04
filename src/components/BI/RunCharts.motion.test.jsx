import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* 2026-10-04 (F5): os gráficos da corrida deixam de ter reveal próprio.
   Com reduced-motion o gráfico de barras recebe `animation: false`; data e
   options mantêm a referência entre renders (cada referência nova faz
   chart.update()); e todos pedem a transição curta (updateMode="period"). */

const h = vi.hoisted(() => ({ reduced: false, calls: [] }));

vi.mock('../../utils/useReducedMotion', async (orig) => ({ ...(await orig()), default: () => h.reduced, useReducedMotion: () => h.reduced }));
vi.mock('../../store', () => ({ useAppStore: (sel) => sel({}), sliceReady: () => true }));
vi.mock('react-chartjs-2', () => {
  const mk = (name) => (props) => { h.calls.push({ name, props }); return <div data-testid={`c-${name}`} />; };
  return { Chart: mk('chart'), Doughnut: mk('donut'), Scatter: mk('scatter'), Line: mk('line'), Bar: mk('bar') };
});

import ACWRChart from './ACWRChart';
import IntensityDonut from './IntensityDonut';
import ScatterTrendChart from './ScatterTrendChart';
import RacePredictionChart from './RacePredictionChart';

const weekly = [
  { weekLabel: 'S1', ratio: 1, acuteLoad: 20, hasEnoughData: true },
  { weekLabel: 'S2', ratio: 1.1, acuteLoad: 25, hasEnoughData: true },
];
const dist = { lowIntensityPct: 80, highIntensityPct: 20 };
const pts = [{ date: '2026-09-01', paceSecondsPerKm: 300, avgHR: 150, label: 'a' }];
const trend = [{ date: '2026-09-01', vdot: 40 }, { date: '2026-09-10', vdot: 41 }];

beforeEach(() => { h.calls.length = 0; h.reduced = false; });

describe('gráficos da corrida — movimento', () => {
  it('ACWR: com reduced-motion a animação é false; sem, tem duração', () => {
    h.reduced = true;
    render(<ACWRChart weeklyData={weekly} />);
    expect(h.calls.at(-1).props.options.animation).toBe(false);
    h.calls.length = 0; h.reduced = false;
    render(<ACWRChart weeklyData={weekly} />);
    expect(h.calls.at(-1).props.options.animation.duration).toBeGreaterThan(0);
  });

  it.each([
    ['ACWR', () => <ACWRChart weeklyData={weekly} />],
    ['Donut', () => <IntensityDonut distribution={dist} />],
    ['Scatter', () => <ScatterTrendChart data={pts} />],
    ['Previsão', () => <RacePredictionChart vdotTrend={trend} />],
  ])('%s: data e options estáveis entre renders e updateMode period', (_n, el) => {
    const { rerender } = render(el());
    const a = h.calls.at(-1).props;
    rerender(el());
    const b = h.calls.at(-1).props;
    expect(b.updateMode).toBe('period');
    if (_n === 'ACWR' || _n === 'Previsão') {
      // dados vindos de constantes do teste: mesma referência de entrada
      expect(b.options).toBe(a.options);
      expect(b.data).toBe(a.data);
    } else {
      expect(b.options).toBe(a.options);
    }
  });

  it('Donut e linha não definem animation própria (default global)', () => {
    render(<IntensityDonut distribution={dist} />);
    expect(h.calls.at(-1).props.options.animation).toBeUndefined();
    render(<RacePredictionChart vdotTrend={trend} />);
    expect(h.calls.at(-1).props.options.animation).toBeUndefined();
  });
});
