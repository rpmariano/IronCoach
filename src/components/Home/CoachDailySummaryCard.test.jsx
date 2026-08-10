import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import CoachDailySummaryCard from './CoachDailySummaryCard';

describe('CoachDailySummaryCard', () => {
  const loadDailySummary = vi.fn().mockResolvedValue(null);

  beforeEach(() => {
    loadDailySummary.mockClear();
    useAppStore.setState({ dailySummary: null, dailySummaryLoading: false, loadDailySummary });
  });

  it('pede o resumo ao montar, com reload — não force', () => {
    render(<CoachDailySummaryCard />);
    expect(loadDailySummary).toHaveBeenCalledWith({ reload: true });
  });

  it('mostra o estado vazio quando não há resumo nem mensagens', () => {
    render(<CoachDailySummaryCard />);
    expect(screen.getByText(/Sem nada a assinalar/i)).toBeInTheDocument();
  });

  it('mostra a mensagem única quando só um campo vem preenchido', () => {
    useAppStore.setState({
      dailySummary: { date: '2026-08-11', recap: 'Treinaste 4x esta semana.', warnings: null, meal_suggestion: null, tomorrow_prep: null },
    });
    render(<CoachDailySummaryCard />);
    expect(screen.getByText('Treinaste 4x esta semana.')).toBeInTheDocument();
    expect(screen.getByText('Recapitulação')).toBeInTheDocument();
    // Uma só mensagem não mostra navegação nem pontos.
    expect(screen.queryByLabelText('Próxima mensagem')).not.toBeInTheDocument();
  });

  it('navega entre mensagens pelos botões seguinte/anterior', () => {
    useAppStore.setState({
      dailySummary: {
        date: '2026-08-11',
        recap: 'Recapitulação aqui.',
        warnings: 'Bebe mais água hoje.',
        meal_suggestion: null,
        tomorrow_prep: null,
      },
    });
    render(<CoachDailySummaryCard />);
    expect(screen.getByText('Recapitulação aqui.')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Próxima mensagem'));
    expect(screen.getByText('Bebe mais água hoje.')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Mensagem anterior'));
    expect(screen.getByText('Recapitulação aqui.')).toBeInTheDocument();
  });

  it('o botão "seguinte" desativa-se na última mensagem', () => {
    useAppStore.setState({
      dailySummary: { date: '2026-08-11', recap: 'A', warnings: 'B', meal_suggestion: null, tomorrow_prep: null },
    });
    render(<CoachDailySummaryCard />);
    fireEvent.click(screen.getByLabelText('Próxima mensagem'));
    expect(screen.getByLabelText('Próxima mensagem')).toBeDisabled();
  });

  it('o botão atualizar força uma nova geração e volta ao início', () => {
    useAppStore.setState({
      dailySummary: { date: '2026-08-11', recap: 'A', warnings: 'B', meal_suggestion: null, tomorrow_prep: null },
    });
    render(<CoachDailySummaryCard />);
    fireEvent.click(screen.getByLabelText('Próxima mensagem'));
    expect(screen.getByText('B')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Atualizar resumo'));
    expect(loadDailySummary).toHaveBeenCalledWith({ force: true });
  });

  it('mostra o esqueleto de carregamento quando não há resumo ainda', () => {
    useAppStore.setState({ dailySummary: null, dailySummaryLoading: true });
    const { container } = render(<CoachDailySummaryCard />);
    expect(container.querySelector('.cds-skeleton')).toBeInTheDocument();
  });

  it('ignora um campo vazio (string em branco) como se fosse ausente', () => {
    useAppStore.setState({
      dailySummary: { date: '2026-08-11', recap: '', warnings: '  ', meal_suggestion: 'Come mais fibra.', tomorrow_prep: null },
    });
    render(<CoachDailySummaryCard />);
    expect(screen.getByText('Come mais fibra.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Próxima mensagem')).not.toBeInTheDocument();
  });
});
