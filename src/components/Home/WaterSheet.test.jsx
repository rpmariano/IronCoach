import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAppStore } from '../../store';
import { ToastProvider } from '../shared/ToastProvider';
import { lisbonTodayISO } from '../../lib/utils';
import WaterSheet, { WATER_GOAL_MOMENT_MS } from './WaterSheet';

/* A água: o copo que passa a meta é o único registo que não é igual aos
   outros — a Carol diz-o e a persiana fecha sozinha. Os outros fecham logo. */

const today = lisbonTodayISO();
let addWaterLog;
let setWaterSheetOpen;

function setup(totalMl) {
  addWaterLog = vi.fn(async (ml) => {
    const row = { id: `w${Math.random()}`, date: today, amount_ml: ml };
    useAppStore.setState((s) => ({ waterLogs: [...s.waterLogs, row] }));
    return row;
  });
  setWaterSheetOpen = vi.fn((open) => useAppStore.setState({ waterSheetOpen: open }));
  useAppStore.setState({
    waterSheetOpen: true,
    waterLogs: totalMl ? [{ id: 'w0', date: today, amount_ml: totalMl }] : [],
    profile: { id: 'u1', water_goal_ml: 2000 },
    addWaterLog,
    setWaterSheetOpen,
    snoozeWaterReminder: vi.fn(),
  });
  return render(<ToastProvider><WaterSheet /></ToastProvider>);
}

afterEach(() => vi.useRealTimers());

describe('WaterSheet', () => {
  beforeEach(() => useAppStore.setState({ waterLogs: [] }));

  it('mostra o nível do dia', () => {
    setup(1000);
    expect(screen.getByRole('progressbar', { name: 'Água de hoje' })).toHaveAttribute('aria-valuenow', '1000');
  });

  it('um copo qualquer fecha logo', async () => {
    setup(1000);
    fireEvent.click(screen.getByRole('button', { name: /\+250 ml/ }));
    await waitFor(() => expect(setWaterSheetOpen).toHaveBeenCalledWith(false));
    expect(screen.queryByTestId('water-goal-reached')).not.toBeInTheDocument();
  });

  it('o copo que passa a meta: a Carol diz-o, e fecha sozinha', async () => {
    setup(1800);
    fireEvent.click(screen.getByRole('button', { name: /\+250 ml/ }));
    const momento = await screen.findByTestId('water-goal-reached');
    expect(momento).toHaveTextContent('A água de hoje está feita.');
    expect(momento).toHaveTextContent('2,1 L');
    expect(setWaterSheetOpen).not.toHaveBeenCalled();
    await waitFor(() => expect(setWaterSheetOpen).toHaveBeenCalledWith(false), { timeout: WATER_GOAL_MOMENT_MS + 1000 });
  });

  it('com a meta já passada, os copos seguintes voltam a ser normais', async () => {
    setup(2100);
    fireEvent.click(screen.getByRole('button', { name: /\+200 ml/ }));
    await waitFor(() => expect(setWaterSheetOpen).toHaveBeenCalledWith(false));
    expect(screen.queryByTestId('water-goal-reached')).not.toBeInTheDocument();
  });
});
