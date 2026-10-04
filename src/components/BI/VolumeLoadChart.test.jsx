import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* F5 (2026-10-04): o gráfico de volume-carga passa as props certas ao Chart.js
   — animação reduced-aware, data/options estáveis entre renders (cada
   referência nova faz chart.update()) e updateMode="period". */
const barProps = [];
vi.mock('react-chartjs-2', () => ({
  Bar: (props) => { barProps.push(props); return <canvas data-testid="bar" />; },
}));

import VolumeLoadChart from './VolumeLoadChart';

const weekly = [1, 2, 3, 4, 5].map((i) => ({ weekLabel: `S${i}`, volumeLoad: i * 1000 }));

function mockMatchMedia(reduce) {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: reduce, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
}

describe('VolumeLoadChart — movimento', () => {
  beforeEach(() => { barProps.length = 0; });
  afterEach(() => { delete window.matchMedia; });

  it('com reduced-motion a animação é false', () => {
    mockMatchMedia(true);
    render(<VolumeLoadChart weeklyData={weekly} />);
    expect(barProps.at(-1).options.animation).toBe(false);
  });

  it('sem reduced-motion as barras crescem e a atualização usa a transição curta', () => {
    mockMatchMedia(false);
    render(<VolumeLoadChart weeklyData={weekly} />);
    const p = barProps.at(-1);
    expect(p.options.animation).toBeTruthy();
    expect(typeof p.options.animation.delay).toBe('function');
    expect(p.updateMode).toBe('period');
  });

  it('data, options e plugins mantêm a referência entre renders', () => {
    mockMatchMedia(false);
    const { rerender } = render(<VolumeLoadChart weeklyData={weekly} />);
    const first = barProps.at(-1);
    rerender(<VolumeLoadChart weeklyData={weekly} />);
    const second = barProps.at(-1);
    expect(second.data).toBe(first.data);
    expect(second.options).toBe(first.options);
    expect(second.plugins).toBe(first.plugins);
  });
});
