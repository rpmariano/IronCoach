import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CarolCena, {
  cenaAreaOf, prepararTraco, prepararMascara, resolverModo, sortearModo, formasCarreiras, formasPontos,
  lerUltimoModo, guardarUltimoModo, CENA_MODOS, CENA_DESENHO_MS, CENA_ULTIMO_MODO_KEY,
} from './CarolCena';
import { AnalysisSkeleton } from './AnalysisState';

/* A cena da Carol na espera das análises: o traço desenha-se e a imagem final
   entra por cima; sem o traço ou sem a imagem, o logótipo de sempre. */

const SVG_OK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="99" height="99"><path d="M0 0 L10 10" stroke="#fff"/><circle cx="5" cy="5" r="2"/></svg>';
const originalMatchMedia = window.matchMedia;
const originalImage = global.Image;
const originalFetch = global.fetch;
let imagemFalha;
let imagensPedidas;
let fetchPedidos;

beforeEach(() => {
  window.localStorage.clear();
  imagemFalha = false;
  imagensPedidas = [];
  fetchPedidos = [];
  // Uma Image que carrega (ou falha) logo a seguir ao src.
  global.Image = class {
    set src(v) {
      imagensPedidas.push(v);
      this.naturalWidth = 600;
      this.naturalHeight = 804;
      queueMicrotask(() => (imagemFalha ? this.onerror?.() : this.onload?.()));
    }
  };
  global.fetch = vi.fn((url) => {
    fetchPedidos.push(url);
    return Promise.resolve({ ok: true, text: () => Promise.resolve(SVG_OK) });
  });
  window.matchMedia = () => ({ matches: false });
});

afterEach(() => {
  vi.useRealTimers();
  window.matchMedia = originalMatchMedia;
  global.Image = originalImage;
  global.fetch = originalFetch;
});

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const FALLBACK = <span data-testid="fallback">logo</span>;

describe('cenaAreaOf — a área certa por kind', () => {
  it('run → corrida, gym → ginasio, body → corporal, meal → alimentacao; o resto, nada', () => {
    expect(cenaAreaOf('run')).toBe('corrida');
    expect(cenaAreaOf('gym')).toBe('ginasio');
    expect(cenaAreaOf('body')).toBe('corporal');
    expect(cenaAreaOf('meal')).toBe('alimentacao');
    expect(cenaAreaOf('outra')).toBeNull();
    expect(cenaAreaOf(null)).toBeNull();
  });
});

describe('CarolCena — proporção da imagem', () => {
  it('size é a altura e a largura segue a proporção do webp (600×804)', async () => {
    render(<CarolCena kind="run" size={200} fallback={FALLBACK} />);
    await flush();
    const cena = screen.getByTestId('carol-cena');
    expect(cena).toHaveStyle({ height: '200px', width: '149px' });
    expect(screen.getByTestId('carol-cena-final')).toHaveAttribute('width', '149');
  });
});

describe('CarolCena', () => {
  it.each([['run', 'corrida'], ['gym', 'ginasio'], ['body', 'corporal'], ['meal', 'alimentacao']])('%s: pede o traço e a imagem da área %s', async (kind, area) => {
    render(<CarolCena kind={kind} modo="traco" fallback={FALLBACK} />);
    // A carregar: o logótipo de sempre.
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    await flush();
    expect(fetchPedidos.some((u) => u.endsWith(`carol-cenas/${area}-traco.svg`))).toBe(true);
    expect(imagensPedidas.some((u) => u.endsWith(`carol-cenas/${area}.webp`))).toBe(true);
    expect(screen.getByTestId('carol-cena')).toHaveAttribute('data-area', area);
    expect(screen.queryByTestId('fallback')).not.toBeInTheDocument();
  });

  it('o traço desenha-se (pathLength normalizado) e, ao fim do desenho, a imagem final aparece por cima', async () => {
    vi.useFakeTimers();
    render(<CarolCena kind="run" modo="traco" fallback={FALLBACK} />);
    await flush();
    const cena = screen.getByTestId('carol-cena');
    expect(cena).toHaveAttribute('data-fase', 'desenho');
    expect(screen.getByTestId('carol-cena-final')).toHaveStyle({ opacity: '0' });
    expect(screen.getByTestId('carol-cena-traco')).toHaveStyle({ opacity: '1' });
    // O SVG inline levou pathLength=1 em cada forma; sem width/height fixos.
    const svg = screen.getByTestId('carol-cena-traco').querySelector('svg');
    expect(svg.querySelectorAll('[pathLength="1"]')).toHaveLength(2);
    expect(svg.hasAttribute('width')).toBe(false);
    act(() => { vi.advanceTimersByTime(CENA_DESENHO_MS + 50); });
    expect(screen.getByTestId('carol-cena')).toHaveAttribute('data-fase', 'final');
    expect(screen.getByTestId('carol-cena-final')).toHaveStyle({ opacity: '1' });
    expect(screen.getByTestId('carol-cena-traco')).toHaveStyle({ opacity: '0' });
    // Decorativa: nada para o leitor de ecrã (a frase é que anuncia a espera).
    expect(cena).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('carol-cena-final')).toHaveAttribute('alt', '');
  });

  it('movimento reduzido: logo a imagem final, sem pedir o traço', async () => {
    window.matchMedia = () => ({ matches: true });
    render(<CarolCena kind="meal" fallback={FALLBACK} />);
    await flush();
    expect(screen.getByTestId('carol-cena')).toHaveAttribute('data-fase', 'final');
    expect(screen.getByTestId('carol-cena-final')).toHaveStyle({ opacity: '1' });
    expect(screen.queryByTestId('carol-cena-traco')).not.toBeInTheDocument();
    expect(fetchPedidos).toHaveLength(0);
  });

  it('a imagem não carrega: volta ao logótipo', async () => {
    imagemFalha = true;
    render(<CarolCena kind="gym" fallback={FALLBACK} />);
    await flush();
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('carol-cena')).not.toBeInTheDocument();
  });

  it('o SVG não carrega (404, rede ou lixo): volta ao logótipo', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, text: () => Promise.resolve('') }));
    const { unmount } = render(<CarolCena kind="body" modo="traco" fallback={FALLBACK} />);
    await flush();
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    unmount();

    global.fetch = vi.fn(() => Promise.reject(new Error('rede')));
    const r2 = render(<CarolCena kind="body" modo="traco" fallback={FALLBACK} />);
    await flush();
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    r2.unmount();

    global.fetch = vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve('isto não é um svg <<<') }));
    render(<CarolCena kind="body" modo="traco" fallback={FALLBACK} />);
    await flush();
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
  });

  it('sem fetch (ambiente sem rede): forçado o traço, logótipo; no sorteio ficam os modos gerados', async () => {
    global.fetch = undefined;
    const { unmount } = render(<CarolCena kind="run" modo="traco" fallback={FALLBACK} />);
    await flush();
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    unmount();
    render(<CarolCena kind="run" fallback={FALLBACK} />);
    await flush();
    expect(['carreiras', 'pontos']).toContain(screen.getByTestId('carol-cena').dataset.modo);
  });

  it('um kind sem cena: só o fallback', () => {
    render(<CarolCena kind="outra" fallback={FALLBACK} />);
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
  });
});

describe('prepararTraco — só passa o que é seguro', () => {
  it('tira scripts, handlers, ligações e elementos que não são formas; normaliza os traços', () => {
    const sujo = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" onload="alert(1)"><script>alert(2)</script><foreignObject><div>x</div></foreignObject><a xlink:href="javascript:alert(3)"><path d="M0 0 L9 9" onclick="alert(4)" stroke="#fff"/></a><use href="#x"/><image href="http://x/y.png"/><g><line x1="0" y1="0" x2="5" y2="5"/></g></svg>';
    const out = prepararTraco(sujo);
    expect(out).not.toMatch(/script|foreignObject|onload|onclick|javascript|<use|<image|<a[ >]|href/i);
    expect(out).toContain('<line');
    expect(out).toContain('pathLength="1"');
  });

  it('o que não é um svg: null', () => {
    expect(prepararTraco('<html><body>ola</body></html>')).toBeNull();
    expect(prepararTraco('<<<')).toBeNull();
  });
});

describe('AnalysisSkeleton com a cena', () => {
  it('mostra a cena da área, a linha «A Carol está a analisar» e as frases; sem cena, o logótipo', async () => {
    window.matchMedia = () => ({ matches: true });
    render(<AnalysisSkeleton kind="run" />);
    expect(screen.getByTestId('logo-loader')).toBeInTheDocument(); // a carregar
    await flush();
    expect(screen.getByTestId('carol-cena')).toHaveAttribute('data-area', 'corrida');
    expect(screen.queryByTestId('logo-loader')).not.toBeInTheDocument();
    expect(screen.getByTestId('analysis-carol-line')).toHaveTextContent('A Carol está a analisar');
    // As frases continuam a ser anunciadas pela região (role=status, aria-live).
    const regiao = screen.getByTestId('analysis-skeleton');
    expect(regiao).toHaveAttribute('role', 'status');
    expect(regiao).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByTestId('analysis-step')).toBeInTheDocument();
  });

  it('com a imagem a falhar, o esqueleto fica como era (logótipo)', async () => {
    imagemFalha = true;
    window.matchMedia = () => ({ matches: true });
    render(<AnalysisSkeleton kind="meal" />);
    await flush();
    expect(screen.getByTestId('logo-loader')).toBeInTheDocument();
    expect(screen.queryByTestId('carol-cena')).not.toBeInTheDocument();
  });
});

/* O modo máscara: traços largos que revelam o webp por baixo (SVG mask); no fim,
   crossfade para a imagem inteira. Sem o -mascara.svg da área, cai no -traco.svg. */
describe('CarolCena — modo máscara', () => {
  const MASCARA = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 512" stroke="#f00" stroke-width="80" fill="#0f0" onload="alert(1)"><path d="M0 0 L9 9"/><circle cx="5" cy="5" r="2" fill="red"/><line x1="0" y1="0" x2="5" y2="5"/><image href="http://x/y.png"/><script>alert(2)</script></svg>';

  beforeEach(() => {
    global.fetch = vi.fn((url) => {
      fetchPedidos.push(url);
      return Promise.resolve({ ok: true, text: () => Promise.resolve(url.endsWith('-mascara.svg') ? MASCARA : SVG_OK) });
    });
  });

  it('prepararMascara: viewBox, formas pela ordem com o atraso de cada uma (2 s no total), pathLength=1 e só formas', () => {
    const m = prepararMascara(MASCARA);
    expect(m.viewBox).toEqual([0, 0, 1024, 512]);
    expect(m.inner).not.toMatch(/script|onload|image|href/i);
    const formas = [...new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${m.inner}</svg>`, 'image/svg+xml').documentElement.children];
    expect(formas.map((f) => f.nodeName)).toEqual(['path', 'circle', 'line']);
    // Sem --i no ficheiro, a ordem é a do ficheiro: 0, 1, 2 → atrasos de 0, 700 e 1400 ms (600 ms cada: ~2 s no total).
    expect(formas.map((f) => f.getAttribute('style'))).toEqual(['--atraso:0ms', '--atraso:700ms', '--atraso:1400ms']);
    expect(formas.every((f) => f.getAttribute('pathLength') === '1')).toBe(true);
    // Muitas formas (43 caminhos): o último continua a começar a 1,4 s — nunca ~9 s.
    const muitas = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${'<path d="M0 0 L1 1"/>'.repeat(43)}</svg>`;
    const atrasos = [...prepararMascara(muitas).inner.matchAll(/--atraso:(\d+)ms/g)].map((x) => Number(x[1]));
    expect(Math.max(...atrasos)).toBe(1400);
    expect(atrasos[0]).toBe(0);
    // O --i do ficheiro agrupa os caminhos que se desenham juntos (contrato da Carol).
    const grupos = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 804"><path d="M0 0" style="--i:0"/><path d="M1 1" style="--i:0"/><path d="M2 2" style="--i:1"/><path d="M3 3" style="--i:2"/></svg>';
    const g = [...prepararMascara(grupos).inner.matchAll(/--atraso:(\d+)ms/g)].map((x) => Number(x[1]));
    expect(g).toEqual([0, 0, 700, 1400]);
    // Um único grupo (tudo --i:0): tudo junto, sem atraso.
    const um = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" style="--i:0"/><path d="M1 1" style="--i:0"/></svg>';
    expect([...prepararMascara(um).inner.matchAll(/--atraso:(\d+)ms/g)].map((x) => Number(x[1]))).toEqual([0, 0]);
    // Sem formas, ou sem viewBox válido: null / o padrão.
    expect(prepararMascara('<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>')).toBeNull();
    expect(prepararMascara('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>').viewBox).toEqual([0, 0, 256, 256]);
  });

  it('resolverModo: a prop manda, depois o URL; sem nenhum dos dois, null (sorteio)', () => {
    expect(resolverModo('mascara')).toBe('mascara');
    expect(resolverModo('pontos')).toBe('pontos');
    expect(resolverModo(undefined)).toBeNull();
    expect(resolverModo('lixo')).toBeNull();
    window.history.replaceState({}, '', '/?cena=mascara');
    expect(resolverModo(undefined)).toBe('mascara');
    expect(resolverModo('traco')).toBe('traco');
    window.history.replaceState({}, '', '/');
  });

  it('modo mascara: pede o -mascara.svg, a imagem fica por baixo de uma <mask>, e no fim cruza-se com a imagem inteira', async () => {
    vi.useFakeTimers();
    render(<CarolCena kind="run" modo="mascara" fallback={FALLBACK} />);
    await flush();
    expect(fetchPedidos.some((u) => u.endsWith('carol-cenas/corrida-mascara.svg'))).toBe(true);
    expect(fetchPedidos.some((u) => u.endsWith('-traco.svg'))).toBe(false);
    const cena = screen.getByTestId('carol-cena');
    expect(cena).toHaveAttribute('data-modo', 'mascara');
    expect(cena).toHaveAttribute('data-fase', 'desenho');
    const svg = screen.getByTestId('carol-cena-mascara');
    expect(svg).toHaveAttribute('viewBox', '0 0 1024 512');
    const mask = svg.querySelector('mask');
    expect(mask.querySelectorAll('path,circle,line')).toHaveLength(3);
    const image = svg.querySelector('image');
    expect(image.getAttribute('href')).toMatch(/carol-cenas\/corrida\.webp$/);
    expect(image.getAttribute('mask')).toBe(`url(#${mask.id})`);
    expect(screen.queryByTestId('carol-cena-traco')).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(CENA_DESENHO_MS + 50); });
    expect(screen.getByTestId('carol-cena')).toHaveAttribute('data-fase', 'final');
    expect(screen.getByTestId('carol-cena-final')).toHaveStyle({ opacity: '1' });
    expect(screen.getByTestId('carol-cena-mascara')).toHaveStyle({ opacity: '0' });
  });

  it('sem o -mascara.svg da área, o modo máscara cai no -traco.svg dela', async () => {
    global.fetch = vi.fn((url) => {
      fetchPedidos.push(url);
      return url.endsWith('-mascara.svg')
        ? Promise.resolve({ ok: false, text: () => Promise.resolve('') })
        : Promise.resolve({ ok: true, text: () => Promise.resolve(SVG_OK) });
    });
    render(<CarolCena kind="gym" modo="mascara" fallback={FALLBACK} />);
    await flush();
    expect(fetchPedidos.map((u) => u.split('/').pop())).toEqual(['ginasio-mascara.svg', 'ginasio-traco.svg']);
    expect(screen.getByTestId('carol-cena')).toHaveAttribute('data-modo', 'traco');
  });

  it('nem máscara nem traço: o logótipo; movimento reduzido: só a imagem, sem pedir nenhum SVG', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, text: () => Promise.resolve('') }));
    const { unmount } = render(<CarolCena kind="body" modo="mascara" fallback={FALLBACK} />);
    await flush();
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    unmount();

    fetchPedidos = [];
    global.fetch = vi.fn((u) => { fetchPedidos.push(u); return Promise.resolve({ ok: true, text: () => Promise.resolve(MASCARA) }); });
    window.matchMedia = () => ({ matches: true });
    render(<CarolCena kind="body" modo="mascara" fallback={FALLBACK} />);
    await flush();
    expect(screen.getByTestId('carol-cena')).toHaveAttribute('data-fase', 'final');
    expect(fetchPedidos).toHaveLength(0);
    expect(screen.queryByTestId('carol-cena-mascara')).not.toBeInTheDocument();
  });
});

/* Os ficheiros reais da Carol (public/carol-cenas) têm de passar pelo preparador tal
   como estão: o viewBox do webp, todos os caminhos, ~2 s no total. */
describe('os SVG reais da corrida (da Carol)', () => {
  const ler = (nome) => readFileSync(resolve(process.cwd(), 'public/carol-cenas', nome), 'utf8');

  it('corrida-mascara.svg: viewBox 600×804, todos os caminhos, o último a começar ao fim dos 2 s menos 0,6', () => {
    const texto = ler('corrida-mascara.svg');
    const esperados = (texto.match(/<path\b/g) || []).length;
    const m = prepararMascara(texto);
    expect(m.viewBox).toEqual([0, 0, 600, 804]);
    const atrasos = [...m.inner.matchAll(/--atraso:(\d+)ms/g)].map((x) => Number(x[1]));
    expect(atrasos).toHaveLength(esperados);
    expect(Math.max(...atrasos)).toBe(1400);
    expect(m.inner).not.toMatch(/script|href|onload/i);
  });

  it('corrida-traco.svg: todos os caminhos, agrupados pelo --i, sem passar de 1,4 s de atraso', () => {
    const texto = ler('corrida-traco.svg');
    const esperados = (texto.match(/<path\b/g) || []).length;
    const out = prepararTraco(texto);
    const atrasos = [...out.matchAll(/--atraso:(\d+)ms/g)].map((x) => Number(x[1]));
    expect(atrasos).toHaveLength(esperados);
    expect(Math.max(...atrasos)).toBeLessThanOrEqual(1400);
    // Muitos caminhos, poucos grupos: há atrasos repetidos (os que se desenham juntos).
    expect(new Set(atrasos).size).toBeLessThan(atrasos.length);
  });
});

describe('CarolCena — carreiras e pontos (gerados por código)', () => {
  it('formasCarreiras: 12 carreiras de cima para baixo, atrasos de 0 a 1,4 s, a cobrir a imagem toda', () => {
    const f = formasCarreiras(600, 804);
    expect(f).toHaveLength(12);
    expect(f[0]).toMatchObject({ x: 0, y: 0, w: 600, atraso: 0 });
    expect(f.at(-1).atraso).toBe(1400);
    expect(f.map((r) => r.y)).toEqual([...f.map((r) => r.y)].sort((a, b) => a - b));
    expect(f.at(-1).y + f.at(-1).h).toBeGreaterThanOrEqual(804);
    // As carreiras tocam-se (sem fios): cada uma começa antes de a anterior acabar.
    f.slice(1).forEach((r, i) => expect(r.y).toBeLessThan(f[i].y + f[i].h));
  });

  it('formasPontos: grelha que cobre a imagem, do centro para fora, de 0 a 1,4 s', () => {
    const p = formasPontos(600, 804);
    const cel = 600 / 10;
    expect(p).toHaveLength(10 * Math.ceil(804 / cel));
    expect(Math.max(...p.map((x) => x.atraso))).toBe(1400);
    // O raio chega à diagonal da célula: dois pontos vizinhos sobrepõem-se.
    expect(p[0].r * 2).toBeGreaterThan(cel);
    // Os do centro entram antes dos dos cantos.
    const centro = p.reduce((a, b) => (Math.hypot(a.cx - 300, a.cy - 402) < Math.hypot(b.cx - 300, b.cy - 402) ? a : b));
    const canto = p[0];
    expect(centro.atraso).toBeLessThan(canto.atraso);
    // Todos os pontos estão dentro da imagem.
    expect(p.every((x) => x.cx > 0 && x.cx < 600 && x.cy > 0 && x.cy < 804 + cel)).toBe(true);
  });

  it.each(['carreiras', 'pontos'])('%s: forçado, usa a imagem numa <mask> de %s com as dimensões do webp e, no fim, crossfade', async (modo) => {
    vi.useFakeTimers();
    render(<CarolCena kind="gym" modo={modo} fallback={FALLBACK} />);
    await flush();
    const cena = screen.getByTestId('carol-cena');
    expect(cena).toHaveAttribute('data-modo', modo);
    // Sem ficheiros por cena: nenhum SVG pedido.
    expect(fetchPedidos).toHaveLength(0);
    const svg = screen.getByTestId('carol-cena-gerada');
    expect(svg).toHaveClass(`carol-cena-${modo}`);
    expect(svg).toHaveAttribute('viewBox', '0 0 600 804');
    const mask = svg.querySelector('mask');
    expect(mask.querySelectorAll(modo === 'carreiras' ? 'rect' : 'circle').length).toBe(modo === 'carreiras' ? 12 : 10 * Math.ceil(804 / 60));
    expect(svg.querySelector('image').getAttribute('mask')).toBe(`url(#${mask.id})`);
    act(() => { vi.advanceTimersByTime(CENA_DESENHO_MS + 50); });
    expect(screen.getByTestId('carol-cena')).toHaveAttribute('data-fase', 'final');
    expect(screen.getByTestId('carol-cena-final')).toHaveStyle({ opacity: '1' });
    expect(screen.getByTestId('carol-cena-gerada')).toHaveStyle({ opacity: '0' });
  });
});

describe('CarolCena — o sorteio, sem repetir', () => {
  it('sortearModo: nunca o último, enquanto houver outro; o único, se for só ele', () => {
    for (let i = 0; i < 40; i += 1) expect(sortearModo(['a', 'b', 'c'], 'b', Math.random)).not.toBe('b');
    expect(sortearModo(['a', 'b'], 'a')).toBe('b');
    expect(sortearModo(['a'], 'a')).toBe('a');
    expect(sortearModo([], 'a')).toBeNull();
    // O rand injetado escolhe o índice (os extremos não saem fora da lista).
    expect(sortearModo(['a', 'b', 'c'], null, () => 0)).toBe('a');
    expect(sortearModo(['a', 'b', 'c'], null, () => 0.999999)).toBe('c');
    expect(sortearModo(['a', 'b', 'c'], null, () => 1)).toBe('c');
  });

  it('lerUltimoModo/guardarUltimoModo: só aceitam modos conhecidos e não rebentam sem storage', () => {
    expect(lerUltimoModo()).toBeNull();
    guardarUltimoModo('pontos');
    expect(lerUltimoModo()).toBe('pontos');
    window.localStorage.setItem(CENA_ULTIMO_MODO_KEY, 'lixo');
    expect(lerUltimoModo()).toBeNull();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
    expect(lerUltimoModo()).toBeNull();
    expect(() => guardarUltimoModo('traco')).not.toThrow();
    vi.restoreAllMocks();
  });

  it('em cada análise sai um modo diferente do da vez anterior (e guarda-o)', async () => {
    const vistos = [];
    for (let i = 0; i < 8; i += 1) {
      const { unmount } = render(<CarolCena kind="run" fallback={FALLBACK} />);
      await flush();
      const modo = screen.getByTestId('carol-cena').dataset.modo;
      expect(CENA_MODOS).toContain(modo);
      expect(window.localStorage.getItem(CENA_ULTIMO_MODO_KEY)).toBe(modo);
      vistos.push(modo);
      unmount();
    }
    vistos.slice(1).forEach((m, i) => expect(m).not.toBe(vistos[i]));
  });

  it('sem o -mascara.svg e o -traco.svg da área, só saem os gerados — e continua sem repetir', async () => {
    global.fetch = vi.fn((url) => { fetchPedidos.push(url); return Promise.resolve({ ok: false, text: () => Promise.resolve('') }); });
    const vistos = [];
    for (let i = 0; i < 6; i += 1) {
      const { unmount } = render(<CarolCena kind="gym" fallback={FALLBACK} />);
      await flush();
      vistos.push(screen.getByTestId('carol-cena').dataset.modo);
      unmount();
    }
    expect(vistos.every((m) => ['carreiras', 'pontos'].includes(m))).toBe(true);
    vistos.slice(1).forEach((m, i) => expect(m).not.toBe(vistos[i]));
  });

  it('o ?cena= força o modo (e ignora o último)', async () => {
    guardarUltimoModo('pontos');
    window.history.replaceState({}, '', '/?cena=pontos');
    try {
      render(<CarolCena kind="body" fallback={FALLBACK} />);
      await flush();
      expect(screen.getByTestId('carol-cena')).toHaveAttribute('data-modo', 'pontos');
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('movimento reduzido: só a imagem, sem sorteio nem guardar modo', async () => {
    window.matchMedia = () => ({ matches: true });
    render(<CarolCena kind="meal" fallback={FALLBACK} />);
    await flush();
    expect(screen.getByTestId('carol-cena')).toHaveAttribute('data-modo', 'imagem');
    expect(screen.getByTestId('carol-cena')).toHaveAttribute('data-fase', 'final');
    expect(window.localStorage.getItem(CENA_ULTIMO_MODO_KEY)).toBeNull();
    expect(fetchPedidos).toHaveLength(0);
  });
});

/* Revisão do lote: o sanitizador deixava passar instruções de processamento e
   comentários (serializados e metidos num innerHTML, um <?x ><img onerror> virava um
   elemento a sério), e não filtrava atributos. */
describe('prepararTraco / prepararMascara — o sanitizador a sério', () => {
  const PAYLOAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><?x ><img src=x onerror=alert(1)>?><path d="M0 0 L9 9"/></svg>';
  const montar = (marcacao) => {
    const el = document.createElement('div');
    el.innerHTML = marcacao;
    return el;
  };

  it('a instrução de processamento com <img onerror> não passa (nem como texto que o innerHTML reinterprete)', () => {
    for (const out of [prepararTraco(PAYLOAD), prepararMascara(PAYLOAD)?.inner]) {
      expect(out).not.toMatch(/<\?|onerror|<img|alert/i);
      // Como o componente a usa: dentro de um innerHTML, não nasce nenhum <img>.
      expect(montar(out).querySelector('img')).toBeNull();
      expect(montar(out).querySelector('path')).not.toBeNull();
    }
  });

  it('comentários, texto, CDATA e DOCTYPE saem', () => {
    const sujo = '<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><!-- <img onerror=x> -->olá<![CDATA[<img src=x onerror=alert(1)>]]><path d="M0 0 L9 9"/></svg>';
    const out = prepararTraco(sujo);
    expect(out).not.toMatch(/<!--|CDATA|olá|onerror|DOCTYPE/);
    expect(montar(out).querySelector('img')).toBeNull();
  });

  it('só passam atributos permitidos: sem style (o --i já foi lido), sem href, sem on*, sem url() externo', () => {
    const sujo = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" class="x" data-x="1">'
      + '<path d="M0 0 L9 9" style="--i:2;background:url(http://x/y.png)" fill="url(http://evil/x.svg#a)" stroke="url(#g)" xlink:href="javascript:alert(1)" onclick="alert(2)" class="c" data-y="1" stroke-width="3"/>'
      + '<rect x="0" y="0" width="5" height="5" mask="url(  #m )" fill="data:text/html,x"/></svg>';
    const out = prepararTraco(sujo);
    // O único style que sobra é o nosso (--atraso), nunca o do ficheiro.
    expect(out).not.toMatch(/background|--i:|href|onclick|http:\/\/x|evil|class=|data-x|data-y|data:text|javascript/);
    expect([...out.matchAll(/style="([^"]*)"/g)].every((m) => /^--atraso:\d+ms$/.test(m[1]))).toBe(true);
    // O que é seguro fica: a ordem (virou atraso), a pintura simples e as referências locais (com o prefixo da instância).
    expect(out).toMatch(/stroke-width="3"/);
    expect(out).toMatch(/stroke="url\(#cena\d+-g\)"/);
    expect(out).toMatch(/mask="url\(#cena\d+-m\)"/);
    expect(out).toMatch(/--atraso:/);
  });

  it('os ids levam um prefixo por instância: dois SVG iguais no mesmo documento não colidem', () => {
    const grad = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path d="M0 0 L9 9" stroke="url(#g)"/></svg>';
    const a = prepararTraco(grad);
    const b = prepararTraco(grad);
    const idA = /id="(cena\d+-g)"/.exec(a)[1];
    const idB = /id="(cena\d+-g)"/.exec(b)[1];
    expect(idA).not.toBe(idB);
    expect(a).toContain(`url(#${idA})`);
    expect(b).toContain(`url(#${idB})`);
    // Um id estranho (com aspas, espaços…) sai.
    expect(prepararTraco('<svg xmlns="http://www.w3.org/2000/svg"><path id="a b" d="M0 0"/></svg>')).not.toMatch(/id=/);
  });

  it('a máscara também: o payload sai da <mask> e as formas ficam', () => {
    const m = prepararMascara(PAYLOAD);
    expect(m.inner).toContain('<path');
    expect(m.inner).not.toMatch(/img|onerror|<\?/);
  });
});

describe('AnalysisSkeleton — a altura da cena reservada', () => {
  it('enquanto a cena pode vir, o espaço dela (200 px) está reservado; se falhar, deixa de estar', async () => {
    imagemFalha = true;
    window.matchMedia = () => ({ matches: true });
    render(<AnalysisSkeleton kind="run" />);
    const caixa = () => screen.getByTestId('analysis-logo').firstChild;
    expect(caixa()).toHaveStyle({ minHeight: '200px' });
    await flush();
    // A imagem falhou: fica o logótipo e a reserva sai (sem um buraco de 200 px).
    expect(caixa().style.minHeight).toBe('');
    expect(screen.getByTestId('logo-loader')).toBeInTheDocument();
  });

  it('um kind sem cena não reserva nada', () => {
    render(<AnalysisSkeleton kind="outra" />);
    expect(screen.getByTestId('analysis-logo').firstChild.style.minHeight).toBe('');
  });
});

/* As quatro cenas reais da Carol passam pelo sanitizador tal como estão: nenhum caminho
   perdido, o viewBox do webp, o último a começar a 1,4 s, só o nosso style. */
describe.each(['corrida', 'ginasio', 'corporal', 'alimentacao'])('os SVG reais — %s', (area) => {
  const ler = (nome) => readFileSync(resolve(process.cwd(), 'public/carol-cenas', nome), 'utf8');
  const contar = (texto) => (texto.match(/<path\b/g) || []).length;

  it('-mascara.svg: viewBox 600×804, todos os caminhos, último atraso 1400 ms, sem restos do ficheiro', () => {
    const texto = ler(`${area}-mascara.svg`);
    const m = prepararMascara(texto);
    expect(m.viewBox).toEqual([0, 0, 600, 804]);
    const atrasos = [...m.inner.matchAll(/--atraso:(\d+)ms/g)].map((x) => Number(x[1]));
    expect(atrasos).toHaveLength(contar(texto));
    expect(Math.max(...atrasos)).toBeLessThanOrEqual(1400);
    expect(m.inner).not.toMatch(/<!--|<\?|href|class=|data-(?!i)|url\(/i);
    expect([...m.inner.matchAll(/style="([^"]*)"/g)].every((x) => /^--atraso:\d+ms$/.test(x[1]))).toBe(true);
  });

  it('-traco.svg: todos os caminhos, atrasos repetidos pelos grupos, nunca depois de 1,4 s', () => {
    const texto = ler(`${area}-traco.svg`);
    const out = prepararTraco(texto);
    const atrasos = [...out.matchAll(/--atraso:(\d+)ms/g)].map((x) => Number(x[1]));
    expect(atrasos).toHaveLength(contar(texto));
    expect(Math.max(...atrasos)).toBeLessThanOrEqual(1400);
    expect(out).not.toMatch(/<!--|<\?|href|class=|data-(?!i)|url\(/i);
  });
});

/* Revisão do lote (pré-visualização): o crossfade esperava um relógio, mas a linha de tempo
   das animações só avança com frames — com o primeiro frame atrasado o relógio cortava o
   desenho a meio. Agora acaba quando as animações acabam. E «a carregar» não é «sem ficheiro». */
describe('CarolCena — o desenho acaba antes de o crossfade começar', () => {
  const originalGetAnimations = Element.prototype.getAnimations;
  afterEach(() => { Element.prototype.getAnimations = originalGetAnimations; });

  it('com animações em curso, o relógio não corta o desenho: só passa a final quando elas acabam', async () => {
    let acabar;
    const finished = new Promise((r) => { acabar = r; });
    Element.prototype.getAnimations = vi.fn(() => [{ finished }]);
    vi.useFakeTimers();
    render(<CarolCena kind="run" modo="traco" fallback={FALLBACK} />);
    await flush();
    expect(screen.getByTestId('carol-cena')).toHaveAttribute('data-fase', 'desenho');
    // Passa o tempo que o desenho DEVIA demorar: as animações ainda não acabaram (sem frames).
    act(() => { vi.advanceTimersByTime(CENA_DESENHO_MS + 500); });
    expect(screen.getByTestId('carol-cena')).toHaveAttribute('data-fase', 'desenho');
    // Acabam: aí sim, o crossfade.
    await act(async () => { acabar(); await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByTestId('carol-cena')).toHaveAttribute('data-fase', 'final');
  });

  it('uma animação que nunca acabe: a margem de segurança fecha a cena', async () => {
    Element.prototype.getAnimations = vi.fn(() => [{ finished: new Promise(() => {}) }]);
    vi.useFakeTimers();
    render(<CarolCena kind="body" modo="carreiras" fallback={FALLBACK} />);
    await flush();
    act(() => { vi.advanceTimersByTime(CENA_DESENHO_MS + 3000); });
    expect(screen.getByTestId('carol-cena')).toHaveAttribute('data-fase', 'desenho');
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByTestId('carol-cena')).toHaveAttribute('data-fase', 'final');
  });

  it('sem getAnimations (jsdom, motores antigos): o relógio de sempre', async () => {
    Element.prototype.getAnimations = undefined;
    vi.useFakeTimers();
    render(<CarolCena kind="meal" modo="pontos" fallback={FALLBACK} />);
    await flush();
    act(() => { vi.advanceTimersByTime(CENA_DESENHO_MS + 50); });
    expect(screen.getByTestId('carol-cena')).toHaveAttribute('data-fase', 'final');
  });
});

describe('CarolCena — «a carregar» não é «sem ficheiro»', () => {
  it('aoCarregar mostra-se só enquanto carrega; o fallback só se a cena falhar', async () => {
    let falhar;
    global.fetch = vi.fn(() => new Promise((_, rej) => { falhar = () => rej(new Error('404')); }));
    render(<CarolCena kind="run" modo="traco" aoCarregar={<span data-testid="a-carregar">…</span>} fallback={FALLBACK} />);
    expect(screen.getByTestId('a-carregar')).toBeInTheDocument();
    expect(screen.queryByTestId('fallback')).not.toBeInTheDocument();
    await flush(); // a imagem carrega primeiro; só então se pede o SVG
    expect(screen.getByTestId('a-carregar')).toBeInTheDocument(); // o SVG ainda por responder: continua a carregar
    await act(async () => { falhar(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(screen.queryByTestId('a-carregar')).not.toBeInTheDocument();
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
  });

  it('sem aoCarregar, a carregar vê-se o fallback (o logótipo da análise)', () => {
    render(<CarolCena kind="run" modo="traco" fallback={FALLBACK} />);
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
  });
});

describe.each(['run', 'gym', 'body', 'meal'])('os SVG reais no DOM — %s', (kind) => {
  const area = { run: 'corrida', gym: 'ginasio', body: 'corporal', meal: 'alimentacao' }[kind];
  const disco = (url) => readFileSync(resolve(process.cwd(), 'public/carol-cenas', url.split('/').pop()), 'utf8');

  it.each(['traco', 'mascara'])('%s: depois de sanitizados, os caminhos estão no DOM, animáveis (pathLength=1 e atraso) e a cena desenha', async (modo) => {
    global.fetch = vi.fn((url) => Promise.resolve({ ok: true, text: () => Promise.resolve(disco(url)) }));
    const esperados = (disco(`${area}-${modo}.svg`).match(/<path\b/g) || []).length;
    render(<CarolCena kind={kind} modo={modo} fallback={FALLBACK} />);
    await flush();
    const cena = screen.getByTestId('carol-cena');
    expect(cena).toHaveAttribute('data-modo', modo);
    expect(cena).toHaveAttribute('data-fase', 'desenho');
    const caminhos = [...cena.querySelectorAll(modo === 'traco' ? '.carol-cena-traco path' : 'mask path')];
    expect(caminhos).toHaveLength(esperados);
    expect(caminhos.every((p) => p.getAttribute('pathLength') === '1' && /^--atraso:\d+ms$/.test(p.getAttribute('style')) && p.getAttribute('d'))).toBe(true);
  });
});

/* Causa de «não se vê o desenho» (pré-visualização): ao passar a 'final' o React 19 voltava a pôr o
   innerHTML (objeto novo no dangerouslySetInnerHTML), recriava os caminhos e as animações
   recomeçavam — o desenho desfazia-se e voltava a desenhar-se durante o crossfade. */
describe('CarolCena — passar a final não recria o desenho', () => {
  it.each([['traco', '.carol-cena-traco path'], ['mascara', 'mask path']])('%s: os mesmos nós antes e depois do crossfade', async (modo, seletor) => {
    vi.useFakeTimers();
    render(<CarolCena kind="run" modo={modo} fallback={FALLBACK} />);
    await flush();
    const antes = screen.getByTestId('carol-cena').querySelector(seletor);
    expect(antes).not.toBeNull();
    expect(screen.getByTestId('carol-cena')).toHaveAttribute('data-fase', 'desenho');
    act(() => { vi.advanceTimersByTime(CENA_DESENHO_MS + 50); });
    expect(screen.getByTestId('carol-cena')).toHaveAttribute('data-fase', 'final');
    // O mesmo nó (não um novo com o mesmo aspeto): senão a animação CSS recomeçava.
    expect(screen.getByTestId('carol-cena').querySelector(seletor)).toBe(antes);
  });

  it('os modos gerados também (as formas da <mask> são as mesmas)', async () => {
    vi.useFakeTimers();
    render(<CarolCena kind="gym" modo="pontos" fallback={FALLBACK} />);
    await flush();
    const antes = screen.getByTestId('carol-cena').querySelector('mask circle');
    act(() => { vi.advanceTimersByTime(CENA_DESENHO_MS + 50); });
    expect(screen.getByTestId('carol-cena').querySelector('mask circle')).toBe(antes);
  });
});
