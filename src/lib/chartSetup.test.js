import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/* 2026-10-04 (F5): a animação por omissão do Chart.js muda NO SÍTIO e o
   reduced-motion alterna entre o objeto original e `false`. Cada teste
   reimporta chart.js + chartSetup do zero para não herdar defaults. */

const original = window.matchMedia;

function fakeMedia(initial) {
  const state = { matches: initial, listeners: new Set() };
  window.matchMedia = () => ({
    get matches() { return state.matches; },
    addEventListener: (_t, fn) => state.listeners.add(fn),
    removeEventListener: (_t, fn) => state.listeners.delete(fn),
  });
  state.set = (v) => { state.matches = v; state.listeners.forEach((fn) => fn({ matches: v })); };
  return state;
}

async function carregar() {
  vi.resetModules();
  const { Chart } = await import('chart.js');
  // chart.js (node_modules) não é reposto pelo resetModules: é o mesmo
  // singleton entre testes, e o teste anterior pode tê-lo deixado a `false`.
  // O próprio chartSetup guarda o objeto original por isso mesmo (HMR).
  if (Chart._ironBaseAnimation) Chart.defaults.animation = Chart._ironBaseAnimation;
  const original_ = Chart.defaults.animation;
  const mod = await import('./chartSetup');
  return { Chart, original_, mod };
}

beforeEach(() => { vi.resetModules(); });
afterEach(() => { window.matchMedia = original; });

describe('chartSetup — movimento', () => {
  it('altera o objeto de animação por omissão no sítio (mesma identidade) — 700 ms, easeOutQuart', async () => {
    fakeMedia(false);
    const { Chart, original_ } = await carregar();
    expect(Chart.defaults.animation).toBe(original_);
    expect(Chart.defaults.animation.duration).toBe(700);
    expect(Chart.defaults.animation.easing).toBe('easeOutQuart');
  });

  it('mudar de período é uma transição de 300 ms', async () => {
    fakeMedia(false);
    const { Chart } = await carregar();
    expect(Chart.defaults.transitions.period).toEqual({ animation: { duration: 300 } });
  });

  it('com reduced-motion a animação global é false', async () => {
    fakeMedia(true);
    const { Chart } = await carregar();
    expect(Chart.defaults.animation).toBe(false);
  });

  it('sem matchMedia (jsdom) não rebenta e não anima', async () => {
    window.matchMedia = undefined;
    const { Chart } = await carregar();
    expect(Chart.defaults.animation).toBe(false);
  });

  it('reavalia quando a preferência muda e repõe o MESMO objeto original', async () => {
    const m = fakeMedia(false);
    const { Chart, original_ } = await carregar();
    m.set(true);
    expect(Chart.defaults.animation).toBe(false);
    m.set(false);
    expect(Chart.defaults.animation).toBe(original_);
    expect(Chart.defaults.animation.duration).toBe(700);
  });

  it('ao mudar, pára e atualiza sem animação os gráficos já criados', async () => {
    const m = fakeMedia(false);
    const { Chart } = await carregar();
    const chart = { stop: vi.fn(), update: vi.fn() };
    const quebrado = { stop: vi.fn(), update: vi.fn(() => { throw new Error('canvas fora do DOM'); }) };
    Chart.instances.a = chart;
    Chart.instances.b = quebrado;
    expect(() => m.set(true)).not.toThrow();
    expect(chart.stop).toHaveBeenCalled();
    expect(chart.update).toHaveBeenCalledWith('none');
    expect(quebrado.update).toHaveBeenCalledWith('none');
    delete Chart.instances.a; delete Chart.instances.b;
  });
});
