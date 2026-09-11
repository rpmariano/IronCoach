import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import React, { useRef } from 'react';
import {
  useElasticPillIndicator,
  navPillDuration,
  subPillDuration,
  SUBNAV_PILL_DURATION,
  OVERSHOOT_DEFAULT,
  STRETCH_RATIO_DEFAULT,
  pillMotion,
} from './useElasticPillIndicator';

/* A minhoca — ponto 4 do handoff. Testa-se o que o desenho fixa em números
   (duração por distância e teto na nav, 320ms nos subnavs, as curvas) e a
   regra "nunca duas em movimento ao mesmo tempo". */

beforeEach(() => pillMotion.reset());

describe('duração da minhoca', () => {
  it('na nav: 420 + 130·distância em separadores', () => {
    expect(navPillDuration(0, 0)).toBe(420);
    expect(navPillDuration(0, 1)).toBe(550);
    expect(navPillDuration(1, 3)).toBe(680);
    // Início → Coach, o salto mais longo dos quatro separadores da barra.
    expect(navPillDuration(0, 3)).toBe(810);
  });

  it('na nav: a distância conta em valor absoluto (ida e volta iguais)', () => {
    expect(navPillDuration(3, 0)).toBe(navPillDuration(0, 3));
  });

  it('na nav: teto de 950ms (--dur-pill-nav-max)', () => {
    expect(navPillDuration(0, 5)).toBe(950);   // 1070 sem teto
    expect(navPillDuration(0, 20)).toBe(950);
  });

  it('no subnav: 320ms fixos, seja qual for a distância', () => {
    expect(SUBNAV_PILL_DURATION).toBe(320);
    expect(subPillDuration(0, 1)).toBe(320);
    expect(subPillDuration(0, 4)).toBe(320);
  });

  it('as curvas são as do handoff: 45% a esticar, overshoot 1.70158', () => {
    expect(STRETCH_RATIO_DEFAULT).toBe(0.45);
    expect(OVERSHOOT_DEFAULT).toBe(1.70158);
  });
});

describe('guarda global — nunca duas minhocas em movimento', () => {
  it('a pílula nova salta a anterior para o fim em vez de esperar por ela', () => {
    const primeira = { finish: vi.fn() };
    const segunda = { finish: vi.fn() };

    pillMotion.claim(primeira);
    expect(pillMotion.isRunning()).toBe(true);

    pillMotion.claim(segunda);
    expect(primeira.finish).toHaveBeenCalledTimes(1);
    expect(segunda.finish).not.toHaveBeenCalled();
    expect(pillMotion.isRunning()).toBe(true);
  });

  it('reclamar duas vezes a mesma animação não a termina a si própria', () => {
    const unica = { finish: vi.fn() };
    pillMotion.claim(unica);
    pillMotion.claim(unica);
    expect(unica.finish).not.toHaveBeenCalled();
  });

  it('libertar a animação em curso deixa o palco livre; libertar outra não mexe', () => {
    const a = { finish: vi.fn() };
    pillMotion.claim(a);
    pillMotion.release(a);
    expect(pillMotion.isRunning()).toBe(false);

    const b = { finish: vi.fn() };
    pillMotion.claim(b);
    pillMotion.release(a);
    expect(pillMotion.isRunning()).toBe(true);
    expect(b.finish).not.toHaveBeenCalled();
  });
});

// ─── O hook, com layout e frames simulados ────────────────────────────────
// O jsdom não faz layout (getBoundingClientRect devolve zeros) nem corre
// requestAnimationFrame a sério — ambos são substituídos aqui para a
// animação ser determinística.

const TAB_W = 70;

/** Barra de `count` separadores com `TAB_W` px cada, a partir de left 0. */
function Bar({ activeIndex, options, testId = 'bar', count = 4 }) {
  const barRef = useRef(null);
  const { indicatorStyle, setItemRef } = useElasticPillIndicator(barRef, activeIndex, options);
  return React.createElement(
    'div',
    { ref: barRef, 'data-testid': testId, 'data-container': 'true' },
    ...Array.from({ length: count }, (_, i) =>
      React.createElement('button', { key: i, ref: setItemRef(i), 'data-idx': String(i) })),
    React.createElement('span', {
      'data-testid': `${testId}-pill`,
      'data-left': indicatorStyle ? String(Math.round(indicatorStyle.left)) : '',
      'data-width': indicatorStyle ? String(Math.round(indicatorStyle.width)) : '',
    })
  );
}

const pill = (container, testId = 'bar') => {
  const el = container.querySelector(`[data-testid="${testId}-pill"]`);
  return { left: Number(el.dataset.left), width: Number(el.dataset.width) };
};

describe('useElasticPillIndicator', () => {
  let now;
  let frames;
  let originalRect;

  beforeEach(() => {
    now = 0;
    frames = [];
    originalRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function fakeRect() {
      const idx = this.getAttribute && this.getAttribute('data-idx');
      if (idx != null) return { left: Number(idx) * TAB_W, width: TAB_W, top: 0, height: 44 };
      return { left: 0, width: TAB_W * 4, top: 0, height: 44 };
    };
    vi.stubGlobal('requestAnimationFrame', (cb) => { frames.push(cb); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', () => { frames.length = 0; });
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    // Sem prefers-reduced-motion, senão a duração cai para 120ms.
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = originalRect;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Avança `ms` e corre os frames pendentes. */
  const step = (ms) => {
    now += ms;
    const pending = frames.splice(0);
    act(() => { pending.forEach((cb) => cb(now)); });
  };

  it('assenta no separador ativo à montagem, sem animar', () => {
    const { container } = render(React.createElement(Bar, { activeIndex: 2 }));
    expect(pill(container)).toEqual({ left: 140, width: TAB_W });
    expect(frames).toHaveLength(0);
  });

  it('estica a cobrir origem e destino e depois contrai no destino', () => {
    const { container, rerender } = render(React.createElement(Bar, { activeIndex: 0 }));
    expect(pill(container)).toEqual({ left: 0, width: TAB_W });

    act(() => { rerender(React.createElement(Bar, { activeIndex: 3 })); });

    // A meio da fase de esticar (45% de 810ms ≈ 365ms) já cobre bem mais do
    // que um separador — é a minhoca a engolir os do meio.
    step(200);
    expect(pill(container).width).toBeGreaterThan(TAB_W * 2);

    // Fim dos 810ms de navPillDuration(0, 3): assenta exatamente no destino.
    step(700);
    expect(pill(container)).toEqual({ left: 3 * TAB_W, width: TAB_W });
  });

  it('aceita a duração como número — 320ms nos subnavs', () => {
    const { container, rerender } = render(
      React.createElement(Bar, { activeIndex: 0, options: { duration: SUBNAV_PILL_DURATION } })
    );
    act(() => { rerender(React.createElement(Bar, { activeIndex: 3, options: { duration: SUBNAV_PILL_DURATION } })); });

    step(200);
    expect(pill(container).left).not.toBe(3 * TAB_W); // ainda a caminho

    step(140); // 340ms > 320ms
    expect(pill(container)).toEqual({ left: 3 * TAB_W, width: TAB_W });
  });

  it('aceita a duração como função (fromIndex, toIndex) => ms', () => {
    const duration = vi.fn(() => 100);
    const { rerender } = render(React.createElement(Bar, { activeIndex: 1, options: { duration } }));
    act(() => { rerender(React.createElement(Bar, { activeIndex: 3, options: { duration } })); });
    expect(duration).toHaveBeenCalledWith(1, 3);
  });

  it('nunca duas em movimento: mexer na segunda barra salta a primeira para o fim', () => {
    const { container, rerender } = render(
      React.createElement(React.Fragment, null,
        React.createElement(Bar, { key: 'a', activeIndex: 0, testId: 'nav' }),
        React.createElement(Bar, { key: 'b', activeIndex: 0, testId: 'sub' }))
    );

    const tree = (navIdx, subIdx) => React.createElement(React.Fragment, null,
      React.createElement(Bar, { key: 'a', activeIndex: navIdx, testId: 'nav' }),
      React.createElement(Bar, { key: 'b', activeIndex: subIdx, testId: 'sub' }));

    act(() => { rerender(tree(3, 0)); });
    step(100); // a da nav está a meio do caminho
    expect(pill(container, 'nav').left).toBeLessThan(3 * TAB_W);

    // A segunda barra reclama o palco: a primeira salta para o destino.
    act(() => { rerender(tree(3, 2)); });
    expect(pill(container, 'nav')).toEqual({ left: 3 * TAB_W, width: TAB_W });
  });

  it('com prefers-reduced-motion a minhoca encurta para 120ms', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const { container, rerender } = render(React.createElement(Bar, { activeIndex: 0 }));
    act(() => { rerender(React.createElement(Bar, { activeIndex: 3 })); });

    step(130); // navPillDuration daria 810ms
    expect(pill(container)).toEqual({ left: 3 * TAB_W, width: TAB_W });
  });
});
