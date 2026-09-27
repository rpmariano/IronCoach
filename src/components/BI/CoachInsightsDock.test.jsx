import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import { todayISO, addDaysISO } from '../../lib/utils';

/* Os avisos da Carol viviam só no Início e nos Dashboards: quem estivesse
   no Calendário, nas Provas ou no Perfil não tinha como saber que havia
   alguma coisa a dizer (relatado pelo utilizador). Este componente é o que
   os leva a esses ecrãs — a todos menos ao Chat, onde a conversa já está
   aberta. Desde 2026-09-27 é também o do Início e da Evolução, e mostra o
   mesmo em todo o lado (useCarolNotices).

   O motor de regras é mockado de propósito: o que aqui se testa é o dock
   (o que mostra, quando se cala, onde se põe), não que regra dispara — isso
   é de biEngine.test.js. */
const INSIGHTS = [
  { id: 'i1', severity: 'warning', title: 'Calendário apertado', message: 'Falta tempo de preparação.', metric: 'Tempo', value: 34, module: 'corrida' },
  { id: 'i2', severity: 'info', title: 'Sapatilhas perto do fim', message: 'Vai pensando no par seguinte.', metric: 'Km', value: 700, module: 'corrida' },
];
vi.mock('../../utils/biEngine', () => ({ detectCoachInsights: vi.fn(() => INSIGHTS) }));

const { detectCoachInsights } = await import('../../utils/biEngine');
const { default: CoachInsightsDock } = await import('./CoachInsightsDock');

const seed = (over = {}) => useAppStore.setState({
  runs: [], gymSessions: [], meals: [], bodyAssessments: [], raceEvents: [],
  coachPlans: [], coachPlanItems: [], coachGoalProposals: [], shoes: [],
  profile: { id: 'u1' },
  insightStates: {},
  insightSnoozes: {},
  impressionShown: new Set(),
  impressionDismissed: new Set(),
  logImpression: vi.fn(),
  ...over,
});

describe('CoachInsightsDock', () => {
  beforeEach(() => {
    window.localStorage.clear();
    detectCoachInsights.mockImplementation(() => INSIGHTS);
    seed();
  });

  it('mostra o botão com o número por ver, e abre o popup', () => {
    render(<CoachInsightsDock />);
    const botao = screen.getByTestId('coach-insight-button');
    expect(botao).toHaveTextContent('2');
    fireEvent.click(botao);
    expect(screen.getByTestId('insights-dialog')).toHaveTextContent('Calendário apertado');
  });

  it('o que já foi percebido não conta', () => {
    seed({ insightStates: { i1: 'understood' } });
    render(<CoachInsightsDock />);
    expect(screen.getByTestId('coach-insight-button')).toHaveTextContent('1');
  });

  it('com tudo percebido, não ocupa espaço nenhum', () => {
    seed({ insightStates: { i1: 'understood', i2: 'understood' } });
    render(<CoachInsightsDock />);
    expect(screen.queryByTestId('coach-insight-button')).not.toBeInTheDocument();
  });

  /* O Perfil tem barra de ação fixa: a 100px o botão caía em cima do
     "Guardar alterações". */
  it('aceita uma altura, para não colidir com a barra de ação', () => {
    render(<CoachInsightsDock bottom={168} />);
    expect(screen.getByTestId('coach-insight-button')).toHaveStyle({ bottom: '168px' });
  });

  /* "Agora não" (pedido 2026-09-27): sai até amanhã e volta se ainda se
     aplicar. */
  it('posto de lado hoje não conta; de ontem, volta', () => {
    seed({ insightStates: { i1: 'ignored' }, insightSnoozes: { i1: todayISO() } });
    const { unmount } = render(<CoachInsightsDock />);
    expect(screen.getByTestId('coach-insight-button')).toHaveTextContent('1');
    unmount();

    seed({ insightStates: { i1: 'ignored' }, insightSnoozes: { i1: addDaysISO(todayISO(), -1) } });
    render(<CoachInsightsDock />);
    expect(screen.getByTestId('coach-insight-button')).toHaveTextContent('2');
  });

  it('"Agora não" na janela tira-o do botão até amanhã', () => {
    render(<CoachInsightsDock />);
    fireEvent.click(screen.getByTestId('coach-insight-button'));
    fireEvent.click(screen.getByTestId('insight-snooze-i1'));
    expect(useAppStore.getState().insightSnoozes).toEqual({ i1: todayISO() });
    expect(useAppStore.getState().insightStates.i1).toBe('ignored');
    expect(screen.getByTestId('coach-insight-button')).toHaveTextContent('1');
  });

  /* Pedido 2026-09-27: os mesmos avisos em todos os ecrãs. Antes este dock
     (Provas, Calendário, Perfil) não tinha os avisos em que a Carol pede
     para falar, e a Evolução não tinha o insight do plano. */
  describe('o mesmo conteúdo em todos os ecrãs', () => {
    it('inclui os avisos em que a Carol pede para falar', () => {
      seed({ profile: { id: 'u1', coach_intervention_status: 'needed', coach_intervention_reason: 'carga a subir' } });
      render(<CoachInsightsDock />);
      const botao = screen.getByTestId('coach-insight-button');
      expect(botao).toHaveAttribute('data-alerts', '1');
      expect(botao).toHaveTextContent('3');
      expect(botao).toHaveAccessibleName(/^A Carol quer falar contigo/);

      fireEvent.click(botao);
      expect(screen.getByTestId('carol-alert-assuntos')).toHaveTextContent('Preciso de falar contigo');
      expect(screen.getByTestId('insight-i1')).toBeInTheDocument();
    });

    it('inclui o insight do plano, que antes só o Início mostrava', () => {
      detectCoachInsights.mockImplementation(() => [
        ...INSIGHTS,
        { id: 'low_adherence', severity: 'warning', title: 'Adesão baixa ao plano', message: 'Falhaste metade das sessões.', module: 'coach' },
      ]);
      render(<CoachInsightsDock />);
      expect(screen.getByTestId('coach-insight-button')).toHaveTextContent('3');
      fireEvent.click(screen.getByTestId('coach-insight-button'));
      expect(screen.getByTestId('insight-low_adherence')).toBeInTheDocument();
    });

    it('abrir a janela regista o que ela mostrou, em qualquer ecrã', () => {
      const logImpression = vi.fn();
      seed({ logImpression });
      render(<CoachInsightsDock />);
      fireEvent.click(screen.getByTestId('coach-insight-button'));
      expect(logImpression).toHaveBeenCalledWith({ kind: 'insights', key: 'i1', title: 'Calendário apertado' });
      expect(logImpression).toHaveBeenCalledWith({ kind: 'insights', key: 'i2', title: 'Sapatilhas perto do fim' });
    });

    const comIntervencao = (over = {}) => seed({
      profile: { id: 'u1', coach_intervention_status: 'needed', coach_intervention_reason: 'carga a subir' },
      ...over,
    });
    const pedirDispensa = () => {
      render(<CoachInsightsDock />);
      fireEvent.click(screen.getByTestId('coach-insight-button'));
      // Pelo nome que o leitor de ecrã ouve — o dismissLabel real do hook.
      fireEvent.click(screen.getByRole('button', { name: 'Dispensar este assunto' }));
      return screen.getByRole('dialog', { name: 'Dispensar este assunto?' });
    };

    /* Revisão pré-deploy 2026-09-27: a confirmação diz qual é o assunto e
       o que fica — "O aviso deixa de aparecer" não era verdade com planos
       ou objetivos à espera. */
    it('dispensar uma intervenção pede confirmação e diz qual é o assunto', () => {
      comIntervencao();
      const dialogo = pedirDispensa();
      expect(screen.getByTestId('dismiss-topic').textContent).toBe('«Há um registo teu que quero ver contigo.»');
      expect(dialogo).toHaveTextContent('Deixo de te chamar por isto. Podes voltar a falar comigo no chat sempre que quiseres.');
      expect(dialogo).not.toHaveTextContent('continua no aviso');
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    });

    it('com um plano à espera, a confirmação diz que ele fica no aviso', () => {
      comIntervencao({ coachPlans: [{ id: 'p1', status: 'proposto' }] });
      const dialogo = pedirDispensa();
      expect(dialogo).toHaveTextContent('O que tens à espera da tua decisão continua no aviso.');
      // Cita a intervenção — a que sai —, não a frase do plano, que fica.
      expect(screen.getByTestId('dismiss-topic').textContent).toBe('«Há um registo teu que quero ver contigo.»');
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    });

    it('resolvida a intervenção com a confirmação aberta, a confirmação fecha-se', () => {
      comIntervencao();
      pedirDispensa();
      act(() => { useAppStore.setState({ profile: { id: 'u1', coach_intervention_status: 'resolved' } }); });
      expect(screen.queryByRole('dialog', { name: 'Dispensar este assunto?' })).not.toBeInTheDocument();

      // Uma intervenção nova não a reabre sozinha: só o "Dispensar" a abre.
      act(() => { useAppStore.setState({ profile: { id: 'u1', coach_intervention_status: 'needed', coach_intervention_reason: 'outra' } }); });
      expect(screen.queryByRole('dialog', { name: 'Dispensar este assunto?' })).not.toBeInTheDocument();
    });
  });

  /* Um só código de cores e símbolos (noticeTones.js): o botão pinta-se do
     aviso mais grave, tal como o cartão dele na janela. */
  describe('o código de cores e símbolos', () => {
    it('a gravidade mais alta pinta o botão, com o símbolo no lugar da cara dela', () => {
      render(<CoachInsightsDock />);
      const botao = screen.getByTestId('coach-insight-button');
      expect(botao).toHaveAttribute('data-severity', 'warning');
      expect(botao.querySelector('.carol-face')).toBeNull();
    });

    it('um crítico passa à frente de tudo', () => {
      detectCoachInsights.mockImplementation(() => [
        ...INSIGHTS,
        { id: 'acwr_danger', severity: 'critical', title: 'Carga excessiva', message: 'ACWR alto.', module: 'corrida' },
      ]);
      render(<CoachInsightsDock />);
      expect(screen.getByTestId('coach-insight-button')).toHaveAttribute('data-severity', 'critical');
    });

    it('só informação: a cara da Carol, sem símbolo de aviso', () => {
      detectCoachInsights.mockImplementation(() => [INSIGHTS[1]]);
      render(<CoachInsightsDock />);
      const botao = screen.getByTestId('coach-insight-button');
      expect(botao).toHaveAttribute('data-severity', 'info');
      expect(botao.querySelector('.carol-face')).not.toBeNull();
    });
  });
});
