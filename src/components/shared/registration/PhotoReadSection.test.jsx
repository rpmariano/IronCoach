import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PhotoReadSection, { ReadPrintsButton } from './PhotoReadSection';

/* #119 (2026-11-10, o Rui): «O botão para ler prints tem de ter muito mais destaque». É o botão
   principal junto das fotos — cheio na cor do módulo, com a tinta legível dele, largo e com ícone —
   no ginásio, na corrida, no corpo (PhotoReadSection) e na refeição (ReadPrintsButton à parte). */
describe('ReadPrintsButton — #119', () => {
  it('cheio na cor do módulo, com a tinta do módulo, largo e com ícone', () => {
    const onRead = vi.fn();
    render(<ReadPrintsButton onRead={onRead} accent="var(--mod-nutricao-to)" label="Ler e preencher" />);
    const b = screen.getByRole('button', { name: 'Ler e preencher' });
    expect(b.style.background).toBe('var(--mod-nutricao-to)');
    expect(b.style.color).toBe('var(--nutrition-ink)');
    expect(b.className).toMatch(/w-full/);
    expect(b.className).toMatch(/min-h-\[52px\]/);
    expect(b.querySelector('svg')).not.toBeNull();
    fireEvent.click(b);
    expect(onRead).toHaveBeenCalledTimes(1);
  });

  it('a ler: desativado, com a frase de espera', () => {
    render(<ReadPrintsButton onRead={() => {}} reading />);
    const b = screen.getByRole('button', { name: 'A ler os prints…' });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('aria-busy', 'true');
  });

  it('na secção das fotos leva a cor do módulo da secção (ginásio por omissão)', () => {
    render(<PhotoReadSection photos={[{ dataUrl: 'data:,' }]} maxPhotos={6} onSelect={() => {}} onRemove={() => {}} onRead={() => {}} />);
    const b = screen.getByRole('button', { name: 'Ler os prints e preencher' });
    expect(b.style.background).toBe('var(--mod-ginasio-to)');
    expect(b.style.color).toBe('var(--gym-ink)');
  });
});
