import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* 2026-10-04 (F5): os gráficos do Corpo/Geral deixam de ter reveal próprio.
   As linhas não definem `animation` (vale o default global, que o chartSetup
   põe a false com reduced-motion); `data` e `options` mantêm a referência entre
   renders (cada referência nova faz chart.update()); todos pedem a transição
   curta (updateMode="period"). RaceReadinessCard e PillarSummaryCard: estado
   zero ao armar, valor ao revelar, nada de movimento com reduced-motion. */

const h = vi.hoisted(() => ({ calls: [], reveal: {} }));

vi.mock('../../store', async (orig) => ({ ...(await orig()), useAppStore: Object.assign((sel) => sel({ dataPending: false }), { getState: () => ({}) }) }));
vi.mock('react-chartjs-2', () => ({
  Line: (props) => { h.calls.push(props); return <div data-testid="c-line" />; },
}));
vi.mock('../../utils/useRevealAnimation', () => ({
  useRevealAnimation: () => h.reveal,
}));
vi.mock('../../utils/biEngine', () => ({
  calculateReadinessIndex: () => ({
    score: 80, level: 'high',
    pillars: [{ key: 'acwr', label: 'Carga', score: 60, hasData: true, desc: 'x' }, { key: 'ea', label: 'Energia', score: 0, hasData: false, desc: 'y' }],
  }),
}));
vi.mock('../../utils/racePlanEngine', () => ({ calculateRaceTrainingPlan: () => null }));
vi.mock('../../utils/homeModels', () => ({ buildTrailModel: () => null }));

import StackedAreaChart from './StackedAreaChart';
import CrossMetricsChart from './CrossMetricsChart';
import RaceReadinessCard from './RaceReadinessCard';
import PillarSummaryCard from './PillarSummaryCard';

const comp = { dates: ['2026-08-01', '2026-10-01'], fatMassKg: [16, 15], leanMassKg: [64, 64.5] };
const left = { label: 'Peso', data: [{ x: 'a', y: 80 }, { x: 'b', y: 79 }], color: '#f0f', unit: 'kg' };
const right = { label: 'VDOT', data: [{ x: 'a', y: 40 }, { x: 'b', y: 41 }], color: '#0ff', unit: '' };

beforeEach(() => {
  h.calls.length = 0;
  h.reveal = {};
});

describe('gráficos de linha do Corpo e do Geral — movimento', () => {
  it.each([
    ['Composição', () => <StackedAreaChart data={comp} />],
    ['Cruzada', () => <CrossMetricsChart title="t" leftData={left} rightData={right} />],
  ])('%s: data e options estáveis entre renders, updateMode period, sem animation própria', (_n, el) => {
    const { rerender } = render(el());
    const a = h.calls.at(-1);
    rerender(el());
    const b = h.calls.at(-1);
    expect(b.updateMode).toBe('period');
    expect(b.options).toBe(a.options);
    expect(b.data).toBe(a.data);
    expect(b.options.animation).toBeUndefined();
  });

  it('dados novos mudam a referência (e só então)', () => {
    const { rerender } = render(<StackedAreaChart data={comp} />);
    const a = h.calls.at(-1);
    rerender(<StackedAreaChart data={{ ...comp, leanMassKg: [64, 65] }} />);
    expect(h.calls.at(-1).data).not.toBe(a.data);
  });
});

describe('RaceReadinessCard — anel e pilares', () => {
  const card = () => (
    <RaceReadinessCard runs={[]} meals={[]} bodyAssessments={[]} gymSessions={[]} raceEvents={[]} profile={{}} />
  );
  const ring = () => document.querySelector('circle[stroke-dashoffset]');
  const circumference = 2 * Math.PI * 36;
  const bar = () => document.querySelector('.h-1 > div');

  it('armado: anel e barras a zero e % a 0 (valor real só para o leitor de ecrã)', () => {
    h.reveal = { active: true, reduced: false, seen: true, armed: true, playKey: 1, animate: false, style: undefined };
    render(card());
    expect(Number(ring().getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference);
    expect(bar().style.transform).toBe('scaleX(0)');
    expect(screen.getAllByText('0%').length).toBeGreaterThanOrEqual(2);
    expect(document.querySelector('.sr-only').textContent).toBe('80%');
  });

  it('antes do 1.º reveal esconde com opacity (nunca visibility)', () => {
    h.reveal = { active: true, reduced: false, seen: false, armed: false, playKey: 0, animate: false, style: { opacity: 0 } };
    render(card());
    const wrap = ring().closest('div.relative');
    expect(wrap.style.opacity).toBe('0');
    expect(wrap.style.visibility).toBe('');
  });

  it('revelado: desenha no rAF seguinte (não no mesmo render) e com transição', async () => {
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => { h.rafCb = cb; return 1; });
    h.reveal = { active: true, reduced: false, seen: false, armed: false, playKey: 0, animate: false, style: { opacity: 0 } };
    const { rerender } = render(card());
    h.reveal = { active: true, reduced: false, seen: true, armed: false, playKey: 1, animate: true, style: undefined };
    rerender(card());
    // aparece primeiro em zero, sem transição…
    expect(Number(ring().getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference);
    // …e só no rAF liga o valor, com transição
    await act(async () => { h.rafCb?.(0); });
    expect(Number(ring().getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference * 0.2);
    expect(ring().style.transition).toMatch(/stroke-dashoffset 800ms/);
    expect(bar().style.transform).toBe('scaleX(0.6)');
    raf.mockRestore();
  });

  it('reduced-motion: valor final já, sem transição nenhuma', () => {
    h.reveal = { active: false, reduced: true, seen: true, armed: false, playKey: 0, animate: false, style: undefined };
    render(card());
    expect(Number(ring().getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference * 0.2);
    expect(ring().style.transition).toBe('none');
    expect(bar().style.transition).toBe('none');
    expect(bar().style.transform).toBe('scaleX(0.6)');
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('fora do carrossel (modo antigo, sem `active`): como era, valor final e % visíveis', () => {
    h.reveal = { playKey: 0, animate: false, style: { opacity: 0 } };
    render(card());
    expect(Number(ring().getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference * 0.2);
    expect(ring().closest('div.relative').style.opacity).toBe('');
    expect(screen.getByText('80%')).toBeInTheDocument();
  });
});

describe('PillarSummaryCard — contagem do KPI', () => {
  it('armado mostra o zero com as mesmas casas e o sufixo; o valor real fica para o leitor de ecrã', () => {
    h.reveal = { active: true, reduced: false, seen: true, armed: true, playKey: 1, animate: false };
    render(<PillarSummaryCard title="Corrida" kpi="32,4" kpiUnit="km" />);
    expect(screen.getByText('0,0')).toBeInTheDocument();
    expect(document.querySelector('.sr-only').textContent).toBe('32,4');
  });

  it.each([['85%', '0%'], ['1,2k', '0,0k'], ['74']].map(([kpi, zero]) => [kpi, zero ?? '0']))(
    'KPI %s: zero armado %s', (kpi, zero) => {
      h.reveal = { active: true, reduced: false, seen: false, armed: false, playKey: 0, animate: false };
      render(<PillarSummaryCard title="X" kpi={kpi} />);
      expect(screen.getByText(zero)).toBeInTheDocument();
    });

  it.each([['5 dias', '0 dias'], ['1 850', '0'], ['1 850 kcal', '0 kcal']])(
    'KPI %s: o espaço separa milhares ou o sufixo — zero armado %s (2026-10-04)', (kpi, zero) => {
      h.reveal = { active: true, reduced: false, seen: true, armed: true, playKey: 1, animate: false };
      render(<PillarSummaryCard title="X" kpi={kpi} />);
      const hidden = [...document.querySelectorAll('span[aria-hidden="true"]')].map((e) => e.textContent);
      expect(hidden).toContain(zero);
      expect(document.querySelector('.sr-only').textContent).toBe(kpi);
    });

  it('KPI de tempo ("5:41") não conta nem fica a zero (2026-10-04)', () => {
    h.reveal = { active: true, reduced: false, seen: true, armed: true, playKey: 1, animate: false };
    render(<PillarSummaryCard title="X" kpi="5:41" />);
    expect(screen.getByText('5:41')).toBeInTheDocument();
    expect(screen.queryByText('0:41')).not.toBeInTheDocument();
  });

  it('KPI que não é número ("—") não conta nem fica a zero', () => {
    h.reveal = { active: true, reduced: false, seen: true, armed: true, playKey: 1, animate: false };
    render(<PillarSummaryCard title="X" kpi="—" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('revelado sem animar (ou reduced-motion): o texto exato que o ecrã passou', () => {
    h.reveal = { active: false, reduced: true, seen: true, armed: false, playKey: 0, animate: false };
    render(<PillarSummaryCard title="X" kpi="1,2k" />);
    expect(screen.getByText('1,2k')).toBeInTheDocument();
  });

  it('a animar conta a partir de zero e acaba no valor', async () => {
    let t = 0;
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => { h.rafCb = cb; return 1; });
    h.reveal = { active: true, reduced: false, seen: true, armed: false, playKey: 1, animate: true };
    render(<PillarSummaryCard title="X" kpi="32,4" />);
    expect(screen.getByText('0,0')).toBeInTheDocument(); // 1.º frame: zero
    await act(async () => { h.rafCb(t); });
    await act(async () => { t += 2000; h.rafCb(t); });
    expect(screen.getByText('32,4')).toBeInTheDocument();
    raf.mockRestore();
  });
});
