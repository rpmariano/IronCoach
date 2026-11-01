import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { useAppStore } from '../../store';

/* Bug #111 (2026-11-01): «apesar de ter dispensado de falar com a Carol, ficou na mesma o alerta».
   O «Dispensar» do registo só gravava a marca local; a intervenção do perfil que a análise desse
   registo abriu ficava por resolver, e o botão flutuante (que lê o perfil) continuava a chamar —
   também depois do reload. Revisão: de quem é a intervenção lê-se da linha aberta de
   coach_interventions, e o update leva a guarda do motivo. */
const mocks = vi.hoisted(() => ({ open: null, readError: null, updates: [], serverReason: null, updateError: null }));
vi.mock('../../lib/supabase', () => {
  const chain = (table) => {
    const q = { table, filters: [], row: null, op: 'select' };
    const api = {
      select: () => api,
      update: (row) => { q.op = 'update'; q.row = row; return api; },
      insert: (row) => { mocks.updates.push({ table, insert: row }); return Promise.resolve({ error: null }); },
      eq: (c, v) => { q.filters.push(['eq', c, v]); return api; },
      is: (c, v) => { q.filters.push(['is', c, v]); return api; },
      order: () => api,
      limit: () => api,
      maybeSingle: () => Promise.resolve(mocks.readError ? { data: null, error: mocks.readError } : { data: mocks.open, error: null }),
      then: (res, rej) => {
        if (q.op !== 'update') return Promise.resolve({ data: [], error: null }).then(res, rej);
        mocks.updates.push({ table, row: q.row, filters: q.filters });
        if (mocks.updateError) return Promise.resolve({ data: null, error: mocks.updateError }).then(res, rej);
        const reasonFilter = q.filters.find(([, c]) => c === 'coach_intervention_reason');
        const matches = !reasonFilter || reasonFilter[2] === mocks.serverReason;
        return Promise.resolve({ data: matches ? [{ id: 'u1' }] : [], error: null }).then(res, rej);
      },
    };
    return api;
  };
  return { supabase: { from: chain } };
});
vi.mock('../../utils/biEngine', () => ({ detectCoachInsights: vi.fn(() => []) }));

const { default: CarolInterventionActions } = await import('./CarolInterventionActions');
const { default: CoachInsightsDock } = await import('../BI/CoachInsightsDock');
const { openInterventionIsFromRecord } = await import('../../utils/profileIntervention');

const CONVITE = 'Excedeste o plano. Vamos falar para adaptar o plano.';
const REASON = 'Trail em vez de recuperação.';
const RUN = { id: 'run-new', date: '2026-11-01', created_at: '2026-11-01T19:02:46Z', coach_notes: CONVITE };
const OLD_RUN = { id: 'run-old', date: '2026-10-30', created_at: '2026-10-30T10:00:00Z', coach_notes: CONVITE };
// Depois de um reload o perfil não traz a origem (o trigger limpa-a): só a linha aberta a tem.
const PENDING = { id: 'u1', coach_intervention_status: 'needed', coach_intervention_reason: REASON, coach_intervention_origin: null };
const OPEN_RUN = { origin: 'run', reason: REASON, opened_at: '2026-11-01T19:02:50Z' };

const seed = (over = {}) => useAppStore.setState({
  runs: [RUN, OLD_RUN], gymSessions: [], meals: [], bodyAssessments: [], raceEvents: [],
  coachPlans: [], coachPlanItems: [], coachGoalProposals: [], shoes: [],
  profile: PENDING, dismissedInterventions: {},
  insightStates: {}, insightSnoozes: {}, impressionShown: new Set(), impressionDismissed: new Set(),
  logImpression: vi.fn(), logImpressionDismissed: vi.fn(), refreshProfile: vi.fn(),
  ...over,
});

const dispensar = (id) => fireEvent.click(screen.getByTestId(`carol-intervention-dismiss-${id}`));
const profileUpdates = () => mocks.updates.filter((u) => u.table === 'profiles');

describe('CarolInterventionActions — #111: dispensar no registo fecha a intervenção que ele abriu', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.assign(mocks, { open: OPEN_RUN, readError: null, serverReason: REASON, updateError: null });
    mocks.updates.length = 0;
    seed();
  });

  it('depois de um reload (sem origem no perfil): a origem vem da linha aberta, o alerta sai e o perfil fica resolvido, com a guarda do motivo', async () => {
    render(<><CarolInterventionActions record={RUN} type="run" /><CoachInsightsDock /></>);
    expect(screen.getByTestId('coach-insight-button')).toHaveAttribute('data-alerts', '1');
    dispensar('run-new');
    await waitFor(() => expect(screen.queryByTestId('coach-insight-button')).not.toBeInTheDocument());
    expect(useAppStore.getState().profile.coach_intervention_status).toBe('resolved');
    expect(profileUpdates()).toHaveLength(1);
    expect(profileUpdates()[0].row).toMatchObject({ coach_intervention_status: 'resolved', coach_intervention_reason: null, coach_intervention_outcome: 'dispensado' });
    expect(profileUpdates()[0].filters).toEqual([['eq', 'id', 'u1'], ['eq', 'coach_intervention_reason', REASON]]);
    expect(useAppStore.getState().logImpressionDismissed).toHaveBeenCalledWith(expect.objectContaining({ kind: 'alert', key: 'assuntos' }));
  });

  it('cenário da revisão: a marca intervention_needed antiga de uma refeição não fecha a intervenção nova de outro assunto', async () => {
    const MEAL = { id: 'meal-a', created_at: '2026-11-01T08:00:00Z', coach_notes: CONVITE, intervention_needed: true };
    // A da refeição resolveu-se; abriu-se outra, de objetivos (origem body), ao fim da tarde.
    Object.assign(mocks, { open: { origin: 'body', reason: '[objetivos] rever', opened_at: '2026-11-01T18:00:00Z' }, serverReason: '[objetivos] rever' });
    seed({ meals: [MEAL], profile: { id: 'u1', coach_intervention_status: 'needed', coach_intervention_reason: '[objetivos] rever' } });
    render(<CarolInterventionActions record={MEAL} type="meal" />);
    dispensar('meal-a');
    await waitFor(() => expect(useAppStore.getState().dismissedInterventions).toEqual({ 'meal-a': CONVITE }));
    await act(async () => {});
    expect(useAppStore.getState().profile.coach_intervention_status).toBe('needed');
    expect(mocks.updates).toHaveLength(0); // nem o update, nem o goalsDeclinedMarker
  });

  it('a mesma origem mas outro registo gravado depois (o que a abriu) também não fecha', async () => {
    Object.assign(mocks, { open: { ...OPEN_RUN, opened_at: '2026-11-01T19:02:50Z' } });
    render(<CarolInterventionActions record={OLD_RUN} type="run" />);
    dispensar('run-old');
    await act(async () => {});
    expect(profileUpdates()).toHaveLength(0);
    expect(useAppStore.getState().profile.coach_intervention_status).toBe('needed');
  });

  it('corrida: o motivo mudou no servidor entre a leitura e a escrita — não fecha, repõe o perfil e relê-o', async () => {
    mocks.serverReason = 'Um assunto novo, chegado agora.';
    render(<><CarolInterventionActions record={RUN} type="run" /><CoachInsightsDock /></>);
    dispensar('run-new');
    await waitFor(() => expect(useAppStore.getState().refreshProfile).toHaveBeenCalled());
    expect(useAppStore.getState().profile.coach_intervention_status).toBe('needed');
    expect(screen.getByTestId('coach-insight-button')).toHaveAttribute('data-alerts', '1');
    expect(useAppStore.getState().logImpressionDismissed).not.toHaveBeenCalled();
  });

  it('sem conseguir ler a linha aberta não fecha nada; só o registo fica dispensado', async () => {
    mocks.readError = { message: 'offline' };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<CarolInterventionActions record={RUN} type="run" />);
    dispensar('run-new');
    await act(async () => {});
    expect(profileUpdates()).toHaveLength(0);
    expect(useAppStore.getState().profile.coach_intervention_status).toBe('needed');
    console.warn.mockRestore();
  });

  it('uma falha no update repõe o alerta e o botão do registo, e avisa', async () => {
    mocks.updateError = { message: 'offline' };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<><CarolInterventionActions record={RUN} type="run" /><CoachInsightsDock /></>);
    dispensar('run-new');
    await waitFor(() => expect(profileUpdates()).toHaveLength(1));
    await waitFor(() => expect(useAppStore.getState().profile.coach_intervention_status).toBe('needed'));
    expect(screen.getByTestId('carol-intervention-dismiss-run-new')).toBeInTheDocument();
    console.error.mockRestore();
  });
});

describe('openInterventionIsFromRecord', () => {
  it('mesma origem, aberta até 10 min depois do registo, sem outro registo do tipo pelo meio', () => {
    expect(openInterventionIsFromRecord(OPEN_RUN, RUN, 'run', [RUN, OLD_RUN])).toBe(true);
    expect(openInterventionIsFromRecord({ ...OPEN_RUN, origin: 'gym' }, RUN, 'run', [RUN])).toBe(false);
    expect(openInterventionIsFromRecord({ ...OPEN_RUN, opened_at: '2026-11-01T19:20:00Z' }, RUN, 'run', [RUN])).toBe(false);
    expect(openInterventionIsFromRecord({ ...OPEN_RUN, opened_at: '2026-11-01T19:00:00Z' }, RUN, 'run', [RUN])).toBe(false);
    expect(openInterventionIsFromRecord(OPEN_RUN, OLD_RUN, 'run', [RUN, OLD_RUN])).toBe(false);
    expect(openInterventionIsFromRecord(OPEN_RUN, { ...RUN, created_at: null }, 'run', [])).toBe(false);
    expect(openInterventionIsFromRecord(null, RUN, 'run', [RUN])).toBe(false);
  });
});

describe('a janela «Dispensar este assunto» — a mesma guarda do motivo (#111, revisão)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.assign(mocks, { open: OPEN_RUN, readError: null, serverReason: REASON, updateError: null });
    mocks.updates.length = 0;
    seed();
  });
  const confirmar = () => {
    render(<CoachInsightsDock />);
    fireEvent.click(screen.getByTestId('coach-insight-button'));
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar este assunto' }));
    const dialogo = screen.getByRole('dialog', { name: 'Dispensar este assunto?' });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Dispensar' }));
  };

  it('com o motivo igual fecha, e o update filtra por ele', async () => {
    confirmar();
    await waitFor(() => expect(useAppStore.getState().profile.coach_intervention_status).toBe('resolved'));
    expect(profileUpdates()[0].filters).toEqual([['eq', 'id', 'u1'], ['eq', 'coach_intervention_reason', REASON]]);
  });

  it('com o motivo trocado no servidor não fecha e relê o perfil', async () => {
    mocks.serverReason = 'Outro assunto.';
    confirmar();
    await waitFor(() => expect(useAppStore.getState().refreshProfile).toHaveBeenCalled());
    expect(useAppStore.getState().profile.coach_intervention_status).toBe('needed');
  });
});
