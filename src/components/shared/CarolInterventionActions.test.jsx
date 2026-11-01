import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useAppStore } from '../../store';

/* Bug #111 (2026-11-01): «apesar de ter dispensado de falar com a Carol, ficou na mesma o alerta».
   O «Dispensar» do registo só gravava a marca local; a intervenção do perfil que a análise desse
   registo abriu ficava por resolver, e o botão flutuante (que lê o perfil) continuava a chamar —
   também depois do reload. */
const mocks = vi.hoisted(() => ({ updates: [], error: null }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => ({
      update: (row) => ({
        eq: (col, val) => { mocks.updates.push({ table, row, col, val }); return Promise.resolve({ error: mocks.error }); },
      }),
      insert: (row) => { mocks.updates.push({ table, insert: row }); return Promise.resolve({ error: null }); },
    }),
  },
}));
vi.mock('../../utils/biEngine', () => ({ detectCoachInsights: vi.fn(() => []) }));

const { default: CarolInterventionActions } = await import('./CarolInterventionActions');
const { default: CoachInsightsDock } = await import('../BI/CoachInsightsDock');
const { recordOwnsProfileIntervention, newestRecordId } = await import('../../utils/profileIntervention');

const CONVITE = 'Excedeste o plano. Vamos falar para adaptar o plano.';
const RUN = { id: 'run-new', date: '2026-11-01', created_at: '2026-11-01T19:02:00Z', coach_notes: CONVITE };
const OLD_RUN = { id: 'run-old', date: '2026-10-30', created_at: '2026-10-30T10:00:00Z', coach_notes: CONVITE };
const PENDING = { id: 'u1', coach_intervention_status: 'needed', coach_intervention_reason: 'Trail em vez de recuperação.', coach_intervention_origin: 'run' };

const seed = (over = {}) => useAppStore.setState({
  runs: [RUN, OLD_RUN], gymSessions: [], meals: [], bodyAssessments: [], raceEvents: [],
  coachPlans: [], coachPlanItems: [], coachGoalProposals: [], shoes: [],
  profile: PENDING, dismissedInterventions: {},
  insightStates: {}, insightSnoozes: {}, impressionShown: new Set(), impressionDismissed: new Set(),
  logImpression: vi.fn(), logImpressionDismissed: vi.fn(),
  ...over,
});

const dispensar = (id) => fireEvent.click(screen.getByTestId(`carol-intervention-dismiss-${id}`));

describe('CarolInterventionActions — #111: dispensar no registo fecha a intervenção que ele abriu', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.updates.length = 0;
    mocks.error = null;
    seed();
  });

  it('o alerta do botão flutuante sai logo, e o perfil fica resolvido no servidor (não volta no reload)', async () => {
    render(<><CarolInterventionActions record={RUN} type="run" /><CoachInsightsDock /></>);
    expect(screen.getByTestId('coach-insight-button')).toHaveAttribute('data-alerts', '1');
    dispensar('run-new');
    expect(screen.queryByTestId('coach-insight-button')).not.toBeInTheDocument();
    expect(useAppStore.getState().profile.coach_intervention_status).toBe('resolved');
    await waitFor(() => expect(mocks.updates).toHaveLength(1));
    expect(mocks.updates[0]).toMatchObject({
      table: 'profiles', col: 'id', val: 'u1',
      row: { coach_intervention_status: 'resolved', coach_intervention_reason: null, coach_intervention_outcome: 'dispensado' },
    });
    expect(useAppStore.getState().logImpressionDismissed).toHaveBeenCalledWith(expect.objectContaining({ kind: 'alert', key: 'assuntos' }));
  });

  it('o registo acabado de gravar com a marca da análise fecha-a mesmo sem ser o mais recente', async () => {
    render(<CarolInterventionActions record={{ ...OLD_RUN, intervention_needed: true }} type="run" />);
    dispensar('run-old');
    await waitFor(() => expect(mocks.updates).toHaveLength(1));
  });

  it('um registo que não a abriu (mais antigo, ou de outro tipo) só se dispensa a si', async () => {
    render(<><CarolInterventionActions record={OLD_RUN} type="run" /><CarolInterventionActions record={{ id: 'm1', coach_notes: CONVITE }} type="meal" /></>);
    dispensar('run-old');
    dispensar('m1');
    expect(useAppStore.getState().dismissedInterventions).toEqual({ 'run-old': CONVITE, m1: CONVITE });
    expect(useAppStore.getState().profile.coach_intervention_status).toBe('needed');
    expect(mocks.updates).toHaveLength(0);
  });

  it('uma falha no servidor repõe o alerta e o botão do registo, e avisa', async () => {
    mocks.error = { message: 'offline' };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<><CarolInterventionActions record={RUN} type="run" /><CoachInsightsDock /></>);
    dispensar('run-new');
    await waitFor(() => expect(useAppStore.getState().profile.coach_intervention_status).toBe('needed'));
    expect(screen.getByTestId('coach-insight-button')).toHaveAttribute('data-alerts', '1');
    expect(screen.getByTestId('carol-intervention-dismiss-run-new')).toBeInTheDocument();
    console.error.mockRestore();
  });
});

describe('profileIntervention', () => {
  it('newestRecordId e recordOwnsProfileIntervention', () => {
    const state = { runs: [OLD_RUN, RUN] };
    expect(newestRecordId(state, 'run')).toBe('run-new');
    expect(newestRecordId(state, 'gym')).toBeNull();
    expect(recordOwnsProfileIntervention(PENDING, RUN, 'run', 'run-new')).toBe(true);
    expect(recordOwnsProfileIntervention({ ...PENDING, coach_intervention_status: 'in_progress' }, RUN, 'run', 'run-new')).toBe(true);
    expect(recordOwnsProfileIntervention(PENDING, OLD_RUN, 'run', 'run-new')).toBe(false);
    expect(recordOwnsProfileIntervention({ ...PENDING, coach_intervention_origin: 'checkin' }, RUN, 'run', 'run-new')).toBe(false);
    expect(recordOwnsProfileIntervention({ ...PENDING, coach_intervention_status: 'resolved' }, RUN, 'run', 'run-new')).toBe(false);
  });
});
