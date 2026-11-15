import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import { ToastProvider } from '../shared/ToastProvider';
import RunRegistration from './RunRegistration';
import { todayISO, addDaysISO } from '../../lib/utils';

vi.setConfig({ testTimeout: 15000 });

/* Bug de 2026-11-15 (pssmartins13): numa prova de 10 km com objetivo 56:40 a atleta escreveu «1:23»,
   que se gravou como 1 min 23 s; para refazer o tempo, apagou a prova inteira. Regras do Rui:
   o tempo impossível não se aceita (na entrada e ao gravar), e «Eliminar registo» vive dentro do
   editar registo — apaga a corrida ou o resultado, nunca a prova. */

vi.mock('../../utils/firstRecord', () => ({ firstRecordMoment: () => null }));
vi.mock('@formulas/runRecord.ts', () => ({ runRecordMoment: () => null }));
vi.mock('../../lib/image', () => ({ compressImage: () => Promise.resolve({ dataUrl: 'data:image/jpeg;base64,AAA', base64: 'AAA' }) }));

const mocks = vi.hoisted(() => ({ ops: [], invoke: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      const op = { table, kind: null, patch: null, filters: {} };
      const q = {
        delete: () => { op.kind = 'delete'; return q; },
        update: (patch) => { op.kind = 'update'; op.patch = patch; return q; },
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
        select: () => q,
        eq: (col, val) => { op.filters[col] = val; return q; },
        maybeSingle: () => { mocks.ops.push(op); return Promise.resolve({ data: { id: op.filters.id }, error: null }); },
        then: (res, rej) => { mocks.ops.push(op); return Promise.resolve({ data: [], error: null }).then(res, rej); },
      };
      return q;
    },
    storage: { from: () => ({ createSignedUrls: (paths) => Promise.resolve({ data: paths.map((p) => ({ signedUrl: `https://s/${p}` })), error: null }), createSignedUrl: (p) => Promise.resolve({ data: { signedUrl: `https://s/${p}` }, error: null }) }) },
  },
  invokeEdgeFunctionWithTimeout: (...a) => mocks.invoke(...a),
}));

const DATA = addDaysISO(todayISO(), -1);
const PROVA = {
  id: 'race-1', name: 'Corrida da Mulher', date: DATA, location: 'Lisboa', status: 'agendada',
  race_type: 'estrada', distance_km: 10, target_time: '56:40', target_time_seconds: 3400,
  target_pace_seconds_per_km: 340, experience_level: 'medio', race_priority: 'a',
};
const PROFILE = { id: 'user-1', name: 'Atleta' };
const CORRIDA = {
  id: 'run-1', user_id: 'user-1', kind: 'competicao', race_id: 'race-1', date: DATA, name: 'Corrida da Mulher',
  distance_km: 10.05, duration_seconds: 4985,
  details: { official_time_seconds: 4980, position: 812, bib_number: '1234', race_type: '10k', avg_hr: 160 },
};

const renderReg = (props) => render(<ToastProvider><RunRegistration onClose={() => {}} {...props} /></ToastProvider>);

describe('Registo da prova — tempo impossível', () => {
  beforeEach(() => {
    mocks.ops.length = 0;
    mocks.invoke.mockReset();
    localStorage.clear();
    useAppStore.setState({
      profile: PROFILE, session: { user: { id: 'user-1' } }, runs: [], shoes: [], coachPlans: [], coachPlanItems: [],
      raceEvents: [PROVA], runRacePrefill: { raceId: 'race-1' },
    });
  });

  it('«1:23» em 10 km com objetivo 56:40: a frase explica, sugere 1:23:00, e um toque corrige', () => {
    renderReg();
    const campo = screen.getByLabelText(/Tempo oficial/);
    fireEvent.change(campo, { target: { value: '123' } });
    expect(campo).toHaveValue('1:23');
    // A escrever não se acusa nada; ao sair do campo, sim.
    expect(screen.queryByTestId('rr-tempo-oficial-erro')).not.toBeInTheDocument();
    fireEvent.blur(campo);
    const erro = screen.getByTestId('rr-tempo-oficial-erro');
    expect(erro).toHaveTextContent('1:23 parece minutos — querias dizer 1:23:00?');
    expect(campo).toHaveAttribute('aria-invalid', 'true');

    fireEvent.click(within(erro).getByRole('button', { name: 'Usar 1:23:00' }));
    expect(campo).toHaveValue('1:23:00');
    expect(screen.queryByTestId('rr-tempo-oficial-erro')).not.toBeInTheDocument();
  });

  it('ao gravar, bloqueia — nada vai à análise', async () => {
    renderReg();
    fireEvent.change(screen.getByLabelText(/Tempo oficial/), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: /Registar a prova/i }));
    expect((await screen.findAllByText('Tempo oficial: 1:23 parece minutos — querias dizer 1:23:00?')).length).toBeGreaterThan(0);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('a duração (tempo pessoal) segue a mesma regra', () => {
    renderReg();
    const duracao = screen.getByPlaceholderText('00:00');
    fireEvent.change(duracao, { target: { value: '124' } });
    fireEvent.blur(duracao);
    expect(screen.getByTestId('rr-duracao-erro')).toHaveTextContent('1:24 parece minutos — querias dizer 1:24:00?');
  });
});

describe('Registo da prova — «Eliminar registo» dentro do editar', () => {
  beforeEach(() => {
    mocks.ops.length = 0;
    localStorage.clear();
    useAppStore.setState({
      profile: PROFILE, session: { user: { id: 'user-1' } }, shoes: [], coachPlans: [], coachPlanItems: [],
      raceEvents: [{ ...PROVA, status: 'concluida', coach_balance: 'Boa.', diploma_path: 'u/d.jpg' }],
      runs: [CORRIDA], runRacePrefill: null,
      setRaceEvents: (events) => useAppStore.setState({ raceEvents: events }),
    });
  });

  it('só aparece a editar; por omissão apaga a corrida — a prova fica, agendada, com as memórias', async () => {
    const onClose = vi.fn();
    renderReg({ runIdToEdit: 'run-1', onClose });
    fireEvent.click(screen.getByTestId('race-record-remove-button'));
    const popup = await screen.findByTestId('race-remove-record');
    expect(within(popup).getByLabelText(/Apagar a corrida/)).toBeChecked();
    fireEvent.click(within(popup).getByRole('button', { name: 'Eliminar registo' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    // A prova primeiro, a corrida depois: se a prova falhasse, a corrida não se perdia.
    expect(mocks.ops.slice(0, 2)).toEqual([
      { table: 'race_events', kind: 'update', patch: { status: 'agendada', coach_balance: null, coach_balance_at: null }, filters: { id: 'race-1', user_id: 'user-1' } },
      { table: 'runs', kind: 'delete', patch: null, filters: { id: 'run-1', user_id: 'user-1' } },
    ]);
    expect(mocks.ops.some((o) => o.table === 'race_events' && o.kind === 'delete')).toBe(false);
    const prova = useAppStore.getState().raceEvents[0];
    expect(prova).toMatchObject({ id: 'race-1', status: 'agendada', coach_balance: null, diploma_path: 'u/d.jpg' });
    expect(useAppStore.getState().runs).toEqual([]);
  });

  it('«Apagar só o resultado»: a corrida fica como treino, sem os campos do resultado', async () => {
    renderReg({ runIdToEdit: 'run-1' });
    fireEvent.click(screen.getByTestId('race-record-remove-button'));
    const popup = await screen.findByTestId('race-remove-record');
    fireEvent.click(within(popup).getByLabelText(/Apagar só o resultado/));
    fireEvent.click(within(popup).getByRole('button', { name: 'Eliminar registo' }));

    await waitFor(() => expect(useAppStore.getState().raceEvents[0].status).toBe('agendada'));
    expect(mocks.ops.find((o) => o.table === 'runs')).toEqual({
      table: 'runs', kind: 'update',
      patch: { race_id: null, details: { race_type: '10k', avg_hr: 160 } },
      filters: { id: 'run-1', user_id: 'user-1' },
    });
    expect(useAppStore.getState().runs[0]).toMatchObject({ id: 'run-1', race_id: null, details: { race_type: '10k', avg_hr: 160 } });
  });

  it('a registar uma prova nova não há «Eliminar registo»', () => {
    useAppStore.setState({ raceEvents: [PROVA], runs: [], runRacePrefill: { raceId: 'race-1' } });
    renderReg();
    expect(screen.queryByTestId('race-record-remove-button')).not.toBeInTheDocument();
  });
});
