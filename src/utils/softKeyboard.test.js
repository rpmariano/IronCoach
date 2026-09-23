import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installSoftKeyboardWatcher, isTextField } from './softKeyboard';

/* Relato 2026-09-23: com o teclado aberto, a barra de baixo tapava a caixa
   de texto do Coach. O atributo no <html> é o que o CSS usa para a esconder. */

function fakeViewport(height) {
  const listeners = {};
  return {
    height,
    addEventListener: (t, fn) => { listeners[t] = fn; },
    removeEventListener: () => {},
    fire(h) { this.height = h; listeners.resize?.(); },
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
});
