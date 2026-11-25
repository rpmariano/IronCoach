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

  it('ligado: o herói da próxima prova a âmbar, o objetivo, «Hoje», a semana, a nutrição; a ação é o treino do dia', async () => {
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
    expect(screen.getByTestId('home-v2-today')).toHaveTextContent('Corrida contínua · 8 km');
    expect(screen.getByTestId('home-v2-today-state')).toHaveTextContent('Por fazer');
    expect(screen.getAllByTestId('home-v2-week-day')).toHaveLength(7);
    expect(screen.getByTestId('home-v2-kcal')).toHaveTextContent('de 2 400 kcal');
    expect(screen.getByTestId('home-v2-proteina')).toHaveTextContent('de 160 g de proteína');
    // A ação principal é a do dia; «Abrir a prova» fica como link no herói.
    expect(screen.getAllByTestId('home-v2-action')).toHaveLength(1);
    expect(screen.getByTestId('home-v2-action')).toHaveTextContent('Começar a corrida de hoje');
    fireEvent.click(screen.getByTestId('home-v2-open-race'));
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
    const acao = screen.getByTestId('home-v2-action');
    expect(acao).toHaveTextContent('Registar a prova');
    expect(acao).toHaveClass('is-race');
    fireEvent.click(acao);
    expect(openRaceRun).toHaveBeenCalledWith('r1');
  });

  it('ligado, sem prova: o herói é o treino de hoje; tocar em «Hoje» abre o registo com o item do plano', async () => {
    act(() => setDesignV2(true));
    const setPlanItemPrefill = vi.fn();
    useAppStore.setState({ ...PLANO, setPlanItemPrefill });
    renderHome();
    await screen.findByTestId('home-v2');
    expect(screen.getByTestId('home-v2-hero')).toHaveTextContent('8 km');
    expect(screen.getByTestId('home-v2-action')).toHaveTextContent('Começar a corrida de hoje');
    fireEvent.click(screen.getByTestId('home-v2-today'));
    expect(setPlanItemPrefill).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1' }));
    expect(setOpenCreationMode).toHaveBeenCalledWith('run');
  });

  it('dia de ginásio: os exercícios do plano em «Hoje» e «Começar o treino»', async () => {
    act(() => setDesignV2(true));
    const setPlanItemPrefill = vi.fn();
    useAppStore.setState({
      setPlanItemPrefill,
      coachPlans: [{ id: 'p1', status: 'aceite', period_start: today, period_end: inDays(7) }],
      coachPlanItems: [{ id: 'g1', plan_id: 'p1', planned_date: today, kind: 'ginasio', categories: ['Força'], target_duration_min: 45, status: 'pendente',
        prescription: { blocks: [{ type: 'forca', name: 'Agachamento', sets: 3, reps: 10 }, { type: 'forca', name: 'Prancha', sets: 3, seconds: 40 }] } }],
    });
    renderHome();
    await screen.findByTestId('home-v2');
    const ex = screen.getByTestId('home-v2-today-exercises');
    expect(ex).toHaveTextContent('Agachamento3×10');
    expect(ex).toHaveTextContent('Prancha3×40 s');
    expect(screen.getByTestId('home-v2-action')).toHaveTextContent('Começar o treino');
    fireEvent.click(screen.getByTestId('home-v2-action'));
    expect(setPlanItemPrefill).toHaveBeenCalledWith(expect.objectContaining({ id: 'g1' }));
    expect(setOpenCreationMode).toHaveBeenCalledWith('workout');
  });

  it('dia de descanso com prova marcada: a ação principal é abrir a prova', async () => {
    act(() => setDesignV2(true));
    useAppStore.setState({
      coachPlans: [{ id: 'p1', status: 'aceite', period_start: today, period_end: inDays(7) }],
      coachPlanItems: [{ id: 'd1', plan_id: 'p1', planned_date: today, kind: 'descanso', status: 'pendente' }],
      raceEvents: [{ id: 'r1', name: 'Meia do Porto', date: inDays(4), status: 'agendada', distance_km: 21.0975 }],
    });
    renderHome();
    await screen.findByTestId('home-v2');
    expect(screen.getByTestId('home-v2-today')).toHaveTextContent('Descanso');
    expect(screen.queryByTestId('home-v2-open-race')).toBeNull();
    fireEvent.click(screen.getByTestId('home-v2-action'));
    expect(setEditingRaceId).toHaveBeenCalledWith('r1');
  });

  it('dia de descanso sem prova e sem check-in: a ação é o check-in', async () => {
    act(() => setDesignV2(true));
    useAppStore.setState({ dailyCheckins: [] });
    renderHome();
    await screen.findByTestId('home-v2');
    expect(screen.getByTestId('home-v2-action')).toHaveTextContent('Fazer o check-in');
  });

  it('a semana: os 7 dias de segunda a domingo, com um visto nos feitos e a prova a âmbar', async () => {
    act(() => setDesignV2(true));
    const { mondayOf } = await import('./HomeV2');
    const seg = mondayOf(today);
    useAppStore.setState({
      coachPlans: [{ id: 'p1', status: 'aceite', period_start: seg, period_end: addDaysISO(seg, 13) }],
      coachPlanItems: [{ id: 'x', plan_id: 'p1', planned_date: seg, kind: 'corrida', training_type: 'continuo', target_distance_km: 5, status: 'concluido', actual_date: seg }],
      raceEvents: [{ id: 'r1', name: 'Meia', date: addDaysISO(seg, 6), status: 'agendada', distance_km: 21 }],
    });
    renderHome();
    await screen.findByTestId('home-v2');
    const dias = screen.getAllByTestId('home-v2-week-day');
    expect(dias[0]).toHaveAttribute('aria-label', expect.stringMatching(/^segunda.*: corrida, feito$/));
    expect(dias[6]).toHaveClass('is-race');
    expect(dias[6]).toHaveAttribute('aria-label', expect.stringMatching(/^domingo.*: prova$/));
  });

  it('a nutrição de hoje: as refeições registadas, e um toque abre a folha delas', async () => {
    act(() => setDesignV2(true));
    useAppStore.setState({ meals: [{ id: 'm1', date: today, meal_type: 'almoco', meal_items: [{ name: 'Arroz', calories: 400 }] }] });
    renderHome();
    await screen.findByTestId('home-v2');
    expect(screen.getByTestId('home-v2-meals')).toHaveTextContent('Almoço');
    fireEvent.click(screen.getByTestId('home-v2-meals'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('ligado: a Carol numa linha que expande ali mesmo («Ler mais»); «Falar com a Carol» à parte', async () => {
    act(() => setDesignV2(true));
    const setActiveTab2 = vi.fn(() => true);
    useAppStore.setState({ setActiveTab: setActiveTab2, dailySummary: { date: today, recap: 'Ontem correste bem. '.repeat(10).trim(), meal_suggestion: 'Almoço com hidratos.' } });
    renderHome();
    await screen.findByTestId('home-v2');
    expect(screen.getByTestId('home-v2-carol')).toHaveTextContent(/^Carol\. Ontem correste bem\./);
    const ler = screen.getByTestId('home-v2-carol-more-toggle');
    expect(ler).toHaveTextContent('Ler mais');
    expect(screen.queryByTestId('home-v2-carol-more')).toBeNull();
    fireEvent.click(ler);
    expect(ler).toHaveAttribute('aria-expanded', 'true');
    expect(ler).toHaveTextContent('Ler menos');
    expect(screen.getByTestId('home-v2-carol-more')).toHaveTextContent('Almoço com hidratos.');
    // Expandir não muda de separador; o chat é a ação à parte.
    expect(setActiveTab2).not.toHaveBeenCalledWith('coach');
    expect(screen.getByTestId('home-v2-carol-chat')).toHaveTextContent('Falar com a Carol');
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
