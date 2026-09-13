import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import React from 'react';
import BrandMark, { brandSrc, BRAND_PLAY_ONCE_MS } from './BrandMark';

/* A marca (2026-09-13): parada por omissão, animada onde se pede, e o
   `playOnce` do cabeçalho toca um ciclo e volta a parar. */

const motion = (reduce) => vi.stubGlobal('matchMedia', () => ({ matches: reduce, addEventListener() {}, removeEventListener() {} }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('brandSrc', () => {
  it('escolhe o ficheiro pela variante e pelo movimento', () => {
    motion(false);
    expect(brandSrc('icon', false)).toMatch(/brand\/ironcoach-icon\.svg$/);
    expect(brandSrc('icon', true)).toMatch(/brand\/ironcoach-icon-animated\.svg$/);
    expect(brandSrc('lockup', true)).toMatch(/brand\/ironcoach-lockup-animated\.svg$/);
  });

  it('com prefers-reduced-motion a variante animada cai para a parada', () => {
    motion(true);
    expect(brandSrc('lockup', true)).toMatch(/brand\/ironcoach-lockup\.svg$/);
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
    expect(img().src).toMatch(/ironcoach-icon\.svg$/);

    act(() => { rerender(<BrandMark variant="icon" playOnce={1} />); });
    expect(img().src).toMatch(/ironcoach-icon-animated\.svg$/);

    act(() => { vi.advanceTimersByTime(BRAND_PLAY_ONCE_MS + 1); });
    expect(img().src).toMatch(/ironcoach-icon\.svg$/);
  });
});
