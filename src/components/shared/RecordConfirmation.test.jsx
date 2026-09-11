import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import RecordConfirmation from './RecordConfirmation';
import { DUR_CONFIRM_EXIT, DUR_TAP } from '../../utils/introAnimations';

/* "Registo confirmado" — animação 6 de `IronCoach - Animacoes.dc.html`:
   impulso elástico de 420 ms, sai aos 900 ms e devolve o atleta ao seu
   caminho. Com prefers-reduced-motion o check aparece e sai aos 120 ms. */

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  vi.useRealTimers();
  window.matchMedia = originalMatchMedia;
});

describe('RecordConfirmation', () => {
  beforeEach(() => {
    window.matchMedia = () => ({ matches: false });
  });

  it('mostra o check e a etiqueta do registo, anunciado a leitores de ecrã', () => {
    render(<RecordConfirmation label="Corrida registada" onDone={() => {}} />);
    const overlay = screen.getByTestId('record-confirmation');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveAttribute('role', 'status');
    expect(overlay).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Corrida registada')).toBeInTheDocument();
  });

  it('o check tem a classe do impulso elástico e o halo a dissipar-se', () => {
    const { container } = render(<RecordConfirmation onDone={() => {}} />);
    expect(container.querySelector('.record-confirm-check')).not.toBeNull();
    expect(container.querySelector('.record-confirm-halo')).not.toBeNull();
    expect(container.querySelector('.record-confirm-label')).not.toBeNull();
  });

  it('chama onDone aos 900 ms (--dur-confirm-exit) e não antes', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<RecordConfirmation label="Treino registado" onDone={onDone} />);

    act(() => { vi.advanceTimersByTime(DUR_CONFIRM_EXIT - 1); });
    expect(onDone).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('com prefers-reduced-motion sai aos 120 ms — a confirmação lê-se, mas não se espera', () => {
    window.matchMedia = () => ({ matches: true });
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<RecordConfirmation onDone={onDone} />);

    act(() => { vi.advanceTimersByTime(DUR_TAP); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('desmontar antes do tempo cancela o temporizador — sem onDone órfão', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const { unmount } = render(<RecordConfirmation onDone={onDone} />);
    unmount();
    act(() => { vi.advanceTimersByTime(DUR_CONFIRM_EXIT * 2); });
    expect(onDone).not.toHaveBeenCalled();
  });

  it('re-renderizações não adiam a saída (o onDone muda de identidade a cada render)', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const { rerender } = render(<RecordConfirmation onDone={() => onDone()} />);
    act(() => { vi.advanceTimersByTime(DUR_CONFIRM_EXIT / 2); });
    rerender(<RecordConfirmation onDone={() => onDone()} />);
    act(() => { vi.advanceTimersByTime(DUR_CONFIRM_EXIT / 2); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
