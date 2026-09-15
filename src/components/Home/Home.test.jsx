import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import { todayISO, addDaysISO } from '../../lib/utils';
import { ToastProvider } from '../shared/ToastProvider';
import Home from './Home';

// O momento da medalha sincroniza com o Supabase — aqui nunca há prémios
// por ver (o que o faz aparecer testa-se em utils/useMedalMoment.test.jsx).
vi.mock('../../utils/medalAwards', () => ({
  syncMedalAwards: vi.fn().mockResolvedValue({ pending: [], available: false }),
  markMedalAwardsSeen: vi.fn().mockResolvedValue(undefined),
}));

/* O Início chama pela Carol quando o plano precisa de um ajuste
   (specs/plano-de-prova.md, "O plano tem de saber da prova"): a deteção é
   de utils/planDivergence.js — aqui testa-se só o que o Início faz com ela,
   que é a prioridade entre assuntos e o que leva ao chat.

   Desde 2026-09-13 os avisos vivem no botão flutuante e na janela dos
   insights, não no cabeçalho do cartão da Carol, que é sempre "Carol". */

const today = todayISO();
const tomorrow = addDaysISO(today, 1);

const baseState = {
  profile: { id: 'user-1', display_name: 'Rui' },
  meals: [{ id: 'm1', date: today }],
  waterLogs: [],
  runs: [],
  gymSessions: [],
  bodyAssessments: [],
  shoes: [],
  insightStates: {},
  dailySummary: null,
  dailySummaryLoading: false,
  raceEvents: [],
  coachPlans: [],
  coachPlanItems: [],
  coachGoalProposals: [],
};

const renderHome = () => render(
  <ToastProvider>
    <Home />
  </ToastProvider>,
);

const alertCount = () => {
  const button = screen.queryByTestId('coach-insight-button');
  return button ? Number(button.getAttribute('data-alerts')) : 0;
};

const openAlerts = () => fireEvent.click(screen.getByTestId('coach-insight-button'));

describe('Home — os avisos da Carol no botão flutuante', () => {
  let setCoachIntent;
  let setActiveTab;

  beforeEach(() => {
    window.localStorage.clear();
    setCoachIntent = vi.fn();
    setActiveTab = vi.fn();
    useAppStore.setState({
      ...baseState,
      setCoachIntent,
      setActiveTab,
      loadDailySummary: vi.fn().mockResolvedValue(null),
    });
  });

  // Uma prova amanhã, dentro de um plano aceite que não a tem como item: é
  // a divergência mais simples de todas.
  const comDivergencia = () => useAppStore.setState({
    raceEvents: [{ id: 'r1', date: tomorrow, name: 'Corrida do Tejo', status: 'agendada', distance_km: 10 }],
    coachPlans: [{ id: 'p1', status: 'aceite', period_start: today, period_end: addDaysISO(today, 7) }],
    coachPlanItems: [{ id: 'i1', plan_id: 'p1', planned_date: tomorrow, kind: 'corrida', training_type: 'longo', status: 'pendente' }],
  });

  it('sem divergência, a Carol não chama por nada', () => {
    renderHome();
    expect(alertCount()).toBe(0);
  });

  it('o cabeçalho do cartão da Carol é sempre "Carol", mesmo com aviso', () => {
    comDivergencia();
    renderHome();
    const cartao = screen.getByTestId('carol-card');
    expect(cartao).toHaveTextContent('Carol');
    expect(cartao).not.toHaveTextContent('precisa de falar contigo');
    expect(cartao).not.toHaveTextContent('o plano precisa de um ajuste');
  });

  it('com divergência, o botão flutuante conta o aviso e a janela diz os motivos', () => {
    comDivergencia();
    renderHome();
    expect(alertCount()).toBe(1);

    openAlerts();
    const aviso = screen.getByTestId('carol-alert-plano');
    expect(aviso).toHaveTextContent('O plano precisa de um ajuste');
    expect(aviso).toHaveTextContent(/A Corrida do Tejo \(.+\) não está no plano\./);
  });

  it('"Falar com a Carol" entra no "Adaptar plano" com os motivos e a assinatura', () => {
    comDivergencia();
    renderHome();
    openAlerts();
    fireEvent.click(screen.getByTestId('carol-alert-talk-plano'));

    expect(setCoachIntent).toHaveBeenCalledTimes(1);
    const intent = setCoachIntent.mock.calls[0][0];
    expect(intent.kind).toBe('adapt_plan');
    // Duas queixas de uma vez: a prova não está lá, e o que lá está é um
    // treino longo no dia dela.
    expect(intent.divergence).toHaveLength(2);
    expect(intent.divergence[0]).toMatch(/^A Corrida do Tejo \(.+\) não está no plano\.$/);
    expect(intent.divergence[1]).toMatch(/o plano tem Rodagem longa no dia da prova\.$/);
    expect(intent.signature).toContain('p1|');
    expect(setActiveTab).toHaveBeenCalledWith('coach');
  });

  it('uma divergência já tratada não volta a chamar', () => {
    comDivergencia();
    const { unmount } = renderHome();
    openAlerts();
    fireEvent.click(screen.getByTestId('carol-alert-talk-plano'));
    const { signature } = setCoachIntent.mock.calls[0][0];
    // É o Coach que marca, ao receber resposta — aqui simula-se esse efeito.
    window.localStorage.setItem('ironcoach:plano-ajuste:user-1', signature);
    unmount();

    renderHome();
    expect(alertCount()).toBe(0);
  });

  it('uma intervenção pendente pesa mais do que o ajuste do plano, e pode dispensar-se', () => {
    comDivergencia();
    useAppStore.setState({ profile: { id: 'user-1', coach_intervention_status: 'needed', coach_intervention_reason: 'carga a subir' } });
    renderHome();
    expect(alertCount()).toBe(1);

    openAlerts();
    expect(screen.getByTestId('carol-alert-assuntos')).toHaveTextContent('Tens 1 assunto a resolver com ela.');
    expect(screen.queryByTestId('carol-alert-plano')).not.toBeInTheDocument();
    expect(screen.getByTestId('carol-alert-dismiss-assuntos')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('carol-alert-talk-assuntos'));
    expect(setCoachIntent).toHaveBeenCalledWith({ kind: 'proactive_intervention', reason: 'carga a subir' });
  });
});
