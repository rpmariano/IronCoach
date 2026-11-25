import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useAppStore } from '../../store';
import { setDesignV2 } from '../../utils/designV2';
import CreatedRecordModal from './CreatedRecordModal';

/* O «Registo guardado» no Design v2: a mensagem numa linha, «Fechar» e o «Eliminar» discreto, com a
   confirmação de sempre. Os cartões dentro dele escolhem a forma deles sozinhos. */

vi.mock('../../store', () => {
  const useAppStore = vi.fn();
  useAppStore.getState = () => useAppStore();
  return { useAppStore };
});
vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn(() => Promise.resolve({ data: null, error: null })), delete: vi.fn().mockReturnThis() })) },
}));
vi.mock('../Run/RunCard', () => ({ default: (props) => <div data-testid="run-card" data-expanded={String(!!props.defaultExpanded)} data-hide-actions={String(!!props.hideActions)} /> }));
vi.mock('../Gym/GymSessionCard', () => ({ default: () => <div data-testid="gym-card" /> }));
vi.mock('../Nutrition/MealCard', () => ({ default: () => <div data-testid="meal-card" /> }));
vi.mock('../Body/BodyAssessmentCard', () => ({ default: () => <div data-testid="body-card" /> }));

const clear = vi.fn();
beforeEach(() => {
  window.localStorage.clear();
  clear.mockReset();
  useAppStore.mockReturnValue({
    newlyCreatedRecord: { type: 'run', record: { id: 'run-1', distance_km: 8 } },
    clearNewlyCreatedRecord: clear,
    profile: { id: 'user-1' },
    setProfile: vi.fn(), setActiveTab: vi.fn(() => true), setCoachIntent: vi.fn(), setSelectedDate: vi.fn(),
    dismissedInterventions: {}, dismissIntervention: vi.fn(), loadInitialData: vi.fn(() => Promise.resolve()),
  });
});
afterEach(() => act(() => setDesignV2(false)));

describe('CreatedRecordModal — Design v2', () => {
  it('a mensagem numa linha; o cartão aberto e sem ações; «Fechar» fecha', () => {
    act(() => setDesignV2(true));
    render(<CreatedRecordModal />);
    expect(screen.getByTestId('created-record-ok')).toHaveTextContent('O teu registo foi analisado e guardado com sucesso.');
    expect(screen.getByTestId('run-card')).toHaveAttribute('data-expanded', 'true');
    expect(screen.getByTestId('run-card')).toHaveAttribute('data-hide-actions', 'true');
    fireEvent.click(screen.getByTestId('created-record-close'));
    expect(clear).toHaveBeenCalled();
  });

  it('«Eliminar» discreto abre a confirmação de sempre', () => {
    act(() => setDesignV2(true));
    render(<CreatedRecordModal />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(screen.getByText(/Tem a certeza que deseja eliminar esta corrida\?/)).toBeInTheDocument();
  });

  it('desligado: a faixa de sempre', () => {
    render(<CreatedRecordModal />);
    expect(screen.queryByTestId('created-record-ok')).toBeNull();
    expect(screen.getByText('O teu registo foi analisado e guardado com sucesso.')).toBeInTheDocument();
  });
});
