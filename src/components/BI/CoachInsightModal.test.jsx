import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CoachInsightModal from './CoachInsightModal';
import { useAppStore } from '../../store';

vi.mock('../../store', () => ({
  useAppStore: vi.fn(),
}));

describe('CoachInsightModal', () => {
  const mockSetInsightState = vi.fn();
  const mockSetActiveTab = vi.fn();
  const mockSetCoachIntent = vi.fn();
  const mockLogImpressionDismissed = vi.fn();
  const mockOnClose = vi.fn();

  const sampleInsights = [
    {
      id: 'insight-1',
      title: 'Carga de Treino Excessiva (ACWR)',
      message: 'O teu ACWR está em 1.79 — acima do limiar de 1.5. Risco elevado de lesão.',
      module: 'corrida',
      metric: 'ACWR',
      value: 1.79,
      severity: 'critical',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.mockReturnValue({
      setInsightState: mockSetInsightState,
      setActiveTab: mockSetActiveTab,
      setCoachIntent: mockSetCoachIntent,
      logImpressionDismissed: mockLogImpressionDismissed,
    });
  });

  it('renderiza o modal com o título, mensagem, módulo e métrica com bom contraste', () => {
    render(<CoachInsightModal insights={sampleInsights} onClose={mockOnClose} />);

    expect(screen.getByText('Insights da Carol')).toBeInTheDocument();
    expect(screen.getByText('Carga de Treino Excessiva (ACWR)')).toBeInTheDocument();
    expect(screen.getByText(/O teu ACWR está em 1.79/i)).toBeInTheDocument();
    expect(screen.getByText('corrida')).toBeInTheDocument();
    expect(screen.getByText(/ACWR: 1.8/i)).toBeInTheDocument();
    expect(screen.getByText('Falar com a Carol')).toBeInTheDocument();
  });

  it('ao clicar em "Falar com a Carol", marca como entendido, define intenção e navega para o coach', () => {
    render(<CoachInsightModal insights={sampleInsights} onClose={mockOnClose} />);

    fireEvent.click(screen.getByText('Falar com a Carol'));

    expect(mockSetInsightState).toHaveBeenCalledWith('insight-1', 'understood');
    expect(mockSetCoachIntent).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'proactive_intervention',
    }));
    expect(mockSetActiveTab).toHaveBeenCalledWith('coach');
    expect(mockOnClose).toHaveBeenCalled();
    // Falar com ela não é dispensar.
    expect(mockLogImpressionDismissed).not.toHaveBeenCalled();
  });

  /* "Ignorar" é a dispensa real (ação 5.1): fica em coach_impressions com a
     chave e o título do insight, para a Carol e o outro telemóvel saberem. */
  it('ao clicar em "Ignorar", marca como ignorado, regista a dispensa e fecha', () => {
    render(<CoachInsightModal insights={sampleInsights} onClose={mockOnClose} />);

    fireEvent.click(screen.getByRole('button', { name: /Ignorar/i }));

    expect(mockSetInsightState).toHaveBeenCalledWith('insight-1', 'ignored');
    expect(mockLogImpressionDismissed).toHaveBeenCalledTimes(1);
    expect(mockLogImpressionDismissed).toHaveBeenCalledWith({ kind: 'insights', key: 'insight-1', title: 'Carga de Treino Excessiva (ACWR)' });
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('ao clicar em "Entendido", marca como entendido e fecha — sem registar dispensa', () => {
    render(<CoachInsightModal insights={sampleInsights} onClose={mockOnClose} />);

    fireEvent.click(screen.getByRole('button', { name: /Entendido/i }));

    expect(mockSetInsightState).toHaveBeenCalledWith('insight-1', 'understood');
    expect(mockLogImpressionDismissed).not.toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();
  });

  /* O "Entendido" estava encolhido ao conteúdo, dentro do cartão, e lia-se
     como um botão de outra categoria ao lado do "Falar com a Carol" e do
     "Ignorar", ambos em largura total (pedido do utilizador). */
  it('o "Entendido" tem a mesma largura dos botões do rodapé', () => {
    render(<CoachInsightModal insights={sampleInsights} onClose={mockOnClose} />);
    const entendido = screen.getByRole('button', { name: /Entendido/i });
    const ignorar = screen.getByRole('button', { name: /^Ignorar$/i });
    expect(entendido.className).toContain('w-full');
    expect(ignorar.className).toContain('w-full');
    // E o mesmo corpo de texto, para não parecerem de pesos diferentes.
    expect(entendido.className).toContain('text-[12.5px]');
    expect(ignorar.className).toContain('text-[12.5px]');
  });

  /* Os avisos da Carol (2026-09-13): cada um com o seu "Falar com a Carol";
     sem "Entendido" nem "Ignorar", porque saem quando o assunto se resolve. */
  describe('avisos da Carol', () => {
    const alerta = (over = {}) => ({ id: 'plano', title: 'O plano precisa de um ajuste', message: 'A Corrida do Tejo não está no plano.', onTalk: vi.fn(), ...over });

    it('mostra o aviso e "Falar com a Carol" chama o dele e fecha', () => {
      const a = alerta();
      render(<CoachInsightModal alerts={[a]} onClose={mockOnClose} />);

      expect(screen.getByTestId('carol-alert-plano')).toHaveTextContent('A Corrida do Tejo não está no plano.');
      expect(screen.queryByRole('button', { name: /Ignorar/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Entendido/i })).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('carol-alert-talk-plano'));
      expect(a.onTalk).toHaveBeenCalledTimes(1);
      expect(mockSetCoachIntent).not.toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('"Dispensar aviso" só aparece quando o aviso o permite', () => {
      const onDismiss = vi.fn();
      render(<CoachInsightModal alerts={[alerta({ id: 'assuntos', onDismiss })]} onClose={mockOnClose} />);
      fireEvent.click(screen.getByTestId('carol-alert-dismiss-assuntos'));
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('com avisos e insights, só há um "Falar com a Carol" por aviso e "Ignorar" é só dos insights', () => {
      render(<CoachInsightModal alerts={[alerta()]} insights={sampleInsights} onClose={mockOnClose} />);
      expect(screen.getAllByText('Falar com a Carol')).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Ignorar os insights' }));
      expect(mockSetInsightState).toHaveBeenCalledWith('insight-1', 'ignored');
      expect(mockSetInsightState).not.toHaveBeenCalledWith('plano', expect.anything());
    });
  });
});
