import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Dashboard from './Dashboard';
import { getSettledIndex, getLastSettledIndex, resetSettledTab } from '../../utils/settledTab';

/* Teste de fumo dos separadores do Dashboard. Existe sobretudo para travar
   uma regressão concreta: a reestruturação de 2026-08-23 removeu o separador
   "Holística" e adicionou "Visão Geral" (hub). Se alguém voltar a adicionar
   um separador que importe ficheiros inexistentes, este teste falha antes do
   build de produção. */

const h = vi.hoisted(() => ({ scrollToTabs: [] }));

// O mock respeita o seletor (2026-10-04): os separadores e o Dashboard
// passaram a ler o store com seletores, e um mock que devolvia sempre o
// estado inteiro dava-lhes o objeto todo no lugar de um array.
vi.mock('../../store', () => {
  const state = {
    runs: [],
    gymSessions: [],
    meals: [],
    bodyAssessments: [],
    raceEvents: [],
    coachPlans: [],
    coachPlanItems: [],
    shoes: [],
    dailyCheckins: [],
    profile: { experience_level: 'medio' },
    insightStates: {},
    insightSnoozes: {},
    session: null,
    waterLogs: [],
    dataPending: false,
    loadedSlices: {},
    setActiveTab: vi.fn(() => true),
    setOpenCreationMode: vi.fn(),
    setNutritionDayFocus: vi.fn(),
  };
  const useAppStore = (sel) => (sel ? sel(state) : state);
  useAppStore.getState = () => state;
  useAppStore.setState = () => {};
  useAppStore.subscribe = () => () => {};
  return {
    useAppStore,
    sliceReady: (s) => !s.dataPending,
    EVOLUTION_TAB_SLICES: { hub: [], corrida: [], ginasio: [], nutricao: [], corpo: [] },
  };
});

// Os avisos da Carol têm testes próprios (BI/CoachInsightsDock.test.jsx) e
// leem do store o que este mock não tem — aqui testam-se os separadores.
vi.mock('../BI/CoachInsightsDock', () => ({ default: () => null }));

// O Geral real, mas a guardar o scrollToTab que recebe a cada render.
vi.mock('./OverviewDashboard', async (importOriginal) => {
  const actual = await importOriginal();
  const React = await import('react');
  return {
    default: (props) => {
      h.scrollToTabs.push(props.scrollToTab);
      return React.createElement(actual.default, props);
    },
  };
});

// O jsdom não tem canvas — sem isto os gráficos rebentavam ao montar.
vi.mock('react-chartjs-2', () => ({
  Bar: () => <div data-testid="chart-bar" />,
  Line: () => <div data-testid="chart-line" />,
  Doughnut: () => <div data-testid="chart-donut" />,
  Scatter: () => <div data-testid="chart-scatter" />,
  Chart: () => <div data-testid="chart-base" />,
}));

describe('Dashboard', () => {
  beforeEach(() => { resetSettledTab(); h.scrollToTabs.length = 0; });
  afterEach(() => { resetSettledTab(); vi.restoreAllMocks(); });

  it('mostra os cinco separadores: Visão Geral, Corrida, Ginásio, Nutrição, Corpo', () => {
    render(<Dashboard activeModule="corrida" />);
    // Usar getAllByText porque alguns labels aparecem tanto no tab como no PillarSummaryCard
    for (const label of ['Visão Geral', 'Corrida', 'Ginásio', 'Nutrição', 'Corpo']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('não mostra o separador Holística (foi removido)', () => {
    render(<Dashboard activeModule="hub" />);
    expect(screen.queryByText('Holística')).not.toBeInTheDocument();
  });

  it('monta cada módulo sem rebentar', () => {
    // Se um separador voltar a importar um ficheiro inexistente, isto falha
    // aqui em vez de só no build de produção.
    for (const mod of ['hub', 'corrida', 'ginasio', 'nutricao', 'corpo']) {
      const { unmount } = render(<Dashboard activeModule={mod} />);
      unmount();
    }
  });

  /* F5 (2026-10-04): o sinal de "separador assente" que os gráficos usam. */
  it('ao entrar, o separador pedido fica logo assente (sem esperar por scroll)', () => {
    render(<Dashboard activeModule="nutricao" />);
    expect(getSettledIndex()).toBe(3);
    expect(getLastSettledIndex()).toBe(3);
  });

  /* 2026-10-05 (A1): num Pixel o carrossel tem 379,43 px. O salto inicial
     ia para 4 × 379 = 1516 (offsetWidth arredondado); o snap corrigia para
     1517,72 e esse scroll desfazia o assentamento — o Corpo nunca aparecia. */
  it('o salto inicial usa a largura fracionária do carrossel (Pixel, 379,43 px)', () => {
    const proto = window.HTMLElement.prototype;
    const rectOrig = proto.getBoundingClientRect;
    const lefts = new WeakMap();
    const leftDesc = Object.getOwnPropertyDescriptor(window.Element.prototype, 'scrollLeft');
    proto.getBoundingClientRect = function rect() {
      if (this.classList?.contains('tab-swipe-carousel')) return { width: 379.43, height: 600, top: 0, left: 0, right: 379.43, bottom: 600 };
      return rectOrig.call(this);
    };
    Object.defineProperty(window.Element.prototype, 'scrollLeft', {
      configurable: true,
      get() { return lefts.get(this) || 0; },
      set(v) { lefts.set(this, v); },
    });
    try {
      const { container } = render(<Dashboard activeModule="corpo" />);
      const el = container.querySelector('.tab-swipe-carousel');
      expect(el.scrollLeft).toBeCloseTo(4 * 379.43, 5);
      expect(getSettledIndex()).toBe(4);
    } finally {
      proto.getBoundingClientRect = rectOrig;
      if (leftDesc) Object.defineProperty(window.Element.prototype, 'scrollLeft', leftDesc);
    }
  });

  it('"holistica" (localStorage antigo) abre o Geral em vez de um índice −1', () => {
    render(<Dashboard activeModule="holistica" />);
    expect(getSettledIndex()).toBe(0);
    // A SubNav marca o Geral como o separador atual.
    expect(screen.getByRole('button', { current: 'page' })).toHaveTextContent('Geral');
  });

  it('entrar não vibra (o salto inicial não passa pelo scrollTo do hook)', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    try {
      render(<Dashboard activeModule="ginasio" />);
      expect(vibrate).not.toHaveBeenCalled();
    } finally {
      delete navigator.vibrate;
    }
  });

  it('sair da Evolução esquece a página assente', () => {
    const { unmount } = render(<Dashboard activeModule="corpo" />);
    expect(getSettledIndex()).toBe(4);
    unmount();
    expect(getSettledIndex()).toBe(-1);
    expect(getLastSettledIndex()).toBe(-1);
  });

  it('o scrollToTab que o Geral recebe é estável entre trocas de separador (o memo vale)', () => {
    const { rerender } = render(<Dashboard activeModule="hub" />);
    rerender(<Dashboard activeModule="corrida" />);
    rerender(<Dashboard activeModule="nutricao" />);
    expect(h.scrollToTabs.length).toBeGreaterThan(0);
    expect(new Set(h.scrollToTabs).size).toBe(1);
  });
});
