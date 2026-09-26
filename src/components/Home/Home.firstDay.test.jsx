import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAppStore } from '../../store';
import { todayISO, addDaysISO } from '../../lib/utils';
import { ToastProvider } from '../shared/ToastProvider';
import Home from './Home';

/* O primeiro dia do Início, a olhar para o contexto (pedido 2026-09-26).

   O caminho principal do arranque: acabar o onboarding, combinar o plano no
   chat, aceitá-lo (ou fechar a folha sem escolher) e voltar ao Início ainda
   sem registos. Antes, isso era o "primeiro dia": o cartão dela negava o
   plano que tinha acabado de escrever, o "O que faço hoje" não aparecia, e
   a linha da corrida prometia "eu ajusto o plano" a quem não tinha plano. */

const baseState = {
  profile: { id: 'user-1', display_name: 'Rui' },
  meals: [],
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
  coachNotes: [{ category: 'objetivo_pessoal', note: 'Voltar depois de uma pausa — retomar sem me lesionar.' }],
  dataPending: false,
  impressionShown: new Set(),
  impressionDismissed: new Set(),
};

const renderHome = () => render(
  <ToastProvider>
    <Home />
  </ToastProvider>,
);

describe('Home — o primeiro dia não nega o plano que ela escreveu', () => {
  let setActiveTab;

  beforeEach(() => {
    window.localStorage.clear();
    setActiveTab = vi.fn().mockReturnValue(true);
    useAppStore.setState({
      ...baseState,
      setActiveTab,
      setOpenCreationMode: vi.fn(),
      setCoachIntent: vi.fn(),
      reloadCoachNotes: vi.fn(),
      loadDailySummary: vi.fn().mockResolvedValue(null),
    });
  });

  it('sem nada (nem registos, nem prova, nem plano): o cartão do primeiro dia', () => {
    renderHome();
    expect(screen.getByTestId('first-day-card')).toBeInTheDocument();
    expect(screen.queryByTestId('day-plan-card')).not.toBeInTheDocument();
  });

  it('com o plano do arranque aceite e sem registos: o Início de todos os dias, com o treino de hoje', () => {
    const today = todayISO();
    useAppStore.setState({
      coachPlans: [{ id: 'p1', status: 'aceite', period_start: today, period_end: addDaysISO(today, 6) }],
      coachPlanItems: [{ id: 'i1', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'rodagem', target_distance_km: 5, status: 'pendente' }],
    });
    renderHome();
    expect(screen.queryByTestId('first-day-card')).not.toBeInTheDocument();
    // "Antes de te dar volume, quero ver as primeiras saídas" — com o volume já no plano.
    expect(screen.queryByText(/Antes de te dar volume/)).not.toBeInTheDocument();
    expect(screen.getByText('O que faço hoje')).toBeInTheDocument();
    expect(screen.getByTestId('day-plan-card')).toBeInTheDocument();
  });

  it('com a proposta por decidir e sem registos: a proposta está no chat, não "vamos escolher a tua prova"', () => {
    useAppStore.setState({ coachPlans: [{ id: 'p1', status: 'proposto' }], coachNotes: [] });
    renderHome();
    expect(screen.queryByTestId('first-day-card')).not.toBeInTheDocument();
    expect(screen.queryByText(/Vamos escolher a tua prova/)).not.toBeInTheDocument();
    expect(screen.getByText('A proposta está no chat')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ver a proposta'));
    expect(setActiveTab).toHaveBeenCalledWith('coach');
  });
});

/* A linha da corrida no primeiro dia, dos dois lados da meia-noite (hora de
   Lisboa; setembro é UTC+1). Só o relógio é falso: o React continua a usar
   os temporizadores de verdade. */
describe('Home — a linha da corrida do primeiro dia', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Sem objetivo: a linha só aparece quando o pedido dela não é já a corrida.
    useAppStore.setState({
      ...baseState,
      coachNotes: [],
      setActiveTab: vi.fn().mockReturnValue(true),
      setOpenCreationMode: vi.fn(),
      setCoachIntent: vi.fn(),
      reloadCoachNotes: vi.fn(),
      loadDailySummary: vi.fn().mockResolvedValue(null),
    });
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const linhaAs = (iso) => {
    vi.setSystemTime(new Date(iso));
    const { unmount } = renderHome();
    const texto = screen.getByText(/Já correste/).textContent;
    unmount();
    return texto;
  };

  it('nunca promete ajustar um plano que não existe', () => {
    for (const iso of ['2026-09-26T09:00:00+01:00', '2026-09-26T22:30:00+01:00', '2026-09-27T01:00:00+01:00']) {
      expect(linhaAs(iso)).not.toMatch(/ajusto o plano/);
    }
  });

  it('dias seguidos: "hoje" de dia, sem "hoje" depois das 23h e antes das 6h', () => {
    for (const dia of ['2026-09-25', '2026-09-26', '2026-09-27']) {
      expect(linhaAs(`${dia}T10:00:00+01:00`)).toBe('Já correste hoje? Regista a corrida e fico a saber por onde começar.');
      expect(linhaAs(`${dia}T22:59:00+01:00`)).toMatch(/Já correste hoje\?/);
      expect(linhaAs(`${dia}T23:10:00+01:00`)).toBe('Já correste? Regista a corrida e fico a saber por onde começar.');
      expect(linhaAs(`${addDaysISO(dia, 1)}T01:00:00+01:00`)).toBe('Já correste? Regista a corrida e fico a saber por onde começar.');
      expect(linhaAs(`${addDaysISO(dia, 1)}T06:00:00+01:00`)).toMatch(/Já correste hoje\?/);
    }
  });
});

/* O contexto primeiro, no Início do primeiro dia (revisão de 2026-09-26):
   quem veio voltar de uma pausa e contou à Carol a cirurgia não tem
   «Registar uma corrida» como pedido principal, nem a linha «Já correste?»,
   da véspera da cirurgia ao fim da recuperação. Dias seguidos, dos dois
   lados da meia-noite de Lisboa (setembro e outubro até dia 25 são UTC+1). */
describe('Home — o primeiro dia com uma cirurgia na memória dela', () => {
  const notas = [
    { category: 'objetivo_pessoal', note: 'Voltar depois de uma pausa — retomar sem me lesionar.' },
    { category: 'saude', note: 'Cirurgia ao menisco do joelho direito a 2026-09-25; paragem de corrida de 2 semanas.' },
  ];

  beforeEach(() => {
    window.localStorage.clear();
    useAppStore.setState({
      ...baseState,
      coachNotes: notas,
      setActiveTab: vi.fn().mockReturnValue(true),
      setOpenCreationMode: vi.fn(),
      setCoachIntent: vi.fn(),
      reloadCoachNotes: vi.fn(),
      loadDailySummary: vi.fn().mockResolvedValue(null),
    });
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const pedeCorrida = (iso) => {
    vi.setSystemTime(new Date(iso));
    const { unmount } = renderHome();
    const card = screen.getByTestId('first-day-card');
    const corre = !!screen.queryByRole('button', { name: /Registar uma corrida/ }) || !!screen.queryByText(/Já correste/);
    const lembra = /Não me esqueci da cirurgia/.test(card.textContent);
    unmount();
    return { corre, lembra };
  };

  it('dias seguidos: da véspera ao último dia da recuperação, ela pergunta por ele e não pela corrida', () => {
    for (const dia of ['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-10-09']) {
      for (const hora of ['10:00', '23:30']) {
        expect(pedeCorrida(`${dia}T${hora}:00+01:00`), `${dia} ${hora}`).toEqual({ corre: false, lembra: true });
      }
    }
  });

  it('os dois lados da meia-noite nas pontas da janela', () => {
    expect(pedeCorrida('2026-09-23T23:59:00+01:00')).toEqual({ corre: true, lembra: false });
    expect(pedeCorrida('2026-09-24T00:00:00+01:00')).toEqual({ corre: false, lembra: true });
    expect(pedeCorrida('2026-10-09T23:59:00+01:00')).toEqual({ corre: false, lembra: true });
    expect(pedeCorrida('2026-10-10T00:00:00+01:00')).toEqual({ corre: true, lembra: false });
  });
});
