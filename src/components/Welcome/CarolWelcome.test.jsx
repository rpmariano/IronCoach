import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import CarolWelcome from './CarolWelcome';
import { useAppStore } from '../../store';

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

  /* Pedido de 2026-09-21: «todas as mensagens que têm este caráter
     temporário devem deixar de o ter; quero que só desapareçam mediante ação
     do utilizador». Fechava-se aos 7,8 s. Este teste é o que impede que o
     temporizador volte. */
  it('não se fecha sozinha — espera pelo atleta', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<CarolWelcome welcome={welcome} now={NOW} onClose={onClose} />);
    act(() => { vi.advanceTimersByTime(60000); });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('carol-welcome')).toBeInTheDocument();
  });

  it('já não mostra a barra que contava o tempo', () => {
    const { container } = render(<CarolWelcome welcome={welcome} now={NOW} onClose={() => {}} />);
    expect(container.querySelector('.welcome-drain')).toBeNull();
  });

  it('no dia da prova, a variante âmbar', () => {
    render(<CarolWelcome welcome={{ ...welcome, variant: 'prova', greeting: 'É hoje, Rui.', cta: 'Estou pronto', race: true }} now={NOW} onClose={() => {}} />);
    expect(screen.getByTestId('carol-welcome')).toHaveAttribute('data-variant', 'prova');
    expect(screen.getByRole('button', { name: 'Estou pronto' })).toBeInTheDocument();
  });

  it('na véspera (ação P.11), sem luz própria: desenha-se com a da hora', () => {
    const vespera = {
      variant: 'vespera',
      greeting: 'Amanhã é dia de prova, Rui.',
      lines: ['Meia de Lisboa, partida às 9:30.', 'Hoje é descanso.'],
      chip: { label: '21,1 km', value: 'Partida às 09:30', icon: 'trophy' },
      cta: 'Ver o meu dia',
      race: false,
    };
    render(<CarolWelcome welcome={vespera} now={new Date('2026-09-19T21:10:00+01:00')} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Amanhã é dia de prova, Rui.' })).toHaveAttribute('data-variant', 'vespera');
    expect(screen.getByText('Partida às 09:30')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver o meu dia' })).toHaveFocus();
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

// Pedido 2026-09-23: o check-in da manhã explica-se e o botão abre-o.
describe('CarolWelcome — "Fazer o check-in"', () => {
  it('leva ao Início e pede ao cartão que abra o check-in', () => {
    useAppStore.setState({ activeTab: 'coach', navGuard: null, checkinRequested: false });
    const onClose = vi.fn();
    render(<CarolWelcome welcome={{ ...welcome, cta: 'Fazer o check-in', action: 'checkin' }} now={NOW} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fazer o check-in' }));
    expect(useAppStore.getState().activeTab).toBe('home');
    expect(useAppStore.getState().checkinRequested).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('com a navegação recusada (formulário por gravar), só fecha', () => {
    useAppStore.setState({ activeTab: 'perfil', navGuard: () => false, checkinRequested: false });
    const onClose = vi.fn();
    render(<CarolWelcome welcome={{ ...welcome, cta: 'Fazer o check-in', action: 'checkin' }} now={NOW} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fazer o check-in' }));
    expect(useAppStore.getState().checkinRequested).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    useAppStore.setState({ navGuard: null });
  });
});

/* Revisão das boas-vindas de 2026-09-26: a cara vem do texto (buildWelcome,
   `mood`). Antes, qualquer madrugada era 'worried' — às 23:05 antes de um
   descanso —, e o "Dormiste mal" da manhã ficava com a cara neutra. */
describe('CarolWelcome — a cara acompanha o que ela diz', () => {
  const moodOf = (container) => container.querySelector('[data-mood]')?.getAttribute('data-mood');

  it('desenha a cara que o texto pede', () => {
    const { container, unmount } = render(<CarolWelcome welcome={{ ...welcome, lines: ['Dormiste mal, pelo que me disseste.'], mood: 'caring' }} now={NOW} onClose={() => {}} />);
    expect(moodOf(container)).toBe('caring');
    unmount();
    const madrugada = { ...welcome, variant: 'madrugada', greeting: 'Ainda acordado, Rui?', mood: 'caring' };
    const r = render(<CarolWelcome welcome={madrugada} now={new Date('2026-09-26T23:05:00+01:00')} onClose={() => {}} />);
    expect(moodOf(r.container)).toBe('caring');
  });

  it('sem `mood`, a madrugada não é "worried": neutra, e contente só na prova', () => {
    const { container, unmount } = render(<CarolWelcome welcome={{ ...welcome, variant: 'madrugada', greeting: 'Ainda a pé?' }} now={new Date('2026-09-26T23:05:00+01:00')} onClose={() => {}} />);
    expect(moodOf(container)).toBe('neutral');
    unmount();
    const r = render(<CarolWelcome welcome={{ ...welcome, variant: 'prova', greeting: 'É hoje, Rui.', race: true }} now={NOW} onClose={() => {}} />);
    expect(moodOf(r.container)).toBe('happy');
  });
});
