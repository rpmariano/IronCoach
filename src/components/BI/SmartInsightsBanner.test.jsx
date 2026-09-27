import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import { todayISO, addDaysISO } from '../../lib/utils';

/* O banner da Evolução · Geral mostra os mesmos insights do botão da Carol:
   desde 2026-09-27 com o mesmo código de símbolos (noticeTones.js) e a
   mesma régua do que está escondido (utils/insightState.js) — era o escudo
   e o raio, e um "Agora não" tirava o insight do botão mas não daqui
   (revisão pré-deploy). O motor de regras é mockado: aqui testa-se o banner. */
const INSIGHTS = [
  { id: 'acwr_danger', severity: 'critical', title: 'Carga excessiva', message: 'O ACWR está alto.', module: 'corrida' },
  { id: 'race_day_x', severity: 'info', title: 'Dia da prova', message: 'Parte com calma.', module: 'corrida' },
];
vi.mock('../../utils/biEngine', () => ({ detectCoachInsights: vi.fn(() => INSIGHTS) }));

const { default: SmartInsightsBanner } = await import('./SmartInsightsBanner');

const renderBanner = () => render(<SmartInsightsBanner data={{}} profile={{}} />);

describe('SmartInsightsBanner', () => {
  beforeEach(() => {
    useAppStore.setState({ insightStates: {}, insightSnoozes: {} });
  });

  it('mostra os insights com os símbolos do código único', () => {
    const { container } = renderBanner();
    expect(screen.getByText('Carga excessiva')).toBeInTheDocument();
    expect(screen.getByText('Dia da prova')).toBeInTheDocument();
    expect(container.querySelector('svg.lucide-triangle-alert')).not.toBeNull();
    expect(container.querySelector('svg.lucide-lightbulb')).not.toBeNull();
    expect(container.querySelector('svg.lucide-shield-alert, svg.lucide-zap')).toBeNull();
  });

  it('um insight posto de lado hoje ("Agora não") sai também daqui; de ontem, volta', () => {
    useAppStore.setState({ insightStates: { acwr_danger: 'ignored' }, insightSnoozes: { acwr_danger: todayISO() } });
    const { unmount } = renderBanner();
    expect(screen.queryByText('Carga excessiva')).not.toBeInTheDocument();
    expect(screen.getByText('Dia da prova')).toBeInTheDocument();
    unmount();

    useAppStore.setState({ insightSnoozes: { acwr_danger: addDaysISO(todayISO(), -1) } });
    renderBanner();
    expect(screen.getByText('Carga excessiva')).toBeInTheDocument();
  });

  it('o que já foi percebido não aparece, e sem nada não ocupa espaço', () => {
    useAppStore.setState({ insightStates: { acwr_danger: 'understood', race_day_x: 'understood' } });
    const { container } = renderBanner();
    expect(container).toBeEmptyDOMElement();
  });
});
