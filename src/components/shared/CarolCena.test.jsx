import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CarolCena, { cenaAreaOf, prepararTraco, CENA_DESENHO_MS } from './CarolCena';
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
    expect(cena).toHaveAttribute('data-fase', 'traco');
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
