import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installSoftKeyboardWatcher, isTextField, computeKeyboardInset } from './softKeyboard';

/* Relato 2026-09-23: com o teclado aberto, a barra de baixo tapava a caixa
   de texto do Coach. O atributo no <html> é o que o CSS usa para a esconder. */

function fakeViewport(height) {
  const listeners = {};
  return {
    height,
    offsetTop: 0,
    addEventListener: (t, fn) => { listeners[t] = fn; },
    removeEventListener: () => {},
    fire(h) { this.height = h; listeners.resize?.(); },
    scroll(top) { this.offsetTop = top; listeners.scroll?.(); },
  };
}

describe('softKeyboard', () => {
  let vv, uninstall, win;
  const open = () => document.documentElement.getAttribute('data-keyboard') === 'open';

  beforeEach(() => {
    vi.useFakeTimers();
    vv = fakeViewport(800);
    win = Object.create(window);
    Object.defineProperty(win, 'document', { value: document });
    Object.defineProperty(win, 'visualViewport', { value: vv });
    Object.defineProperty(win, 'innerHeight', { value: 800, configurable: true });
    win.matchMedia = () => ({ matches: true });
    win.setTimeout = (fn, ms) => setTimeout(fn, ms);
    win.addEventListener = () => {};
    win.removeEventListener = () => {};
    document.body.innerHTML = '<textarea id="t"></textarea><input id="c" type="checkbox"><button id="b">x</button>';
    uninstall = installSoftKeyboardWatcher(win);
  });
  afterEach(() => { uninstall(); vi.useRealTimers(); document.body.innerHTML = ''; });

  it('foco num campo de texto abre; sair dele fecha', () => {
    document.getElementById('t').focus();
    expect(open()).toBe(true);
    document.getElementById('b').focus();
    vi.runAllTimers();
    expect(open()).toBe(false);
  });

  it('uma checkbox não abre teclado', () => {
    document.getElementById('c').focus();
    expect(open()).toBe(false);
  });

  it('o "voltar" do Android fecha o teclado sem tirar o foco: a barra volta', () => {
    document.getElementById('t').focus();
    vv.fire(450);
    expect(open()).toBe(true);
    // a meio da animação não pisca
    vv.fire(700);
    expect(open()).toBe(true);
    vv.fire(800);
    expect(open()).toBe(false);
  });

  it('num computador (sem ecrã de toque) nunca esconde nada', () => {
    uninstall();
    win.matchMedia = () => ({ matches: false });
    uninstall = installSoftKeyboardWatcher(win);
    document.getElementById('t').focus();
    expect(open()).toBe(false);
  });

  it('isTextField: textarea e input de texto sim; date, checkbox e desativado não', () => {
    const el = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.firstChild; };
    expect(isTextField(el('<textarea></textarea>'))).toBe(true);
    expect(isTextField(el('<input type="number">'))).toBe(true);
    expect(isTextField(el('<input type="date">'))).toBe(false);
    expect(isTextField(el('<input type="text" disabled>'))).toBe(false);
  });
  // Bug #56 (2026-10-05): iOS — o teclado tapa o layout viewport.
  describe('--keyboard-inset', () => {
    const inset = () => document.documentElement.style.getPropertyValue('--keyboard-inset');

    it('sem teclado é 0px', () => {
      expect(inset()).toBe('0px');
    });

    it('iOS: o teclado tapa 336 px e o inset acompanha', () => {
      document.getElementById('t').focus();
      vv.fire(464);
      expect(inset()).toBe('336px');
    });

    it('desconta o offsetTop que o iOS aplica ao rolar a página', () => {
      document.getElementById('t').focus();
      vv.offsetTop = 100;
      vv.fire(464);
      expect(inset()).toBe('236px');
      vv.scroll(0);
      expect(inset()).toBe('336px');
    });

    it('Android com resizes-content: innerHeight acompanha o visualViewport, inset 0', () => {
      Object.defineProperty(win, 'innerHeight', { value: 464, configurable: true });
      document.getElementById('t').focus();
      vv.fire(464);
      expect(open()).toBe(true);
      expect(inset()).toBe('0px');
    });

    it('nunca é negativo', () => {
      expect(computeKeyboardInset({ innerHeight: 700, visualViewport: { height: 800, offsetTop: 0 } })).toBe(0);
      expect(computeKeyboardInset({ innerHeight: 700 })).toBe(0);
    });

    it('fechar o teclado volta a 0px', () => {
      document.getElementById('t').focus();
      vv.fire(464);
      vv.fire(800);
      expect(inset()).toBe('0px');
    });
  });
});
