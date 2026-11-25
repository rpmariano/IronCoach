import React from 'react';
import { render, screen, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAppStore } from '../../store';
import { todayISO, addDaysISO } from '../../lib/utils';
import { ToastProvider } from '../shared/ToastProvider';
import { setDesignV2 } from '../../utils/designV2';
import Home from './Home';

/* Os avisos do Início: tudo o que a v1 avisa, a v2 também avisa, nas mesmas condições (pedido do
   Rui, 25/11: «os popups de alerta para falar com a Carol não estavam a aparecer» com o v2). Cada
   caso monta o MESMO estado duas vezes, com o v2 desligado e ligado, e procura o mesmo aviso. */

const today = todayISO();
const tomorrow = addDaysISO(today, 1);
const inDays = (n) => addDaysISO(today, n);

const baseState = {
  profile: { id: 'user-1', display_name: 'Rui', calorie_goal: 2400, protein_goal: 160 },
  meals: [{ id: 'm1', date: today }],
  waterLogs: [], runs: [], gymSessions: [], bodyAssessments: [], shoes: [], insightStates: {},
  dailySummary: null, dailySummaryLoading: false, dailySummaryNotice: null,
  raceEvents: [], coachPlans: [], coachPlanItems: [], coachGoalProposals: [],
  impressionShown: new Set(), impressionDismissed: new Set(),
};

beforeEach(() => {
  window.localStorage.clear();
  useAppStore.setState({
    ...baseState,
    setActiveTab: vi.fn(() => true), setEditingRaceId: vi.fn(), setOpenCreationMode: vi.fn(),
    setCoachIntent: vi.fn(), loadDailySummary: vi.fn().mockResolvedValue(null), logImpression: vi.fn(),
  });
});
afterEach(() => act(() => setDesignV2(false)));

/* Monta o Início com o v2 desligado e depois ligado, e devolve o que `find` encontrou em cada um. */
async function emAmbos(find) {
  const out = {};
  for (const v2 of [false, true]) {
    act(() => setDesignV2(v2));
    render(<ToastProvider><Home /></ToastProvider>);
    if (v2) await screen.findByTestId('home-v2');
    out[v2 ? 'v2' : 'v1'] = find();
    cleanup();
  }
  return out;
}

describe('Início — os avisos da v1 também na v2', () => {
  it('o botão flutuante da Carol com o contador (useCarolNotices): uma divergência do plano', async () => {
    useAppStore.setState({
      raceEvents: [{ id: 'r1', date: tomorrow, name: 'Corrida do Tejo', status: 'agendada', distance_km: 10 }],
      coachPlans: [{ id: 'p1', status: 'aceite', period_start: today, period_end: inDays(7) }],
      coachPlanItems: [{ id: 'i1', plan_id: 'p1', planned_date: tomorrow, kind: 'corrida', training_type: 'longo', status: 'pendente' }],
    });
    const r = await emAmbos(() => screen.queryByTestId('coach-insight-button')?.getAttribute('data-alerts'));
    expect(r.v1).toBe('1');
    expect(r.v2).toBe(r.v1);
  });

  it('a intervenção da Carol (coach_intervention_status needed) conta no botão', async () => {
    useAppStore.setState({ profile: { ...baseState.profile, coach_intervention_status: 'needed', coach_intervention_reason: 'Dor no joelho' } });
    const r = await emAmbos(() => screen.queryByTestId('coach-insight-button')?.getAttribute('data-alerts'));
    expect(Number(r.v1)).toBeGreaterThan(0);
    expect(r.v2).toBe(r.v1);
  });

  it('sem plano, só com uma proposta: o «Hoje» diz que está no chat (e sem o aviso repetido)', async () => {
    useAppStore.setState({ coachPlans: [{ id: 'pp', status: 'proposto', period_start: today, period_end: inDays(7) }] });
    const r = await emAmbos(() => ({ copy: !!screen.queryByText('A proposta está no chat'), banner: !!screen.queryByText('Tens uma proposta minha por rever') }));
    expect(r.v1).toEqual({ copy: true, banner: false });
    expect(r.v2).toEqual(r.v1);
  });

  it('com plano aceite e outra proposta: o aviso das propostas por rever', async () => {
    useAppStore.setState({
      coachPlans: [
        { id: 'p1', status: 'aceite', period_start: today, period_end: inDays(7) },
        { id: 'pp', status: 'proposto', period_start: inDays(8), period_end: inDays(14) },
      ],
      coachPlanItems: [{ id: 'i1', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'continuo', target_distance_km: 5, status: 'pendente' }],
    });
    const r = await emAmbos(() => !!screen.queryByText('Tens uma proposta minha por rever'));
    expect(r).toEqual({ v1: true, v2: true });
  });

  it('sem plano nenhum: «Sem plano acordado» e o pedido à Carol', async () => {
    const r = await emAmbos(() => !!screen.queryByText('Sem plano acordado'));
    expect(r).toEqual({ v1: true, v2: true });
  });

  it('a semana do plano cumprida', async () => {
    useAppStore.setState({
      coachPlans: [{ id: 'p1', status: 'aceite', period_start: inDays(-6), period_end: inDays(7) }],
      coachPlanItems: [
        { id: 'a', plan_id: 'p1', planned_date: inDays(-6), kind: 'corrida', training_type: 'continuo', target_distance_km: 8, status: 'concluido', actual_date: inDays(-6) },
        { id: 'b', plan_id: 'p1', planned_date: inDays(-3), kind: 'corrida', training_type: 'continuo', target_distance_km: 6, status: 'concluido', actual_date: inDays(-3) },
        { id: 'c', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'continuo', target_distance_km: 5, status: 'concluido', actual_date: today },
      ],
    });
    const r = await emAmbos(() => screen.queryByTestId('week-done')?.textContent || null);
    expect(r.v1).toMatch(/Semana 1 cumprida/);
    expect(r.v2).toBe(r.v1);
  });

  it('o marco da contagem da prova (a 7 dias)', async () => {
    useAppStore.setState({ raceEvents: [{ id: 'r7', name: 'Meia', date: inDays(7), status: 'agendada', distance_km: 21.0975, race_priority: 'a' }] });
    const r = await emAmbos(() => screen.queryByTestId('race-milestone')?.textContent || null);
    expect(r.v1).toBeTruthy();
    expect(r.v2).toBe(r.v1);
  });

  it('a ação da mensagem da Carol no dia da prova', async () => {
    useAppStore.setState({ raceEvents: [{ id: 'rh', name: 'São Silvestre', date: today, start_time: '09:00:00', status: 'agendada', distance_km: 10 }] });
    const r = await emAmbos(() => screen.queryAllByTestId('carol-card-action').map((b) => b.textContent));
    expect(r.v1.length).toBeGreaterThan(0);
    expect(r.v2).toEqual(r.v1);
  });

  it('a prova concluída no dia a seguir (ProvaConcluidaCard), sem outra prova marcada', async () => {
    const ontem = inDays(-1);
    useAppStore.setState({
      raceEvents: [{ id: 'rc', name: 'São Silvestre', date: ontem, status: 'concluida', distance_km: 10, target_time_seconds: 3000 }],
      runs: [{ id: 'run-c', race_id: 'rc', kind: 'competicao', date: ontem, distance_km: 10, duration_seconds: 2998, details: { official_time_seconds: 2998 } }],
    });
    const r = await emAmbos(() => screen.queryByTestId('race-card-completed')?.textContent || null);
    expect(r.v1).toMatch(/São Silvestre/);
    expect(r.v2).toBe(r.v1);
  });

  it('«Fazer o check-in» abre o check-in pelo pedido do store, sem mexer no DOM', async () => {
    act(() => setDesignV2(true));
    useAppStore.setState({ dailyCheckins: [], checkinRequested: false });
    render(<ToastProvider><Home /></ToastProvider>);
    await screen.findByTestId('home-v2');
    const acao = screen.getByTestId('home-v2-action');
    expect(acao).toHaveTextContent('Fazer o check-in');
    act(() => { acao.click(); });
    // O CheckinCard ouve o pedido, abre a folha e limpa-o.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(useAppStore.getState().checkinRequested).toBe(false);
  });

  it('o aviso da quota do resumo', async () => {
    useAppStore.setState({ dailySummary: { date: today, recap: 'Ontem correste.' }, dailySummaryNotice: { text: 'Hoje já usei os pedidos todos; amanhã há mais.', day: today } });
    const r = await emAmbos(() => screen.queryByTestId('carol-quota-notice')?.textContent || null);
    expect(r.v1).toMatch(/pedidos todos/);
    expect(r.v2).toBe(r.v1);
  });
});
