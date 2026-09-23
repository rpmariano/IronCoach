import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ToastProvider, useToast, TOASTS_VISIVEIS, TOAST_MS } from './ToastProvider';

/* Os avisos curtos da app. Saem sozinhos (bug #44, 2026-09-22: "devem
   desaparecer sozinhas, como estava originalmente desenhado"); o toque, o
   "Limpar tudo" e a região viva ficaram do período em que esperavam. */

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
  afterEach(() => vi.useRealTimers());

  it('o aviso sai sozinho ao fim de 3 s', () => {
    vi.useFakeTimers();
    montar();
    disparar();
    expect(screen.getByTestId('toast')).toHaveTextContent('Aviso 1');
    act(() => { vi.advanceTimersByTime(TOAST_MS.success - 1); });
    expect(screen.getByTestId('toast')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('um erro fica o dobro do tempo, para dar para o ler', () => {
    vi.useFakeTimers();
    montar({ tipo: 'error' });
    disparar();
    act(() => { vi.advanceTimersByTime(TOAST_MS.success); });
    expect(screen.getByTestId('toast')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(TOAST_MS.error - TOAST_MS.success); });
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
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
