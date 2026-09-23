import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Sheet, useEscapeClose, closeTopOverlay } from './Sheet';

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

/* Revisão pré-deploy do bug #43: um ecrã inteiro com onClose inline (novo a
   cada render) voltava a empilhar-se a cada render e passava para cima da
   persiana que tinha aberto — o "voltar"/Escape fechava o ecrã inteiro. */
describe('closeTopOverlay — a ordem da pilha não muda com re-renders', () => {
  function Ecra({ tick, aberta, onCloseEcra, onCloseSheet }) {
    useEscapeClose(() => onCloseEcra(tick));
    return aberta ? <Sheet title="Seletor" onClose={() => onCloseSheet(tick)}><p>x</p></Sheet> : null;
  }

  it('depois de um re-render do ecrã, o voltar fecha a persiana de cima, não o ecrã', () => {
    vi.useFakeTimers();
    const onCloseEcra = vi.fn();
    const onCloseSheet = vi.fn();
    // O ecrã abre primeiro; a persiana abre-se depois, por cima dele.
    const { rerender, unmount } = render(<Ecra tick={1} aberta={false} onCloseEcra={onCloseEcra} onCloseSheet={onCloseSheet} />);
    rerender(<Ecra tick={1} aberta onCloseEcra={onCloseEcra} onCloseSheet={onCloseSheet} />);
    // Um re-render qualquer (ex.: a store mudou) dá ao ecrã um onClose novo.
    rerender(<Ecra tick={2} aberta onCloseEcra={onCloseEcra} onCloseSheet={onCloseSheet} />);

    act(() => { expect(closeTopOverlay()).toBe(true); });
    act(() => { vi.advanceTimersByTime(1000); });

    expect(onCloseSheet).toHaveBeenCalledWith(2);
    expect(onCloseEcra).not.toHaveBeenCalled();
    unmount();
    vi.useRealTimers();
  });

  it('sem nada aberto, devolve false', () => {
    expect(closeTopOverlay()).toBe(false);
  });
});
