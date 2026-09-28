import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AppTutorial from './AppTutorial';
import { useAppStore } from '../../store';
import { isTutorialDoneLocally } from '../../utils/tutorial';

vi.mock('../Coach/CoachAvatar', () => ({
  default: () => <div data-testid="coach-avatar" />,
}));

describe('AppTutorial', () => {
  const userId = 'test-athlete';

  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      profile: { id: userId, display_name: 'Manuel' },
      activeTab: 'home',
    });
  });

  it('renderiza o primeiro passo do tutorial com foco na PT empática', () => {
    render(<AppTutorial onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Mais do que uma app, tens uma PT ao teu lado/i)).toBeInTheDocument();
    expect(screen.getByText(/1\/5/)).toBeInTheDocument();
    expect(screen.getByText(/Continuar/i)).toBeInTheDocument();
  });

  it('avança para o passo 2 com o botão Continuar (Omnisciência)', () => {
    render(<AppTutorial onClose={vi.fn()} />);

    const nextBtn = screen.getByText(/Continuar/i);
    fireEvent.click(nextBtn);

    expect(screen.getByText(/2\/5/)).toBeInTheDocument();
    expect(screen.getByText(/Omnisciente: Reparo em tudo o que fazes/i)).toBeInTheDocument();
    expect(screen.getByText(/Anterior/i)).toBeInTheDocument();
  });

  it('recua para o passo anterior com o botão Anterior', () => {
    render(<AppTutorial onClose={vi.fn()} />);

    // Avança para passo 2
    fireEvent.click(screen.getByText(/Continuar/i));
    expect(screen.getByText(/2\/5/)).toBeInTheDocument();

    // Recua para passo 1
    fireEvent.click(screen.getByText(/Anterior/i));
    expect(screen.getByText(/1\/5/)).toBeInTheDocument();
    expect(screen.queryByText(/Anterior/i)).not.toBeInTheDocument();
  });

  it('no último passo em reentrada mostra "Começar a treinar" e conclui', () => {
    const onFinish = vi.fn();
    const onClose = vi.fn();

    render(<AppTutorial isFirstArrival={false} onFinish={onFinish} onClose={onClose} />);

    // Percorre até ao passo 5
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByText(/Continuar/i));
    }

    expect(screen.getByText(/5\/5/)).toBeInTheDocument();
    expect(screen.getByText(/Começar a treinar/i)).toBeInTheDocument();

    // Conclui
    fireEvent.click(screen.getByText(/Começar a treinar/i));
    expect(onFinish).toHaveBeenCalledWith({ startOnboarding: false });
    expect(onClose).toHaveBeenCalled();
    expect(isTutorialDoneLocally(userId)).toBe(true);
  });

  it('em primeiro acesso (isFirstArrival) o último passo mostra "Avançar para o arranque"', () => {
    const onFinish = vi.fn();
    const onClose = vi.fn();

    render(<AppTutorial isFirstArrival={true} onFinish={onFinish} onClose={onClose} />);

    // Percorre até ao passo 5
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByText(/Continuar/i));
    }

    expect(screen.getByText(/5\/5/)).toBeInTheDocument();
    expect(screen.getByText(/Avançar para o arranque/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Avançar para o arranque/i));
    expect(onFinish).toHaveBeenCalledWith({ startOnboarding: true });
    expect(onClose).toHaveBeenCalled();
  });

  it('permite saltar o tutorial a qualquer momento com destino ao arranque se for primeiro acesso', () => {
    const onClose = vi.fn();
    render(<AppTutorial isFirstArrival={true} onClose={onClose} />);

    const skipBtn = screen.getByText(/Saltar tutorial e ir para o arranque/i);
    fireEvent.click(skipBtn);

    expect(onClose).toHaveBeenCalled();
    expect(isTutorialDoneLocally(userId)).toBe(true);
  });

  it('fecha e conclui com a tecla Escape', () => {
    const onClose = vi.fn();
    render(<AppTutorial onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    expect(isTutorialDoneLocally(userId)).toBe(true);
  });
});
