import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CarolActions, { CarolTalkButton } from './CarolActions';
import CarolInterventionActions from './CarolInterventionActions';
import { useAppStore } from '../../store';

/* A convenção única dos botões da Carol (2026-10-05): primário em cima com
   a largura toda; por baixo, em linha, o positivo à esquerda e o negativo à
   direita. */
describe('CarolActions', () => {
  it('"Falar com a Carol" em cima, com o balão; por baixo [Percebi] [Agora não]', () => {
    render(
      <CarolActions
        talk={{ onClick: vi.fn() }}
        understood={{ onClick: vi.fn() }}
        snooze={{ onClick: vi.fn() }}
      />,
    );
    const [falar, percebi, agoraNao] = screen.getAllByRole('button');
    expect(falar).toHaveTextContent('Falar com a Carol');
    expect(falar.querySelector('svg.lucide-message-circle')).not.toBeNull();
    expect(falar.getAttribute('style')).toContain('--grad-coach-legible');
    expect(falar.getAttribute('style')).toContain('--coach-ink');
    expect(falar.className).toMatch(/min-h-\[44px\]/);
    expect(percebi).toHaveTextContent('Percebi');
    expect(agoraNao).toHaveTextContent('Agora não');
    // "Agora não" é sempre só até amanhã — e o leitor de ecrã ouve-o.
    expect(agoraNao).toHaveAccessibleName('Agora não — volta amanhã, se ainda se aplicar');
    // Percebi e Agora não na mesma linha, Percebi à esquerda.
    expect(percebi.parentElement).toBe(agoraNao.parentElement);
    expect(percebi.nextElementSibling).toBe(agoraNao);
  });

  it('"Dispensar" diz ao leitor de ecrã o que dispensa', () => {
    const onDismiss = vi.fn();
    render(<CarolActions talk={{ onClick: vi.fn() }} dismiss={{ onClick: onDismiss }} />);
    const dispensar = screen.getByRole('button', { name: 'Dispensar este aviso' });
    expect(dispensar).toHaveTextContent('Dispensar');
    fireEvent.click(dispensar);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('sem papéis secundários não há linha por baixo', () => {
    const { container } = render(<CarolActions talk={{ onClick: vi.fn() }} />);
    expect(container.querySelectorAll('button')).toHaveLength(1);
  });

  it('CarolTalkButton aceita um CTA com contexto que mantém o verbo', () => {
    render(<CarolTalkButton onClick={vi.fn()}>Adaptar o plano com a Carol</CarolTalkButton>);
    const b = screen.getByRole('button', { name: 'Adaptar o plano com a Carol' });
    expect(b.querySelector('svg.lucide-message-circle')).not.toBeNull();
  });
});

/* O componente comum dos registos: cartão, formulário e "Registo
   Guardado". Aqui com o store a sério — a dispensa lê-se pelo hook
   (reativo): ao dispensar, o botão sai logo. */
describe('CarolInterventionActions', () => {
  const CONVITE = 'Treino pesado. Temos de adaptar o plano.';
  let setActiveTab;
  let setCoachIntent;

  beforeEach(() => {
    localStorage.clear();
    setActiveTab = vi.fn(() => true);
    setCoachIntent = vi.fn();
    useAppStore.setState({ dismissedInterventions: {}, setActiveTab, setCoachIntent });
  });

  it('"Falar com a Carol" abre o chat sobre este registo e NÃO dispensa', () => {
    const onTalked = vi.fn();
    render(<CarolInterventionActions record={{ id: 'g1', name: 'Pernas', date: '2026-10-05', coach_notes: CONVITE }} type="gym" onTalked={onTalked} />);
    fireEvent.click(screen.getByRole('button', { name: 'Falar com a Carol' }));
    expect(setCoachIntent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'proactive_intervention', recordType: 'gym', recordId: 'g1', reason: CONVITE }));
    expect(setActiveTab).toHaveBeenCalledWith('coach');
    expect(onTalked).toHaveBeenCalled();
    expect(useAppStore.getState().dismissedInterventions).toEqual({});
    // Continua à vista: sai quando o assunto se resolve.
    expect(screen.getByRole('button', { name: 'Falar com a Carol' })).toBeInTheDocument();
  });

  it('com a saída travada, não fecha nada e o pedido desfaz-se', () => {
    setActiveTab.mockReturnValue(false);
    const onTalked = vi.fn();
    render(<CarolInterventionActions record={{ id: 'g1', coach_notes: CONVITE }} type="gym" onTalked={onTalked} />);
    fireEvent.click(screen.getByRole('button', { name: 'Falar com a Carol' }));
    expect(onTalked).not.toHaveBeenCalled();
    expect(setCoachIntent).toHaveBeenLastCalledWith(null);
  });

  it('"Dispensar" grava com a chave única do tipo e o botão sai logo', () => {
    render(<CarolInterventionActions record={{ id: 'b1', ai_summary: CONVITE, coach_notes: 'outro' }} type="body" />);
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar este aviso' }));
    expect(useAppStore.getState().dismissedInterventions).toEqual({ b1: CONVITE });
    expect(screen.queryByRole('button', { name: 'Falar com a Carol' })).not.toBeInTheDocument();
    expect(setActiveTab).not.toHaveBeenCalled();
  });

  it('o clique não sobe ao cartão', () => {
    const onCard = vi.fn();
    render(
      <div onClick={onCard}>
        <CarolInterventionActions record={{ id: 'm1', coach_notes: CONVITE }} type="meal" />
      </div>,
    );
    fireEvent.click(within(screen.getByTestId('carol-intervention-meal')).getByRole('button', { name: 'Falar com a Carol' }));
    expect(onCard).not.toHaveBeenCalled();
  });

  it('sem convite, nada', () => {
    const { container } = render(<CarolInterventionActions record={{ id: 'm1', coach_notes: 'Boa refeição.' }} type="meal" />);
    expect(container).toBeEmptyDOMElement();
  });
});
