import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReducedMotion, prefersReducedMotion, subscribeReducedMotion } from './useReducedMotion';

/* 2026-10-04 (F5): a preferência lê-se em tempo real e protege-se para jsdom,
   onde matchMedia e addEventListener podem não existir. */

const original = window.matchMedia;
afterEach(() => { window.matchMedia = original; });

/** matchMedia falso com `change` controlável. */
function fakeMedia(initial) {
  const state = { matches: initial, listeners: new Set() };
  window.matchMedia = vi.fn(() => ({
    get matches() { return state.matches; },
    addEventListener: (_t, fn) => state.listeners.add(fn),
    removeEventListener: (_t, fn) => state.listeners.delete(fn),
  }));
  state.set = (v) => { state.matches = v; state.listeners.forEach((fn) => fn({ matches: v })); };
  return state;
}

describe('useReducedMotion', () => {
  it('lê a preferência atual', () => {
    fakeMedia(true);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(true);
    fakeMedia(false);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
  });

  it('reage a uma mudança com a app aberta e limpa o ouvinte ao desmontar', () => {
    const m = fakeMedia(false);
    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => m.set(true));
    expect(result.current).toBe(true);
    act(() => m.set(false));
    expect(result.current).toBe(false);
    unmount();
    expect(m.listeners.size).toBe(0);
  });

  it('sem matchMedia (jsdom cru) não rebenta e não anima', () => {
    window.matchMedia = undefined;
    expect(prefersReducedMotion()).toBe(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('matchMedia sem addEventListener (como nos testes antigos) não rebenta', () => {
    window.matchMedia = () => ({ matches: false });
    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    expect(() => unmount()).not.toThrow();
  });

  it('usa addListener/removeListener quando só esses existem (Safari antigo)', () => {
    const add = vi.fn(); const remove = vi.fn();
    window.matchMedia = () => ({ matches: false, addListener: add, removeListener: remove });
    const cb = () => {};
    const off = subscribeReducedMotion(cb);
    expect(add).toHaveBeenCalledWith(cb);
    off();
    expect(remove).toHaveBeenCalledWith(cb);
  });

  it('matchMedia que lança não rebenta a subscrição', () => {
    window.matchMedia = () => { throw new Error('boom'); };
    expect(() => subscribeReducedMotion(() => {})()).not.toThrow();
  });
});
