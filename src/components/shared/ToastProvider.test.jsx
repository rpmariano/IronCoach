import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ToastProvider, useToast, TOASTS_VISIVEIS } from './ToastProvider';

/* Os avisos curtos da app. Este ficheiro não existia: o ToastProvider eram
   12 linhas sem estado e um setTimeout. Desde 2026-09-21 não saem sozinhos
   («só desaparecem mediante ação do utilizador»), e passou a haver dispensa
   individual, "Limpar tudo" e uma região viva — tudo isso precisa de rede. */

function Disparador({ quantos = 1, tipo = 'success' }) {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => { for (let i = 1; i <= quantos; i += 1) showToast(`Aviso ${i}`, tipo); }}>
      disparar
    </button>
  );
}

const montar = (props) => render(
  <ToastProvider>
    <Disparador {...props} />
  </ToastProvider>,
);

const disparar = () => fireEvent.click(screen.getByRole('button', { name: 'disparar' }));

describe('ToastProvider', () => {
  it('o aviso fica no ecrã — não sai com o tempo', async () => {
    montar();
    disparar();
    expect(screen.getByTestId('toast')).toHaveTextContent('Aviso 1');

    // Tempo de sobra para os 3 s de antes.
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.getByTestId('toast')).toBeInTheDocument();
  });

  it('sai ao toque', () => {
    montar();
    disparar();
    fireEvent.click(screen.getByTestId('toast'));
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('"Limpar tudo" só aparece a partir do terceiro, e diz quantos são', () => {
    montar({ quantos: 2 });
    disparar();
    expect(screen.queryByTestId('toast-clear-all')).not.toBeInTheDocument();

    disparar(); // mais dois: quatro ao todo
    expect(screen.getByTestId('toast-clear-all')).toHaveTextContent('Limpar tudo (4)');

    fireEvent.click(screen.getByTestId('toast-clear-all'));
    expect(screen.queryAllByTestId('toast')).toHaveLength(0);
  });

  /* Sem teto, uma dúzia de avisos enchia o ecrã e empurrava o próprio
     "Limpar tudo" para fora — a saída desaparecia quando passava a ser
     precisa (2.ª revisão pré-deploy). */
  it('só ficam à vista os mais recentes; os outros contam-se', () => {
    montar({ quantos: TOASTS_VISIVEIS + 3 });
    disparar();

    expect(screen.getAllByTestId('toast')).toHaveLength(TOASTS_VISIVEIS);
    expect(screen.getByTestId('toast-more')).toHaveTextContent('+3 avisos mais antigos');
    // Os visíveis são os últimos a chegar.
    expect(screen.getAllByTestId('toast')[TOASTS_VISIVEIS - 1]).toHaveTextContent(`Aviso ${TOASTS_VISIVEIS + 3}`);
  });

  it('com um só escondido, o plural acerta', () => {
    montar({ quantos: TOASTS_VISIVEIS + 1 });
    disparar();
    expect(screen.getByTestId('toast-more')).toHaveTextContent('+1 aviso mais antigo');
  });

  /* `role="status"` assume `aria-atomic: true`: sem o desligar, cada aviso
     novo — e cada aviso dispensado — mandava reler a pilha inteira. */
  it('a região viva existe desde o início e não relê a pilha toda', () => {
    const { container } = montar();
    const viva = container.querySelector('.toast-live');
    expect(viva).toHaveAttribute('role', 'status');
    expect(viva).toHaveAttribute('aria-live', 'polite');
    expect(viva).toHaveAttribute('aria-atomic', 'false');
  });

  it('a mensagem é o nome do botão — o "Dispensar" não passa à frente dela', () => {
    montar();
    disparar();
    expect(screen.getByRole('button', { name: /^Aviso 1/ })).toBeInTheDocument();
  });
});
