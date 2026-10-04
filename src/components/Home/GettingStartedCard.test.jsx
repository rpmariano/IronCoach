import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import GettingStartedCard, { gettingStartedDismissKey, gettingStartedCompletedKey } from './GettingStartedCard';
import { todayISO, addDaysISO } from '../../lib/utils';

const vazio = { profile: { id: 'u1' }, raceEvents: [], runs: [], meals: [] };

describe('GettingStartedCard', () => {
  beforeEach(() => { localStorage.clear(); useAppStore.setState(vazio); });

  it('cada passo por fazer é um botão que chama onAction com a chave', () => {
    const onAction = vi.fn();
    render(<GettingStartedCard onAction={onAction} />);
    expect(screen.getByText(/montar o plano até à prova/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Perfil preenchido/ }));
    fireEvent.click(screen.getByRole('button', { name: /Marcar uma prova/ }));
    fireEvent.click(screen.getByRole('button', { name: /Registar 3 corridas/ }));
    fireEvent.click(screen.getByRole('button', { name: /1 semana de refeições/ }));
    expect(onAction.mock.calls.map((c) => c[0])).toEqual(['perfil', 'prova', 'corridas', 'refeicoes']);
  });

  it('um passo feito deixa de ser botão', () => {
    useAppStore.setState({ raceEvents: [{ id: 'r1' }] });
    render(<GettingStartedCard onAction={() => {}} />);
    expect(screen.queryByRole('button', { name: /Marcar uma prova/ })).not.toBeInTheDocument();
    expect(screen.getByText('1 de 4')).toBeInTheDocument();
  });

  it('"Agora não" esconde e guarda a dispensa por utilizador', () => {
    const { container } = render(<GettingStartedCard onAction={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Agora não/ }));
    expect(container).toBeEmptyDOMElement();
    expect(localStorage.getItem(gettingStartedDismissKey('u1'))).toBe('1');
  });

  it('já dispensado: não aparece; outro utilizador vê-o', () => {
    localStorage.setItem(gettingStartedDismissKey('u1'), '1');
    const { container, rerender } = render(<GettingStartedCard onAction={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    useAppStore.setState({ profile: { id: 'u2' } });
    rerender(<GettingStartedCard onAction={() => {}} />);
    expect(screen.getByTestId('getting-started')).toBeInTheDocument();
  });

  const completo = (nDias = 7) => ({
    profile: { id: 'u1', experience_level: 'x', weight_kg: 70 },
    raceEvents: [{ id: 'r' }],
    runs: [{}, {}, {}],
    meals: Array.from({ length: nDias }, (_, i) => ({ date: addDaysISO(todayISO(), -(i + 1)) })),
  });

  it('esconde-se com os 4 passos feitos e lembra a conclusão', () => {
    useAppStore.setState(completo());
    const { container, rerender } = render(<GettingStartedCard onAction={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    expect(localStorage.getItem(gettingStartedCompletedKey('u1'))).toBe('1');
    // falha um dia (6 de 7): continua escondido
    useAppStore.setState(completo(6));
    rerender(<GettingStartedCard onAction={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('não aparece enquanto os dados estão pendentes', () => {
    useAppStore.setState({ dataPending: true });
    const { container } = render(<GettingStartedCard onAction={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    useAppStore.setState({ dataPending: false });
  });

  it('sem utilizador não grava a dispensa; trocar de conta repõe o cartão', () => {
    useAppStore.setState({ profile: null });
    const { container, rerender } = render(<GettingStartedCard onAction={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Agora não/ }));
    expect(container).toBeEmptyDOMElement();
    expect(localStorage.getItem(gettingStartedDismissKey(undefined))).toBeNull();

    useAppStore.setState({ profile: { id: 'u1' } });
    rerender(<GettingStartedCard onAction={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Agora não/ }));
    useAppStore.setState({ profile: { id: 'u2' } });
    rerender(<GettingStartedCard onAction={() => {}} />);
    expect(screen.getByTestId('getting-started')).toBeInTheDocument();
  });
});
