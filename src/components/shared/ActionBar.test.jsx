import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ActionBar from './ActionBar';
import Button from './Button';

describe('ActionBar', () => {
  it('renderiza os filhos dentro da barra', () => {
    render(<ActionBar><Button className="w-full">Guardar</Button></ActionBar>);
    const bar = screen.getByTestId('action-bar');
    expect(bar).toBeInTheDocument();
    expect(bar).toContainElement(screen.getByRole('button', { name: 'Guardar' }));
  });

  it('fica fixa acima da nav, a var(--actionbar-bottom) do fundo', () => {
    render(<ActionBar><Button>Guardar</Button></ActionBar>);
    const bar = screen.getByTestId('action-bar');
    // 76px do fundo (--actionbar-bottom), para assentar sobre a nav de 76px.
    // Mais o safe-area: a nav cresce env(safe-area-inset-bottom) num ecrã
    // com indicador de gestos (Layout.jsx) e a barra tem de subir com ela.
    // Sem notch env() é 0 e a barra fica nos mesmos 76px.
    expect(bar.style.bottom).toBe('calc(var(--actionbar-bottom) + env(safe-area-inset-bottom, 0px))');
    expect(bar.className).toContain('fixed');
    // Mesma coluna centrada max-w-md do header/nav do Layout.
    expect(bar.className).toContain('max-w-md');
  });

  it('com aboveNav={false} cola ao fundo do ecrã', () => {
    render(<ActionBar aboveNav={false}><Button>Continuar</Button></ActionBar>);
    expect(screen.getByTestId('action-bar').style.bottom).toBe('0px');
  });

  it('o botão da barra cumpre o piso de toque de 44px', () => {
    render(<ActionBar><Button className="w-full">Guardar</Button></ActionBar>);
    const btn = screen.getByRole('button', { name: 'Guardar' });
    // Os tamanhos do Button trazem tap-44/tap-h-44 (min-height: 44px em
    // globals.css) — o piso de toque do ponto 2 do handoff.
    expect(btn.className).toMatch(/tap-(h-)?44/);
  });

  it('encaminha o onClick do botão', () => {
    const onClick = vi.fn();
    render(<ActionBar><Button onClick={onClick}>Guardar</Button></ActionBar>);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
