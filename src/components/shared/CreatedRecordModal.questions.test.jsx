import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import CreatedRecordModal from './CreatedRecordModal';

/* Bug #52 (fase B): as perguntas da Carol aparecem logo no ecrã do
   resultado; responder não faz o bloco desaparecer — fica a resposta dela. */

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../lib/supabase', () => {
  const chain = { select: () => chain, eq: () => chain, single: () => Promise.resolve({ data: { coach_intervention_status: null }, error: null }) };
  return {
    supabase: { from: () => chain, storage: { from: () => ({}) } },
    invokeEdgeFunctionWithTimeout: (...args) => mocks.invoke(...args),
  };
});

const Q1 = { id: 'q1', topic: 'fritos', item_name: 'Ovo estrelado', question: 'Os ovos foram estrelados em quê?', options: ['Azeite', 'Manteiga'], assumed: 'Azeite', impact_kcal: 90, answer: null };
const MEAL = { id: 'm1', date: '2026-10-04', meal_type: 'almoco', meal_items: [], carol_questions: [Q1] };

describe('CreatedRecordModal — as perguntas da Carol', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    useAppStore.setState({ profile: { id: 'u1' }, meals: [MEAL], newlyCreatedRecord: { type: 'meal', record: MEAL }, dismissedInterventions: {} });
  });

  it('mostra as perguntas e, depois de responder, a resposta da Carol', async () => {
    const updated = { ...MEAL, carol_questions: [{ ...Q1, answer: 'Manteiga' }] };
    mocks.invoke.mockResolvedValue({ data: { meal: updated, learned: [{ topic: 'fritos', value: 'Manteiga', status: 'confirmado' }] }, error: null });
    render(<CreatedRecordModal />);
    expect(screen.getByTestId('carol-questions')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Manteiga' }));
    fireEvent.click(screen.getByTestId('carol-questions-submit'));

    expect(await screen.findByText(/Guardei: fritos — Manteiga\. Não volto a perguntar\./)).toBeInTheDocument();
    expect(useAppStore.getState().newlyCreatedRecord.record).toBe(updated);
  });

  it('sem perguntas, nada disto', () => {
    useAppStore.setState({ newlyCreatedRecord: { type: 'meal', record: { ...MEAL, carol_questions: null } } });
    render(<CreatedRecordModal />);
    expect(screen.queryByTestId('carol-questions')).not.toBeInTheDocument();
  });
});
