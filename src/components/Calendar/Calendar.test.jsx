import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import { ToastProvider } from '../shared/ToastProvider';
import Calendar from './Calendar';

/* Auditoria a11y (passagem "harden"): eliminar uma prova passava por um
   window.confirm — popup do sistema, fora da linguagem da app, sem dizer o
   que se perde e sem os 44px de toque. Passou a usar o Dialog partilhado,
   como "Dispensar o aviso da Carol?" no Início. Este teste fixa as duas
   metades: o confirm do browser nunca é chamado, e nada é apagado enquanto
   o atleta não confirmar no popup da app. */

const mocks = vi.hoisted(() => ({ deleted: [] }));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      delete: () => ({
        eq: (_col, id) => { mocks.deleted.push(id); return Promise.resolve({ error: null }); },
      }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));

const HOJE = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const PROVA = {
  id: 'race-1',
  name: 'Meia de Lisboa',
  date: iso(HOJE),
  distance_km: 21.1,
  status: 'planeada',
  race_type: 'estrada',
};

const renderCalendario = () => render(<ToastProvider><Calendar /></ToastProvider>);

describe('Calendário — eliminar prova', () => {
  let confirmSpy;

  beforeEach(() => {
    mocks.deleted.length = 0;
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    useAppStore.setState({
      runs: [], gymSessions: [], meals: [], bodyAssessments: [],
      raceEvents: [PROVA],
      pendingCalendarDate: null,
    });
  });

  afterEach(() => confirmSpy.mockRestore());

  it('pede confirmação no popup da app, não no window.confirm', async () => {
    renderCalendario();
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da prova/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Eliminar/ }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(await screen.findByText('Eliminar esta prova?')).toBeInTheDocument();
    expect(mocks.deleted).toEqual([]);
  });

  it('"Cancelar" fecha o popup e não apaga nada', async () => {
    renderCalendario();
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da prova/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Eliminar/ }));
    await screen.findByText('Eliminar esta prova?');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByText('Eliminar esta prova?')).not.toBeInTheDocument());
    expect(mocks.deleted).toEqual([]);
    expect(useAppStore.getState().raceEvents).toHaveLength(1);
  });

  it('só apaga depois de confirmar', async () => {
    renderCalendario();
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da prova/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Eliminar/ }));
    const popup = await screen.findByRole('dialog');

    fireEvent.click(within(popup).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(mocks.deleted).toEqual(['race-1']));
    expect(useAppStore.getState().raceEvents).toHaveLength(0);
  });
});

/* A ordem do dia (pedido 2026-09-13): pela hora, entre tipos — o ginásio
   das 07:00 antes do almoço, a corrida das 18:30 depois. */
describe('Calendário — o dia por ordem cronológica', () => {
  it('intercala corridas, treinos e refeições pela hora', () => {
    useAppStore.setState({
      raceEvents: [],
      runs: [{ id: 'run-1', kind: 'treino', name: 'Corrida da tarde', date: iso(HOJE), start_time: '18:30:00', distance_km: 10, duration_seconds: 3000, details: {} }],
      gymSessions: [{ id: 'gym-1', name: 'Ginásio da manhã', date: iso(HOJE), start_time: '07:00:00', categories: ['Pernas'], exercises: [] }],
      meals: [{ id: 'meal-1', date: iso(HOJE), meal_type: 'almoco', name: 'Almoço', meal_items: [], total_calories: 600 }],
      bodyAssessments: [],
      pendingCalendarDate: null,
    });
    renderCalendario();

    const ginasio = screen.getByText('Ginásio da manhã');
    const almoco = screen.getByText('Almoço');
    const corrida = screen.getByText('Corrida da tarde');
    const antes = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(antes(ginasio, almoco)).toBe(true);
    expect(antes(almoco, corrida)).toBe(true);
  });
});
