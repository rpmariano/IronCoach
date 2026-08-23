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

  it('pede o resumo ao montar, sem reload — não force', () => {
    render(<CoachDailySummaryCard />);
    expect(loadDailySummary).toHaveBeenCalledWith();
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
    expect(screen.queryByLabelText('Ver mensagem 2')).not.toBeInTheDocument();
  });

  it('navega entre mensagens pelos botões de paginação diretos (dots)', () => {
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

    fireEvent.click(screen.getByLabelText('Ver mensagem 2'));
    expect(screen.getByText('Bebe mais água hoje.')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Ver mensagem 1'));
    expect(screen.getByText('Recapitulação aqui.')).toBeInTheDocument();
  });

  it('o botão atualizar força uma nova geração e volta ao início', () => {
    useAppStore.setState({
      dailySummary: { date: '2026-08-11', recap: 'A', warnings: 'B', meal_suggestion: null, tomorrow_prep: null },
    });
    render(<CoachDailySummaryCard />);
    fireEvent.click(screen.getByLabelText('Ver mensagem 2'));
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
    expect(screen.queryByLabelText('Ver mensagem 2')).not.toBeInTheDocument();
  });

  describe('"Ler mais" (mensagem longa clampada a 4 linhas)', () => {
    // jsdom não faz layout real — scrollHeight/clientHeight ficam sempre a 0.
    // Simula-se aqui: qualquer parágrafo com mais de 100 carateres "excede"
    // as 4 linhas (scrollHeight > clientHeight), texto curto não excede —
    // deixa testar os dois casos com o mesmo stub.
    beforeEach(() => {
      Object.defineProperty(HTMLParagraphElement.prototype, 'clientHeight', {
        configurable: true, get() { return 50; },
      });
      Object.defineProperty(HTMLParagraphElement.prototype, 'scrollHeight', {
        configurable: true,
        get() { return (this.textContent || '').length > 100 ? 200 : 50; },
      });
    });

    const LONG_TEXT = 'Para hoje tens agendado: Corrida (intervalos, 8 km, 50 min). '.repeat(3).trim();

    it('mensagem curta não mostra "Ler mais"', () => {
      useAppStore.setState({
        dailySummary: { date: '2026-08-11', recap: 'Treinaste 4x esta semana.', warnings: null, meal_suggestion: null, tomorrow_prep: null },
      });
      render(<CoachDailySummaryCard />);
      expect(screen.queryByText('Ler mais')).not.toBeInTheDocument();
    });

    it('mensagem longa mostra "Ler mais"; ao clicar, mostra o texto completo e passa a "Ler menos"', () => {
      useAppStore.setState({
        dailySummary: { date: '2026-08-11', recap: null, warnings: LONG_TEXT, meal_suggestion: null, tomorrow_prep: null },
      });
      render(<CoachDailySummaryCard />);
      const readMore = screen.getByText('Ler mais');
      expect(readMore).toBeInTheDocument();
      // Clampado por omissão.
      expect(screen.getByText(LONG_TEXT).className).toContain('cds-clamp');

      fireEvent.click(readMore);
      expect(screen.getByText('Ler menos')).toBeInTheDocument();
      expect(screen.getByText(LONG_TEXT).className).not.toContain('cds-clamp');
    });

    it('ao mudar de mensagem (dots), volta a fechar o "Ler mais" da anterior', () => {
      useAppStore.setState({
        dailySummary: { date: '2026-08-11', recap: 'Curta.', warnings: LONG_TEXT, meal_suggestion: null, tomorrow_prep: null },
      });
      render(<CoachDailySummaryCard />);
      fireEvent.click(screen.getByLabelText('Ver mensagem 2'));
      fireEvent.click(screen.getByText('Ler mais'));
      expect(screen.getByText(LONG_TEXT).className).not.toContain('cds-clamp');

      fireEvent.click(screen.getByLabelText('Ver mensagem 1'));
      fireEvent.click(screen.getByLabelText('Ver mensagem 2'));
      expect(screen.getByText(LONG_TEXT).className).toContain('cds-clamp');
    });
  });
});
