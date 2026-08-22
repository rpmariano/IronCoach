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
    });
  });

  it('renderiza o modal com o título, mensagem, módulo e métrica com bom contraste', () => {
    render(<CoachInsightModal insights={sampleInsights} onClose={mockOnClose} />);

    expect(screen.getByText('Insights do Coach')).toBeInTheDocument();
    expect(screen.getByText('Carga de Treino Excessiva (ACWR)')).toBeInTheDocument();
    expect(screen.getByText(/O teu ACWR está em 1.79/i)).toBeInTheDocument();
    expect(screen.getByText('corrida')).toBeInTheDocument();
    expect(screen.getByText(/ACWR: 1.8/i)).toBeInTheDocument();
    expect(screen.getByText('Falar com o Coach')).toBeInTheDocument();
  });

  it('ao clicar em "Falar com o Coach", marca como entendido, define intenção e navega para o coach', () => {
    render(<CoachInsightModal insights={sampleInsights} onClose={mockOnClose} />);

    fireEvent.click(screen.getByText('Falar com o Coach'));

    expect(mockSetInsightState).toHaveBeenCalledWith('insight-1', 'understood');
    expect(mockSetCoachIntent).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'proactive_intervention',
    }));
    expect(mockSetActiveTab).toHaveBeenCalledWith('coach');
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('ao clicar em "Ignorar", marca como ignorado e fecha', () => {
    render(<CoachInsightModal insights={sampleInsights} onClose={mockOnClose} />);

    fireEvent.click(screen.getByRole('button', { name: /Ignorar/i }));

    expect(mockSetInsightState).toHaveBeenCalledWith('insight-1', 'ignored');
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('ao clicar em "Entendido", marca como entendido e fecha', () => {
    render(<CoachInsightModal insights={sampleInsights} onClose={mockOnClose} />);

    fireEvent.click(screen.getByRole('button', { name: /Entendido/i }));

    expect(mockSetInsightState).toHaveBeenCalledWith('insight-1', 'understood');
    expect(mockOnClose).toHaveBeenCalled();
  });
});
