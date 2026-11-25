import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import { ToastProvider } from '../shared/ToastProvider';
import { setDesignV2 } from '../../utils/designV2';
import Calendar from './Calendar';

/* O Calendário no Design v2 (pedido do Rui, 25/11): a grelha plana, hoje a ciano, a prova a âmbar,
   os pontos dos registos; a prova da agenda como bloco plano, com «Eliminar prova» e o diálogo de
   sempre. Desligado, o Calendário de sempre. */

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => {
      const q = { delete: () => q, update: () => q, eq: () => q, select: () => q, maybeSingle: () => Promise.resolve({ data: null, error: null }), then: (res, rej) => Promise.resolve({ error: null }).then(res, rej) };
      return q;
    },
  },
}));

const HOJE = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const outroDia = new Date(HOJE.getFullYear(), HOJE.getMonth(), HOJE.getDate() === 15 ? 16 : 15);
const PROVA = { id: 'race-1', name: 'Meia de Lisboa', date: iso(outroDia), distance_km: 21.1, status: 'planeada', race_type: 'estrada', target_time: '1:45:00' };

const renderCalendario = () => render(<ToastProvider><Calendar /></ToastProvider>);

beforeEach(() => {
  window.localStorage.clear();
  useAppStore.setState({
    runs: [{ id: 'run-1', user_id: 'user-1', date: iso(HOJE), distance_km: 8, duration_seconds: 2700 }],
    gymSessions: [], meals: [{ id: 'm1', date: iso(HOJE), meal_type: 'almoco', meal_items: [] }], bodyAssessments: [],
    raceEvents: [PROVA], coachPlans: [], coachPlanItems: [],
    profile: { id: 'user-1' }, session: { user: { id: 'user-1' } },
    pendingCalendarDate: null, calendarView: null,
  });
});
afterEach(() => act(() => setDesignV2(false)));

describe('Calendário — Design v2', () => {
  it('desligado: o Calendário de sempre', () => {
    renderCalendario();
    expect(screen.queryByTestId('calendar-v2')).toBeNull();
    expect(screen.getByTestId('calendar-filter')).toBeInTheDocument();
  });

  it('ligado: a grelha plana, hoje marcado, a prova a âmbar e os pontos dos registos', () => {
    act(() => setDesignV2(true));
    renderCalendario();
    expect(screen.getByTestId('calendar-v2')).toBeInTheDocument();
    const hoje = screen.getByTestId(`calendar-day-${iso(HOJE)}`);
    expect(hoje).toHaveClass('is-today');
    expect(hoje).toHaveAttribute('aria-label', expect.stringMatching(/hoje, corrida, refeições$/));
    const prova = screen.getByTestId(`calendar-day-${PROVA.date}`);
    expect(prova).toHaveClass('is-race');
    expect(prova).toHaveAttribute('aria-label', expect.stringMatching(/prova: Meia de Lisboa/));
    // Sem etiquetas em maiúsculas espaçadas: o mês em texto normal.
    expect(screen.getByTestId('calendar-v2-month').className).not.toMatch(/uppercase/);
  });

  it('escolher um dia mostra os registos dele; o filtro continua a filtrar', () => {
    act(() => setDesignV2(true));
    renderCalendario();
    fireEvent.click(screen.getByTestId(`calendar-day-${PROVA.date}`));
    expect(screen.getByTestId(`calendar-day-${PROVA.date}`)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('race-agenda-v2')).toHaveTextContent('Meia de Lisboa');
    fireEvent.click(screen.getByTestId('calendar-filter-corrida'));
    expect(screen.getByTestId('calendar-filter-corrida')).toHaveAttribute('aria-pressed', 'true');
  });

  it('a prova da agenda: um bloco plano com os números; «Eliminar prova» abre o diálogo de sempre', async () => {
    act(() => setDesignV2(true));
    renderCalendario();
    fireEvent.click(screen.getByTestId(`calendar-day-${PROVA.date}`));
    const card = screen.getByTestId('race-agenda-v2');
    expect(card).toHaveTextContent('21,1 km');
    expect(card).toHaveTextContent('1:45:00');
    const mais = within(card).getByTestId('race-agenda-v2-more');
    expect(mais).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(mais);
    expect(mais).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(within(card).getByRole('button', { name: 'Eliminar prova' }));
    expect(await screen.findByTestId('race-remove-race')).toHaveTextContent('«Meia de Lisboa» sai do calendário');
  });
});
