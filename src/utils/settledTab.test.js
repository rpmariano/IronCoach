import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, act, screen } from '@testing-library/react';
import {
  trackSettledTab,
  alignedPageIndex,
  getSettledIndex,
  getLastSettledIndex,
  setSettledIndex,
  resetSettledTab,
  scheduleWhenSettled,
  useTabSettled,
  TabPageContext,
  SETTLE_DEBOUNCE_MS,
  SETTLE_SAFETY_MS,
  carouselPageWidth,
  nearestPageIndex,
} from './settledTab';

/* "Separador assente" (2026-10-04, F5): o carrossel parado, sem toque, com o
   scrollLeft alinhado a uma página. O jsdom não faz layout — a largura e o
   scrollLeft simulam-se à mão. */

const WIDTH = 390;
function carousel() {
  const el = document.createElement('div');
  Object.defineProperty(el, 'offsetWidth', { configurable: true, value: WIDTH });
  document.body.appendChild(el);
  return el;
}
const scrollTo = (el, left) => { el.scrollLeft = left; el.dispatchEvent(new Event('scroll')); };
const touch = (el, type, touches = []) => {
  const e = new Event(type);
  e.touches = touches;
  el.dispatchEvent(e);
};

describe('alignedPageIndex', () => {
  it('dá a página só quando o scrollLeft está alinhado (≤ 1 px)', () => {
    const el = carousel();
    el.scrollLeft = 780;
    expect(alignedPageIndex(el, 5)).toBe(2);
    el.scrollLeft = 780.6;
    expect(alignedPageIndex(el, 5)).toBe(2);
    el.scrollLeft = 700;
    expect(alignedPageIndex(el, 5)).toBe(-1);
  });

  it('sem largura (por pintar) não há página', () => {
    const el = document.createElement('div');
    expect(alignedPageIndex(el, 5)).toBe(-1);
  });
});

/* 2026-10-05 (A1, P0): larguras FRACIONÁRIAS. O browser arredonda o
   `offsetWidth`; o snap pára em idx × largura real. Um Pixel (411,43 px de
   ecrã) dá um carrossel de 379,43 px; o zoom e o aA dão outras. */
function fractionalCarousel(rectWidth) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'offsetWidth', { configurable: true, value: Math.round(rectWidth) });
  el.getBoundingClientRect = () => ({ width: rectWidth, height: 600, top: 0, left: 0, right: rectWidth, bottom: 600 });
  document.body.appendChild(el);
  return el;
}

describe('larguras fracionárias (Pixel, zoom)', () => {
  it('carouselPageWidth usa a largura com casas decimais e cai no offsetWidth sem layout', () => {
    const el = fractionalCarousel(379.43);
    expect(carouselPageWidth(el)).toBeCloseTo(379.43, 5);
    expect(carouselPageWidth(carousel())).toBe(WIDTH);
    expect(carouselPageWidth({ offsetWidth: 300 })).toBe(300);
    expect(carouselPageWidth(null)).toBe(0);
  });

  for (const width of [379.43, 411.43]) {
    it(`com ${String(width).replace('.', ',')} px todas as páginas assentam (scrollLeft fracionário e arredondado)`, () => {
      const el = fractionalCarousel(width);
      for (let i = 0; i < 5; i++) {
        el.scrollLeft = i * width; // o que o snap dá
        expect(alignedPageIndex(el, 5)).toBe(i);
        el.scrollLeft = Math.round(i * width); // o que o browser arredonda
        expect(alignedPageIndex(el, 5)).toBe(i);
        el.scrollLeft = i * width + 0.37; // subpíxel de um ecrã de alta densidade
        expect(alignedPageIndex(el, 5)).toBe(i);
      }
      // A meio de duas páginas continua a não estar assente.
      el.scrollLeft = 3.5 * width;
      expect(alignedPageIndex(el, 5)).toBe(-1);
      el.remove();
    });
  }

  it('o Corpo (índice 4) assenta num Pixel — com o offsetWidth arredondado não assentava', () => {
    const el = fractionalCarousel(379.43);
    el.scrollLeft = 4 * 379.43; // 1517,72
    // A conta antiga: |1517,72 − 4 × 379| = 1,72 px > 1 px → nunca assente.
    expect(Math.abs(el.scrollLeft - 4 * el.offsetWidth)).toBeGreaterThan(1);
    expect(alignedPageIndex(el, 5)).toBe(4);
    el.remove();
  });

  it('nearestPageIndex limita às páginas que existem', () => {
    const el = fractionalCarousel(379.43);
    el.scrollLeft = 3.4 * 379.43;
    expect(nearestPageIndex(el, 5)).toBe(3);
    el.scrollLeft = 9999;
    expect(nearestPageIndex(el, 5)).toBe(4);
    el.remove();
  });
});

describe('trackSettledTab', () => {
  let el;
  let stop;
  beforeEach(() => {
    vi.useFakeTimers();
    resetSettledTab();
    el = carousel();
    stop = trackSettledTab(el, { pageCount: 5 });
  });
  afterEach(() => {
    stop();
    el.remove();
    resetSettledTab();
    vi.useRealTimers();
  });

  it('assenta na página alinhada depois de 120 ms sem scroll', () => {
    scrollTo(el, 780);
    expect(getSettledIndex()).toBe(-1);
    vi.advanceTimersByTime(SETTLE_DEBOUNCE_MS + 10);
    expect(getSettledIndex()).toBe(2);
  });

  it('um scroll que atravessa várias páginas sem parar só assenta na última', () => {
    setSettledIndex(0);
    scrollTo(el, 200);
    expect(getSettledIndex()).toBe(-1); // desalinhado: deixa logo de estar assente
    vi.advanceTimersByTime(50);
    scrollTo(el, 390); // passa pela página 1, alinhada, mas sem parar
    vi.advanceTimersByTime(50);
    scrollTo(el, 700);
    vi.advanceTimersByTime(50);
    scrollTo(el, 1170);
    expect(getSettledIndex()).toBe(-1);
    vi.advanceTimersByTime(SETTLE_DEBOUNCE_MS + 10);
    expect(getSettledIndex()).toBe(3);
  });

  it('o dedo parado a meio do gesto não assenta (nem alinhado)', () => {
    setSettledIndex(1);
    touch(el, 'touchstart', [{}]);
    scrollTo(el, 500);
    expect(getSettledIndex()).toBe(-1);
    scrollTo(el, 780); // arrastou até alinhar e parou com o dedo pousado
    vi.advanceTimersByTime(1000);
    expect(getSettledIndex()).toBe(-1);
    touch(el, 'touchend', []);
    vi.advanceTimersByTime(SETTLE_DEBOUNCE_MS + 10);
    expect(getSettledIndex()).toBe(2);
  });

  it('com dois dedos, levantar um não assenta', () => {
    touch(el, 'touchstart', [{}, {}]);
    scrollTo(el, 780);
    touch(el, 'touchend', [{}]);
    vi.advanceTimersByTime(500);
    expect(getSettledIndex()).toBe(-1);
    touch(el, 'touchend', []);
    vi.advanceTimersByTime(SETTLE_DEBOUNCE_MS + 10);
    expect(getSettledIndex()).toBe(2);
  });

  it('scrollend assenta logo, sem esperar pelo debounce', () => {
    scrollTo(el, 390);
    el.dispatchEvent(new Event('scrollend'));
    expect(getSettledIndex()).toBe(1);
  });

  it('scrollend desalinhado (snap ainda por acabar) não assenta', () => {
    scrollTo(el, 400);
    el.dispatchEvent(new Event('scrollend'));
    expect(getSettledIndex()).toBe(-1);
  });

  it('um toque sem deslize (tocar num botão, scroll vertical) não desfaz o assentamento', () => {
    setSettledIndex(2);
    el.scrollLeft = 780;
    touch(el, 'touchstart', [{}]);
    expect(getSettledIndex()).toBe(2);
    touch(el, 'touchend', []);
    vi.advanceTimersByTime(SETTLE_DEBOUNCE_MS + 10);
    expect(getSettledIndex()).toBe(2);
  });

  it('a última página assente sobrevive ao −1 do gesto (é a que manda na altura)', () => {
    setSettledIndex(2);
    scrollTo(el, 900);
    expect(getSettledIndex()).toBe(-1);
    expect(getLastSettledIndex()).toBe(2);
  });

  it('assenta no índice 4 de um carrossel de 379,43 px com scrollLeft fracionário', () => {
    stop();
    el.remove();
    el = fractionalCarousel(379.43);
    stop = trackSettledTab(el, { pageCount: 5 });
    scrollTo(el, 1517.72);
    vi.advanceTimersByTime(SETTLE_DEBOUNCE_MS + 10);
    expect(getSettledIndex()).toBe(4);
  });

  /* Rede de segurança (2026-10-05): parado sem página assente, ao fim de
     SETTLE_SAFETY_MS assenta na mais próxima — nunca um gráfico invisível
     para sempre. */
  it('parado desalinhado, a rede assenta na página mais próxima', () => {
    scrollTo(el, 800); // 20 px depois da página 2: fora da folga
    vi.advanceTimersByTime(SETTLE_DEBOUNCE_MS + 10);
    expect(getSettledIndex()).toBe(-1);
    vi.advanceTimersByTime(SETTLE_SAFETY_MS);
    expect(getSettledIndex()).toBe(2);
  });

  it('a rede espera pelo fim do scroll e não age com o dedo pousado', () => {
    touch(el, 'touchstart', [{}]);
    scrollTo(el, 500);
    vi.advanceTimersByTime(SETTLE_SAFETY_MS * 3);
    expect(getSettledIndex()).toBe(-1);
    touch(el, 'touchend', []);
    scrollTo(el, 760);
    vi.advanceTimersByTime(SETTLE_SAFETY_MS - 50);
    scrollTo(el, 770); // ainda a mexer: recomeça a contar
    vi.advanceTimersByTime(SETTLE_SAFETY_MS - 50);
    expect(getSettledIndex()).toBe(-1);
    vi.advanceTimersByTime(100);
    expect(getSettledIndex()).toBe(2);
  });

  it('a rede não mexe numa página já assente', () => {
    setSettledIndex(1);
    el.scrollLeft = 390;
    vi.advanceTimersByTime(SETTLE_SAFETY_MS * 2);
    expect(getSettledIndex()).toBe(1);
  });

  /* 2026-10-05 (A6): o alvo do toque sai do DOM a meio do gesto (um
     separador que troca o "ainda sem dados" pelos gráficos). O touchend vai
     para o nó desligado e não borbulha — antes o toque ficava preso. */
  it('o touchend de um alvo que saiu do DOM a meio do gesto também solta o toque', () => {
    const alvo = document.createElement('button');
    el.appendChild(alvo);
    const start = new Event('touchstart', { bubbles: true });
    start.touches = [{}];
    alvo.dispatchEvent(start);
    scrollTo(el, 780);
    alvo.remove();
    const end = new Event('touchend', { bubbles: true });
    end.touches = [];
    alvo.dispatchEvent(end); // não chega ao carrossel
    vi.advanceTimersByTime(SETTLE_DEBOUNCE_MS + 10);
    expect(getSettledIndex()).toBe(2);
  });

  it('com o alvo ainda no carrossel, o touchend conta uma vez só (pelo carrossel)', () => {
    const alvo = document.createElement('button');
    el.appendChild(alvo);
    const start = new Event('touchstart', { bubbles: true });
    start.touches = [{}];
    alvo.dispatchEvent(start);
    scrollTo(el, 780);
    const end = new Event('touchend', { bubbles: true });
    end.touches = [];
    alvo.dispatchEvent(end);
    vi.advanceTimersByTime(SETTLE_DEBOUNCE_MS + 10);
    expect(getSettledIndex()).toBe(2);
  });

  it('desligar remove os ouvintes', () => {
    stop();
    scrollTo(el, 780);
    vi.advanceTimersByTime(SETTLE_SAFETY_MS * 2); // nem a rede fica para trás
    expect(getSettledIndex()).toBe(-1);
    stop = () => {};
  });
});

describe('useTabSettled', () => {
  afterEach(() => resetSettledTab());

  function Probe() {
    return React.createElement('span', { 'data-testid': 'p' }, String(useTabSettled()));
  }
  const inPage = (i) => React.createElement(TabPageContext.Provider, { value: i }, React.createElement(Probe));

  it('é um booleano por página', () => {
    resetSettledTab();
    render(inPage(1));
    expect(screen.getByTestId('p').textContent).toBe('false');
    act(() => setSettledIndex(1));
    expect(screen.getByTestId('p').textContent).toBe('true');
    act(() => setSettledIndex(2));
    expect(screen.getByTestId('p').textContent).toBe('false');
  });

  it('fora do carrossel conta sempre como assente', () => {
    resetSettledTab();
    render(React.createElement(Probe));
    expect(screen.getByTestId('p').textContent).toBe('true');
  });
});

describe('scheduleWhenSettled', () => {
  beforeEach(() => { vi.useFakeTimers(); resetSettledTab(); });
  afterEach(() => { resetSettledTab(); vi.useRealTimers(); });

  it('um trabalho por vez, só com o carrossel assente e a página vizinha', () => {
    const done = [];
    setSettledIndex(1);
    scheduleWhenSettled(0, () => done.push('a'));
    scheduleWhenSettled(2, () => done.push('b'));
    scheduleWhenSettled(4, () => done.push('longe')); // a 3 páginas: não corre
    vi.advanceTimersByTime(40);
    expect(done).toEqual(['a']);
    vi.advanceTimersByTime(40);
    expect(done).toEqual(['a', 'b']);
    vi.advanceTimersByTime(200);
    expect(done).toEqual(['a', 'b']);
  });

  it('a meio de um gesto espera que assente', () => {
    const done = [];
    setSettledIndex(-1);
    scheduleWhenSettled(1, () => done.push('x'));
    vi.advanceTimersByTime(500);
    expect(done).toEqual([]);
    setSettledIndex(1);
    vi.advanceTimersByTime(40);
    expect(done).toEqual(['x']);
  });

  it('cancelado não corre', () => {
    const done = [];
    setSettledIndex(0);
    const cancel = scheduleWhenSettled(0, () => done.push('x'));
    cancel();
    vi.advanceTimersByTime(200);
    expect(done).toEqual([]);
  });
});
