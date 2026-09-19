import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AnalysisSkeleton, AnalysisFailure, classifyAnalysisFailure } from './AnalysisState';

/* A espera com a Carol a dizer o que está a ler, e a falha a dizer a causa. */

const originalMatchMedia = window.matchMedia;
afterEach(() => { vi.useRealTimers(); window.matchMedia = originalMatchMedia; });

describe('AnalysisSkeleton — o que ela está a ler', () => {
  it('os passos sucedem-se e param no último, sem voltar ao início', () => {
    window.matchMedia = () => ({ matches: false });
    vi.useFakeTimers();
    render(<AnalysisSkeleton kind="meal" />);
    expect(screen.getByTestId('analysis-step')).toHaveTextContent('A olhar para o prato…');
    act(() => { vi.advanceTimersByTime(2400); });
    expect(screen.getByTestId('analysis-step')).toHaveTextContent('A separar os alimentos…');
    act(() => { vi.advanceTimersByTime(2400 * 3); });
    expect(screen.getByTestId('analysis-step')).toHaveTextContent('A fazer as contas às calorias e às macros…');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByTestId('analysis-step')).toHaveTextContent('A fazer as contas');
  });

  it('passados 12 s, diz que está a demorar — que é verdade', () => {
    window.matchMedia = () => ({ matches: false });
    vi.useFakeTimers();
    render(<AnalysisSkeleton kind="run" />);
    act(() => { vi.advanceTimersByTime(12000); });
    expect(screen.getByTestId('analysis-step')).toHaveTextContent('Está a demorar mais do que o costume. Continuo.');
  });

  it('sem tipo, o esqueleto de sempre', () => {
    render(<AnalysisSkeleton />);
    expect(screen.getByTestId('analysis-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('analysis-step')).not.toBeInTheDocument();
  });
});

describe('AnalysisFailure — a causa, dita por ela', () => {
  it('classifica as mensagens técnicas', () => {
    expect(classifyAnalysisFailure('TypeError: Failed to fetch')).toBe('offline');
    expect(classifyAnalysisFailure('qualquer coisa', false)).toBe('offline');
    expect(classifyAnalysisFailure('Timeout na análise.')).toBe('timeout');
    expect(classifyAnalysisFailure('Edge Function returned 401')).toBe('session');
    expect(classifyAnalysisFailure('Falha na análise.')).toBe('other');
  });

  it('sem rede: o título e a causa antes do que fazer', () => {
    render(<AnalysisFailure detail="Failed to fetch" onRetry={() => {}}>As fotos ficaram guardadas.</AnalysisFailure>);
    const aviso = screen.getByTestId('analysis-failure');
    expect(aviso).toHaveAttribute('data-cause', 'offline');
    expect(aviso).toHaveTextContent('Estás sem rede');
    expect(aviso).toHaveTextContent('Sem rede, a foto não chega a sair do telemóvel. As fotos ficaram guardadas.');
  });

  it('uma falha qualquer: o título de sempre, e o título dado por quem monta ganha', () => {
    const { unmount } = render(<AnalysisFailure detail="Falha na análise.">x</AnalysisFailure>);
    expect(screen.getByText('Não consegui analisar')).toBeInTheDocument();
    unmount();
    render(<AnalysisFailure title="Outro título" detail="Failed to fetch">x</AnalysisFailure>);
    expect(screen.getByText('Outro título')).toBeInTheDocument();
  });
});
