import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import { todayISO, addDaysISO } from '../../lib/utils';
import { ToastProvider } from '../shared/ToastProvider';
import { interventionKey } from '@formulas/proactiveTriggers.ts';
import Home from './Home';

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
  // As impressões lidas do servidor (ação 5.1): vazias, como num primeiro acesso.
  impressionShown: new Set(),
  impressionDismissed: new Set(),
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
    // Na voz dela e a dizer o assunto, sem o motivo técnico (2026-09-23).
    const aviso = screen.getByTestId('carol-alert-assuntos');
    expect(aviso).toHaveTextContent('Preciso de falar contigo');
    expect(aviso).toHaveTextContent('há uma coisa que quero ver contigo');
    expect(aviso).not.toHaveTextContent('carga a subir');
    expect(aviso.textContent.match(/Carol/g) || []).toHaveLength(0);
    expect(screen.queryByTestId('carol-alert-plano')).not.toBeInTheDocument();
    expect(screen.getByTestId('carol-alert-dismiss-assuntos')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('carol-alert-talk-assuntos'));
    expect(setCoachIntent).toHaveBeenCalledWith({ kind: 'proactive_intervention', reason: 'carga a subir' });
  });

  // Ação P.11: um bloco sem prova que acaba depois de amanhã, sem outro a seguir.
  const comFimDeBloco = () => useAppStore.setState({
    coachPlans: [{ id: 'b1', status: 'aceite', period_start: addDaysISO(today, -27), period_end: addDaysISO(today, 2) }],
    coachPlanItems: [{ id: 'i1', plan_id: 'b1', planned_date: tomorrow, kind: 'corrida', training_type: 'rodagem', status: 'pendente' }],
  });

  it('o bloco a acabar: o aviso na voz dela, e "Falar com a Carol" pede a conversa com o candidato do chat', () => {
    comFimDeBloco();
    renderHome();
    expect(alertCount()).toBe(1);

    openAlerts();
    const aviso = screen.getByTestId('carol-alert-fim-bloco');
    expect(aviso).toHaveTextContent('O bloco está a acabar');
    expect(aviso).toHaveTextContent('O teu bloco de treino acaba daqui a 2 dias e não há outro a seguir. Quero preparar o próximo contigo.');

    fireEvent.click(screen.getByTestId('carol-alert-talk-fim-bloco'));
    expect(setCoachIntent).toHaveBeenCalledWith({
      kind: 'proactive_moment',
      candidate: expect.objectContaining({ trigger: 'block_end', key: 'block_end:b1' }),
    });
    expect(setActiveTab).toHaveBeenCalledWith('coach');
  });

  it('o bloco a acabar dispensa-se, com a chave do candidato para os outros dispositivos', () => {
    comFimDeBloco();
    const logImpressionDismissed = vi.fn();
    useAppStore.setState({ logImpressionDismissed });
    renderHome();
    openAlerts();
    fireEvent.click(screen.getByTestId('carol-alert-dismiss-fim-bloco'));
    expect(logImpressionDismissed).toHaveBeenCalledWith({ kind: 'alert', key: 'block_end:b1', title: 'O bloco está a acabar' });
    expect(alertCount()).toBe(0);
  });

  it('abrir os avisos regista também a chave do momento no servidor, para o tick não o notificar hoje (P.10)', () => {
    comFimDeBloco();
    const logImpression = vi.fn();
    useAppStore.setState({ logImpression });
    renderHome();
    openAlerts();
    expect(logImpression).toHaveBeenCalledWith({ kind: 'alert', key: 'fim-bloco', title: 'O bloco está a acabar' });
    expect(logImpression).toHaveBeenCalledWith({ kind: 'alert', key: 'block_end:b1', title: 'O bloco está a acabar' });
  });

  it('um assunto por resolver regista a chave da intervenção, a mesma do servidor (P.10)', () => {
    const logImpression = vi.fn();
    useAppStore.setState({ logImpression, profile: { id: 'user-1', coach_intervention_status: 'needed', coach_intervention_reason: 'carga a subir' } });
    renderHome();
    openAlerts();
    expect(logImpression).toHaveBeenCalledWith({ kind: 'alert', key: interventionKey('carga a subir'), title: 'Preciso de falar contigo' });
  });

  it('dispensado noutro dispositivo, o bloco a acabar não aparece', () => {
    comFimDeBloco();
    useAppStore.setState({ impressionDismissed: new Set(['alert:block_end:b1']) });
    renderHome();
    expect(alertCount()).toBe(0);
  });
});

/* A ordem dos cartões (2026-09-15): de perto para longe — quem me fala, o
   que faço hoje, como estou hoje, para onde vou. "Como estou" subiu para
   terceiro e a prova passou a fechar o ecrã. */
describe('Home — a ordem dos cartões', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAppStore.setState({
      ...baseState,
      setCoachIntent: vi.fn(),
      setActiveTab: vi.fn(),
      loadDailySummary: vi.fn().mockResolvedValue(null),
    });
  });

  it('Carol → o que faço hoje → como estou → para onde vou', () => {
    renderHome();
    const rotulos = ['O que faço hoje', 'Como estou', 'Para onde vou'].map((t) => screen.getByText(t));
    rotulos.slice(1).forEach((rotulo, i) => {
      // Node.DOCUMENT_POSITION_FOLLOWING: o rótulo seguinte vem depois.
      expect(rotulos[i].compareDocumentPosition(rotulo) & 4).toBeTruthy();
    });
    const carol = screen.getByTestId('carol-card');
    expect(carol.compareDocumentPosition(rotulos[0]) & 4).toBeTruthy();
  });

  it('as refeições sugeridas de hoje vivem no "Como estou", não no cartão do plano', () => {
    useAppStore.setState({
      coachPlans: [{ id: 'p1', status: 'aceite', period_start: today, period_end: addDaysISO(today, 6) }],
      coachPlanItems: [{
        id: 'i1', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'longo', target_distance_km: 12, status: 'pendente',
        meal_macros: { kcal: 2300, items: [{ tipo: 'almoco', texto: 'Atum com grão-de-bico' }] },
      }],
    });
    renderHome();
    const comoEstou = screen.getByTestId('status-card');
    expect(comoEstou).toContainElement(screen.getByTestId('status-card-meals'));
    expect(screen.getByTestId('day-plan-card')).not.toHaveTextContent('Refeições sugeridas');

    fireEvent.click(screen.getByTestId('status-card-meals'));
    expect(screen.getByTestId('meal-sheet')).toHaveTextContent('Atum com grão-de-bico');
  });
});

/* Os atalhos de registo do primeiro dia passam pelo setActiveTab, que pode
   ser recusado por um navGuard (um formulário sujo noutro ecrã). A recusa
   tem de travar também o setOpenCreationMode — senão abria-se o registo
   por cima de uma navegação que não aconteceu, o efeito secundário que o
   contrato do store proíbe. Mesmo contrato de openRaceRun e do "+" do
   Layout (achado do grafo, 2026-09-17). */
describe('Home — os atalhos de registo respeitam a recusa do navGuard', () => {
  let setActiveTab;
  let setOpenCreationMode;

  const primeiroDia = () => {
    window.localStorage.clear();
    setActiveTab = vi.fn();
    setOpenCreationMode = vi.fn();
    useAppStore.setState({
      ...baseState,
      meals: [],
      setActiveTab,
      setOpenCreationMode,
      setCoachIntent: vi.fn(),
      loadDailySummary: vi.fn().mockResolvedValue(null),
    });
  };

  it('com o separador recusado, não abre o registo de corrida', () => {
    primeiroDia();
    setActiveTab.mockReturnValue(false);
    renderHome();
    fireEvent.click(screen.getByText(/Já correste( hoje)?\?/));
    expect(setActiveTab).toHaveBeenCalledWith('corrida');
    expect(setOpenCreationMode).not.toHaveBeenCalled();
  });

  it('com o separador aceite, abre o registo de corrida', () => {
    primeiroDia();
    setActiveTab.mockReturnValue(true);
    renderHome();
    fireEvent.click(screen.getByText(/Já correste( hoje)?\?/));
    expect(setActiveTab).toHaveBeenCalledWith('corrida');
    expect(setOpenCreationMode).toHaveBeenCalledWith('run');
  });
});

/* Arranque com dados ainda a chegar depois do prazo (dataPending, ver
   loadInitialData): as listas vazias não querem dizer "primeiro dia". */
describe('Home — dados ainda a chegar', () => {
  const vazio = (dataPending) => {
    window.localStorage.clear();
    useAppStore.setState({
      ...baseState,
      meals: [],
      dataPending,
      setActiveTab: vi.fn(),
      setOpenCreationMode: vi.fn(),
      setCoachIntent: vi.fn(),
      loadDailySummary: vi.fn().mockResolvedValue(null),
    });
  };

  it('com dados pendentes não mostra o primeiro dia', () => {
    vazio(true);
    renderHome();
    expect(screen.queryByText(/Já correste( hoje)?\?/)).toBeNull();
  });

  it('com tudo carregado e sem registos, mostra-o', () => {
    vazio(false);
    renderHome();
    expect(screen.getByText(/Já correste( hoje)?\?/)).toBeTruthy();
  });
});
