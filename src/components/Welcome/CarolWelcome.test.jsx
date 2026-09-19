import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import CarolWelcome from './CarolWelcome';
import { WELCOME_AUTO_CLOSE_MS } from '../../utils/carolWelcome';

const welcome = {
  variant: 'manha',
  greeting: 'Bom dia, Rui.',
  lines: ['O check-in diz que dormiste bem.', 'Hoje tens rodagem · 8 km.'],
  chip: { label: 'Hoje', value: 'Rodagem · 8 km', icon: 'run' },
  cta: 'Começar o dia',
  race: false,
};
const NOW = new Date('2026-09-19T07:12:00+01:00');

afterEach(() => vi.useRealTimers());

describe('CarolWelcome', () => {
  it('é um diálogo com o nome dela a falar, as frases e o que interessa hoje', () => {
    render(<CarolWelcome welcome={welcome} now={NOW} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Bom dia, Rui.' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('O check-in diz que dormiste bem.')).toBeInTheDocument();
    expect(screen.getByText('Rodagem · 8 km')).toBeInTheDocument();
    expect(screen.getByText('07:12')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Começar o dia' })).toHaveFocus();
  });

  it('fecha com o botão, com um toque em qualquer sítio ou com Escape — uma vez só', () => {
    const onClose = vi.fn();
    const { unmount } = render(<CarolWelcome welcome={welcome} now={NOW} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Começar o dia' }));
    fireEvent.click(screen.getByTestId('carol-welcome'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    const onClose2 = vi.fn();
    render(<CarolWelcome welcome={welcome} now={NOW} onClose={onClose2} />);
    fireEvent.click(screen.getByText('O check-in diz que dormiste bem.'));
    expect(onClose2).toHaveBeenCalledTimes(1);
  });

  it('fecha sozinha ao fim do tempo', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<CarolWelcome welcome={welcome} now={NOW} onClose={onClose} />);
    act(() => { vi.advanceTimersByTime(1800 + WELCOME_AUTO_CLOSE_MS - 1); });
    expect(onClose).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('no dia da prova, a variante âmbar', () => {
    render(<CarolWelcome welcome={{ ...welcome, variant: 'prova', greeting: 'É hoje, Rui.', cta: 'Estou pronto', race: true }} now={NOW} onClose={() => {}} />);
    expect(screen.getByTestId('carol-welcome')).toHaveAttribute('data-variant', 'prova');
    expect(screen.getByRole('button', { name: 'Estou pronto' })).toBeInTheDocument();
  });
});

describe('CarolWelcome — o foco (revisão pré-master de 2026-09-19)', () => {
  it('o Tab não sai dela, e ao fechar o foco volta ao sítio de onde veio', () => {
    const antes = document.createElement('button');
    document.body.appendChild(antes);
    antes.focus();
    expect(antes).toHaveFocus();

    const { unmount } = render(<CarolWelcome welcome={welcome} now={NOW} onClose={() => {}} />);
    const botao = screen.getByRole('button', { name: 'Começar o dia' });
    expect(botao).toHaveFocus();

    // Tab: fica lá dentro.
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(botao).toHaveFocus();

    unmount();
    expect(antes).toHaveFocus();
    antes.remove();
  });
});
