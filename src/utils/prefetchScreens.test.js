import { describe, it, expect, vi, afterEach } from 'vitest';
import { prefetchScreensWhenIdle, rememberDefaultExport } from './prefetchScreens';

const now = (fn) => fn();

describe('prefetchScreensWhenIdle — os ecrãs carregados antes de se pedirem', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('depois da espera, carrega um de cada vez, pela ordem', async () => {
    vi.useFakeTimers();
    const order = [];
    const load = (name) => () => new Promise((r) => { order.push(`${name}:início`); setTimeout(() => { order.push(`${name}:fim`); r(); }, 10); });
    prefetchScreensWhenIdle([load('coach'), load('perfil')], { delayMs: 100, idle: now, saveData: false });
    expect(order).toEqual([]);
    await vi.advanceTimersByTimeAsync(100);
    expect(order).toEqual(['coach:início']);
    await vi.advanceTimersByTimeAsync(10);
    expect(order).toEqual(['coach:início', 'coach:fim', 'perfil:início']);
  });

  it('cada ecrã espera pelo seu tempo morto, não só o primeiro', async () => {
    vi.useFakeTimers();
    const idle = vi.fn((fn) => fn());
    const loads = [vi.fn(() => Promise.resolve()), vi.fn(() => Promise.resolve()), vi.fn(() => Promise.resolve())];
    prefetchScreensWhenIdle(loads, { delayMs: 0, idle, saveData: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(idle).toHaveBeenCalledTimes(3);
    loads.forEach((l) => expect(l).toHaveBeenCalledTimes(1));
  });

  it('uma falha não pára os seguintes', async () => {
    vi.useFakeTimers();
    const ok = vi.fn(() => Promise.resolve());
    prefetchScreensWhenIdle([() => Promise.reject(new Error('404')), ok], { delayMs: 0, idle: now, saveData: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('com a poupança de dados ligada, não carrega nada', async () => {
    vi.useFakeTimers();
    const load = vi.fn(() => Promise.resolve());
    prefetchScreensWhenIdle([load], { delayMs: 0, idle: now, saveData: true });
    await vi.advanceTimersByTimeAsync(10);
    expect(load).not.toHaveBeenCalled();
  });

  it('cancelado antes da espera, não carrega nada', async () => {
    vi.useFakeTimers();
    const load = vi.fn(() => Promise.resolve());
    const cancel = prefetchScreensWhenIdle([load], { delayMs: 100, idle: now, saveData: false });
    cancel();
    await vi.advanceTimersByTimeAsync(200);
    expect(load).not.toHaveBeenCalled();
  });
});

describe('rememberDefaultExport — o ecrã já carregado desenha-se sem passar pelo lazy', () => {
  it('get() é null até o import resolver, e depois devolve o export por omissão', async () => {
    const Comp = () => null;
    const mod = { default: Comp };
    const screen = rememberDefaultExport(() => Promise.resolve(mod));
    expect(screen.get()).toBe(null);
    await expect(screen.load()).resolves.toBe(mod);
    expect(screen.get()).toBe(Comp);
  });

  it('uma falha não regista nada e propaga o erro (o retryOnce trata dele)', async () => {
    const screen = rememberDefaultExport(() => Promise.reject(new Error('404')));
    await expect(screen.load()).rejects.toThrow('404');
    expect(screen.get()).toBe(null);
  });
});
