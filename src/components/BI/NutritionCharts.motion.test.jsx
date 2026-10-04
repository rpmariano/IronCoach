import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import NutritionChartCard, { enterStyle, NutritionEnteredContext } from '../Nutrition/NutritionChartCard';
import { TabPageContext, TabReadyContext, setSettledIndex, resetSettledTab } from '../../utils/settledTab';
import { STAGGER_BARS_MAX_SPAN } from '../../utils/introAnimations';

/* Os gráficos da Nutrição por período (fase 4, 2026-10-04) são HTML — o
   "Adesão às macros" e a linha da EA em Chart.js saíram com o mock-up. A
   entrada segue a regra da fase 2 (R9): dentro do carrossel, as barras
   crescem da base quando o gráfico fica à vista com o separador assente,
   ficam na base enquanto não; com reduced-motion ou fora do carrossel não
   mexe nada. */

describe('enterStyle — a entrada de cada barra', () => {
  it('sem movimento (fora do carrossel, reduced-motion) não mexe em nada', () => {
    expect(enterStyle({ active: false }, 3, 7)).toBeUndefined();
    expect(enterStyle(undefined, 0, 1)).toBeUndefined();
  });

  it('armado: na base (barras a scaleY(0), células transparentes)', () => {
    expect(enterStyle({ active: true, hold: true }, 0, 7)).toEqual({ transformOrigin: 'bottom', transform: 'scaleY(0)' });
    expect(enterStyle({ active: true, hold: true }, 0, 7, 'pop')).toEqual({ opacity: 0 });
  });

  it('a revelar: cresce da base com escalonamento com teto (31 barras em ≈ 1 s)', () => {
    const first = enterStyle({ active: true, animate: true }, 0, 31);
    const last = enterStyle({ active: true, animate: true }, 30, 31);
    expect(first.animation).toMatch(/^nutriGrow \d+ms var\(--ease-out\) 0ms both$/);
    const delay = Number(/(\d+)ms both$/.exec(last.animation)[1]);
    expect(delay).toBeLessThanOrEqual(STAGGER_BARS_MAX_SPAN);
  });

  it('depois da entrada (e ao mudar de período) não volta a animar', () => {
    expect(enterStyle({ active: true, animate: false, hold: false }, 2, 7)).toBeUndefined();
  });
});

describe('NutritionChartCard — dentro do carrossel da Evolução', () => {
  let observers = [];
  class FakeObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(el) { this.el = el; }
    disconnect() { this.disconnected = true; }
  }
  const fire = (entry) => act(() => { observers.forEach((o) => o.el && !o.disconnected && o.callback([entry])); });
  const aVista = () => ({
    isIntersecting: true,
    intersectionRect: { height: 228, width: 343 },
    boundingClientRect: { height: 228, width: 343, top: 100, bottom: 328 },
    rootBounds: { height: 800 },
  });
  const card = (seen, { value = '2 310', entered = null } = {}) => (
    <TabPageContext.Provider value={3}>
      <TabReadyContext.Provider value>
        <NutritionEnteredContext.Provider value={entered}>
          <NutritionChartCard label="Calorias por dia" value={value} unit="kcal/dia">
            {(motion) => {
              seen.push(motion);
              return <span data-testid="bar" style={enterStyle(motion, 0, 7)} />;
            }}
          </NutritionChartCard>
        </NutritionEnteredContext.Provider>
      </TabReadyContext.Provider>
    </TabPageContext.Provider>
  );
  const shown = () => screen.getByTestId('chart-frame-value').textContent.replace(/[\u00a0\u202f]/g, ' ');

  beforeEach(() => {
    vi.useFakeTimers();
    observers = [];
    resetSettledTab();
    vi.stubGlobal('IntersectionObserver', FakeObserver);
  });
  afterEach(() => {
    resetSettledTab();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('antes do reveal: área transparente e barras na base; revelado: crescem', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    const seen = [];
    render(card(seen));
    expect(screen.getByTestId('nutrition-chart-plot').style.opacity).toBe('0');
    expect(screen.getByTestId('bar').style.transform).toBe('scaleY(0)');
    act(() => { setSettledIndex(3); });
    fire(aVista());
    expect(screen.getByTestId('nutrition-chart-plot').style.opacity).toBe('1');
    expect(screen.getByTestId('bar').style.animation).toMatch(/^nutriGrow/);
    expect(seen.at(-1)).toMatchObject({ active: true, hold: false, animate: true });
  });

  /* Revisão de 2026-10-04 (D4): mudar de período dentro da janela da animação
     não recomeça a contagem do 0 — mostra logo o número novo. */
  it('o valor muda a meio da contagem: mostra-o logo, sem voltar a contar do 0', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    const seen = [];
    const { rerender } = render(card(seen));
    act(() => { setSettledIndex(3); });
    fire(aVista());
    expect(seen.at(-1).animate).toBe(true);
    rerender(card(seen, { value: '2 229' }));
    expect(shown()).toBe('2 229');
    act(() => { vi.advanceTimersByTime(100); });
    expect(shown()).toBe('2 229');
    // ‹ e logo › (ainda na janela): volta ao valor de partida sem recontar.
    rerender(card(seen, { value: '2 310' }));
    expect(shown()).toBe('2 310');
  });

  /* Um cartão que monta com o separador já assente e já visto (troca de
     período/tipo) entra calado; se o atleta sair antes de ele ser revelado,
     ao voltar é uma entrada normal (R9). */
  it('montado depois da entrada: calado; saiu antes de o ver: ao voltar anima', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    act(() => { setSettledIndex(3); });
    const seen = [];
    const { unmount } = render(card(seen, { entered: { current: true } }));
    expect(screen.getByTestId('nutrition-chart-plot').style.opacity).toBe('1');
    expect(screen.getByTestId('bar').getAttribute('style') || '').not.toMatch(/scaleY|nutriGrow/);
    fire(aVista());
    expect(screen.getByTestId('bar').getAttribute('style') || '').not.toMatch(/nutriGrow/);
    expect(shown()).toBe('2 310');
    unmount();

    observers = [];
    const seen2 = [];
    render(card(seen2, { entered: { current: true } }));
    // Sai antes de o observer o dar à vista…
    act(() => { setSettledIndex(0); });
    act(() => { vi.advanceTimersByTime(3100); });
    // … e volta: é uma entrada, anima.
    act(() => { setSettledIndex(3); });
    fire(aVista());
    expect(screen.getByTestId('bar').style.animation).toMatch(/^nutriGrow/);
  });

  it('montado antes de o separador ser visto (1.ª entrada): anima', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    const seen = [];
    render(card(seen, { entered: { current: false } }));
    expect(screen.getByTestId('nutrition-chart-plot').style.opacity).toBe('0');
    act(() => { setSettledIndex(3); });
    fire(aVista());
    expect(screen.getByTestId('bar').style.animation).toMatch(/^nutriGrow/);
  });

  it('com reduced-motion nada se esconde nem anima', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const seen = [];
    render(card(seen));
    expect(screen.getByTestId('nutrition-chart-plot').style.opacity).toBe('1');
    expect(screen.getByTestId('bar').getAttribute('style') || '').not.toMatch(/scaleY|animation/);
    expect(seen.at(-1).active).toBe(false);
  });
});
