import React from 'react';
import { render, screen, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* O Troféu no Início (revisão de 2026-11-25): a linha e o cartão da próxima jornada (CupNextLine /
   CupNextCard) aparecem no v2 como no v1. O interruptor da Taça vive no useCupListing (sem ele a
   listagem é null e nada aparece); aqui a listagem é fixa, para comparar os dois ecrãs. */

vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn(() => { throw new Error('sem rede nos testes'); }), rpc: vi.fn() },
  invokeEdgeFunctionWithTimeout: vi.fn(),
  logAppEvent: vi.fn(),
}));

const cupState = vi.hoisted(() => ({ view: null, listing: null }));
vi.mock('../../utils/useCup', async (orig) => {
  const real = await orig();
  return {
    ...real,
    useCupListing: () => ({ view: cupState.view, listing: cupState.listing }),
    useCupForHome: () => null,
  };
});

const { useAppStore } = await import('../../store');
const { todayISO, addDaysISO } = await import('../../lib/utils');
const { ToastProvider } = await import('../shared/ToastProvider');
const { setDesignV2 } = await import('../../utils/designV2');
const { buildCupView } = await import('../../utils/useCup');
const F = await import('@formulas/cup.fixtures.ts');
const { default: Home } = await import('./Home');

const today = todayISO();
const USER = 'user-1';

function cupView() {
  return buildCupView({
    cup: {
      status: 'ready', userId: USER, dismissals: [],
      editions: [{ ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION }],
      enrollments: [{ id: 'enr1', user_id: USER, edition_id: F.CASCAIS_34.id, team_id: 't-naza', season_goal: 'participar', status: 'ativa' }],
      participations: [],
      catalog: { [F.CASCAIS_34.id]: { status: 'ready', rounds: F.CASCAIS_ROUNDS, courses: F.CASCAIS_COURSES, overrides: F.CASCAIS_OVERRIDES, categories: F.CASCAIS_CATEGORIES, teams: F.CASCAIS_TEAMS } },
      results: { status: 'idle', enrollmentId: null, rows: [], teamRows: [] },
    },
    profile: { id: USER, gender: 'M', birth_date: '1982-01-24' }, raceEvents: [], runs: [], today: '2027-01-11',
  });
}

beforeEach(() => {
  window.localStorage.clear();
  const v = cupView();
  cupState.view = v;
  cupState.listing = { isFixed: () => true, loading: false };
  useAppStore.setState({
    profile: { id: USER, display_name: 'Rui' }, meals: [{ id: 'm1', date: today }], waterLogs: [], runs: [], gymSessions: [], bodyAssessments: [], shoes: [],
    insightStates: {}, dailySummary: null, dailySummaryLoading: false, raceEvents: [], coachPlans: [], coachPlanItems: [], coachGoalProposals: [],
    impressionShown: new Set(), impressionDismissed: new Set(),
    setActiveTab: vi.fn(() => true), setEditingRaceId: vi.fn(), setOpenCreationMode: vi.fn(), setCoachIntent: vi.fn(),
    loadDailySummary: vi.fn().mockResolvedValue(null), logImpression: vi.fn(),
  });
});
afterEach(() => act(() => setDesignV2(false)));

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

describe('Início — o Troféu no v1 e no v2', () => {
  it('sem prova marcada: o cartão da próxima jornada', async () => {
    const r = await emAmbos(() => screen.queryByTestId('race-card-cup')?.textContent || null);
    expect(r.v1).toBeTruthy();
    expect(r.v2).toBe(r.v1);
  });

  it('com uma prova marcada: a linha da próxima jornada', async () => {
    // A prova marcada não é uma jornada fixa (fica no cartão); as jornadas do catálogo são.
    cupState.listing = { isFixed: (x) => x?.id !== 'r1', loading: false };
    useAppStore.setState({ raceEvents: [{ id: 'r1', name: 'Meia', date: addDaysISO(today, 30), status: 'agendada', distance_km: 21 }] });
    const r = await emAmbos(() => screen.queryByTestId('race-card-cup-line')?.textContent || null);
    expect(r.v1).toBeTruthy();
    expect(r.v2).toBe(r.v1);
  });

  it('com a Taça desligada (sem listagem): nada, nos dois', async () => {
    cupState.view = null;
    cupState.listing = null;
    const r = await emAmbos(() => !!(screen.queryByTestId('race-card-cup') || screen.queryByTestId('race-card-cup-line')));
    expect(r).toEqual({ v1: false, v2: false });
  });
});
