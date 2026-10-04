import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* F5 (2026-10-04): o gráfico de volume-carga passa as props certas ao Chart.js
   — animação reduced-aware, data/options estáveis entre renders (cada
   referência nova faz chart.update()) e updateMode="period". */
const barProps = [];
vi.mock('react-chartjs-2', () => ({
  Bar: (props) => { barProps.push(props); return <canvas data-testid="bar" />; },
}));

import VolumeLoadChart, { weeklyVolumeSummary } from './VolumeLoadChart';

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

/* G3/G4 (2026-10-04): semanas de calendário com zeros, a semana em curso fora
   da média e do delta, o número grande é a última semana FECHADA. */
const semana = (weekLabel, volumeLoad, extra = {}) => ({ weekLabel, volumeLoad, ...extra });
const SEMANAS = [
  semana('31 ago', 0), semana('7 set', 4000), semana('14 set', 0), semana('21 set', 6000),
  semana('28 set', 2000, { inProgress: true }),
];

describe('weeklyVolumeSummary (G3/G4)', () => {
  it('o número grande é a última semana FECHADA, não a em curso', () => {
    const r = weeklyVolumeSummary(SEMANAS);
    expect(r.last).toMatchObject({ weekLabel: '21 set', volumeLoad: 6000 });
    expect(r.hasInProgress).toBe(true);
  });

  it('o delta é contra a semana fechada imediatamente anterior (mesmo que seja zero)', () => {
    expect(weeklyVolumeSummary(SEMANAS).delta).toEqual({ diff: 6000, prevLabel: '14 set' });
  });

  it('uma semana vazia no fim é um 0 e não a última semana com treino (G3)', () => {
    const r = weeklyVolumeSummary([semana('14 set', 5000), semana('21 set', 0), semana('28 set', 800, { inProgress: true })]);
    expect(r.last).toMatchObject({ weekLabel: '21 set', volumeLoad: 0 });
    expect(r.delta).toEqual({ diff: -5000, prevLabel: '14 set' });
  });

  it('a média de 4 semanas é das 4 últimas fechadas, com zeros, e sem a em curso', () => {
    const r = weeklyVolumeSummary([
      semana('24 ago', 9999), semana('31 ago', 0), semana('7 set', 4000), semana('14 set', 0), semana('21 set', 6000),
      semana('28 set', 9999, { inProgress: true }),
    ]);
    expect(r.avg4w).toBe((0 + 4000 + 0 + 6000) / 4);
  });

  it('com menos de 4 semanas fechadas não há média', () => {
    expect(weeklyVolumeSummary([semana('14 set', 1), semana('21 set', 2), semana('28 set', 3, { inProgress: true })]).avg4w).toBeNull();
  });

  it('a semana parcial (antes do 1.º registo) não entra na média nem no delta', () => {
    const r = weeklyVolumeSummary([semana('7 set', 3000, { partial: true }), semana('14 set', 4000)]);
    expect(r.last).toMatchObject({ weekLabel: '14 set' });
    expect(r.delta).toBeNull();
    expect(r.avg4w).toBeNull();
    const so = weeklyVolumeSummary([semana('14 set', 4000, { partial: true })]);
    expect(so.last).toMatchObject({ weekLabel: '14 set' });
    expect(so.delta).toBeNull();
  });

  it('sem nenhuma semana fechada não há número, nem delta, nem média', () => {
    const r = weeklyVolumeSummary([semana('28 set', 2000, { inProgress: true })]);
    expect(r).toMatchObject({ last: null, delta: null, avg4w: null });
  });
});

describe('VolumeLoadChart — texto (G3/G4, D5)', () => {
  beforeEach(() => { barProps.length = 0; mockMatchMedia(false); });
  afterEach(() => { delete window.matchMedia; });

  it('o número grande diz de que semana é e o delta de qual', () => {
    render(<VolumeLoadChart weeklyData={SEMANAS} hint="semanas seg–dom" />);
    expect(screen.getByText('kg · semana de 21 set')).toBeInTheDocument();
    expect(screen.getByTestId('chart-frame-delta')).toHaveTextContent(/▲ 6\s000 kg face a 14 set/);
    expect(screen.getByText(/Semana em curso \(fora da média\)/)).toBeInTheDocument();
    expect(screen.getByText('semanas seg–dom')).toBeInTheDocument();
  });

  it('com 4 semanas fechadas a legenda traz a média, e as semanas vazias contam 0 kg', () => {
    const fechadas = [semana('31 ago', 0), semana('7 set', 4000), semana('14 set', 0), semana('21 set', 6000)];
    render(<VolumeLoadChart weeklyData={fechadas} />);
    expect(screen.getByText(/Média 4 semanas fechadas · 2\s500 kg/)).toBeInTheDocument();
    expect(screen.getByTestId('volume-notas')).toHaveTextContent('As semanas sem treino contam 0 kg.');
  });

  it('as barras: zeros explícitos nos dados; a semana em curso só em contorno', () => {
    render(<VolumeLoadChart weeklyData={SEMANAS} />);
    const { data } = barProps.at(-1);
    expect(data.datasets[0].data).toEqual([0, 4000, 0, 6000, 2000]);
    expect(data.datasets[0].borderWidth).toEqual([0, 0, 0, 0, 1.5]);
    expect(data.datasets[0].backgroundColor[4]).toBe('rgba(158, 195, 210, 0.12)');
  });

  it('o tooltip marca a semana em curso', () => {
    render(<VolumeLoadChart weeklyData={SEMANAS} />);
    const { callbacks } = barProps.at(-1).options.plugins.tooltip;
    expect(callbacks.title([{ dataIndex: 4 }])).toBe('Semana de 28 set · em curso');
    expect(callbacks.title([{ dataIndex: 3 }])).toBe('Semana de 21 set');
    expect(callbacks.label({ raw: 6000 })).toMatch(/6\s000 kg/);
  });

  it('sem semana fechada: "—" e não um número de outra semana', () => {
    render(<VolumeLoadChart weeklyData={[semana('28 set', 2000, { inProgress: true })]} />);
    expect(screen.getByText('ainda sem semana fechada')).toBeInTheDocument();
  });

  it('o ACWR do ginásio saiu do ecrã (D5)', () => {
    const { container } = render(<VolumeLoadChart weeklyData={SEMANAS} />);
    expect(container.textContent).not.toMatch(/ACWR/);
  });
});
