import { describe, it, expect, vi, afterEach } from 'vitest';
import { prefetchScreensWhenIdle } from './prefetchScreens';

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
