import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import VerdictLine from './VerdictLine';

/* Ponto 6 do redesenho. O que este teste trava:
   - a frase aparece mesmo (é o primeiro elemento do dashboard);
   - o traço muda de cor com o TOM, não com o módulo — foi a decisão que
     divergiu do mock de propósito (ver comentário no componente);
   - sem texto não se renderiza nada (não fica um traço órfão). */

describe('VerdictLine', () => {
  it('mostra a frase', () => {
    render(<VerdictLine text="O volume está a subir de forma segura." tone="ok" />);
    expect(screen.getByText('O volume está a subir de forma segura.')).toBeInTheDocument();
  });

  it('expõe o tom para quem lê o DOM e para o leitor de ecrã', () => {
    render(<VerdictLine text="A proteína anda 20% abaixo do alvo." tone="warn" />);
    const line = screen.getByTestId('verdict-line');
    expect(line).toHaveAttribute('data-tone', 'warn');
    expect(line).toHaveAttribute('role', 'status');
  });

  it('pinta o traço na cor do tom', () => {
    const cases = [
      ['ok', 'var(--ok)'],
      ['warn', 'var(--warn)'],
      ['danger', 'var(--danger)'],
      ['neutral', 'var(--text-4)'],
    ];
    for (const [tone, color] of cases) {
      const { unmount } = render(<VerdictLine text="Frase." tone={tone} />);
      expect(screen.getByTestId('verdict-dash')).toHaveStyle({ background: color });
      unmount();
    }
  });

  it('um tom desconhecido cai em neutro em vez de rebentar', () => {
    render(<VerdictLine text="Frase." tone="roxo" />);
    expect(screen.getByTestId('verdict-line')).toHaveAttribute('data-tone', 'neutral');
  });

  it('sem texto não renderiza nada', () => {
    const { container } = render(<VerdictLine text="" tone="ok" />);
    expect(container).toBeEmptyDOMElement();
  });
});
