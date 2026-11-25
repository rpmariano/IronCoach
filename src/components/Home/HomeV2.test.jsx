import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAppStore } from '../../store';
import { todayISO, addDaysISO } from '../../lib/utils';
import { ToastProvider } from '../shared/ToastProvider';
import { setDesignV2 } from '../../utils/designV2';
import Home from './Home';
import { dayCell } from './HomeV2';

/* O Início no Design v2 (2026-11-24): o herói, a Carol numa linha, a grelha de dois e uma só ação.
   Desligado (o defeito), o Início é o de sempre. */

const today = todayISO();
const tomorrow = addDaysISO(today, 1);
const inDays = (n) => addDaysISO(today, n);

const baseState = {
  profile: { id: 'user-1', display_name: 'Rui', calorie_goal: 2400, protein_goal: 160 },
  meals: [{ id: 'm1', date: today }],
  waterLogs: [], runs: [], gymSessions: [], bodyAssessments: [], shoes: [], insightStates: {},
  dailySummary: null, dailySummaryLoading: false,
  raceEvents: [], coachPlans: [], coachPlanItems: [], coachGoalProposals: [],
  impressionShown: new Set(), impressionDismissed: new Set(),
};
const PLANO = {
  coachPlans: [{ id: 'p1', status: 'aceite', period_start: today, period_end: inDays(7) }],
  coachPlanItems: [
    { id: 'i1', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'continuo', target_distance_km: 8, status: 'pendente' },
    { id: 'i2', plan_id: 'p1', planned_date: tomorrow, kind: 'corrida', training_type: 'longo', target_distance_km: 18, status: 'pendente' },
  ],
};

const renderHome = () => render(<ToastProvider><Home /></ToastProvider>);
// As regras da direção C: sem maiúsculas espaçadas nem travessões nos textos novos.
const semTravessoes = (el) => expect(el.textContent).not.toMatch(/—/);

let setActiveTab; let setEditingRaceId; let setOpenCreationMode;
beforeEach(() => {
  window.localStorage.clear();
  setActiveTab = vi.fn(() => true); setEditingRaceId = vi.fn(); setOpenCreationMode = vi.fn();
  useAppStore.setState({ ...baseState, setActiveTab, setEditingRaceId, setOpenCreationMode, setCoachIntent: vi.fn(), loadDailySummary: vi.fn().mockResolvedValue(null) });
});
afterEach(() => act(() => setDesignV2(false)));

describe('Início — Design v2', () => {
  it('desligado (o defeito): o Início de sempre, sem nada do v2', () => {
    useAppStore.setState(PLANO);
    renderHome();
    expect(screen.getByTestId('carol-card')).toBeInTheDocument();
    expect(screen.queryByTestId('home-v2')).toBeNull();
  });

  it('ligado: o herói da próxima prova a âmbar, o objetivo, a grelha de dois e «Abrir a prova»', async () => {
    act(() => setDesignV2(true));
    useAppStore.setState({ ...PLANO, raceEvents: [{ id: 'r1', name: 'Meia do Porto', date: inDays(70), status: 'agendada', distance_km: 21.0975, target_time: '1:45:00', target_time_seconds: 6300 }] });
    renderHome();
    await screen.findByTestId('home-v2');
    expect(screen.queryByTestId('carol-card')).toBeNull();
    const hero = screen.getByTestId('home-v2-hero');
    expect(hero).toHaveTextContent('70 dias');
    expect(hero).toHaveTextContent('para a Meia do Porto, 21,1 km');
    expect(hero).toHaveTextContent('1:45:00');
    expect(hero.querySelector('.v2-hero-n')).toHaveClass('is-race');
    expect(screen.getByTestId('home-v2-hoje')).toHaveTextContent('8 km');
    expect(screen.getByTestId('home-v2-amanha')).toHaveTextContent('18 km');
    expect(screen.getByTestId('home-v2-amanha')).toHaveTextContent(/amanhã, /);
    expect(screen.getByTestId('home-v2-kcal')).toHaveTextContent('de 2 400 kcal');
    expect(screen.getByTestId('home-v2-proteina')).toHaveTextContent('de 160 g de proteína');
    // Uma só ação.
    expect(screen.getAllByTestId('home-v2-action')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('home-v2-action'));
    expect(setEditingRaceId).toHaveBeenCalledWith('r1');
    semTravessoes(screen.getByTestId('home-v2'));
  });

  it('ligado, no dia da prova: «Registar a prova» a âmbar', async () => {
    act(() => setDesignV2(true));
    const openRaceRun = vi.fn();
    useAppStore.setState({ openRaceRun, raceEvents: [{ id: 'r1', name: 'São Silvestre', date: today, start_time: '09:00:00', location: 'Lisboa', status: 'agendada', distance_km: 10, target_time_seconds: 2880, target_time: '48:00' }] });
    renderHome();
    await screen.findByTestId('home-v2');
    expect(screen.getByTestId('home-v2-hero')).toHaveTextContent('São Silvestre, às 09:00');
    // O mosaico de hoje não repete o herói: a hora de partida e o local.
    expect(screen.getByTestId('home-v2-hoje')).toHaveTextContent('09:00partida, Lisboa');
    const acao = screen.getByTestId('home-v2-action');
    expect(acao).toHaveTextContent('Registar a prova');
    expect(acao).toHaveClass('is-race');
    fireEvent.click(acao);
    expect(openRaceRun).toHaveBeenCalledWith('r1');
  });

  it('ligado, sem prova: o herói é o treino de hoje, e a ação é registá-lo', async () => {
    act(() => setDesignV2(true));
    useAppStore.setState({ ...PLANO, setPlanItemPrefill: vi.fn() });
    renderHome();
    await screen.findByTestId('home-v2');
    expect(screen.getByTestId('home-v2-hero')).toHaveTextContent('8 km');
    expect(screen.getByTestId('home-v2-action')).toHaveTextContent('Registar o treino');
    fireEvent.click(screen.getByTestId('home-v2-action'));
    expect(setOpenCreationMode).toHaveBeenCalledWith('run');
  });

  it('ligado: a Carol numa linha, a primeira mensagem do dia, e o toque abre a conversa', async () => {
    act(() => setDesignV2(true));
    useAppStore.setState({ dailySummary: { date: today, recap: 'Ontem correste bem.' } });
    renderHome();
    await screen.findByTestId('home-v2');
    expect(screen.getByTestId('home-v2-carol')).toHaveTextContent('Carol. Ontem correste bem.');
  });
});

describe('Início — Design v2, o que a revisão pediu de volta', () => {
  it('uma prova de há 2 dias por registar é o herói, com «Registar a prova»', async () => {
    act(() => setDesignV2(true));
    const openRaceRun = vi.fn();
    useAppStore.setState({ openRaceRun, raceEvents: [
      { id: 'p', name: 'Trail dos Moinhos', date: inDays(-2), status: 'agendada', distance_km: 15 },
      { id: 'f', name: 'Corrida do Tejo', date: inDays(20), status: 'agendada', distance_km: 10 },
    ] });
    renderHome();
    await screen.findByTestId('home-v2');
    expect(screen.getByTestId('home-v2-hero')).toHaveTextContent('Por registar');
    expect(screen.getByTestId('home-v2-hero')).toHaveTextContent('Trail dos Moinhos, há 2 dias');
    fireEvent.click(screen.getByTestId('home-v2-action'));
    expect(openRaceRun).toHaveBeenCalledWith('p');
  });

  it('o check-in diário está lá, e as kcal abrem as refeições de hoje', async () => {
    act(() => setDesignV2(true));
    renderHome();
    await screen.findByTestId('home-v2');
    expect(screen.getByTestId('home-v2-checkin')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByTestId('home-v2-kcal'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('dayCell', () => {
  it('um dia sem nada é «Livre»; um descanso é «Descanso»', () => {
    expect(dayCell([], 'hoje')).toMatchObject({ big: 'Livre', small: 'hoje' });
    expect(dayCell([{ kind: 'descanso', status: 'pendente' }], 'amanhã')).toMatchObject({ big: 'Descanso', small: 'amanhã' });
  });
  it('o ginásio sem km diz os minutos', () => {
    expect(dayCell([{ kind: 'ginasio', categories: ['Força'], target_duration_min: 45, status: 'pendente' }], 'hoje')).toMatchObject({ big: '45 min', small: 'hoje, força' });
  });
});
