import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ACWRChart (2026-10-04, fase 5 — R1): o número grande é o do KPI (acwr), a
   semana em curso é uma barra às riscas e fora das contas, os limiares são os
   de acwr.ts (`>`), e a zona segura só se desenha com rácio com dados. */

const h = vi.hoisted(() => ({ calls: [] }));

vi.mock('../../store', () => ({ useAppStore: (sel) => sel({}), sliceReady: () => true }));
vi.mock('react-chartjs-2', () => ({ Chart: (props) => { h.calls.push(props); return <div data-testid="c-chart" />; } }));

import ACWRChart, { fmtRatio } from './ACWRChart';

const semana = (over = {}) => ({ weekLabel: '21 set', acuteLoad: 20, chronicLoad: 20, ratio: 1, zone: 'safe', hasEnoughData: true, inProgress: false, ...over });
const kpi = (over = {}) => ({ ratio: 1.12, status: 'safe', hasEnoughData: true, acuteKm: 22.4, chronicWeeklyKm: 20, historyWeeks: 4, ...over });
const frameValue = () => within(screen.getByTestId('chart-frame')).getByTestId('chart-frame-value');

beforeEach(() => { h.calls.length = 0; });

describe('R1 — o número grande é o do KPI', () => {
  it('mostra o rácio e o estado do KPI, não o da última semana do gráfico', () => {
    render(<ACWRChart acwr={kpi()} weeklyData={[semana({ ratio: 0.5, zone: 'undertrained' }), semana({ weekLabel: '28 set', ratio: null, inProgress: true, zone: null, hasEnoughData: false })]} />);
    expect(frameValue()).toHaveTextContent('1,12');
    expect(screen.getByTestId('chart-frame-delta')).toHaveTextContent('Ideal');
    expect(screen.getByTestId('chart-frame')).toHaveTextContent('últimas 12 semanas');
    expect(screen.getByTestId('chart-frame-unit')).toHaveTextContent('7 d vs 28 d');
  });

  it('sem histórico: "—" e quantas semanas faltam, sem zona segura', () => {
    render(<ACWRChart acwr={kpi({ hasEnoughData: false, ratio: 0, status: 'unknown', historyWeeks: 1 })} weeklyData={[semana({ ratio: null, hasEnoughData: false, zone: null, acuteLoad: 5 })]} />);
    expect(frameValue()).toHaveTextContent('—');
    expect(screen.getByTestId('chart-frame-delta')).toHaveTextContent('Faltam 2 sem.');
    expect(screen.getByTestId('chart-frame')).not.toHaveTextContent('Zona segura');
    expect(h.calls.at(-1).options.plugins.backgroundBands.enabled).toBe(false);
  });

  it('com rácio nas semanas, a zona segura aparece na legenda e as bandas ligam-se', () => {
    render(<ACWRChart acwr={kpi()} weeklyData={[semana()]} />);
    expect(screen.getByTestId('chart-frame')).toHaveTextContent('Zona segura 0,8–1,3');
    expect(h.calls.at(-1).options.plugins.backgroundBands.enabled).toBe(true);
  });

  it('explica de que são o número e as barras', () => {
    render(<ACWRChart acwr={kpi()} weeklyData={[semana()]} />);
    expect(screen.getByTestId('acwr-explicacao')).toHaveTextContent('22,4 km nos últimos 7 dias contra a média semanal de 20,0 km dos últimos 28');
  });

  it('o estado de perigo e atenção seguem o KPI', () => {
    const { unmount } = render(<ACWRChart acwr={kpi({ ratio: 1.62, status: 'danger' })} weeklyData={[semana()]} />);
    expect(screen.getByTestId('chart-frame-delta')).toHaveTextContent('Perigo');
    unmount();
    render(<ACWRChart acwr={kpi({ ratio: 1.38, status: 'caution' })} weeklyData={[semana()]} />);
    expect(screen.getByTestId('chart-frame-delta')).toHaveTextContent('Atenção');
  });
});

describe('a semana em curso', () => {
  const dados = [semana(), semana({ weekLabel: '28 set', acuteLoad: 8, ratio: null, zone: null, hasEnoughData: false, inProgress: true })];

  it('é uma barra às riscas, sem rácio, e a legenda diz que está fora das contas', () => {
    render(<ACWRChart acwr={kpi()} weeklyData={dados} />);
    const { data } = h.calls.at(-1);
    expect(data.datasets[0].data).toEqual([1, null]);
    const cor = data.datasets[1].backgroundColor;
    expect(typeof cor).toBe('function');
    expect(cor({ dataIndex: 0, chart: {} })).toBe('#2ee0ff');
    // sem tela (jsdom) cai para o ciano suave, mas é diferente da barra fechada
    expect(cor({ dataIndex: 1, chart: { ctx: {} } })).not.toBe('#2ee0ff');
    expect(data.datasets[1].borderWidth({ dataIndex: 1 })).toBeGreaterThan(0);
    expect(data.datasets[1].borderWidth({ dataIndex: 0 })).toBe(0);
    expect(screen.getByTestId('chart-frame')).toHaveTextContent('Semana em curso (fora das contas)');
  });

  it('o tooltip diz "em curso, fora das contas"', () => {
    render(<ACWRChart acwr={kpi()} weeklyData={dados} />);
    const { options } = h.calls.at(-1);
    expect(options.plugins.tooltip.callbacks.title([{ dataIndex: 1 }])).toBe('Semana de 28 set · em curso, fora das contas');
    expect(options.plugins.tooltip.callbacks.title([{ dataIndex: 0 }])).toBe('Semana de 21 set');
  });

  it('semanas antes do 1.º registo (carga null) não são barras a zero', () => {
    render(<ACWRChart acwr={kpi()} weeklyData={[semana({ acuteLoad: null, ratio: null }), semana()]} />);
    expect(h.calls.at(-1).data.datasets[1].data).toEqual([null, 20]);
  });
});

describe('limiares de acwr.ts (uso sem `acwr`, pela última semana fechada)', () => {
  it('1,30 é "Ideal" (`>` e não `>=`) e 1,31 já é "Atenção"', () => {
    const ideal = render(<ACWRChart weeklyData={[semana({ ratio: 1.3 })]} />);
    expect(screen.getByTestId('chart-frame')).toHaveTextContent('Ideal');
    ideal.unmount();
    render(<ACWRChart weeklyData={[semana({ ratio: 1.31 })]} />);
    expect(screen.getByTestId('chart-frame')).toHaveTextContent('Atenção');
  });

  it('1,50 é "Atenção" e 1,51 é "Perigo"', () => {
    const a = render(<ACWRChart weeklyData={[semana({ ratio: 1.5 })]} />);
    expect(screen.getByTestId('chart-frame')).toHaveTextContent('Atenção');
    a.unmount();
    render(<ACWRChart weeklyData={[semana({ ratio: 1.51 })]} />);
    expect(screen.getByTestId('chart-frame')).toHaveTextContent('Perigo');
  });
});

describe('fmtRatio', () => {
  it('duas casas, vírgula decimal; três quando o arredondamento cairia em cima de um limiar que o estado desmente', () => {
    expect(fmtRatio(1.123)).toBe('1,12');
    expect(fmtRatio(1.5)).toBe('1,50');
    expect(fmtRatio(1.5004)).toBe('1,500');
    expect(fmtRatio(1.2999)).toBe('1,300');
    expect(fmtRatio(NaN)).toBe('—');
  });
});
