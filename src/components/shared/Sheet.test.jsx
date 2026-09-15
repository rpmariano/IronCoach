import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Sheet } from './Sheet';

/* Achado 2026-09-15: duas persianas empilhadas (ex.: a lista de registos de
   um medalhão aberta por cima da persiana do medalhão) tinham CADA UMA o
   seu próprio listener de Escape — a tecla fechava as duas de uma vez, em
   vez de só a de cima. A pilha em Sheet.jsx garante que só a última a abrir
   (a de cima, visualmente) responde. */
describe('Sheet — Escape com duas persianas empilhadas', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('só a Sheet de cima fecha; a de baixo fica, e uma segunda Escape fecha essa', () => {
    const onCloseFundo = vi.fn();
    const onCloseTopo = vi.fn();
    const { rerender } = render(
      <>
        <Sheet onClose={onCloseFundo} testId="fundo">fundo</Sheet>
        <Sheet onClose={onCloseTopo} testId="topo">topo</Sheet>
      </>,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => { vi.runAllTimers(); });
    expect(onCloseTopo).toHaveBeenCalledTimes(1);
    expect(onCloseFundo).not.toHaveBeenCalled();

    // A de cima já fechou (quem a montava deixou de a renderizar) — só a de
    // baixo continua na pilha, e é ela que a próxima Escape fecha.
    rerender(<Sheet onClose={onCloseFundo} testId="fundo">fundo</Sheet>);
    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => { vi.runAllTimers(); });
    expect(onCloseFundo).toHaveBeenCalledTimes(1);
  });
});
