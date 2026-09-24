import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useHeldWhile, holdForLogo, registerSkeletonLogo, adoptBootSplash, releaseBootSplash, LOGO_DRAW_MS, LOGO_INTRO_MS, SKELETON_DELAY_MS } from './logoIntro';

describe('useHeldWhile — o ecrã do logo só sai quando o desenho acaba', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('os dados chegam a meio do desenho: fica até ao fim', () => {
    const { result, rerender } = renderHook(({ a }) => useHeldWhile(a, 2450), { initialProps: { a: true } });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(800); });
    rerender({ a: false });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(1600); });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(60); });
    expect(result.current).toBe(false);
  });

  it('os dados demoram mais do que o desenho: sai quando chegam', () => {
    const { result, rerender } = renderHook(({ a }) => useHeldWhile(a, 2450), { initialProps: { a: true } });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current).toBe(true);
    rerender({ a: false });
    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current).toBe(false);
  });

  it('volta a entrar (login): o desenho recomeça a contar', () => {
    const { result, rerender } = renderHook(({ a }) => useHeldWhile(a, 2450), { initialProps: { a: false } });
    expect(result.current).toBe(false);
    rerender({ a: true });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(100); });
    rerender({ a: false });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(400); });
    expect(result.current).toBe(false);
  });

  it('volta a ficar ativo a meio da espera: conta desde o início original (o desenho não recomeçou)', () => {
    const { result, rerender } = renderHook(({ a }) => useHeldWhile(a, 2450), { initialProps: { a: true } });
    act(() => { vi.advanceTimersByTime(500); });
    rerender({ a: false });
    act(() => { vi.advanceTimersByTime(500); });
    rerender({ a: true });
    rerender({ a: false });
    act(() => { vi.advanceTimersByTime(1400); });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(60); });
    expect(result.current).toBe(false);
  });

  it('com movimento reduzido (minMs 0) não retém nada', () => {
    const { result, rerender } = renderHook(({ a }) => useHeldWhile(a, 0), { initialProps: { a: true } });
    rerender({ a: false });
    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current).toBe(false);
  });
});

describe('holdForLogo — o ecrã espera pelo brasão, se ele chegou a aparecer', () => {
  const original = window.matchMedia;
  beforeEach(() => { window.matchMedia = () => ({ matches: false }); });
  afterEach(() => { window.matchMedia = original; });

  it('ecrã rápido (nenhum logo à vista): entra logo', async () => {
    const wait = vi.fn(() => Promise.resolve());
    await expect(holdForLogo(() => Promise.resolve('mod'), { now: () => 100, wait })()).resolves.toBe('mod');
    expect(wait).not.toHaveBeenCalled();
  });

  it('ecrã lento (logo à vista): espera até o brasão acabar', async () => {
    const off = registerSkeletonLogo(400);
    let t = 900;
    const wait = vi.fn(async (ms) => { t += ms; });
    await expect(holdForLogo(() => Promise.resolve('mod'), { now: () => t, wait })()).resolves.toBe('mod');
    expect(wait).toHaveBeenCalledWith(400 + LOGO_DRAW_MS - 900);
    off();
  });

  it('ecrã muito lento (o desenho já acabou): entra quando chega', async () => {
    const off = registerSkeletonLogo(0);
    const wait = vi.fn(() => Promise.resolve());
    await expect(holdForLogo(() => Promise.resolve('mod'), { now: () => 5000, wait })()).resolves.toBe('mod');
    expect(wait).not.toHaveBeenCalled();
    off();
  });
});

describe('holdForLogo — casos-limite do logo do esqueleto', () => {
  const original = window.matchMedia;
  afterEach(() => { window.matchMedia = original; });

  it('com movimento reduzido nunca espera', async () => {
    window.matchMedia = () => ({ matches: true });
    const off = registerSkeletonLogo(0);
    const wait = vi.fn(() => Promise.resolve());
    await expect(holdForLogo(() => Promise.resolve('m'), { now: () => 100, wait })()).resolves.toBe('m');
    expect(wait).not.toHaveBeenCalled();
    off();
  });

  it('o atleta sai e volta a meio: espera pelo desenho novo, não pelo antigo', async () => {
    window.matchMedia = () => ({ matches: false });
    let t = 1000;
    const offOld = registerSkeletonLogo(0);
    let offNew = null;
    const wait = vi.fn(async (ms) => {
      t += ms;
      // Durante a primeira espera, o esqueleto antigo saiu e entrou um novo.
      if (!offNew) { offOld(); offNew = registerSkeletonLogo(1500); }
    });
    await holdForLogo(() => Promise.resolve('m'), { now: () => t, wait })();
    expect(t).toBe(1500 + LOGO_DRAW_MS);
    offNew();
  });
});

describe('ScreenSkeleton — o atraso fica acima do do React', () => {
  it('SKELETON_DELAY_MS passa os 300 ms em que o React 19 segura o fallback', () => {
    expect(SKELETON_DELAY_MS).toBeGreaterThan(300);
  });
});

describe('logo de arranque do index.html — a app adota-o, não o recomeça', () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
    document.getElementById('boot-splash')?.remove();
    delete window.__bootSplashAdopted;
    delete window.__bootSplashAt;
    vi.useRealTimers();
  });

  function montarSplash(startedAt) {
    const el = document.createElement('div');
    el.id = 'boot-splash';
    document.body.appendChild(el);
    window.__bootSplashAt = startedAt;
    return el;
  }

  it('sem logo no HTML (testes, recarga), não há nada a adotar', () => {
    expect(adoptBootSplash()).toBeNull();
  });

  it('conta só o que falta do desenho, desde que ele começou', () => {
    window.matchMedia = () => ({ matches: false });
    montarSplash(performance.now() - 1000);
    const { remainingMs } = adoptBootSplash();
    expect(remainingMs).toBeGreaterThan(LOGO_INTRO_MS - 1100);
    expect(remainingMs).toBeLessThanOrEqual(LOGO_INTRO_MS - 1000);
    expect(window.__bootSplashAdopted).toBe(true);
  });

  it('com o desenho já acabado (JavaScript lento), não espera mais', () => {
    window.matchMedia = () => ({ matches: false });
    montarSplash(performance.now() - 9000);
    expect(adoptBootSplash().remainingMs).toBe(0);
  });

  it('com movimento reduzido, não espera nada', () => {
    window.matchMedia = () => ({ matches: true });
    montarSplash(performance.now());
    expect(adoptBootSplash().remainingMs).toBe(0);
  });

  it('ao sair, desvanece e desaparece', () => {
    vi.useFakeTimers();
    window.matchMedia = () => ({ matches: false });
    const el = montarSplash(0);
    releaseBootSplash();
    expect(el.classList.contains('bs-out')).toBe(true);
    expect(document.getElementById('boot-splash')).not.toBeNull();
    vi.advanceTimersByTime(300);
    expect(document.getElementById('boot-splash')).toBeNull();
  });
});
