import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import { todayISO, addDaysISO } from '../../lib/utils';
import { TabPageContext } from '../../utils/settledTab';

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

const { default: SmartInsightsBanner, useBannerShown, resetBannerShown } = await import('./SmartInsightsBanner');
const { detectCoachInsights } = await import('../../utils/biEngine');

const renderBanner = (props = {}) => render(<SmartInsightsBanner data={{}} profile={{}} {...props} />);

describe('SmartInsightsBanner', () => {
  beforeEach(() => {
    useAppStore.setState({ insightStates: {}, insightSnoozes: {} });
    detectCoachInsights.mockImplementation(() => INSIGHTS);
    resetBannerShown();
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

  /* 2026-10-04 (Geral): o banner ignorava `maxItems` (cortava sempre a 2) e o
     botão da Carol repetia os mesmos insights por baixo. */
  describe('maxItems', () => {
    const MUITOS = ['a', 'b', 'c', 'd'].map((x, i) => ({ id: `i_${x}`, severity: 'info', title: `Insight ${x}`, message: `msg ${i}`, module: 'corrida' }));

    it('por omissão mostra 2', () => {
      detectCoachInsights.mockImplementation(() => MUITOS);
      renderBanner();
      expect(screen.getAllByText(/^Insight /)).toHaveLength(2);
    });

    it('respeita maxItems: 3, 1 e mais do que há', () => {
      detectCoachInsights.mockImplementation(() => MUITOS);
      const { unmount } = renderBanner({ maxItems: 3 });
      expect(screen.getAllByText(/^Insight /)).toHaveLength(3);
      unmount();
      const { unmount: u2 } = renderBanner({ maxItems: 1 });
      expect(screen.getAllByText(/^Insight /)).toHaveLength(1);
      expect(screen.getByText('Insight a')).toBeInTheDocument();
      u2();
      renderBanner({ maxItems: 10 });
      expect(screen.getAllByText(/^Insight /)).toHaveLength(4);
    });

    it('um maxItems inválido volta ao 2', () => {
      detectCoachInsights.mockImplementation(() => MUITOS);
      renderBanner({ maxItems: 'x' });
      expect(screen.getAllByText(/^Insight /)).toHaveLength(2);
    });
  });

  describe('publica o que mostra (para o botão da Carol não o repetir)', () => {
    function Spy({ onShown }) {
      onShown(useBannerShown());
      return null;
    }

    it('publica só os ids mostrados e a página do carrossel; limpa ao desmontar', () => {
      let last = null;
      render(<Spy onShown={(v) => { last = v; }} />);
      expect(last.ids).toEqual([]);
      const { unmount } = render(
        <TabPageContext.Provider value={0}>
          <SmartInsightsBanner data={{}} profile={{}} maxItems={1} />
        </TabPageContext.Provider>,
      );
      expect(last.ids).toEqual(['acwr_danger']);
      expect(last.page).toBe(0);
      act(() => unmount());
      expect(last.ids).toEqual([]);
      expect(last.page).toBeNull();
    });

    it('o que foi percebido ou posto de lado não é publicado (não está à vista)', () => {
      useAppStore.setState({ insightStates: { acwr_danger: 'understood' } });
      let last = null;
      render(<Spy onShown={(v) => { last = v; }} />);
      renderBanner();
      expect(last.ids).toEqual(['race_day_x']);
    });
  });
});
