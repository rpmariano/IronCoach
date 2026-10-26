import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import RecordConfirmation from './RecordConfirmation';
import { AnalysisSkeleton, AnalysisFailure, classifyAnalysisFailure, analysisLacksReference } from './AnalysisState';
import { useAppStore } from '../../store';
import { todayISO, addDaysISO } from '../../lib/utils';

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

  /* Bug #49: «durante a análise aparecer o logotipo». */
  it('mostra o logotipo, decorativo — quem anuncia a espera é a região', () => {
    render(<AnalysisSkeleton kind="gym" />);
    const logo = screen.getByTestId('logo-loader');
    expect(logo).toHaveAttribute('aria-hidden', 'true');
    expect(logo).not.toHaveAttribute('role');
    expect(screen.getByTestId('analysis-skeleton')).toHaveAttribute('role', 'status');
  });

  it('o logotipo aparece mesmo sem tipo', () => {
    render(<AnalysisSkeleton />);
    expect(screen.getByTestId('logo-loader')).toBeInTheDocument();
  });

  it('escrito à mão não diz que lê o print nem o prato', () => {
    window.matchMedia = () => ({ matches: false });
    render(<AnalysisSkeleton kind="run" manual />);
    expect(screen.getByTestId('analysis-step')).toHaveTextContent('A ler os teus números…');
    const { unmount } = render(<AnalysisSkeleton kind="meal" manual />);
    expect(screen.getAllByTestId('analysis-step')[1]).toHaveTextContent('A ler os alimentos…');
    unmount();
  });

  it('manual sem referência: corrida sem plano e primeira avaliação não comparam', () => {
    window.matchMedia = () => ({ matches: true });
    render(<AnalysisSkeleton kind="body" manual />);
    expect(screen.getByTestId('analysis-step')).toHaveTextContent('A guardar como ponto de partida…');
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
  const hoje = todayISO();
  const PLANO = { id: 'p1', status: 'aceite', period_start: addDaysISO(hoje, -7), period_end: addDaysISO(hoje, 7) };
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

  it('um plano aceite que já acabou, ou que ainda não começou, não conta como plano para comparar', () => {
    const acabado = { id: 'p1', status: 'aceite', period_start: '2026-06-01', period_end: '2026-07-31' };
    const futuro = { ...PLANO, period_start: addDaysISO(hoje, 14), period_end: addDaysISO(hoje, 70) };
    const corridaFeita = { ...CORRIDA, status: 'concluido' };
    expect(analysisLacksReference('run', { coachPlans: [acabado], coachPlanItems: [corridaFeita], today: '2026-09-26' })).toBe(true);
    expect(analysisLacksReference('run', { coachPlans: [futuro], coachPlanItems: [CORRIDA] })).toBe(true);
    expect(analysisLacksReference('run', { coachPlans: [PLANO], coachPlanItems: [CORRIDA] })).toBe(false);
  });

  it('corrida com um plano aceite que já acabou: não diz que compara com o plano', () => {
    reduzido();
    useAppStore.setState({
      coachPlans: [{ ...PLANO, period_start: addDaysISO(hoje, -60), period_end: addDaysISO(hoje, -1) }],
      coachPlanItems: [{ ...CORRIDA, status: 'concluido' }],
    });
    render(<AnalysisSkeleton kind="run" />);
    expect(screen.getByTestId('analysis-step')).toHaveTextContent('A ver onde encaixa na tua semana…');
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

/* A espera é uma camada fixa centrada no ecrã visível (pedido do Rui, 2026-10-26): no
   telemóvel, inline no topo do formulário, o atleta tinha de subir para a ver. Substitui o
   scroll do bug #49 (o ecrã a subir até ao logotipo): fixa e centrada, fica à vista seja qual
   for o scroll. */
describe('AnalysisSkeleton — a camada fixa, centrada no ecrã visível', () => {
  beforeEach(() => { window.matchMedia = () => ({ matches: true }); });

  it('vai para o document.body (portal), em position fixed, centrada, por cima do formulário e abaixo dos modais', () => {
    const { container } = render(<div data-testid="formulario"><AnalysisSkeleton kind="meal" /></div>);
    const camada = screen.getByTestId('analysis-skeleton');
    // Fora do formulário: um antepassado com transform não lhe prende o position:fixed.
    expect(container.contains(camada)).toBe(false);
    expect(camada.parentElement).toBe(document.body);
    // Centrada com margin:auto no conteúdo, e a camada faz scroll se ele não couber (landscape).
    expect(camada).toHaveStyle({ position: 'fixed', display: 'flex', overflowY: 'auto' });
    expect(screen.getByTestId('analysis-conteudo')).toHaveStyle({ margin: 'auto' });
    expect(camada.style.inset).toMatch(/^0/);
    // Por cima do formulário e dos botões, mas abaixo da confirmação do registo (95) e dos modais (100).
    expect(Number(camada.style.zIndex)).toBeGreaterThan(50);
    expect(Number(camada.style.zIndex)).toBeLessThan(95);
    // Fundo semitransparente, para o formulário se ver por baixo.
    expect(camada.style.background).toMatch(/rgba\(.*,\s*0?\.\d+\)/);
  });

  it('bloqueia os toques mas não prende o foco: pointer-events auto, sem aria-modal, sem tabindex, e o foco fica onde estava', () => {
    render(<div><input data-testid="campo" /><AnalysisSkeleton kind="run" /></div>);
    const campo = screen.getByTestId('campo');
    campo.focus();
    const camada = screen.getByTestId('analysis-skeleton');
    // Os toques ficam na camada (o formulário não se mexe a meio da análise)…
    expect(camada).toHaveStyle({ pointerEvents: 'auto' });
    // …mas o foco não fica preso: nada de modal, nada de focável, e o teclado segue como estava.
    expect(camada).not.toHaveAttribute('aria-modal');
    expect(camada).not.toHaveAttribute('tabindex');
    expect(camada.querySelector('[tabindex], button, a, input')).toBeNull();
    expect(document.activeElement).toBe(campo);
  });

  it('continua a anunciar as frases (role=status, aria-live) e já não faz scroll para a mostrar', () => {
    const scroll = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      render(<AnalysisSkeleton kind="meal" label="A analisar a refeição" />);
      const camada = screen.getByRole('status', { name: 'A analisar a refeição' });
      expect(camada).toHaveAttribute('aria-live', 'polite');
      expect(camada).toContainElement(screen.getByTestId('analysis-step'));
      expect(camada).toContainElement(screen.getByTestId('analysis-carol-line'));
      expect(scroll).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('sai com a análise: ao desmontar, a camada desaparece do body (não sobra uma camada a tapar o ecrã)', () => {
    const { unmount } = render(<AnalysisSkeleton kind="gym" />);
    expect(screen.getByTestId('analysis-skeleton')).toBeInTheDocument();
    unmount();
    expect(screen.queryByTestId('analysis-skeleton')).not.toBeInTheDocument();
    expect(document.body.querySelector('[data-testid="analysis-skeleton"]')).toBeNull();
  });

  it('o erro de análise continua inline e visível, e não passa pela camada', () => {
    const { container } = render(<AnalysisFailure detail="timeout">A análise demorou.</AnalysisFailure>);
    const falha = screen.getByTestId('analysis-failure');
    expect(container.contains(falha)).toBe(true);
    expect(screen.queryByTestId('analysis-skeleton')).not.toBeInTheDocument();
  });

  it('em telemóvel baixo (landscape) a cena encolhe para caber; num ecrã normal tem 200 px', async () => {
    const original = window.innerHeight;
    try {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 812 });
      const { unmount } = render(<AnalysisSkeleton kind="run" />);
      expect(screen.getByTestId('analysis-logo').firstChild.style.minHeight).toBe('200px');
      unmount();
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 320 });
      render(<AnalysisSkeleton kind="run" />);
      expect(screen.getByTestId('analysis-logo').firstChild.style.minHeight).toBe('96px');
    } finally {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: original });
    }
  });
});

/* Revisão da camada de espera: ordem das camadas, respiro do ecrã, resize, região viva. */
describe('AnalysisSkeleton — as ressalvas da revisão', () => {
  beforeEach(() => { window.matchMedia = () => ({ matches: true }); });

  it('a confirmação do registo (RecordConfirmation) fica ACIMA da camada de espera', () => {
    const { container } = render(<RecordConfirmation label="Corrida registada" onDone={() => {}} />);
    const confirmacao = container.querySelector('[role="dialog"]');
    const z = Number(/z-\[(\d+)\]/.exec(confirmacao.className)[1]);
    render(<AnalysisSkeleton kind="run" />);
    expect(z).toBeGreaterThan(Number(screen.getByTestId('analysis-skeleton').style.zIndex));
    // …e abaixo dos modais (PremiumModal, z 100): é uma celebração, não uma janela.
    expect(z).toBeLessThan(100);
  });

  it('o respiro respeita o entalhe e as margens nos quatro lados (safe-area), com 16 px no mínimo', () => {
    render(<AnalysisSkeleton kind="meal" />);
    expect(screen.getByTestId('analysis-skeleton')).toHaveClass('analysis-camada');
    const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8');
    const regra = /\.analysis-camada\s*\{([^}]*)\}/.exec(css)[1];
    for (const lado of ['top', 'right', 'bottom', 'left']) {
      expect(regra).toContain(`max(16px, env(safe-area-inset-${lado}))`);
    }
    expect(regra).toContain('overscroll-behavior: contain');
  });

  it('a altura da cena acompanha um resize ou a rotação', () => {
    const original = window.innerHeight;
    const altura = (v) => { Object.defineProperty(window, 'innerHeight', { configurable: true, value: v }); };
    try {
      altura(812);
      render(<AnalysisSkeleton kind="run" />);
      const caixa = () => screen.getByTestId('analysis-logo').firstChild;
      expect(caixa().style.minHeight).toBe('200px');
      // Rodou para landscape (o ecrã passou a ter 360 px de altura): a cena encolhe sem recarregar.
      altura(360);
      act(() => { window.dispatchEvent(new Event('resize')); });
      expect(caixa().style.minHeight).toBe('108px');
      altura(320);
      act(() => { window.dispatchEvent(new Event('orientationchange')); });
      expect(caixa().style.minHeight).toBe('96px');
      altura(900);
      act(() => { window.dispatchEvent(new Event('resize')); });
      expect(caixa().style.minHeight).toBe('200px');
    } finally {
      altura(original);
    }
  });

  it('deixa de ouvir resize/orientationchange ao desmontar', () => {
    const adicionar = vi.spyOn(window, 'addEventListener');
    const remover = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<AnalysisSkeleton kind="gym" />);
    unmount();
    for (const tipo of ['resize', 'orientationchange']) {
      expect(adicionar.mock.calls.some(([t]) => t === tipo)).toBe(true);
      expect(remover.mock.calls.some(([t]) => t === tipo)).toBe(true);
    }
    adicionar.mockRestore();
    remover.mockRestore();
  });

  it('a região role=status monta-se VAZIA e preenche-se a seguir (para o leitor de ecrã anunciar a primeira frase)', () => {
    // O momento em que a região entra no documento: quantos filhos tem nessa altura.
    const filhosAoEntrar = [];
    const original = Element.prototype.appendChild;
    Element.prototype.appendChild = function appendChild(no) {
      if (no?.dataset?.testid === 'analysis-skeleton') filhosAoEntrar.push({ filhos: no.childElementCount, role: no.getAttribute('role') });
      return original.call(this, no);
    };
    try {
      render(<AnalysisSkeleton kind="meal" />);
    } finally {
      Element.prototype.appendChild = original;
    }
    expect(filhosAoEntrar).toEqual([{ filhos: 0, role: 'status' }]);
    // Logo a seguir (efeito), a mesma região já tem o conteúdo — é essa mudança que se anuncia.
    expect(screen.getByTestId('analysis-skeleton')).toHaveAttribute('role', 'status');
    expect(screen.getByTestId('analysis-step')).toBeInTheDocument();
    expect(screen.getByTestId('analysis-carol-line')).toBeInTheDocument();
  });
});
