import { describe, it, expect, beforeEach } from 'vitest';
import { HIDDEN_AT_KEY, bootMessage, readBootInfo, trackHiddenAt, bootInfoOnce, resetBootInfo } from './bootTelemetry';

/* #97 (2026-11-04): a telemetria do arranque — se a página foi descartada, o tipo de navegação e
   há quanto tempo estava escondida. */
function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

describe('bootTelemetry', () => {
  beforeEach(() => resetBootInfo());

  it('guarda a hora ao esconder (visibilitychange hidden e pagehide) e desliga', () => {
    const st = fakeStorage();
    const doc = new EventTarget();
    doc.visibilityState = 'visible';
    const win = new EventTarget();
    let t = 1000;
    const off = trackHiddenAt({ doc, win, storage: st, now: () => t });
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(st.getItem(HIDDEN_AT_KEY)).toBeNull(); // visível: nada
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(st.getItem(HIDDEN_AT_KEY)).toBe('1000');
    t = 2000;
    win.dispatchEvent(new Event('pagehide'));
    expect(st.getItem(HIDDEN_AT_KEY)).toBe('2000');
    off();
    t = 3000;
    win.dispatchEvent(new Event('pagehide'));
    expect(st.getItem(HIDDEN_AT_KEY)).toBe('2000');
  });

  it('no arranque: descartada, o tipo de navegação, há quanto tempo estava escondida (e apaga a hora)', () => {
    const st = fakeStorage();
    st.setItem(HIDDEN_AT_KEY, '10000');
    const info = readBootInfo({
      doc: { wasDiscarded: true },
      perf: { getEntriesByType: () => [{ type: 'navigate' }] },
      storage: st,
      loc: { href: 'https://x.test/IronHealth/' },
      now: () => 40000,
    });
    expect(info).toMatchObject({ wasDiscarded: true, navType: 'navigate', hiddenForMs: 30000, versionReload: false });
    expect(st.getItem(HIDDEN_AT_KEY)).toBeNull();
    expect(bootMessage(info)).toBe('Arranque depois de a página ser descartada');
  });

  it('sem a API ou sem hora guardada: null, nunca um erro; recarga por versão nova pelo ?v=', () => {
    const info = readBootInfo({ doc: {}, perf: {}, storage: fakeStorage(), loc: { href: 'https://x.test/?v=abc' } });
    expect(info).toMatchObject({ wasDiscarded: null, navType: null, hiddenForMs: null, versionReload: true });
    expect(bootMessage(info)).toBe('Arranque por versão nova');
    expect(bootMessage({ navType: 'reload' })).toBe('Recarga da página');
    expect(bootMessage({ navType: 'navigate' })).toBe('Arranque da app');
  });

  it('bootInfoOnce lê uma vez por carregamento da página', () => {
    const a = bootInfoOnce();
    expect(bootInfoOnce()).toBe(a);
  });
});
