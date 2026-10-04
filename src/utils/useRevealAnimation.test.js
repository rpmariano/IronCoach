import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, act, screen } from '@testing-library/react';
import { useRevealAnimation, REVEAL_ANIMATION_WINDOW_MS, QUICK_RETURN_MS } from './useRevealAnimation';
import { TabPageContext, TabReadyContext, setSettledIndex, resetSettledTab } from './settledTab';

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

/* Modo separador (2026-10-04, F5 — plano §2.1): dentro do carrossel da
   Evolução o gatilho é "à vista + separador assente + dados prontos", e o
   rearme é por o separador deixar de estar assente (não por sair de lado).
   A tabela de situações do plano, uma por teste. */
describe('useRevealAnimation — dentro do carrossel da Evolução', () => {
  const PAGE = 1;

  function TabBox({ readyOption }) {
    const r = useRevealAnimation(readyOption === undefined ? undefined : { ready: readyOption });
    return React.createElement('div', {
      ref: r.ref,
      style: r.style,
      'data-testid': 'box',
      'data-animate': String(r.animate),
      'data-key': String(r.playKey),
      'data-seen': String(r.seen),
      'data-armed': String(r.armed),
      'data-visible': String(r.visible),
    });
  }
  const inTab = ({ ready = true, readyOption } = {}) => React.createElement(
    TabPageContext.Provider, { value: PAGE },
    React.createElement(TabReadyContext.Provider, { value: ready }, React.createElement(TabBox, { readyOption })),
  );

  // A área do gráfico (176 px) inteira no ecrã, e fora por completo.
  const aVista = (visible = 176) => ({
    isIntersecting: true,
    intersectionRect: { height: visible, width: 343 },
    boundingClientRect: { height: 176, width: 343, top: 100, bottom: 276 },
    rootBounds: { height: 800 },
  });
  const fora = () => ({
    isIntersecting: false,
    intersectionRect: { height: 0, width: 0 },
    boundingClientRect: { height: 176, width: 343, top: 100, bottom: 276 },
    rootBounds: { height: 800 },
  });
  const assenta = (i) => act(() => { setSettledIndex(i); });
  const espera = (ms) => act(() => { vi.advanceTimersByTime(ms); });
  const d = () => box().dataset;

  // Revelado na página PAGE, assente, para os testes que partem daí.
  const revelado = () => {
    render(inTab());
    assenta(PAGE);
    fire(aVista());
    expect(d().key).toBe('1');
  };

  beforeEach(() => {
    vi.useFakeTimers();
    observers = [];
    resetSettledTab();
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  });
  afterEach(() => {
    resetSettledTab();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('à vista mas com o separador por assentar: não revela', () => {
    render(inTab());
    fire(aVista());
    expect(box().style.opacity).toBe('0');
    expect(d().seen).toBe('false');
    expect(d().key).toBe('0');
  });

  it('o separador assenta: revela, playKey 1, anima', () => {
    render(inTab());
    fire(aVista());
    assenta(PAGE);
    expect(box().style.opacity).toBe('');
    expect(d().seen).toBe('true');
    expect(d().key).toBe('1');
    expect(d().animate).toBe('true');
    expect(d().armed).toBe('false');
  });

  it('a entrada do observer pode chegar depois de assentar', () => {
    render(inTab());
    assenta(PAGE);
    expect(d().key).toBe('0');
    fire(aVista());
    expect(d().key).toBe('1');
  });

  it('só 55 % da área conta como à vista (uma ponta não chega)', () => {
    render(inTab());
    assenta(PAGE);
    fire(aVista(80)); // 80 de 176 px
    expect(d().key).toBe('0');
    fire(aVista(110));
    expect(d().key).toBe('1');
  });

  it('o separador sai: rearma ao fim de ~3 s fora da vista (seen fica)', () => {
    revelado();
    assenta(PAGE + 1);
    fire(fora());
    expect(d().armed).toBe('false');
    espera(QUICK_RETURN_MS + 10);
    expect(d().armed).toBe('true');
    expect(d().seen).toBe('true');
    expect(box().style.opacity).toBe(''); // rearmado fica à vista, no estado zero
  });

  it('volta ao separador depois disso: revela outra vez, playKey 2', () => {
    revelado();
    assenta(PAGE + 1);
    fire(fora());
    espera(QUICK_RETURN_MS + 10);
    fire(aVista());
    expect(d().key).toBe('1'); // ainda não assentou
    assenta(PAGE);
    expect(d().key).toBe('2');
    expect(d().armed).toBe('false');
    expect(d().animate).toBe('true');
  });

  it('vai-e-vem em menos de ~3 s: não rearma nem repete', () => {
    revelado();
    espera(REVEAL_ANIMATION_WINDOW_MS + 10);
    assenta(PAGE + 1);
    fire(fora());
    espera(1000);
    fire(aVista());
    assenta(PAGE);
    expect(d().key).toBe('1');
    expect(d().armed).toBe('false');
    expect(d().animate).toBe('false');
    espera(QUICK_RETURN_MS * 2);
    expect(d().armed).toBe('false');
  });

  it('scroll vertical (sai por baixo e volta) nunca rearma', () => {
    revelado();
    fire(fora());
    espera(QUICK_RETURN_MS * 3);
    expect(d().armed).toBe('false');
    fire(aVista());
    expect(d().key).toBe('1');
  });

  it('separador por assentar mas ainda à vista ao fim de 3 s: só rearma quando sai', () => {
    revelado();
    assenta(-1); // dedo pousado a meio do gesto, o gráfico ainda se vê
    espera(QUICK_RETURN_MS + 10);
    expect(d().armed).toBe('false');
    fire(fora());
    expect(d().armed).toBe('true');
  });

  it('dados por chegar (ready falso): não revela; chegam: revela', () => {
    const { rerender } = render(inTab({ ready: false }));
    assenta(PAGE);
    fire(aVista());
    expect(d().seen).toBe('false');
    expect(d().key).toBe('0');
    rerender(inTab({ ready: true }));
    expect(d().key).toBe('1');
  });

  it('a opção ready de quem chama também segura o reveal', () => {
    render(inTab({ readyOption: false }));
    assenta(PAGE);
    fire(aVista());
    expect(d().key).toBe('0');
  });

  it('a janela de animação fecha e não reabre sem novo reveal', () => {
    revelado();
    expect(d().animate).toBe('true');
    espera(REVEAL_ANIMATION_WINDOW_MS + 10);
    expect(d().animate).toBe('false');
  });

  it('com movimento reduzido: seen logo, nada escondido nem anima — mas continua a observar', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    render(inTab());
    expect(d().seen).toBe('true');
    expect(box().style.opacity).toBe('');
    expect(d().animate).toBe('false');
    expect(observers).toHaveLength(1); // a criação dos canvas espera pela proximidade
    expect(d().visible).toBe('false');
    assenta(PAGE);
    fire(aVista());
    expect(d().visible).toBe('true');
    expect(d().key).toBe('0');
    expect(d().animate).toBe('false');
  });

  it('sem IntersectionObserver: à vista, quieto, e `visible` (monta logo)', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(inTab());
    expect(d().seen).toBe('true');
    expect(box().style.opacity).toBe('');
    expect(d().animate).toBe('false');
    expect(d().visible).toBe('true');
  });

  it('uma página vizinha encostada à margem (interseção de largura 0) não conta como à vista', () => {
    render(inTab());
    assenta(PAGE);
    fire({ ...aVista(), intersectionRect: { height: 176, width: 0 } });
    expect(d().key).toBe('0');
  });
});
