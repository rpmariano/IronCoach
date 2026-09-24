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

    expect(screen.getByRole('button', { name: /Mais prints/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Manual/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Prosseguir sem estas métricas/i })).toBeInTheDocument();
  });

  it('chama os respetivos callbacks ao clicar nos botões', () => {
    render(<MissingMetricsBottomSheet {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /Mais prints/i }));
    expect(defaultProps.onAddPhotos).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Manual/i }));
    expect(defaultProps.onGoManual).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Prosseguir sem estas métricas/i }));
    expect(defaultProps.onProceedAnyway).toHaveBeenCalledTimes(1);
  });

  it('chama onClose ao clicar no traço de touch', () => {
    vi.useFakeTimers();
    defaultProps.onClose.mockClear();
    render(<MissingMetricsBottomSheet {...defaultProps} />);

    const grabHandle = screen.getByTitle('Toca para fechar persiana');
    fireEvent.click(grabHandle);
    vi.runAllTimers();
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  /* Com a fonte reconhecida, o painel deixa de listar campos soltos e passa a
     dizer QUE PRINT os traz (supabase/functions/_shared/sourceApps.ts). Foi
     esta a lacuna medida a 2026-09-22: a mesma corrida com 1 foto perdia oito
     campos, e o painel nomeava a métrica sem nunca dizer onde ela vive. */
  describe('com a app de origem reconhecida', () => {
    const comFonte = {
      ...defaultProps,
      missingKeys: ['hr_zones', 'thresholds', 'biomechanics'],
      sourceApp: 'samsung_health',
    };

    it('agrupa as métricas em falta por ecrã, dizendo o nome do ecrã e da app', () => {
      render(<MissingMetricsBottomSheet {...comFonte} />);
      const cabecalhos = screen.getAllByText(/^O ecrã/).map((el) => el.textContent.replace(/\s+/g, ' '));
      expect(cabecalhos).toEqual([
        'O ecrã Zonas de Frequência Cardíaca da Samsung Health traz estas 2:',
        'O ecrã Dinâmica de Corrida da Samsung Health traz esta:',
      ]);
    });

    it('não perde nenhuma métrica ao agrupá-las — dois prints, seis campos na mesma', () => {
      render(<MissingMetricsBottomSheet {...comFonte} />);
      expect(screen.getByText(/Métricas sugeridas \(3\):/i)).toBeInTheDocument();
      expect(screen.getByText('Limiares Fisiológicos (FC LA / LAn)')).toBeInTheDocument();
      expect(screen.getByText(/Métricas Biomecânicas/)).toBeInTheDocument();
      // O rótulo da métrica e o nome do ecrã são a mesma frase aqui — o que
      // tem de haver são DUAS ocorrências: o cabeçalho e a linha da métrica.
      expect(screen.getAllByText('Zonas de Frequência Cardíaca')).toHaveLength(2);
    });
  });

  /* O requisito que não pode ceder: uma app que o catálogo não conhece — ou
     uma corrida antiga, gravada antes de haver fonte nenhuma — mantém o texto
     de hoje. Nunca se inventa o nome de um ecrã de uma app desconhecida. */
  it.each([['desconhecida'], ['strava'], [null], [undefined]])(
    'mantém a lista plana de sempre quando a fonte é %s',
    (fonte) => {
      render(<MissingMetricsBottomSheet {...defaultProps} sourceApp={fonte} missingKeys={['hr_zones', 'thresholds']} />);
      expect(screen.queryByText(/O ecrã/)).toBeNull();
      expect(screen.getByText(/Métricas sugeridas \(2\):/i)).toBeInTheDocument();
      expect(screen.getByText('Zonas de Frequência Cardíaca')).toBeInTheDocument();
      expect(screen.getByText('Limiares Fisiológicos (FC LA / LAn)')).toBeInTheDocument();
    },
  );

  it('chama onClose ao deslizar para baixo', () => {
    vi.useFakeTimers();
    defaultProps.onClose.mockClear();
    render(<MissingMetricsBottomSheet {...defaultProps} />);
    
    const grabHandle = screen.getByTitle('Toca para fechar persiana');
    fireEvent.touchStart(grabHandle, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(grabHandle, { touches: [{ clientY: 250 }] });
    fireEvent.touchEnd(grabHandle, { changedTouches: [{ clientY: 250 }] });
    vi.runAllTimers();
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
