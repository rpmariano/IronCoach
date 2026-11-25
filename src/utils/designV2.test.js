import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { isDesignV2, setDesignV2, applyDesignV2Class, useDesignV2, DESIGN_V2_KEY, DESIGN_V2_CLASS } from './designV2';

/* O Design v2 (2026-11-24): um interruptor local, por dispositivo, desligado por defeito. */

beforeEach(() => { window.localStorage.clear(); document.documentElement.classList.remove(DESIGN_V2_CLASS); });
afterEach(() => { window.localStorage.clear(); document.documentElement.classList.remove(DESIGN_V2_CLASS); vi.restoreAllMocks(); });

describe('designV2', () => {
  it('por defeito está desligado, e sem a classe no <html>', () => {
    expect(isDesignV2()).toBe(false);
    applyDesignV2Class();
    expect(document.documentElement.classList.contains(DESIGN_V2_CLASS)).toBe(false);
  });

  it('só "1" liga', () => {
    window.localStorage.setItem(DESIGN_V2_KEY, 'true');
    expect(isDesignV2()).toBe(false);
    window.localStorage.setItem(DESIGN_V2_KEY, '1');
    expect(isDesignV2()).toBe(true);
  });

  it('com o armazenamento bloqueado, fica desligado e não rebenta', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('SecurityError'); });
    expect(isDesignV2()).toBe(false);
    expect(() => setDesignV2(true)).not.toThrow();
    expect(document.documentElement.classList.contains(DESIGN_V2_CLASS)).toBe(false);
  });

  it('setDesignV2 grava, põe a classe e o hook troca sem recarregar', () => {
    const { result } = renderHook(() => useDesignV2());
    expect(result.current).toBe(false);
    act(() => setDesignV2(true));
    expect(window.localStorage.getItem(DESIGN_V2_KEY)).toBe('1');
    expect(document.documentElement.classList.contains(DESIGN_V2_CLASS)).toBe(true);
    expect(result.current).toBe(true);
    act(() => setDesignV2(false));
    expect(window.localStorage.getItem(DESIGN_V2_KEY)).toBeNull();
    expect(document.documentElement.classList.contains(DESIGN_V2_CLASS)).toBe(false);
    expect(result.current).toBe(false);
  });
});

describe('designV2 — só para admins, e a classe sem componente montado', () => {
  const fakeStore = (initial) => {
    let state = initial; const subs = new Set();
    return {
      getState: () => state,
      subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
      set: (patch) => { state = { ...state, ...patch }; subs.forEach((fn) => fn(state)); },
    };
  };

  it('ao sair da conta, a flag apaga-se', async () => {
    const { enforceDesignV2Access } = await import('./designV2');
    setDesignV2(true);
    const store = fakeStore({ session: { user: { id: 'a' } }, profile: { id: 'a' }, isAdmin: true });
    const stop = enforceDesignV2Access(store);
    store.set({ session: null, profile: null, isAdmin: false });
    expect(isDesignV2()).toBe(false);
    expect(document.documentElement.classList.contains(DESIGN_V2_CLASS)).toBe(false);
    stop();
  });

  it('com o perfil de quem não é admin, a flag apaga-se; no arranque (sem perfil) não', async () => {
    const { enforceDesignV2Access } = await import('./designV2');
    setDesignV2(true);
    const store = fakeStore({ session: null, profile: null, isAdmin: false });
    const stop = enforceDesignV2Access(store);
    store.set({ session: { user: { id: 'a' } } });
    expect(isDesignV2()).toBe(true);
    store.set({ profile: { id: 'a', is_admin: true }, isAdmin: true });
    expect(isDesignV2()).toBe(true);
    // Um set parcial do perfil, sem is_admin (e com o isAdmin ainda por ler), não decide nada.
    store.set({ profile: { onboarding_done: true }, isAdmin: false });
    expect(isDesignV2()).toBe(true);
    store.set({ profile: { id: 'b', is_admin: false }, isAdmin: false });
    expect(isDesignV2()).toBe(false);
    stop();
  });

  it('a mudança noutro separador re-aplica a classe sem nenhum componente montado', async () => {
    const { watchDesignV2Storage } = await import('./designV2');
    const stop = watchDesignV2Storage();
    window.localStorage.setItem(DESIGN_V2_KEY, '1');
    window.dispatchEvent(new StorageEvent('storage', { key: DESIGN_V2_KEY }));
    expect(document.documentElement.classList.contains(DESIGN_V2_CLASS)).toBe(true);
    window.localStorage.removeItem(DESIGN_V2_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: DESIGN_V2_KEY }));
    expect(document.documentElement.classList.contains(DESIGN_V2_CLASS)).toBe(false);
    stop();
  });
});
