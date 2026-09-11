import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import CarouselDots from './CarouselDots';

/* Ponto 9: os pontos dos carrosséis passam a ter alvo de 44×44 sem mexer no
   desenho — o traço visível continua a ser a caixa que a minhoca mede. */

describe('CarouselDots — alvos de toque', () => {
  it('com um só item não se desenha nada', () => {
    const { container } = render(<CarouselDots count={1} currentIndex={0} onSelect={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('cada ponto tem um alvo de 44×44 (--tap), invisível e fora do fluxo', () => {
    render(<CarouselDots count={3} currentIndex={0} onSelect={() => {}} />);
    const alvos = screen.getAllByTestId('carousel-dot-target');
    expect(alvos).toHaveLength(3);
    for (const alvo of alvos) {
      expect(alvo.style.width).toBe('var(--tap)');
      expect(alvo.style.height).toBe('var(--tap)');
      // Centrado no traço, absoluto: não empurra o layout dos pontos.
      expect(alvo.className).toContain('absolute');
      expect(alvo.style.transform).toBe('translate(-50%, -50%)');
    }
  });

  it('o alvo não é a caixa que a minhoca mede — o traço de 16×6 continua a sê-lo', () => {
    const { container } = render(<CarouselDots count={3} currentIndex={1} onSelect={() => {}} />);
    // O traço: a caixa w-4 h-1.5 de cada ponto continua no layout, e o alvo
    // de 44px vive por cima dela sem lhe mudar as medidas.
    const tracos = container.querySelectorAll('div[class~="w-4"]');
    expect(tracos).toHaveLength(3);
    for (const alvo of screen.getAllByTestId('carousel-dot-target')) {
      expect(alvo.className).not.toContain('w-4');
      // O alvo está EXCLUÍDO do scale .98 do toque, para não encolher a
      // caixa medida enquanto o dedo está em baixo.
      expect(alvo.className).toContain('no-tap-scale');
    }
  });

  it('tocar no alvo seleciona o ponto correspondente', () => {
    const onSelect = vi.fn();
    render(<CarouselDots count={3} currentIndex={0} onSelect={onSelect} ariaLabelPrefix="Ver prova" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver prova 3' }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('o desenho não mudou: continua um traço pequeno por ponto', () => {
    const { container } = render(<CarouselDots count={4} currentIndex={2} onSelect={() => {}} />);
    expect(container.querySelectorAll('span[class~="w-1.5"][class~="rounded-full"]')).toHaveLength(4);
  });
});
