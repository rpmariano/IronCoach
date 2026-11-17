import { describe, it, expect, vi, afterEach } from 'vitest';
import { withVisibleDeadline } from './bootDeadline';

/* Revisão pré-deploy de a78b80bb: o prazo de um import() conta só com a página à vista — o Android
   congela a página em segundo plano com o temporizador a correr, e ao voltar ele disparava logo. E
   uma rede lenta que ainda avança não cai. */
function fakeDoc() {
  const listeners = new Set();
  return {
    hidden: false,
    addEventListener: (t, fn) => { if (t === 'visibilitychange') listeners.add(fn); },
    removeEventListener: (t, fn) => { if (t === 'visibilitychange') listeners.delete(fn); },
    setHidden(v) { this.hidden = v; listeners.forEach((fn) => fn()); },
  };
}

describe('withVisibleDeadline', () => {
  afterEach(() => vi.useRealTimers());

  it('escondida, o tempo pára; à vista, retoma o que faltava', async () => {
    vi.useFakeTimers();
    const doc = fakeDoc();
    let t = 0;
    const p = withVisibleDeadline(new Promise(() => {}), 1000, 'import', { doc, now: () => t, lastActivity: () => null });
    const caught = p.catch((e) => e);
    t = 600; vi.advanceTimersByTime(600);
    doc.setHidden(true);
    // Muito tempo escondida (a página congelada): não dispara.
    t = 600 + 60000; vi.advanceTimersByTime(60000);
    let settled = false;
    caught.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    doc.setHidden(false);
    t += 399; vi.advanceTimersByTime(399);
    await Promise.resolve();
    expect(settled).toBe(false);
    t += 1; vi.advanceTimersByTime(1);
    expect(await caught).toMatchObject({ name: 'TimeoutError' });
  });

  it('com a rede a avançar (um ficheiro chegou há pouco), o prazo estica; parada, cai', async () => {
    vi.useFakeTimers();
    const doc = fakeDoc();
    let t = 0;
    let since = 500;
    const p = withVisibleDeadline(new Promise(() => {}), 1000, 'import', { doc, now: () => t, lastActivity: () => since, graceMs: 2000, maxVisibleMs: 60000 });
    const caught = p.catch((e) => e);
    let settled = false;
    caught.then(() => { settled = true; });
    t = 1000; vi.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(settled).toBe(false);
    since = 5000; // nada chegou há mais do que o grace
    t = 3000; vi.advanceTimersByTime(2000);
    expect(await caught).toMatchObject({ name: 'TimeoutError' });
  });

  it('o que chega a tempo passa', async () => {
    await expect(withVisibleDeadline(Promise.resolve('mod'), 1000, 'import', { doc: fakeDoc() })).resolves.toBe('mod');
  });
});
