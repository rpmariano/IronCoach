import React from 'react';
import { render, act } from '@testing-library/react';
import { animator } from 'chart.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ChartJS, { applyChartMotion } from '../../lib/chartSetup';
import { TabPageContext, setSettledIndex, resetSettledTab } from '../../utils/settledTab';
import VolumeLoadChart from './VolumeLoadChart';

/* 2026-10-04: com o Chart.js e o react-chartjs-2 VERDADEIROS (os outros testes
   de movimento usam mocks, e foi por isso que este erro passou). O
   react-chartjs-2 5.3.1 só entrega `plugins` ao `new Chart(...)`; um plugin
   que feche sobre um valor do render fica com o valor da criação. No
   carrossel o canvas já não remonta a cada reveal, por isso a linha da média
   (Ginásio) e as linhas de alvo (Nutrição) ficavam presas. Os plugins leem
   agora o valor das opções, que chegam ao gráfico em cada update.

   O jsdom não tem canvas 2D: um contexto falso regista as chamadas, e o
   contentor ganha tamanho para o Chart.js responsivo ter área de desenho. */

function fakeContext(canvas) {
  const log = [];
  const state = { canvas, log };
  return new Proxy(state, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'getLineDash') return () => [];
      if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern') {
        return () => ({ addColorStop() {} });
      }
      if (p === 'getImageData') return () => ({ data: [] });
      return (...args) => { log.push([p, ...args]); };
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

let contexts;
beforeEach(() => {
  contexts = new Map();
  // Sem matchMedia o motor assume reduced-motion: desenha logo, sem animação.
  vi.stubGlobal('matchMedia', undefined);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 0, left: 0, right: 320, bottom: 200, width: 320, height: 200, x: 0, y: 0,
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function getContext() {
    if (!contexts.has(this)) contexts.set(this, fakeContext(this));
    return contexts.get(this);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const chartOf = (container) => ChartJS.getChart(container.querySelector('canvas'));
const logOf = (container) => contexts.get(container.querySelector('canvas')).log;

/** As alturas (y) das linhas tracejadas com este padrão no último desenho. */
function dashedLineYs(log, pattern) {
  const ys = [];
  log.forEach((entry, i) => {
    if (entry[0] !== 'setLineDash' || JSON.stringify(entry[1]) !== JSON.stringify(pattern)) return;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (log[j][0] === 'moveTo') { ys.push(log[j][2]); break; }
    }
  });
  return ys;
}

const weeks = (n) => Array.from({ length: n }, (_, i) => ({ weekLabel: `S${i + 1}`, volumeLoad: (i + 1) * 1000 }));

describe('VolumeLoadChart — linha da média de 4 semanas (Chart.js real)', () => {
  it('passa de ≥4 semanas para <4: a linha desaparece com a legenda', () => {
    const { container, rerender } = render(<VolumeLoadChart weeklyData={weeks(5)} />);
    const chart = chartOf(container);
    expect(chart).toBeTruthy();
    expect(dashedLineYs(logOf(container), [5, 5])).toHaveLength(1);

    logOf(container).length = 0;
    rerender(<VolumeLoadChart weeklyData={weeks(3)} />);
    // A mesma instância (não remontou) e já sem linha.
    expect(chartOf(container)).toBe(chart);
    expect(dashedLineYs(logOf(container), [5, 5])).toHaveLength(0);
    expect(container.textContent).not.toContain('Média 4 semanas');
  });

  it('passa de <4 semanas para ≥4: a linha aparece, à altura da média nova', () => {
    const { container, rerender } = render(<VolumeLoadChart weeklyData={weeks(3)} />);
    expect(dashedLineYs(logOf(container), [5, 5])).toHaveLength(0);

    logOf(container).length = 0;
    rerender(<VolumeLoadChart weeklyData={weeks(6)} />);
    const chart = chartOf(container);
    const avg = (3000 + 4000 + 5000 + 6000) / 4;
    expect(dashedLineYs(logOf(container), [5, 5])).toEqual([chart.scales.y.getPixelForValue(avg)]);
    expect(container.textContent).toContain('Média 4 semanas');
  });
});

/* MacroComplianceChart (as linhas de alvo da Nutrição) saiu a 2026-10-04 com
   o mock-up da Nutrição por período (fase 4): os gráficos da Nutrição passaram
   a HTML (NutritionWeekChart/MonthHeatmap/QuarterCharts), sem plugins do
   Chart.js. */

/* 2026-10-04: ChartFrame + Chart.js real dentro do React.StrictMode (o
   `npm run dev`). O StrictMode corre duas vezes o efeito de montagem do
   react-chartjs-2: a 2.ª instância nascia a animar a entrada toda escondida
   (opacity 0) e, no reveal, ficava cheia e parada. Medido no Chromium pelo
   revisor; aqui com o animador do Chart.js. */
describe('ChartFrame + Chart.js real — StrictMode e gráfico seguro na base', () => {
  const PAGE = 1;
  let observers;
  class FakeObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(el) { this.el = el; }
    disconnect() { this.disconnected = true; }
  }
  const aVista = {
    isIntersecting: true,
    intersectionRect: { height: 208, width: 320 },
    boundingClientRect: { height: 208, width: 320, top: 100, bottom: 308 },
    rootBounds: { height: 800 },
  };
  const fire = (entry) => act(() => { observers.forEach((o) => o.el && !o.disconnected && o.callback([entry])); });

  beforeEach(() => {
    vi.useFakeTimers();
    observers = [];
    resetSettledTab();
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    applyChartMotion(false);
  });
  afterEach(() => {
    Object.values(ChartJS.instances).forEach((c) => c.destroy());
    applyChartMotion(true);
    resetSettledTab();
    vi.useRealTimers();
  });

  const naBase = (chart) => {
    const zero = chart.scales.y.getPixelForValue(0);
    return chart.getDatasetMeta(0).data.every((bar) => Math.abs(bar.y - zero) < 0.5);
  };

  it('pré-criado na vizinha: a instância viva fica quieta na base e anima no reveal', async () => {
    const { container } = render(
      <React.StrictMode>
        <TabPageContext.Provider value={PAGE}>
          <VolumeLoadChart weeklyData={weeks(5)} />
        </TabPageContext.Provider>
      </React.StrictMode>
    );
    act(() => { setSettledIndex(PAGE + 1); });
    act(() => { vi.advanceTimersByTime(50); });
    await act(async () => {});

    // Só uma instância viva (a 1.ª foi destruída pelo StrictMode)…
    expect(Object.keys(ChartJS.instances)).toHaveLength(1);
    const chart = chartOf(container);
    // …sem nenhuma animação agendada (nada a mexer escondido) e na base.
    expect(animator.has(chart)).toBe(false);
    expect(naBase(chart)).toBe(true);

    // Um resize (rodar o telemóvel) enquanto está seguro não o enche.
    chart.update('resize');
    expect(animator.has(chart)).toBe(false);
    expect(naBase(chart)).toBe(true);

    act(() => { setSettledIndex(PAGE); });
    fire(aVista);
    // No reveal a MESMA instância volta a animar a partir da base.
    expect(chartOf(container)).toBe(chart);
    expect(animator.has(chart)).toBe(true);
  });
});
