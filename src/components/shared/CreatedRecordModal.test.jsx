import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import CreatedRecordModal from './CreatedRecordModal';

/* Regressão: CreatedRecordModal usava dismissedInterventions e
   dismissIntervention (ver linhas isDismissed/handleGoToChat) sem os
   desestruturar de useAppStore() — ReferenceError logo no render, sempre
   que newlyCreatedRecord tinha um record.id. Sem nenhum Error Boundary
   no topo da app (ver AppErrorBoundary), isto desmontava a app inteira:
   o atleta ficava com um ecrã completamente preto ao registar peso ou
   refeição por foto (finishCreateAndGoToCalendar → newlyCreatedRecord →
   este modal), tendo de fechar e reabrir a aplicação. */

vi.mock('../../store', () => ({
  useAppStore: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
  },
}));

// Isola o teste da lógica interna de cada cartão — só interessa que
// CreatedRecordModal em si não rebente ao ler o store.
vi.mock('../Run/RunCard', () => ({ default: () => <div data-testid="run-card" /> }));
vi.mock('../Gym/GymSessionCard', () => ({ default: () => <div data-testid="gym-card" /> }));
vi.mock('../Nutrition/MealCard', () => ({ default: () => <div data-testid="meal-card" /> }));
vi.mock('../Body/BodyAssessmentCard', () => ({ default: () => <div data-testid="body-card" /> }));

function mockStore(overrides = {}) {
  useAppStore.mockReturnValue({
    newlyCreatedRecord: null,
    clearNewlyCreatedRecord: vi.fn(),
    profile: { id: 'user-1' },
    setProfile: vi.fn(),
    setActiveTab: vi.fn(),
    setSelectedDate: vi.fn(),
    dismissedInterventions: {},
    dismissIntervention: vi.fn(),
    ...overrides,
  });
}

describe('CreatedRecordModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('não rebenta ao mostrar uma avaliação corporal recém-criada (registo por foto)', () => {
    mockStore({
      newlyCreatedRecord: { type: 'body', record: { id: 'a1', date: '2026-08-24', weight_kg: 79.2 } },
    });
    expect(() => render(<CreatedRecordModal />)).not.toThrow();
    expect(screen.getByTestId('body-card')).toBeInTheDocument();
  });

  it('não rebenta ao mostrar uma refeição recém-criada (registo por foto)', () => {
    mockStore({
      newlyCreatedRecord: { type: 'meal', record: { id: 'm1', date: '2026-08-24' } },
    });
    expect(() => render(<CreatedRecordModal />)).not.toThrow();
    expect(screen.getByTestId('meal-card')).toBeInTheDocument();
  });

  it('devolve null sem registo novo', () => {
    mockStore({ newlyCreatedRecord: null });
    const { container } = render(<CreatedRecordModal />);
    expect(container).toBeEmptyDOMElement();
  });
});
