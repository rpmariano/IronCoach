import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import React from 'react';
import { cubicBezier, easeBack, useCountUp, useCountUpDisplay, useCountUpText } from './useCountUp';
import { fmtNumber } from './dashboardVerdicts';
import { DUR_COUNT } from './introAnimations';

/* "Números que contam" — animação 2 de `IronCoach - Animacoes.dc.html`:
   1400 ms, curva --ease-back, formato PT. Fora da primeira entrada da sessão
   (e com movimento reduzido) o número aparece já no destino. */

function Valor({ alvo, animate, decimals, display }) {
  const texto = useCountUpDisplay(alvo, { animate, decimals, display });
  return React.createElement('span', { 'data-testid': 'valor' }, texto);
}
const valor = (props) => React.createElement(Valor, props);

function Cru({ alvo, animate }) {
  const v = useCountUp(alvo, { animate });
  return React.createElement('span', { 'data-testid': 'cru' }, String(v));
}
const cru = (props) => React.createElement(Cru, props);

describe('curva --ease-back', () => {
  it('cubic-bezier(.22,1,.36,1) começa em 0 e acaba em 1', () => {
    expect(easeBack(0)).toBe(0);
    expect(easeBack(1)).toBe(1);
  });

  it('é monótona e "out" — a meio do tempo já passou de metade do caminho', () => {
    expect(easeBack(0.5)).toBeGreaterThan(0.5);
    let anterior = 0;
    for (let p = 0.05; p <= 1; p += 0.05) {
      const v = easeBack(p);
      expect(v).toBeGreaterThanOrEqual(anterior);
      anterior = v;
    }
  });

  it('a linear (0,0,1,1) devolve o próprio tempo', () => {
    const linear = cubicBezier(0, 0, 1, 1);
    expect(linear(0.25)).toBeCloseTo(0.25, 3);
    expect(linear(0.75)).toBeCloseTo(0.75, 3);
  });
});

describe('sem animar (o caso do jsdom e do movimento reduzido)', () => {
  it('mostra o valor final de imediato', () => {
    render(valor({ alvo: 183, animate: false }));
    expect(screen.getByTestId('valor').textContent).toBe('183');
  });

  it('o texto final é o `display` que o ecrã já usava, não uma reformatação', () => {
    render(valor({ alvo: 1.6, animate: false, decimals: 1, display: '1,6' }));
    expect(screen.getByTestId('valor').textContent).toBe('1,6');
  });

  it('o que não é número passa intacto (um pace "5:41")', () => {
    render(valor({ alvo: '5:41', animate: false }));
    expect(screen.getByTestId('valor').textContent).toBe('5:41');
  });
});

describe('a contar (temporizadores falsos + rAF)', () => {
  let now = 0;
  let callbacks = [];
  const originalRaf = global.requestAnimationFrame;
  const originalCancel = global.cancelAnimationFrame;

  const avancar = (ms) => {
    now += ms;
    const pendentes = callbacks;
    callbacks = [];
    act(() => { pendentes.forEach(({ fn }) => fn(now)); });
  };

  beforeEach(() => {
    now = 0;
    callbacks = [];
    let id = 1;
    global.requestAnimationFrame = (fn) => { const i = id++; callbacks.push({ i, fn }); return i; };
    global.cancelAnimationFrame = (i) => { callbacks = callbacks.filter((c) => c.i !== i); };
  });

  afterEach(() => {
    global.requestAnimationFrame = originalRaf;
    global.cancelAnimationFrame = originalCancel;
    vi.useRealTimers();
  });

  it('parte de zero, passa pelo meio e fecha exatamente no destino', () => {
    render(cru({ alvo: 200, animate: true }));
    // Primeiro frame: já reposto a zero pelo efeito.
    avancar(0);
    expect(Number(screen.getByTestId('cru').textContent)).toBe(0);

    avancar(DUR_COUNT / 2);
    const meio = Number(screen.getByTestId('cru').textContent);
    expect(meio).toBeGreaterThan(0);
    expect(meio).toBeLessThan(200);

    avancar(DUR_COUNT);
    expect(Number(screen.getByTestId('cru').textContent)).toBe(200);
  });

  it('os frames do meio saem em formato PT (vírgula decimal, espaço de milhar)', () => {
    render(valor({ alvo: 1850, animate: true, display: '1850' }));
    avancar(0);
    avancar(DUR_COUNT * 0.6);
    const meio = screen.getByTestId('valor').textContent;
    // fmtNumber separa milhares com espaco insecavel (U+00A0).
    expect(meio).toMatch(/^\d{1,3}( \d{3})*$/);
    expect(meio).not.toBe('1850');

    // No fim volta a ser exatamente o texto que o ecrã já mostrava.
    avancar(DUR_COUNT);
    expect(screen.getByTestId('valor').textContent).toBe('1850');
  });

  it('com casas decimais não muda de largura a meio da contagem', () => {
    render(valor({ alvo: 1.6, animate: true, decimals: 1, display: '1,6' }));
    avancar(0);
    avancar(DUR_COUNT * 0.4);
    expect(screen.getByTestId('valor').textContent).toMatch(/^\d,\d$/);
    avancar(DUR_COUNT);
    expect(screen.getByTestId('valor').textContent).toBe('1,6');
  });

  it('useCountUpText formata sempre com fmtNumber quando não há display', () => {
    render(valor({ alvo: 12345, animate: false }));
    expect(screen.getByTestId('valor').textContent).toBe('12345');

    function Texto() {
      return React.createElement('span', { 'data-testid': 't' }, useCountUpText(12345, { animate: false }));
    }
    render(React.createElement(Texto));
    expect(screen.getByTestId('t').textContent).toBe(fmtNumber(12345, 0));
  });

  it('desmontar a meio cancela o rAF — sem frames órfãos', () => {
    const { unmount } = render(cru({ alvo: 200, animate: true }));
    avancar(0);
    expect(callbacks.length).toBe(1);
    unmount();
    expect(callbacks.length).toBe(0);
  });
});
