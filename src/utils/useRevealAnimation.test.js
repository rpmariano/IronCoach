import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, act, screen } from '@testing-library/react';
import { useRevealAnimation, REVEAL_ANIMATION_WINDOW_MS } from './useRevealAnimation';

/* Animar quando se vê (pedido 2026-09-13): esconder até entrar no ecrã,
   animar aí, re-armar só quando sai de lado (troca de separador). */

let observers = [];
class FakeObserver {
  constructor(callback) { this.callback = callback; observers.push(this); }
  observe(el) { this.el = el; }
  disconnect() { this.disconnected = true; }
}

const fire = (entry) => act(() => { observers[observers.length - 1].callback([entry]); });
const entrou = (height = 200, visible = 120, width = 300, visibleWidth = 300) => ({
  isIntersecting: true,
  intersectionRect: { height: visible, width: visibleWidth, left: 0, right: visibleWidth },
  boundingClientRect: { height, width, left: 0, right: width, top: 100, bottom: 100 + height },
});
const saiu = (box) => ({
  isIntersecting: false,
  intersectionRect: { height: 0, width: 0, left: 0, right: 0 },
  boundingClientRect: { height: 200, width: 300, top: 100, bottom: 300, ...box },
});

function Box() {
  const { ref, style, animate, playKey } = useRevealAnimation();
  return React.createElement('div', {
    ref, style, 'data-testid': 'box', 'data-animate': String(animate), 'data-key': String(playKey),
  });
}
const box = () => screen.getByTestId('box');

describe('useRevealAnimation', () => {
  beforeEach(() => {
    observers = [];
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fica escondido até entrar no ecrã, e anima quando entra', () => {
    render(React.createElement(Box));
    expect(box().style.opacity).toBe('0');
    expect(box().dataset.animate).toBe('false');

    fire(entrou());
    expect(box().style.opacity).toBe('');
    expect(box().dataset.animate).toBe('true');
    expect(box().dataset.key).toBe('1');
  });

  it('uma ponta à vista ainda não conta', () => {
    render(React.createElement(Box));
    fire(entrou(200, 20));
    expect(box().style.opacity).toBe('0');
  });

  it('uma lasca de lado (a página seguinte do carrossel a espreitar) não conta', () => {
    render(React.createElement(Box));
    fire(entrou(200, 200, 340, 16));
    expect(box().style.opacity).toBe('0');
    expect(box().dataset.animate).toBe('false');
  });

  it('sair de lado (troca de separador) re-arma, e ao voltar anima outra vez', () => {
    render(React.createElement(Box));
    fire(entrou());
    fire(saiu({ left: 1200, right: 1500 }));
    expect(box().style.opacity).toBe('0');

    fire(entrou());
    expect(box().dataset.key).toBe('2');
  });

  it('ficar só com a lasca de 16px na margem também conta como ter saído de lado', () => {
    render(React.createElement(Box));
    fire(entrou());
    fire({ isIntersecting: true, intersectionRect: { height: 200, width: 16, left: 0, right: 16 }, boundingClientRect: { height: 200, width: 343, left: -327, right: 16, top: 100, bottom: 300 } });
    expect(box().style.opacity).toBe('0');

    fire(entrou());
    expect(box().dataset.key).toBe('2');
  });

  it('sair por baixo (scroll) não re-arma nem volta a animar', () => {
    render(React.createElement(Box));
    fire(entrou());
    fire(saiu({ left: 0, right: 300, top: 900, bottom: 1100 }));
    expect(box().style.opacity).toBe('');

    fire(entrou());
    expect(box().dataset.key).toBe('1');
  });

  it('no desktop, a página vizinha cortada pelo carrossel re-arma mesmo dentro da janela', () => {
    render(React.createElement(Box));
    fire(entrou());
    // Coluna centrada: a página seguinte está a 900px, dentro dos 1400 da janela.
    fire(saiu({ left: 900, right: 1243 }));
    expect(box().style.opacity).toBe('0');
  });

  it('a animação desliga-se no fim da janela, e mudar os dados depois não reconta', () => {
    vi.useFakeTimers();
    try {
      render(React.createElement(Box));
      fire(entrou());
      expect(box().dataset.animate).toBe('true');
      act(() => { vi.advanceTimersByTime(REVEAL_ANIMATION_WINDOW_MS + 1); });
      expect(box().dataset.animate).toBe('false');
      // Voltar ao separador anima outra vez, logo no render do novo key.
      fire(saiu({ left: 1200, right: 1500 }));
      fire(entrou());
      expect(box().dataset.key).toBe('2');
      expect(box().dataset.animate).toBe('true');
    } finally {
      vi.useRealTimers();
    }
  });

  it('com movimento reduzido não esconde nem anima', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    render(React.createElement(Box));
    expect(box().style.opacity).toBe('');
    expect(box().dataset.animate).toBe('false');
    expect(observers).toHaveLength(0);
  });

  it('sem IntersectionObserver fica à vista e quieto', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(React.createElement(Box));
    expect(box().style.opacity).toBe('');
    expect(box().dataset.animate).toBe('false');
  });
});
