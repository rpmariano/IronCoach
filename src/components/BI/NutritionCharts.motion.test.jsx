import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* F5 (2026-10-04): os gráficos de nutrição passam as props certas ao Chart.js
   — animação reduced-aware nas barras, sem chave `animation` na linha,
   data/options/plugins estáveis entre renders e updateMode="period". */
const barProps = [];
const lineProps = [];
vi.mock('react-chartjs-2', () => ({
  Bar: (props) => { barProps.push(props); return <canvas data-testid="bar" />; },
  Line: (props) => { lineProps.push(props); return <canvas data-testid="line" />; },
}));

import MacroComplianceChart from './MacroComplianceChart';
import EnergyAvailabilityChart from './EnergyAvailabilityChart';

const macros = [1, 2, 3, 4, 5].map((i) => ({
  date: `2026-10-0${i}`, protein: 100 + i, carbs: 250, fat: 70,
  proteinTarget: 150, carbsTarget: 300, fatTarget: 80,
}));
const ea = [1, 2, 3].map((i) => ({ date: `2026-10-0${i}`, ea: 20 + i * 10, status: 'optimal' }));

function mockMatchMedia(reduce) {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: reduce, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
}

describe('gráficos de nutrição — movimento', () => {
  beforeEach(() => { barProps.length = 0; lineProps.length = 0; });
  afterEach(() => { delete window.matchMedia; });

  it('adesão às macros: com reduced-motion a animação é false', () => {
    mockMatchMedia(true);
    render(<MacroComplianceChart dailyData={macros} />);
    expect(barProps.at(-1).options.animation).toBe(false);
  });

  it('adesão às macros: barras crescem e usam a transição curta', () => {
    mockMatchMedia(false);
    render(<MacroComplianceChart dailyData={macros} />);
    const p = barProps.at(-1);
    expect(typeof p.options.animation.delay).toBe('function');
    expect(p.updateMode).toBe('period');
  });

  it('adesão às macros: data, options e plugins estáveis entre renders', () => {
    mockMatchMedia(false);
    const { rerender } = render(<MacroComplianceChart dailyData={macros} />);
    const a = barProps.at(-1);
    rerender(<MacroComplianceChart dailyData={macros} />);
    const b = barProps.at(-1);
    expect(b.data).toBe(a.data);
    expect(b.options).toBe(a.options);
    expect(b.plugins).toBe(a.plugins);
  });

  it('EA: sem chave animation (vale o padrão global), period e referências estáveis', () => {
    mockMatchMedia(false);
    const { rerender } = render(<EnergyAvailabilityChart dailyData={ea} />);
    const a = lineProps.at(-1);
    expect('animation' in a.options).toBe(false);
    expect(a.updateMode).toBe('period');
    rerender(<EnergyAvailabilityChart dailyData={ea} />);
    const b = lineProps.at(-1);
    expect(b.data).toBe(a.data);
    expect(b.options).toBe(a.options);
    expect(b.plugins).toBe(a.plugins);
  });
});
