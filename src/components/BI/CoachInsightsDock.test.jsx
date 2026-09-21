import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';

/* Os avisos da Carol viviam só no Início e nos Dashboards: quem estivesse
   no Calendário, nas Provas ou no Perfil não tinha como saber que havia
   alguma coisa a dizer (relatado pelo utilizador). Este componente é o que
   os leva a esses ecrãs — a todos menos ao Chat, onde a conversa já está
   aberta.

   O motor de regras é mockado de propósito: o que aqui se testa é o dock
   (o que mostra, quando se cala, onde se põe), não que regra dispara — isso
   é de biEngine.test.js. */
const INSIGHTS = [
  { id: 'i1', severity: 'warning', title: 'Calendário apertado', message: 'Falta tempo de preparação.', metric: 'Tempo', value: 34, module: 'corrida' },
  { id: 'i2', severity: 'info', title: 'Sapatilhas perto do fim', message: 'Vai pensando no par seguinte.', metric: 'Km', value: 700, module: 'corrida' },
];
vi.mock('../../utils/biEngine', () => ({ detectCoachInsights: vi.fn(() => INSIGHTS) }));

const { default: CoachInsightsDock } = await import('./CoachInsightsDock');

const seed = (over = {}) => useAppStore.setState({
  runs: [], gymSessions: [], meals: [], bodyAssessments: [], raceEvents: [],
  coachPlans: [], coachPlanItems: [], shoes: [],
  profile: { id: 'u1' },
  insightStates: {},
  ...over,
});

describe('CoachInsightsDock', () => {
  beforeEach(() => { seed(); });

  it('mostra o botão com o número por ver, e abre o popup', () => {
    render(<CoachInsightsDock />);
    const botao = screen.getByTestId('coach-insight-button');
    expect(botao).toHaveTextContent('2');
    fireEvent.click(botao);
    expect(screen.getByTestId('insights-dialog')).toHaveTextContent('Calendário apertado');
  });

  it('o que já foi entendido não conta', () => {
    seed({ insightStates: { i1: 'understood' } });
    render(<CoachInsightsDock />);
    expect(screen.getByTestId('coach-insight-button')).toHaveTextContent('1');
  });

  it('com tudo entendido, não ocupa espaço nenhum', () => {
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
});
