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
