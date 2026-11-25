import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CarolLineV2, { CAROL_LINE_CHARS } from './CarolLineV2';

/* A linha da Carol dos cartões v2 (uniformização, 2026-11-25): «Ler mais» só quando a análise não
   cabe numa linha. No jsdom não há layout (as medidas dão 0) e conta o número de caracteres. */

function Host({ text }) {
  const [open, setOpen] = useState(false);
  return <CarolLineV2 text={text} id="c1" open={open} onToggle={() => setOpen((o) => !o)} testId="carol" />;
}

describe('CarolLineV2', () => {
  it('curta: numa linha, sem «Ler mais»', () => {
    render(<Host text="Boa sessão." />);
    expect(screen.getByTestId('carol')).toHaveTextContent('Carol. Boa sessão.');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('longa: «Ler mais» abre o texto inteiro no sítio, «Ler menos» volta a fechar', () => {
    const longo = 'Ritmo certo nos primeiros quilómetros. '.repeat(4);
    expect(longo.length).toBeGreaterThan(CAROL_LINE_CHARS);
    render(<Host text={longo} />);
    const btn = screen.getByRole('button', { name: 'Ler mais' });
    expect(btn).toHaveClass('v2-act', 'is-acc');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(screen.getByRole('button', { name: 'Ler menos' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('carol').querySelector('.v2-rec-say-full')).not.toBeNull();
  });

  it('a linha sai sem as marcas do texto rico nem travessões', () => {
    render(<Host text={'## Resumo\n**Boa** sessão — mantém.'} />);
    expect(screen.getByTestId('carol')).toHaveTextContent('Carol. Resumo Boa sessão: mantém.');
  });
});
