import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MetricInfo from './MetricInfo';

/* O "Mais informações" media 18×18 px no browser (2026-10-04): a área de 44 px
   do `tap-area-44` é um pseudo-elemento, que não conta quando se mede o botão.
   Agora o próprio botão mede 44×44 (var(--tap)), com margens negativas que
   devolvem os 13 px de cada lado — o glifo (14 px) e a pastilha (18 px) ficam
   iguais e o layout à volta também. O jsdom não faz layout: aqui garante-se o
   que o CSS inline declara; a medição real é no Chromium. */
describe('MetricInfo', () => {
  it('o botão tem 44×44 (var(--tap)) e as margens negativas mantêm o layout do glifo de 18 px', () => {
    render(<MetricInfo text="Explicação." />);
    const b = screen.getByRole('button', { name: 'Mais informações' });
    expect(b.style.width).toBe('var(--tap)');
    expect(b.style.height).toBe('var(--tap)');
    // 44 − 18 = 26 → 13 px de cada lado (e −7 à esquerda = −13 + os 6 px do antigo `ml-1.5`).
    expect(b.style.margin).toBe('-13px -13px -13px -7px');
    // O glifo continua a 14 px, dentro da pastilha de 18 px (o círculo "aberto" não cresce).
    const glyph = b.querySelector('svg');
    expect(glyph).toHaveAttribute('width', '14');
    expect(glyph).toHaveAttribute('height', '14');
    expect(glyph.parentElement.className).toMatch(/rounded-full/);
    expect(glyph.parentElement.className).toMatch(/p-0\.5/);
  });

  it('alterna o texto, com aria-expanded', () => {
    render(<MetricInfo text="Explicação." />);
    const b = screen.getByRole('button', { name: 'Mais informações' });
    expect(b).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(b);
    expect(b).toHaveAttribute('aria-expanded', 'true');
    expect(b.firstElementChild.className).toMatch(/bg-\[var\(--tint-coach-bg\)\]/);
    fireEvent.click(b);
    expect(b).toHaveAttribute('aria-expanded', 'false');
  });

  it('abrir um fecha o outro', () => {
    render(<><MetricInfo text="A" /><MetricInfo text="B" /></>);
    const [a, b] = screen.getAllByRole('button', { name: 'Mais informações' });
    fireEvent.click(a);
    fireEvent.click(b);
    expect(a).toHaveAttribute('aria-expanded', 'false');
    expect(b).toHaveAttribute('aria-expanded', 'true');
  });

  it('sem texto não desenha nada', () => {
    const { container } = render(<MetricInfo />);
    expect(container).toBeEmptyDOMElement();
  });
});
