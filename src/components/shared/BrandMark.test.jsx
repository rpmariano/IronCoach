import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import BrandMark, { brandSrc, brandFile, BRAND_PLAY_ONCE_MS } from './BrandMark';

/* A marca (2026-09-13): parada por omissão, animada onde se pede, e o
   `playOnce` do cabeçalho toca um ciclo e volta a parar. */

const motion = (reduce) => vi.stubGlobal('matchMedia', () => ({ matches: reduce, addEventListener() {}, removeEventListener() {} }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('brandSrc', () => {
  it('escolhe o ficheiro pela variante e pelo movimento', () => {
    motion(false);
    expect(brandFile('icon', false)).toBe('ironcoach-icon.svg');
    expect(brandFile('icon', true)).toBe('ironcoach-icon-animated.svg');
    expect(brandFile('lockup', true)).toBe('ironcoach-lockup-animated.svg');
  });

  it('com prefers-reduced-motion a variante animada cai para a parada', () => {
    motion(true);
    expect(brandFile('lockup', true)).toBe('ironcoach-lockup.svg');
  });

  /* 2026-11-09: sem rede o login mostrava o logótipo partido (ia buscar public/brand/ à rede).
     Agora vem no bundle, como data URL — nenhum pedido. */
  it('o src é o SVG no próprio bundle (data URL), nunca um pedido à rede', () => {
    motion(false);
    for (const [variant, animated] of [['icon', false], ['icon', true], ['lockup', false], ['lockup', true]]) {
      const src = brandSrc(variant, animated);
      expect(src.startsWith('data:image/svg+xml')).toBe(true);
      expect(decodeURIComponent(src.slice(src.indexOf(',') + 1))).toContain('<svg');
    }
  });

  it('as cópias de src/assets/brand são iguais às de public/brand (não podem divergir)', () => {
    for (const f of ['ironcoach-icon.svg', 'ironcoach-icon-animated.svg', 'ironcoach-lockup.svg', 'ironcoach-lockup-animated.svg']) {
      const a = readFileSync(resolve(process.cwd(), 'src/assets/brand', f), 'utf8').replace(/\r\n/g, '\n');
      const b = readFileSync(resolve(process.cwd(), 'public/brand', f), 'utf8').replace(/\r\n/g, '\n');
      expect(a, f).toBe(b);
    }
  });
});

describe('BrandMark', () => {
  it('o ícone parado tem as dimensões pedidas e o lockup segue o 4:3', () => {
    motion(false);
    const { container } = render(<><BrandMark variant="icon" size={36} /><BrandMark variant="lockup" size={240} /></>);
    const [icon, lockup] = container.querySelectorAll('img');
    expect(icon.getAttribute('data-animated')).toBe('false');
    expect(icon.style.width).toBe('36px');
    expect(lockup.style.height).toBe('180px');
  });

  it('playOnce anima um ciclo (2,2 s) e volta a parar', () => {
    motion(false);
    vi.useFakeTimers();
    const { container, rerender } = render(<BrandMark variant="icon" playOnce={0} />);
    const img = () => container.querySelector('img');
    expect(img().getAttribute('data-file')).toBe('ironcoach-icon.svg');

    act(() => { rerender(<BrandMark variant="icon" playOnce={1} />); });
    expect(img().getAttribute('data-file')).toBe('ironcoach-icon-animated.svg');

    act(() => { vi.advanceTimersByTime(BRAND_PLAY_ONCE_MS + 1); });
    expect(img().getAttribute('data-file')).toBe('ironcoach-icon.svg');
  });
});
