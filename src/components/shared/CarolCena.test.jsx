import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CarolCena, { cenaAreaOf, prepararTraco, prepararMascara, resolverModo, CENA_DESENHO_MS } from './CarolCena';
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
    render(<CarolCena kind={kind} fallback={FALLBACK} />);
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
    render(<CarolCena kind="run" fallback={FALLBACK} />);
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
    const { unmount } = render(<CarolCena kind="body" fallback={FALLBACK} />);
    await flush();
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    unmount();

    global.fetch = vi.fn(() => Promise.reject(new Error('rede')));
    const r2 = render(<CarolCena kind="body" fallback={FALLBACK} />);
    await flush();
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    r2.unmount();

    global.fetch = vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve('isto não é um svg <<<') }));
    render(<CarolCena kind="body" fallback={FALLBACK} />);
    await flush();
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
  });

  it('sem fetch (ambiente sem rede): logótipo', async () => {
    global.fetch = undefined;
    render(<CarolCena kind="run" fallback={FALLBACK} />);
    await flush();
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
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

  it('resolverModo: a prop manda, depois o URL, depois o padrão (traço)', () => {
    expect(resolverModo('mascara')).toBe('mascara');
    expect(resolverModo(undefined)).toBe('traco');
    expect(resolverModo('lixo')).toBe('traco');
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
