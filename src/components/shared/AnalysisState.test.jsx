import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AnalysisSkeleton, AnalysisFailure, classifyAnalysisFailure, analysisLacksReference } from './AnalysisState';
import { useAppStore } from '../../store';

/* A espera com a Carol a dizer o que está a ler, e a falha a dizer a causa. */

const originalMatchMedia = window.matchMedia;
afterEach(() => {
  vi.useRealTimers();
  window.matchMedia = originalMatchMedia;
  useAppStore.setState({ coachPlans: [], coachPlanItems: [], bodyAssessments: [] });
});

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

describe('revisão pré-master de 2026-09-19', () => {
  it('a "sessão" do ginásio não é uma sessão expirada', () => {
    expect(classifyAnalysisFailure('Máximo de 4 imagens por sessão')).toBe('other');
    expect(classifyAnalysisFailure('Falha a gravar sessão: erro')).toBe('other');
    expect(classifyAnalysisFailure('Invalid JWT')).toBe('session');
  });
});

describe('AnalysisFailure — à vista quando aparece', () => {
  // O botão que lança a análise está na barra de baixo e o aviso no topo do
  // formulário: sem isto a falha ficava fora do ecrã (relatado 2026-09-24).
  it('traz o aviso à vista ao aparecer', () => {
    const scroll = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      render(<AnalysisFailure detail="Falha na análise." onRetry={() => {}}>Tenta outra vez.</AnalysisFailure>);
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(scroll.mock.contexts[0]).toBe(screen.getByTestId('analysis-failure'));
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});

/* A última frase dizia uma comparação que nem sempre existe, e a nota
   prometia um aviso no fim que a app não dá (revisão de 2026-09-26). */
describe('AnalysisSkeleton — só compara quando há com quê', () => {
  const PLANO = { id: 'p1', status: 'aceite' };
  const CORRIDA = { id: 'i1', plan_id: 'p1', kind: 'corrida', status: 'pendente' };
  // Com movimento reduzido mostra logo o último passo — o que interessa aqui.
  const reduzido = () => { window.matchMedia = () => ({ matches: true }); };

  it('corrida sem plano aceite: não diz que compara com o plano', () => {
    reduzido();
    render(<AnalysisSkeleton kind="run" />);
    expect(screen.getByTestId('analysis-step')).toHaveTextContent('A ver onde encaixa na tua semana…');
    expect(screen.getByTestId('analysis-step')).not.toHaveTextContent('plano pedia');
  });

  it('corrida com plano aceite com corridas: compara com o que o plano pedia', () => {
    reduzido();
    useAppStore.setState({ coachPlans: [PLANO], coachPlanItems: [CORRIDA] });
    render(<AnalysisSkeleton kind="run" />);
    expect(screen.getByTestId('analysis-step')).toHaveTextContent('A comparar com o que o plano pedia…');
  });

  it('um plano só proposto, ou só com refeições, não conta como plano para comparar', () => {
    expect(analysisLacksReference('run', { coachPlans: [{ id: 'p1', status: 'proposto' }], coachPlanItems: [CORRIDA] })).toBe(true);
    expect(analysisLacksReference('run', { coachPlans: [PLANO], coachPlanItems: [{ ...CORRIDA, kind: 'descanso' }] })).toBe(true);
    expect(analysisLacksReference('run', { coachPlans: [PLANO], coachPlanItems: [{ ...CORRIDA, status: 'cancelado' }] })).toBe(true);
  });

  it('primeira avaliação corporal: guarda como ponto de partida, sem comparar', () => {
    reduzido();
    render(<AnalysisSkeleton kind="body" />);
    expect(screen.getByTestId('analysis-step')).toHaveTextContent('A guardar como ponto de partida…');
    expect(screen.getByTestId('analysis-step')).not.toHaveTextContent('última avaliação');
  });

  it('com avaliações anteriores: compara com a última', () => {
    reduzido();
    useAppStore.setState({ bodyAssessments: [{ id: 'b1' }] });
    render(<AnalysisSkeleton kind="body" />);
    expect(screen.getByTestId('analysis-step')).toHaveTextContent('A comparar com a última avaliação…');
  });

  it('a nota não promete um aviso no fim', () => {
    render(<AnalysisSkeleton kind="meal" />);
    const esqueleto = screen.getByTestId('analysis-skeleton');
    expect(esqueleto).toHaveTextContent('Isto leva uns segundos. O que escreveste não se perde.');
    expect(esqueleto).not.toHaveTextContent(/aviso-te/);
  });
});

