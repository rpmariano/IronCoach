import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setDesignV2 } from '../../utils/designV2';
import PremiumModal from './PremiumModal';

/* Acessibilidade de base no v2 (2.ª crítica, 2026-11-28): o PremiumModal fecha com Escape, leva o
   foco para dentro ao abrir, prende-o lá e devolve-o a quem o abriu. Na v1, como sempre. */

afterEach(() => act(() => setDesignV2(false)));

function Abridor({ onClose = () => {} }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Abrir</button>
      <PremiumModal isOpen={open} onClose={() => { setOpen(false); onClose(); }} title="Eliminar prova" variant="dialog">
        <div>
          <button type="button">Eliminar prova</button>
          <button type="button">Cancelar</button>
        </div>
      </PremiumModal>
    </>
  );
}

describe('PremiumModal — o foco no v2', () => {
  it('ao abrir o foco vai para o diálogo (não para o botão de eliminar)', () => {
    act(() => setDesignV2(true));
    render(<Abridor />);
    const abrir = screen.getByRole('button', { name: 'Abrir' });
    abrir.focus();
    fireEvent.click(abrir);
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(dialog);
    expect(dialog).toHaveAttribute('tabindex', '-1');
  });

  it('o Tab fica preso lá dentro: do último volta ao primeiro, e o Shift+Tab do primeiro vai ao último', () => {
    act(() => setDesignV2(true));
    render(<Abridor />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialog = screen.getByRole('dialog');
    const botoes = [...dialog.querySelectorAll('button')];
    const ultimo = botoes[botoes.length - 1];
    ultimo.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(botoes[0]);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(ultimo);
  });

  it('o Escape fecha e o foco volta a quem o abriu', async () => {
    act(() => setDesignV2(true));
    const onClose = vi.fn();
    render(<Abridor onClose={onClose} />);
    const abrir = screen.getByRole('button', { name: 'Abrir' });
    abrir.focus();
    fireEvent.click(abrir);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 1500 });
    await waitFor(() => expect(document.activeElement).toBe(abrir));
  });

  it('v1: como sempre (o Escape não fecha, nem o diálogo recebe o foco)', async () => {
    const onClose = vi.fn();
    render(<Abridor onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveAttribute('tabindex');
    expect(document.activeElement).not.toBe(dialog);
    fireEvent.keyDown(document, { key: 'Escape' });
    await new Promise((r) => setTimeout(r, 600));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('v2.css — nada abaixo de 12 px e a bolha que não tapa texto', () => {
  const css = readFileSync(resolve(__dirname, '../../styles/v2.css'), 'utf8');
  it('o --text-xs e os tamanhos fixos de 9 a 11,5 px sobem a 12 px (menos os .v2-num)', () => {
    expect(css).toMatch(/html\.design-v2 \{ --text-xs: 12px; \}/);
    expect(css).toMatch(/\.text-\\\[11px\\\][\s\S]*?:not\(\.v2-num\) \{ font-size: 12px !important; \}/);
  });
  it('a bolha da Carol é uma aba encostada à margem direita, com 32 px de largura', () => {
    expect(css).toMatch(/\[data-testid="coach-insight-button"\] \{\s*right: 0 !important; width: 32px !important; height: 52px !important;/);
  });
});
