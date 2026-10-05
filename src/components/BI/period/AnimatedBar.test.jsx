import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnimatedBar, BarsEnteredContext, useBarsReveal } from './AnimatedBar';
import { TabPageContext, TabReadyContext, setSettledIndex, resetSettledTab } from '../../../utils/settledTab';

/* As barras do resumo do período e do cartão do dia (2026-10-05, revelação A3):
   crescem do zero quando o separador assenta e o cartão está à vista, repetem
   ao voltar ao separador, deslizam em 300 ms ao mudar de valor (sem voltar ao
   zero), e com reduced-motion ou fora do carrossel são o valor final. */

function Card({ values, labelPrefix = 'b' }) {
  const bars = useBarsReveal();
  return (
    <div ref={bars.ref} data-testid="card">
      {values.map((v, i) => (
        <AnimatedBar key={i} testId={`${labelPrefix}${i}`} pct={v} color="red" index={i} bars={bars} />
      ))}
    </div>
  );
}

const inTab = (ui, { entered = null } = {}) => (
  <TabPageContext.Provider value={3}>
    <TabReadyContext.Provider value>
      <BarsEnteredContext.Provider value={entered}>{ui}</BarsEnteredContext.Provider>
    </TabReadyContext.Provider>
  </TabPageContext.Provider>
);

describe('AnimatedBar', () => {
  let observers = [];
  class FakeObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(el) { this.el = el; }
    disconnect() { this.disconnected = true; }
  }
  const fire = (entry) => act(() => { observers.forEach((o) => o.el && !o.disconnected && o.callback([entry])); });
  const aVista = () => ({
    isIntersecting: true,
    intersectionRect: { height: 200, width: 343 },
    boundingClientRect: { height: 200, width: 343, top: 100, bottom: 300 },
    rootBounds: { height: 800 },
  });
  const fora = () => ({
    isIntersecting: false,
    intersectionRect: { height: 0, width: 0 },
    boundingClientRect: { height: 200, width: 343, top: 900, bottom: 1100 },
    rootBounds: { height: 800 },
  });
  const bar = (i = 0) => screen.getByTestId(`b${i}`);
  const normalMotion = () => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));

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

  it('fora do carrossel: o valor final logo, sem transição', () => {
    render(<Card values={[95, 120, 0]} />);
    expect(bar(0).style.transform).toBe('scaleX(0.95)');
    expect(bar(0).style.transition).toBe('none');
    // Limitada a 0–100%.
    expect(bar(1).style.transform).toBe('scaleX(1)');
    expect(bar(2).style.transform).toBe('scaleX(0)');
    expect(bar(0).style.transformOrigin).toBe('left');
  });

  it('no carrossel: a zero até o separador assentar E o cartão estar à vista; depois cresce, escalonada', () => {
    normalMotion();
    render(inTab(<Card values={[95, 60, 40]} />));
    expect(bar(0).style.transform).toBe('scaleX(0)');
    expect(bar(0).style.transition).toBe('none');
    // Separador assente, mas o cartão ainda fora de vista: continua a zero.
    act(() => { setSettledIndex(3); });
    expect(bar(0).style.transform).toBe('scaleX(0)');
    fire(aVista());
    // Revelou: aparece no zero e só no frame seguinte muda para o valor (é isso que dispara a transição).
    expect(bar(0).style.transform).toBe('scaleX(0)');
    act(() => { vi.advanceTimersByTime(32); });
    expect(bar(0).style.transform).toBe('scaleX(0.95)');
    expect(bar(1).style.transform).toBe('scaleX(0.6)');
    expect(bar(0).style.transition).toBe('transform var(--dur-bars) var(--ease-out) 0ms');
    // Escalonada: 60 ms por linha.
    expect(bar(1).style.transition).toBe('transform var(--dur-bars) var(--ease-out) 60ms');
    expect(bar(2).style.transition).toBe('transform var(--dur-bars) var(--ease-out) 120ms');
  });

  it('mudar de valor depois da entrada: desliza em 300 ms, sem voltar ao zero', () => {
    normalMotion();
    const { rerender } = render(inTab(<Card values={[95, 60]} />));
    act(() => { setSettledIndex(3); });
    fire(aVista());
    act(() => { vi.advanceTimersByTime(32); });
    act(() => { vi.advanceTimersByTime(2000); }); // acabou a janela da entrada
    rerender(inTab(<Card values={[40, 100]} />));
    expect(bar(0).style.transform).toBe('scaleX(0.4)');
    expect(bar(1).style.transform).toBe('scaleX(1)');
    expect(bar(0).style.transition).toBe('transform 300ms var(--ease-out)');
    expect(bar(1).style.transition).toBe('transform 300ms var(--ease-out)');
  });

  it('sair do separador e voltar repete a entrada (volta a zero fora de vista)', () => {
    normalMotion();
    render(inTab(<Card values={[80]} />));
    act(() => { setSettledIndex(3); });
    fire(aVista());
    act(() => { vi.advanceTimersByTime(32); });
    expect(bar(0).style.transform).toBe('scaleX(0.8)');
    // Sai de lado e fica 3 s fora: rearma, a zero.
    act(() => { setSettledIndex(0); });
    fire(fora());
    act(() => { vi.advanceTimersByTime(3100); });
    expect(bar(0).style.transform).toBe('scaleX(0)');
    expect(bar(0).style.transition).toBe('none');
    // Volta: cresce outra vez.
    act(() => { setSettledIndex(3); });
    fire(aVista());
    act(() => { vi.advanceTimersByTime(32); });
    expect(bar(0).style.transform).toBe('scaleX(0.8)');
    expect(bar(0).style.transition).toMatch(/^transform var\(--dur-bars\)/);
  });

  it('reduced-motion: o valor final logo, sem transição', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const { rerender } = render(inTab(<Card values={[70]} />));
    expect(bar(0).style.transform).toBe('scaleX(0.7)');
    expect(bar(0).style.transition).toBe('none');
    act(() => { setSettledIndex(3); });
    fire(aVista());
    rerender(inTab(<Card values={[30]} />));
    expect(bar(0).style.transform).toBe('scaleX(0.3)');
    expect(bar(0).style.transition).toBe('none');
  });

  it('montado com o separador já assente e visto (trocar o cartão): nasce no valor final, calado', () => {
    normalMotion();
    act(() => { setSettledIndex(3); });
    const { rerender } = render(inTab(<Card values={[90]} />, { entered: { current: true } }));
    // Nasce no valor final: não há zero de onde crescer, por isso a entrada não se vê.
    expect(bar(0).style.transform).toBe('scaleX(0.9)');
    fire(aVista());
    act(() => { vi.advanceTimersByTime(32); });
    expect(bar(0).style.transform).toBe('scaleX(0.9)');
    expect(bar(0).style.transition).not.toMatch(/dur-bars/);
    // Mudar de valor continua a deslizar em 300 ms.
    rerender(inTab(<Card values={[50]} />, { entered: { current: true } }));
    expect(bar(0).style.transform).toBe('scaleX(0.5)');
    expect(bar(0).style.transition).toBe('transform 300ms var(--ease-out)');
  });

  it('sem brilho a zero (uma barra de largura nula deixava um borrão)', () => {
    render(<Card values={[0, 50]} />);
    expect(bar(0).style.boxShadow).toBe('');
    expect(bar(1).style.boxShadow).toMatch(/red/);
  });
});
