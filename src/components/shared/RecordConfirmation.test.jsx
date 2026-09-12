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

/* A conquista nova (specs/gamificacao-provas.md §1): entra 300 ms depois do
   check e prolonga a confirmação até 1,6 s, porque há mais para ler. */
describe('RecordConfirmation — a conquista nova da prova', () => {
  const Medalha = (props) => <svg data-testid="icone-conquista" {...props} />;
  const CONQUISTA = {
    key: 'recorde_pessoal',
    name: 'Recorde pessoal',
    detail: 'Meia: 1:53:42, 4:04 abaixo do anterior',
    tone: 'run',
    Icon: Medalha,
  };

  beforeEach(() => {
    window.matchMedia = () => ({ matches: false });
  });

  it('o cartão só entra aos 300 ms, depois do check', () => {
    vi.useFakeTimers();
    render(<RecordConfirmation label="Meia de Lisboa concluída" tone="race" achievement={CONQUISTA} onDone={() => {}} />);

    expect(screen.queryByTestId('record-confirmation-achievement')).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(300); });

    const cartao = screen.getByTestId('record-confirmation-achievement');
    expect(cartao).toHaveTextContent('Nova conquista');
    expect(cartao).toHaveTextContent('Recorde pessoal');
    expect(cartao).toHaveTextContent('Meia: 1:53:42, 4:04 abaixo do anterior');
  });

  it('com conquista, a confirmação só sai aos 1,6 s', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<RecordConfirmation tone="race" achievement={CONQUISTA} onDone={onDone} />);

    act(() => { vi.advanceTimersByTime(DUR_CONFIRM_EXIT); });
    expect(onDone).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1600 - DUR_CONFIRM_EXIT); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('havendo mais do que uma, mostra a primeira e conta o resto', () => {
    vi.useFakeTimers();
    render(<RecordConfirmation tone="race" achievement={{ ...CONQUISTA, extra: '+1 conquista' }} onDone={() => {}} />);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByTestId('record-confirmation-achievement')).toHaveTextContent('+1 conquista');
  });

  it('sem conquista nenhuma, o registo de todos os dias sai aos 900 ms como sempre', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<RecordConfirmation onDone={onDone} />);
    act(() => { vi.advanceTimersByTime(DUR_CONFIRM_EXIT); });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('record-confirmation-achievement')).not.toBeInTheDocument();
  });

  it('com prefers-reduced-motion o cartão não espera pelos 300 ms', () => {
    window.matchMedia = () => ({ matches: true });
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<RecordConfirmation tone="race" achievement={CONQUISTA} onDone={onDone} />);

    act(() => { vi.advanceTimersByTime(DUR_TAP); });
    expect(screen.getByTestId('record-confirmation-achievement')).toBeInTheDocument();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
