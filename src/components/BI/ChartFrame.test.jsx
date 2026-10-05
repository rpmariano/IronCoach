import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ChartFrame from './ChartFrame';
import { TabPageContext, TabReadyContext, setSettledIndex, resetSettledTab } from '../../utils/settledTab';
import { QUICK_RETURN_MS } from '../../utils/useRevealAnimation';

// A instância do Chart.js que o ChartFrame vai buscar com ChartJS.getChart:
// um falso que regista as chamadas por ordem (o stop() TEM de vir antes do
// reset() — sem ele a animação em curso desfaz o reset).
const h = vi.hoisted(() => ({ chart: null, calls: [] }));
vi.mock('../../lib/chartSetup', () => ({
  default: { getChart: () => h.chart },
}));

/* Ponto 6 do redesenho / auditoria, achado 1. O que este teste trava é a
   regra estrutural: o número atual, a unidade, os extremos do eixo e a
   legenda vivem em HTML, FORA do <svg>/<canvas> do gráfico. Se alguém voltar
   a empurrar texto para dentro da tela, o gráfico deixa de precisar destes
   nós e o teste cai. */

describe('ChartFrame', () => {
  it('põe o valor atual e a unidade em HTML, acima do gráfico', () => {
    render(
      <ChartFrame label="Volume semanal" value="42,6" unit="km">
        <svg data-testid="plot" />
      </ChartFrame>
    );
    expect(screen.getByText('Volume semanal')).toBeInTheDocument();
    expect(screen.getByTestId('chart-frame-value')).toHaveTextContent('42,6');
    expect(screen.getByTestId('chart-frame-unit')).toHaveTextContent('km');
  });

  it('o número grande traz data-count-to, pronto para a animação do ponto 9', () => {
    render(<ChartFrame value="1 980" unit="kcal"><svg /></ChartFrame>);
    expect(screen.getByTestId('chart-frame-value')).toHaveAttribute('data-count-to', '1980');
  });

  it('um valor não numérico não inventa data-count-to', () => {
    render(<ChartFrame value="5:41" unit="/km"><svg /></ChartFrame>);
    expect(screen.getByTestId('chart-frame-value')).not.toHaveAttribute('data-count-to');
  });

  it('um ritmo "5.20" (min.seg, formato canónico) não é decimal: não conta (2026-10-04)', () => {
    render(<ChartFrame value="5.20" unit="/km"><svg /></ChartFrame>);
    expect(screen.getByTestId('chart-frame-value')).not.toHaveAttribute('data-count-to');
    expect(screen.getByTestId('chart-frame-value')).toHaveTextContent('5.20');
  });

  it('desenha a legenda em HTML, uma entrada por série', () => {
    render(
      <ChartFrame
        value={12}
        legend={[
          { label: 'Carga aguda', color: 'var(--run)' },
          { label: 'Rácio ACWR', color: 'white', shape: 'line' },
        ]}
      >
        <svg />
      </ChartFrame>
    );
    const legend = screen.getByTestId('chart-frame-legend');
    expect(legend).toHaveTextContent('Carga aguda');
    expect(legend).toHaveTextContent('Rácio ACWR');
  });

  it('os extremos do eixo ficam nos cantos, em HTML', () => {
    render(<ChartFrame value={1} axis={{ min: '0 km', max: '48 km' }}><svg /></ChartFrame>);
    const axis = screen.getByTestId('chart-frame-axis');
    expect(axis).toHaveTextContent('0 km');
    expect(axis).toHaveTextContent('48 km');
  });

  it('sem legenda nem eixo, não deixa nós vazios', () => {
    render(<ChartFrame value={1}><svg /></ChartFrame>);
    expect(screen.queryByTestId('chart-frame-legend')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chart-frame-axis')).not.toBeInTheDocument();
  });

  it('monta o gráfico dentro da área de desenho', () => {
    render(<ChartFrame value={1}><svg data-testid="plot" /></ChartFrame>);
    expect(screen.getByTestId('chart-frame-plot')).toContainElement(screen.getByTestId('plot'));
  });

  it('sem valor, não mostra a linha do número', () => {
    render(<ChartFrame label="Só o gráfico"><svg /></ChartFrame>);
    expect(screen.queryByTestId('chart-frame-value')).not.toBeInTheDocument();
  });
});

/* Dentro do carrossel da Evolução (2026-10-04, F5 — plano §2.1). */
describe('ChartFrame — dentro do carrossel da Evolução', () => {
  const PAGE = 1;
  let observers = [];
  class FakeObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(el) { this.el = el; }
    disconnect() { this.disconnected = true; }
  }
  const fire = (entry) => act(() => { observers.forEach((o) => o.el && !o.disconnected && o.callback([entry])); });
  const aVista = () => ({
    isIntersecting: true,
    intersectionRect: { height: 176, width: 343 },
    boundingClientRect: { height: 176, width: 343, top: 100, bottom: 276 },
    rootBounds: { height: 800 },
  });
  const fora = () => ({
    isIntersecting: false,
    intersectionRect: { height: 0, width: 0 },
    boundingClientRect: { height: 176, width: 343, top: 100, bottom: 276 },
    rootBounds: { height: 800 },
  });
  const assenta = (i) => act(() => { setSettledIndex(i); });
  const espera = (ms) => act(() => { vi.advanceTimersByTime(ms); });

  const fakeChart = () => {
    const calls = [];
    return {
      calls,
      stop: () => calls.push('stop'),
      reset: () => calls.push('reset'),
      draw: () => calls.push('draw'),
      update: (mode) => calls.push(mode ? `update:${mode}` : 'update'),
    };
  };

  const framed = ({ page = PAGE, ready = true, wrap } = {}) => {
    const frame = (
      <ChartFrame label="Distância por dia" value="42,6" unit="km" delta={{ text: '▲ 3,4 km', tone: 'ok' }}>
        <canvas data-testid="cv" />
      </ChartFrame>
    );
    return (
      <TabPageContext.Provider value={page}>
        <TabReadyContext.Provider value={ready}>
          {wrap ? wrap(frame) : frame}
        </TabReadyContext.Provider>
      </TabPageContext.Provider>
    );
  };
  // Sem o stop() a animação em curso desfaz o reset (medido no Chart.js real).
  const stopAntesDeCadaReset = (calls) => calls.forEach((c, i) => {
    if (c === 'reset') expect(calls[i - 1]).toBe('stop');
  });
  const plot = () => screen.getByTestId('chart-frame-plot');
  const valueRow = () => screen.getByTestId('chart-frame-value-row');

  // Revelado (canvas criado no próprio reveal), para os testes que partem daí.
  const revelado = (chart) => {
    render(framed());
    assenta(PAGE);
    fire(aVista());
    expect(screen.getByTestId('cv')).toBeInTheDocument();
    expect(chart.calls).toEqual([]);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    observers = [];
    resetSettledTab();
    h.chart = fakeChart();
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  });
  afterEach(() => {
    resetSettledTab();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('antes do reveal: moldura e etiqueta à vista; número e área transparentes (opacity, nunca visibility); sem canvas', () => {
    render(framed());
    expect(screen.getByText('Distância por dia')).toBeVisible();
    expect(screen.getByTestId('chart-frame').style.opacity).toBe('');
    expect(valueRow().style.opacity).toBe('0');
    expect(plot().style.opacity).toBe('0');
    expect(valueRow().style.visibility).toBe('');
    expect(plot().style.visibility).toBe('');
    // O valor continua no DOM, para o leitor de ecrã.
    expect(screen.getByTestId('chart-frame-value')).toHaveTextContent('42,6');
    expect(screen.queryByTestId('cv')).not.toBeInTheDocument();
  });

  it('observa a ÁREA do gráfico, não o cartão', () => {
    render(framed());
    expect(observers).toHaveLength(1);
    expect(observers[0].el).toBe(plot());
  });

  /* 2026-10-04 (verificação no browser, bloqueante da Corrida · «Previsão de
     prova»): sem gráfico (height 0, sem children) a área tem 0 px e nunca
     fica "à vista" — o número ficava em opacity 0 para sempre. */
  it('sem gráfico (height 0, sem children): observa a linha do valor e revela o número depois de assentar', () => {
    render(
      <TabPageContext.Provider value={PAGE}>
        <TabReadyContext.Provider value>
          <ChartFrame label="Previsão de prova" value="48:38" unit="São Silvestre de Lisboa" height={0} />
        </TabReadyContext.Provider>
      </TabPageContext.Provider>
    );
    expect(observers).toHaveLength(1);
    expect(observers[0].el).toBe(valueRow());
    expect(valueRow().style.opacity).toBe('0');
    assenta(PAGE);
    fire({
      isIntersecting: true,
      intersectionRect: { height: 28, width: 343 },
      boundingClientRect: { height: 28, width: 343, top: 120, bottom: 148 },
      rootBounds: { height: 800 },
    });
    expect(valueRow().style.opacity).toBe('1');
    expect(screen.getByTestId('chart-frame-value')).toHaveTextContent('48:38');
  });

  it('sem gráfico e sem valor: observa o próprio cartão', () => {
    render(
      <TabPageContext.Provider value={PAGE}>
        <TabReadyContext.Provider value>
          <ChartFrame label="Composição" height={0} />
        </TabReadyContext.Provider>
      </TabPageContext.Provider>
    );
    expect(observers).toHaveLength(1);
    expect(observers[0].el).toBe(screen.getByTestId('chart-frame'));
  });

  it('o gráfico chega depois (height 0 → 176): passa a observar a área', () => {
    const ui = (h0) => (
      <TabPageContext.Provider value={PAGE}>
        <TabReadyContext.Provider value>
          <ChartFrame label="VDOT" value="48,2" height={h0}>{h0 ? <canvas data-testid="cv" /> : null}</ChartFrame>
        </TabReadyContext.Provider>
      </TabPageContext.Provider>
    );
    const { rerender } = render(ui(0));
    expect(observers.at(-1).el).toBe(valueRow());
    rerender(ui(176));
    const live = observers.filter((o) => !o.disconnected);
    expect(live).toHaveLength(1);
    expect(live[0].el).toBe(plot());
  });

  /* 2026-10-05 (A5): o gráfico nasce DEPOIS de a moldura estar revelada (a
     Composição que passa de "só o número" a ter área ao trocar de período).
     Abaixo da dobra animava lá em baixo, sem ninguém ver; agora segura-se na
     base e cresce quando a área aparece. */
  describe('gráfico que nasce depois do reveal (A5)', () => {
    const ui = (h0) => (
      <TabPageContext.Provider value={PAGE}>
        <TabReadyContext.Provider value>
          <ChartFrame label="Composição corporal" value="72,4" unit="kg" height={h0}>{h0 ? <canvas data-testid="cv" /> : null}</ChartFrame>
        </TabReadyContext.Provider>
      </TabPageContext.Provider>
    );
    const valorAVista = {
      isIntersecting: true,
      intersectionRect: { height: 28, width: 343 },
      boundingClientRect: { height: 28, width: 343, top: 120, bottom: 148 },
      rootBounds: { height: 800 },
    };
    const comAreaEm = (top) => {
      const orig = window.HTMLElement.prototype.getBoundingClientRect;
      vi.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
        if (this.dataset?.testid === 'chart-frame-plot') return { top, bottom: top + 200, height: 200, width: 343, left: 0, right: 343 };
        return orig.call(this);
      });
      vi.stubGlobal('innerHeight', 800);
    };
    // Só "na base" (stop → reset → draw, as vezes que forem), nunca um update.
    const seguro = (calls) => calls.length > 0 && calls.every((c) => ['stop', 'reset', 'draw'].includes(c));
    const revelaSoNumero = () => {
      const r = render(ui(0));
      assenta(PAGE);
      fire(valorAVista);
      expect(valueRow().style.opacity).toBe('1');
      return r;
    };

    it('abaixo da dobra: fica na base (data-chart-hold) e cresce quando a área aparece', () => {
      const { rerender } = revelaSoNumero();
      comAreaEm(900); // abaixo dos 800 px do ecrã
      rerender(ui(200));
      expect(screen.getByTestId('cv')).toBeInTheDocument();
      expect(seguro(h.chart.calls)).toBe(true);
      expect(plot().dataset.chartHold).toBe('1');
      // Ainda abaixo: nada anima.
      fire(fora());
      expect(seguro(h.chart.calls)).toBe(true);
      // O atleta faz scroll até lá.
      fire({ ...aVista(), boundingClientRect: { height: 200, width: 343, top: 300, bottom: 500 }, intersectionRect: { height: 200, width: 343 } });
      expect(plot().dataset.chartHold).toBeUndefined();
      expect(h.chart.calls.slice(-3)).toEqual(['stop', 'reset', 'update']);
      stopAntesDeCadaReset(h.chart.calls);
    });

    it('já à vista quando nasce: o construtor anima ali mesmo, nada a segurar', () => {
      const { rerender } = revelaSoNumero();
      comAreaEm(200);
      rerender(ui(200));
      expect(h.chart.calls).toEqual([]);
      expect(plot().dataset.chartHold).toBeUndefined();
    });

    it('com o separador por assentar quando nasce: também espera', () => {
      const { rerender } = revelaSoNumero();
      comAreaEm(200);
      assenta(-1);
      rerender(ui(200));
      expect(seguro(h.chart.calls)).toBe(true);
      assenta(PAGE);
      fire({ ...aVista(), boundingClientRect: { height: 200, width: 343, top: 200, bottom: 400 }, intersectionRect: { height: 200, width: 343 } });
      expect(h.chart.calls.slice(-3)).toEqual(['stop', 'reset', 'update']);
    });
  });

  it('1.º reveal: cria o canvas e não chama nada (o construtor já anima da base)', () => {
    revelado(h.chart);
    expect(valueRow().style.opacity).toBe('1');
    expect(plot().style.opacity).toBe('1');
  });

  it('à vista mas com o separador por assentar: não cria', () => {
    render(framed());
    fire(aVista());
    expect(screen.queryByTestId('cv')).not.toBeInTheDocument();
  });

  it('ao rearmar: stop → reset → draw; ao revelar outra vez: stop → reset → update', () => {
    revelado(h.chart);
    assenta(PAGE + 1);
    fire(fora());
    espera(QUICK_RETURN_MS + 10);
    expect(h.chart.calls).toEqual(['stop', 'reset', 'draw']);

    h.chart.calls.length = 0;
    assenta(PAGE);
    fire(aVista());
    // Armado, cada redesenho da moldura repõe a base (stop → reset → draw,
    // inofensivo); o reveal acaba sempre com stop → reset → update.
    expect(h.chart.calls.slice(-3)).toEqual(['stop', 'reset', 'update']);
    stopAntesDeCadaReset(h.chart.calls);
    expect(h.chart.calls.filter((c) => c === 'update')).toHaveLength(1);
  });

  it('enquanto armado, o número mostra o estado zero (o valor fica para o leitor de ecrã)', () => {
    revelado(h.chart);
    assenta(PAGE + 1);
    fire(fora());
    espera(QUICK_RETURN_MS + 10);
    const shown = screen.getByTestId('chart-frame-value');
    expect(shown).toHaveTextContent('0,0');
    expect(shown).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('42,6')).toHaveClass('sr-only');
    // Rearmado fica à vista (já foi visto), no estado zero.
    expect(valueRow().style.opacity).toBe('1');
  });

  it('vai-e-vem rápido: o gráfico não volta a zero nem repete', () => {
    revelado(h.chart);
    assenta(PAGE + 1);
    fire(fora());
    espera(1000);
    assenta(PAGE);
    fire(aVista());
    espera(QUICK_RETURN_MS * 2);
    expect(h.chart.calls).toEqual([]);
    expect(screen.getByTestId('chart-frame-value')).toHaveTextContent('42,6');
  });

  it('pré-criado em tempo morto na página vizinha, já no estado zero; ao revelar é só stop → reset → update', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 300, bottom: 476, height: 176, left: 400, right: 743, width: 343, x: 400, y: 300,
    });
    render(framed());
    assenta(PAGE + 1); // a vizinha está assente
    expect(screen.queryByTestId('cv')).not.toBeInTheDocument();
    espera(50);
    expect(screen.getByTestId('cv')).toBeInTheDocument();
    expect(h.chart.calls).toEqual(['stop', 'reset', 'draw']);
    expect(plot().style.opacity).toBe('0'); // ainda por ver

    h.chart.calls.length = 0;
    assenta(PAGE);
    fire(aVista());
    expect(h.chart.calls.slice(-3)).toEqual(['stop', 'reset', 'update']);
    stopAntesDeCadaReset(h.chart.calls);
    expect(plot().style.opacity).toBe('1');
  });

  it('nunca pré-cria a duas páginas de distância', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 300, bottom: 476, height: 176, left: 800, right: 1143, width: 343, x: 800, y: 300,
    });
    render(framed());
    assenta(PAGE + 2);
    espera(500);
    expect(screen.queryByTestId('cv')).not.toBeInTheDocument();
  });

  it('nunca pré-cria dentro da Análise Cruzada fechada (antepassado com altura 0 e overflow cortado)', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 300, bottom: 476, height: 176, left: 0, right: 343, width: 343, x: 0, y: 300,
    });
    render(framed({ wrap: (f) => <div style={{ overflow: 'hidden' }}>{f}</div> }));
    assenta(PAGE);
    espera(500);
    expect(screen.queryByTestId('cv')).not.toBeInTheDocument();
  });

  it('dados por chegar: não revela (mas a moldura está lá)', () => {
    render(framed({ ready: false }));
    assenta(PAGE);
    fire(aVista());
    expect(screen.getByText('Distância por dia')).toBeInTheDocument();
    expect(valueRow().style.opacity).toBe('0');
  });

  it('com movimento reduzido: nada escondido, nada anima, e o canvas espera pela vista', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    render(framed());
    expect(valueRow().style.opacity).toBe('1');
    expect(plot().style.opacity).toBe('1');
    expect(screen.queryByTestId('cv')).not.toBeInTheDocument();
    assenta(PAGE);
    fire(aVista());
    expect(screen.getByTestId('cv')).toBeInTheDocument();
    assenta(PAGE + 1);
    fire(fora());
    espera(QUICK_RETURN_MS * 2);
    assenta(PAGE);
    fire(aVista());
    expect(h.chart.calls).toEqual([]);
  });

  it('sem IntersectionObserver (jsdom, browsers antigos): monta logo e não esconde nada', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(framed());
    expect(screen.getByTestId('cv')).toBeInTheDocument();
    expect(valueRow().style.opacity).toBe('1');
    expect(h.chart.calls).toEqual([]);
  });

  it('seguro na base, a área leva data-chart-hold (para o plugin do chartSetup); revelado, não', () => {
    revelado(h.chart);
    expect(plot()).not.toHaveAttribute('data-chart-hold');
    assenta(PAGE + 1);
    fire(fora());
    espera(QUICK_RETURN_MS + 10);
    expect(plot()).toHaveAttribute('data-chart-hold', '1');
  });

  it('reduced-motion ligado com o gráfico rearmado: valores finais sem animação (stop → update none) (2026-10-04)', () => {
    const media = { matches: false, listeners: new Set() };
    vi.stubGlobal('matchMedia', () => ({
      get matches() { return media.matches; },
      addEventListener: (_t, fn) => media.listeners.add(fn),
      removeEventListener: (_t, fn) => media.listeners.delete(fn),
    }));
    revelado(h.chart);
    assenta(PAGE + 1);
    fire(fora());
    espera(QUICK_RETURN_MS + 10);
    expect(h.chart.calls).toEqual(['stop', 'reset', 'draw']);

    h.chart.calls.length = 0;
    act(() => { media.matches = true; media.listeners.forEach((fn) => fn({ matches: true })); });
    expect(plot()).not.toHaveAttribute('data-chart-hold');
    expect(h.chart.calls).toEqual(['stop', 'update:none']);
  });

  /* 2026-10-04: no React.StrictMode (npm run dev) o efeito de montagem do
     react-chartjs-2 corre duas vezes — cria, destrói e cria outra instância
     sem novo render da moldura. Este filho imita isso: cada montagem do
     efeito cria uma instância nova e a desmontagem destrói-a (canvas a null,
     como o destroy() do Chart.js). */
  const instances = [];
  function FakeChartChild() {
    React.useEffect(() => {
      const c = fakeChart();
      c.canvas = {};
      instances.push(c);
      h.chart = c;
      return () => { c.canvas = null; c.calls.push('destroy'); };
    }, []);
    return <canvas data-testid="cv" />;
  }
  const framedStrict = () => (
    <React.StrictMode>
      <TabPageContext.Provider value={PAGE}>
        <ChartFrame label="Distância por dia" value="42,6" unit="km">
          <FakeChartChild />
        </ChartFrame>
      </TabPageContext.Provider>
    </React.StrictMode>
  );

  it('StrictMode: a instância recriada depois do efeito da moldura também fica na base, e anima no reveal', async () => {
    instances.length = 0;
    h.chart = undefined;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 300, bottom: 476, height: 176, left: 400, right: 743, width: 343, x: 400, y: 300,
    });
    render(framedStrict());
    assenta(PAGE + 1);
    espera(50); // pré-criado em tempo morto
    await act(async () => {}); // a microtarefa que volta a olhar para a instância
    expect(instances).toHaveLength(2);
    const [primeira, viva] = instances;
    expect(primeira.calls.at(-1)).toBe('destroy');
    expect(viva.canvas).not.toBeNull();
    // A instância viva foi parada e reposta na base (stop → reset), sem render
    // novo da moldura pelo meio.
    expect(viva.calls).toEqual(['stop', 'reset', 'draw']);
    expect(plot()).toHaveAttribute('data-chart-hold', '1');

    viva.calls.length = 0;
    assenta(PAGE);
    fire(aVista());
    // No reveal: replay na instância VIVA (antes ficava a morta no ref e o
    // reveal tratava a viva como "criada agora" — aparecia cheia, parada).
    expect(viva.calls.slice(-3)).toEqual(['stop', 'reset', 'update']);
    stopAntesDeCadaReset(viva.calls);
    expect(plot()).not.toHaveAttribute('data-chart-hold');
  });

  it('instância trocada sem render e sem a microtarefa: uma anterior destruída não conta como "criada no reveal"', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 300, bottom: 476, height: 176, left: 400, right: 743, width: 343, x: 400, y: 300,
    });
    const antiga = fakeChart();
    antiga.canvas = {};
    h.chart = antiga;
    render(framed());
    assenta(PAGE + 1);
    espera(50);
    await act(async () => {});
    expect(antiga.calls).toEqual(['stop', 'reset', 'draw']);

    assenta(PAGE);
    await act(async () => {});
    // Troca às escondidas (sem render nem microtarefa pelo meio): a antiga
    // morre, há outra; o próximo render já é o do reveal.
    antiga.canvas = null;
    const nova = fakeChart();
    nova.canvas = {};
    h.chart = nova;
    fire(aVista());
    expect(nova.calls.slice(-3)).toEqual(['stop', 'reset', 'update']);
    stopAntesDeCadaReset(nova.calls);
  });

  it('getChart sem instância (mock sem canvas, gráfico que falhou): não rebenta', () => {
    h.chart = undefined;
    render(framed());
    assenta(PAGE);
    fire(aVista());
    assenta(PAGE + 1);
    fire(fora());
    espera(QUICK_RETURN_MS + 10);
    assenta(PAGE);
    fire(aVista());
    expect(screen.getByTestId('cv')).toBeInTheDocument();
  });
});

describe('ChartFrame — prop ready', () => {
  let observers = [];
  class FakeObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(el) { this.el = el; }
    disconnect() {}
  }
  beforeEach(() => {
    observers = [];
    resetSettledTab();
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  });
  afterEach(() => { resetSettledTab(); vi.unstubAllGlobals(); });

  it('ready={false} segura a entrada mesmo com o separador pronto e à vista', () => {
    const tree = (ready) => (
      <TabPageContext.Provider value={0}>
        <ChartFrame label="RPE" value="6" ready={ready}><canvas /></ChartFrame>
      </TabPageContext.Provider>
    );
    const { rerender } = render(tree(false));
    act(() => { setSettledIndex(0); });
    act(() => {
      observers[0].callback([{
        isIntersecting: true,
        intersectionRect: { height: 176, width: 343 },
        boundingClientRect: { height: 176, width: 343, top: 100, bottom: 276 },
        rootBounds: { height: 800 },
      }]);
    });
    expect(screen.getByTestId('chart-frame-value-row').style.opacity).toBe('0');
    rerender(tree(true));
    expect(screen.getByTestId('chart-frame-value-row').style.opacity).toBe('1');
  });
});
