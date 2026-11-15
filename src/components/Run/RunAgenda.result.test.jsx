import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import { ToastProvider } from '../shared/ToastProvider';
import RunAgenda from './RunAgenda';
import { todayISO, addDaysISO } from '../../lib/utils';

/* Bug de 2026-11-15: a atleta queria refazer o tempo da prova concluída e o «Eliminar» do hub apagou
   a prova inteira. Regra do Rui: o botão que apaga a prova diz sempre «Eliminar prova», e a
   confirmação diz o que se perde. Refazer só o tempo faz-se em «Editar o registo». */

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
};
const RUN = { id: 'run-1', user_id: 'user-1', date: DATA, distance_km: 10.1, duration_minutes: 52, race_id: 'race-1', run_kind: 'competicao' };

describe('RunAgenda — «Eliminar prova» numa prova concluída', () => {
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

  it('diz o que se perde, aponta o «Eliminar registo», e só apaga a prova (com user_id) ao confirmar', async () => {
    const onClose = vi.fn();
    render(<ToastProvider><RunAgenda onClose={onClose} /></ToastProvider>);
    const botao = screen.getByTestId('race-remove-button');
    expect(botao).toHaveTextContent('Eliminar prova');
    fireEvent.click(botao);

    const aviso = await screen.findByTestId('race-remove-race');
    expect(aviso).toHaveTextContent('«Corrida do Tejo» sai do calendário e perdes o resultado, o diploma, as fotos e a ligação à corrida.');
    expect(aviso).toHaveTextContent('Para refazer só o tempo, usa «Eliminar registo» em «Editar o registo».');
    expect(mocks.ops).toEqual([]);
    fireEvent.click(within(aviso).getByRole('button', { name: 'Eliminar prova' }));

    await waitFor(() => expect(useAppStore.getState().raceEvents).toEqual([]));
    expect(mocks.ops).toEqual([{ table: 'race_events', kind: 'delete', patch: null, filters: { id: 'race-1', user_id: 'user-1' } }]);
    expect(useAppStore.getState().runs[0].race_id).toBeNull();
    expect(useAppStore.getState().editingRaceId).toBeNull();
    expect(onClose).toHaveBeenCalled();
  });
});
