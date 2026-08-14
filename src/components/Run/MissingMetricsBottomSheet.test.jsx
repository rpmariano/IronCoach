import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MissingMetricsBottomSheet from './MissingMetricsBottomSheet';

describe('MissingMetricsBottomSheet', () => {
  const defaultProps = {
    isOpen: true,
    missingKeys: ['avg_heart_rate_bpm', 'cadence_spm', 'sweat_loss_ml'],
    onAddPhotos: vi.fn(),
    onGoManual: vi.fn(),
    onProceedAnyway: vi.fn(),
    onClose: vi.fn(),
  };

  it('não renderiza nada se isOpen for false', () => {
    const { container } = render(<MissingMetricsBottomSheet {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza o título, lista de métricas e os 3 botões de ação quando aberto', () => {
    render(<MissingMetricsBottomSheet {...defaultProps} />);
    expect(screen.getByText('Métricas em falta')).toBeInTheDocument();
    expect(screen.getByText(/Métricas sugeridas \(3\):/i)).toBeInTheDocument();
    expect(screen.getByText('Frequência Cardíaca (Média / Máxima)')).toBeInTheDocument();
    expect(screen.getByText('Cadência de Corrida (spm)')).toBeInTheDocument();
    expect(screen.getByText('Perda por Transpiração (ml)')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Carregar mais prints da app/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Completar manualmente \(manter dados\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Prosseguir sem estas métricas/i })).toBeInTheDocument();
  });

  it('chama os respetivos callbacks ao clicar nos botões', () => {
    render(<MissingMetricsBottomSheet {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /Carregar mais prints da app/i }));
    expect(defaultProps.onAddPhotos).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Completar manualmente \(manter dados\)/i }));
    expect(defaultProps.onGoManual).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Prosseguir sem estas métricas/i }));
    expect(defaultProps.onProceedAnyway).toHaveBeenCalledTimes(1);
  });

  it('chama onClose ao clicar no traço de touch ou deslizar para baixo', () => {
    render(<MissingMetricsBottomSheet {...defaultProps} />);

    const grabHandle = screen.getByTitle('Toca para fechar persiana');
    fireEvent.click(grabHandle);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);

    // Gestos de toque deslizar para baixo
    fireEvent.touchStart(grabHandle, { touches: [{ clientY: 100 }] });
    fireEvent.touchEnd(grabHandle, { changedTouches: [{ clientY: 160 }] });
    expect(defaultProps.onClose).toHaveBeenCalledTimes(2);
  });
});
