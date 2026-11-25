import React from 'react';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/* A Evolução · Geral no Design v2 (direção C · Painel, 2026-11-25): secções planas, títulos em
   texto simples, os nomes dos pilares da prontidão inteiros (sem «Disponibilidade E…»), o âmbar só
   na contagem da prova e a mensagem da Carol na linha da Carol. Desligado, fica como era. */

vi.mock('../../utils/partialMealDays', () => ({
  partialMealDays: () => ({ profile: { kind: 'completo' }, isPartial: () => false }),
}));
vi.mock('react-chartjs-2', () => ({
  Bar: () => <div />, Line: () => <div />, Doughnut: () => <div />, Scatter: () => <div />, Chart: () => <div />,
}));
// O Geral aqui com os dois cartões de cima vazios (como no teste de sempre); os cartões reais
// testam-se abaixo, importados à parte.
vi.mock('../BI/SmartInsightsBanner', () => ({ default: () => null }));
vi.mock('../BI/RaceReadinessCard', () => ({ default: () => null }));

const PILLARS = [
  { key: 'acwr', label: 'Carga de Treino (ACWR)', score: 80, hasData: true, desc: 'Carga ok.' },
  { key: 'ea', label: 'Disponibilidade Energética', score: 60, hasData: true, desc: 'EA média.' },
  { key: 'tactic', label: 'Viabilidade Tática', score: 40, hasData: true, desc: 'Ritmo apertado.' },
  { key: 'vdot', label: 'Forma Aeróbica (VDOT)', score: 0, hasData: false, desc: '' },
];
const INSIGHTS = [
  { id: 'race_day_x', severity: 'info', title: 'Dia da Prova: Meia de Lisboa', message: 'Hoje é dia de prova. Parte com calma nos primeiros quilómetros e bebe nos abastecimentos.', module: 'corrida' },
];
vi.mock('../../utils/biEngine', async (orig) => ({
  ...(await orig()),
  calculateReadinessIndex: vi.fn(() => ({ score: 62, level: 'medium', pillars: PILLARS })),
  detectCoachInsights: vi.fn(() => INSIGHTS),
}));

import { useAppStore } from '../../store';
import { usePeriodStore } from '../../store/periodStore';
import { setDesignV2 } from '../../utils/designV2';
import { addDaysISO } from '../../lib/utils';
import OverviewDashboard from './OverviewDashboard';

const { default: RaceReadinessCard } = await vi.importActual('../BI/RaceReadinessCard');
const { default: SmartInsightsBanner, resetBannerShown } = await vi.importActual('../BI/SmartInsightsBanner');
const { default: PillarSummaryCard } = await vi.importActual('../BI/PillarSummaryCard');

const TODAY = '2026-10-10';
const ago = (n) => addDaysISO(TODAY, -n);
const corrida = (daysAgo, km = 5) => ({ id: `r${daysAgo}${km}`, date: ago(daysAgo), distance_km: km, duration_seconds: km * 330 });

function renderOverview(state = {}) {
  useAppStore.setState({
    runs: [corrida(1), corrida(20)], gymSessions: [], meals: [], bodyAssessments: [], raceEvents: [],
    coachPlans: [], coachPlanItems: [], shoes: [], profile: {}, goalHistory: [], dailyCheckins: [],
    insightStates: {}, insightSnoozes: {}, ...state,
  });
  return render(<OverviewDashboard scrollToTab={() => {}} />);
}

const race = { id: 'meia', date: addDaysISO(TODAY, 12), name: 'Meia de Lisboa', race_priority: 'a', distance_km: 21.1 };
const renderCard = () => render(
  <RaceReadinessCard runs={[]} meals={[]} bodyAssessments={[]} gymSessions={[]} raceEvents={[race]} profile={{}} onClickRace={() => {}} />,
);

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 10, 12, 0, 0));
  usePeriodStore.getState().reset();
  useAppStore.setState({ dailyCheckins: [], goalHistory: [], insightStates: {}, insightSnoozes: {} });
  resetBannerShown();
});
afterEach(() => {
  act(() => setDesignV2(false));
  vi.useRealTimers();
});

const on = () => act(() => setDesignV2(true));

describe('OverviewDashboard v2 — títulos em texto simples e secções planas', () => {
  it('os títulos das secções são .v2-label, sem as etiquetas em maiúsculas espaçadas', () => {
    on();
    const { container } = renderOverview();
    const titles = [...container.querySelectorAll('h3.v2-label')].map((h) => h.textContent);
    expect(titles).toEqual(expect.arrayContaining(['Visão Estratégica', 'Os 4 pilares']));
    expect(container.querySelector('.uppercase.tracking-widest')).toBeNull();
    expect(container.firstChild).toHaveClass('v2-geral');
  });

  it('o período e os pilares da semana são planos: sem vidro, sem sombra, sem pílulas', () => {
    on();
    const { container } = renderOverview();
    const period = screen.getByTestId('overview-period-v2');
    expect(period).toHaveClass('v2-geral-panel');
    expect(period.getAttribute('style')).toBeNull();
    const cards = screen.getAllByTestId('pillar-card-v2');
    expect(cards).toHaveLength(4);
    cards.forEach((c) => {
      expect(c).toHaveClass('v2-geral-panel');
      expect(c.className).not.toMatch(/backdrop-blur|shadow|rounded-2xl/);
    });
    expect(container.querySelector('.rounded-md')).toBeNull();
  });

  it('sem registos: a lista «O que falta para começar» plana, com o título simples', () => {
    on();
    useAppStore.setState({ runs: [] });
    renderOverview({ runs: [] });
    expect(screen.getByText('O que falta para começar', { selector: 'h3.v2-label' })).toBeInTheDocument();
    expect(screen.getByTestId('overview-checklist-v2')).toHaveClass('v2-geral-panel');
  });

  it('com o v2 desligado fica a marcação de sempre', () => {
    const { container } = renderOverview();
    expect(container.querySelector('h3.v2-label')).toBeNull();
    expect(screen.getByText('Visão Estratégica', { selector: 'p' })).toHaveClass('uppercase');
    expect(screen.queryByTestId('overview-period-v2')).toBeNull();
    expect(screen.queryByTestId('pillar-card-v2')).toBeNull();
    expect(container.firstChild).toHaveClass('space-y-4');
  });
});

describe('RaceReadinessCard v2 — o anel e os pilares', () => {
  it('os nomes dos pilares inteiros, sem truncate, e cada pilar é um botão', () => {
    on();
    const { container } = renderCard();
    const card = screen.getByTestId('readiness-v2');
    expect(card).toHaveClass('v2-geral-panel');
    expect(card.className).not.toMatch(/backdrop-blur|shadow|rounded-2xl/);
    expect(container.querySelector('.truncate')).toBeNull();
    for (const p of PILLARS) {
      const btn = screen.getByTestId(`readiness-pillar-${p.key}`);
      expect(btn.tagName).toBe('BUTTON');
      expect(within(btn).getByText(p.label)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByTestId('readiness-pillar-ea'));
    expect(screen.getByRole('dialog', { name: 'Disponibilidade Energética' })).toBeInTheDocument();
  });

  it('o âmbar só na contagem da prova; a etiqueta é texto simples', () => {
    on();
    const { container } = renderCard();
    expect(screen.getByText('Próxima prova')).not.toHaveClass('uppercase');
    expect(screen.getByTestId('readiness-race-countdown')).toHaveTextContent('Faltam 12 dias');
    expect(screen.getByTestId('readiness-race-countdown')).toHaveClass('v2-geral-ready-count');
    // Nada mais pintado com o âmbar da prova (nem o troféu, nem o ícone da tática).
    expect(container.querySelector('[style*="--race"], .text-\\[var\\(--race\\)\\]')).toBeNull();
    expect(container.textContent).not.toMatch(/—\s*21/);
  });

  it('com o v2 desligado, o cartão de sempre (com o nome cortado)', () => {
    const { container } = renderCard();
    expect(screen.queryByTestId('readiness-v2')).toBeNull();
    expect(screen.getByText('Próxima Prova')).toHaveClass('uppercase');
    expect(container.querySelectorAll('.truncate').length).toBeGreaterThan(0);
  });
});

describe('SmartInsightsBanner v2 — o «Dia da Prova» como secção plana com a linha da Carol', () => {
  it('título simples, a mensagem na linha da Carol (traço ciano) e os botões de sempre', () => {
    on();
    render(<SmartInsightsBanner data={{}} profile={{}} />);
    const box = screen.getByTestId('banner-insight-race_day_x');
    expect(box).toHaveClass('v2-geral-panel');
    expect(box.getAttribute('style')).toBeNull();
    expect(within(box).getByRole('heading', { name: 'Dia da Prova: Meia de Lisboa' })).toBeInTheDocument();
    const say = screen.getByTestId('banner-insight-say-race_day_x');
    expect(say).toHaveClass('v2-say');
    expect(within(say).getByText('Carol.')).toHaveClass('v2-who');
    expect(screen.getByTestId('banner-insight-talk-race_day_x')).toBeInTheDocument();
    expect(screen.getByTestId('banner-insight-understood-race_day_x')).toBeInTheDocument();
  });

  it('com o v2 desligado, o Warning de sempre', () => {
    render(<SmartInsightsBanner data={{}} profile={{}} />);
    expect(screen.queryByTestId('banner-insights-v2')).toBeNull();
    expect(screen.queryByTestId('banner-insight-say-race_day_x')).toBeNull();
    expect(screen.getByTestId('banner-insight-race_day_x').getAttribute('style')).toMatch(/tint-coach-bg/);
  });
});

describe('PillarSummaryCard v2', () => {
  it('o estado em texto com um ponto, sem pílula', () => {
    on();
    render(<PillarSummaryCard title="Ginásio" kpi="2" kpiUnit="sessões de força" badge={{ label: 'Alvo cumprido', color: 'green' }} subtitle={['Linha']} onClick={() => {}} />);
    const badge = screen.getByTestId('pillar-badge');
    expect(badge).toHaveTextContent('Alvo cumprido');
    expect(badge.className).not.toMatch(/rounded/);
    expect(badge.querySelector('.v2-dot')).not.toBeNull();
    expect(screen.getByText('Ginásio')).not.toHaveClass('uppercase');
  });
});
