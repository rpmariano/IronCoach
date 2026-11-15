import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import { ToastProvider } from '../shared/ToastProvider';
import RunAgenda from './RunAgenda';
import { todayISO, addDaysISO } from '../../lib/utils';

/* Bug de 2026-11-15: a atleta queria «eliminar o registo» da prova concluída, para refazer o tempo,
   e o «Eliminar» do hub apagou a prova inteira (a corrida ficou órfã). No hub de uma prova com
   resultado, a ação é «Apagar o resultado»: a prova volta a agendada e fica aberta, pronta a
   registar outra vez. */

vi.mock('react-chartjs-2', () => ({ Line: () => <div data-testid="c-line" /> }));

const mocks = vi.hoisted(() => ({ ops: [] }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      const op = { table, kind: null, patch: null, filters: {} };
      const q = {
        delete: () => { op.kind = 'delete'; return q; },
        update: (patch) => { op.kind = 'update'; op.patch = patch; return q; },
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
        eq: (col, val) => { op.filters[col] = val; return q; },
        select: () => q,
        maybeSingle: () => { mocks.ops.push(op); return Promise.resolve({ data: { id: op.filters.id }, error: null }); },
        then: (res, rej) => { mocks.ops.push(op); return Promise.resolve({ error: null }).then(res, rej); },
      };
      return q;
    },
  },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const DATA = addDaysISO(todayISO(), -2);
const RACE = {
  id: 'race-1', date: DATA, location: 'Lisboa', name: 'Corrida do Tejo', status: 'concluida',
  race_type: 'estrada', distance_km: 10, elevation_gain_m: null, experience_level: 'medio', race_priority: 'a',
  target_time: '55:00', target_time_seconds: 3300, target_pace_seconds_per_km: 330,
  website: null, web_info: null, notes: null, course_profile: null,
  coach_balance: 'Boa prova.', coach_balance_at: `${DATA}T20:00:00Z`, diploma_path: 'u/diploma.jpg',
};
const RUN = { id: 'run-1', user_id: 'user-1', date: DATA, distance_km: 10.1, duration_minutes: 52, race_id: 'race-1', run_kind: 'competicao' };

describe('RunAgenda — apagar o resultado de uma prova concluída', () => {
  beforeEach(() => {
    mocks.ops.length = 0;
    localStorage.clear();
    useAppStore.setState({
      raceEvents: [RACE], runs: [RUN], coachPlans: [], coachPlanItems: [],
      profile: { id: 'user-1' }, session: { user: { id: 'user-1' } },
      editingRaceId: 'race-1', activeTab: 'provas', pendingCalendarDate: null,
      setRaceEvents: (events) => useAppStore.setState({ raceEvents: events }),
      setNavGuard: () => {},
      setEditingRaceId: (id) => useAppStore.setState({ editingRaceId: id }),
    });
  });

  it('o hub fica aberto, a prova volta a agendada, as memórias ficam e os detalhes destrancam', async () => {
    render(<ToastProvider><RunAgenda onClose={() => {}} /></ToastProvider>);
    expect(screen.queryByRole('button', { name: /^Detalhes da prova$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('race-remove-button'));
    const popup = await screen.findByTestId('race-remove-result');
    expect(popup).toHaveTextContent('«Corrida do Tejo» volta a «agendada»');
    expect(popup).toHaveTextContent('As memórias (diploma, medalha, fotos) ficam.');
    fireEvent.click(within(popup).getByRole('button', { name: 'Apagar o resultado' }));

    await waitFor(() => expect(useAppStore.getState().raceEvents[0].status).toBe('agendada'));
    expect(mocks.ops.every((o) => o.kind === 'update' && o.filters.user_id === 'user-1')).toBe(true);
    const prova = useAppStore.getState().raceEvents[0];
    expect(prova.diploma_path).toBe('u/diploma.jpg');
    expect(prova.coach_balance).toBeNull();
    expect(useAppStore.getState().runs[0].race_id).toBeNull();

    // A prova continua aberta, agora como agendada: os detalhes voltam.
    expect(useAppStore.getState().editingRaceId).toBe('race-1');
    expect(await screen.findByRole('button', { name: /^Detalhes da prova$/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('race-remove-result')).not.toBeInTheDocument());
  });

  it('«Eliminar a prova inteira» continua lá, como secundária, e fecha o hub', async () => {
    const onClose = vi.fn();
    render(<ToastProvider><RunAgenda onClose={onClose} /></ToastProvider>);
    fireEvent.click(screen.getByTestId('race-remove-button'));
    const popup = await screen.findByTestId('race-remove-result');
    fireEvent.click(within(popup).getByRole('button', { name: /Eliminar a prova inteira/ }));
    const aviso = await screen.findByTestId('race-remove-race');
    expect(aviso).toHaveTextContent('o resultado, as conquistas, as memórias (diploma, medalha, fotos) e a ligação à corrida');
    fireEvent.click(within(aviso).getByRole('button', { name: 'Eliminar prova' }));

    await waitFor(() => expect(useAppStore.getState().raceEvents).toEqual([]));
    expect(mocks.ops).toEqual([{ table: 'race_events', kind: 'delete', patch: null, filters: { id: 'race-1', user_id: 'user-1' } }]);
    expect(useAppStore.getState().editingRaceId).toBeNull();
    expect(onClose).toHaveBeenCalled();
  });
});
