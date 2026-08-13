import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PlanProposalBottomSheet from './PlanProposalBottomSheet';

describe('PlanProposalBottomSheet', () => {
  const mockPlan = {
    id: 'plan-1',
    period_start: '2026-08-15',
    period_end: '2026-08-20',
    summary: 'Plano de corrida de 5 dias focado em ritmo fácil.',
  };

  const mockItems = [
    { id: 'item-1', plan_id: 'plan-1', planned_date: '2026-08-15', kind: 'corrida', training_type: 'continuo', target_distance_km: 5, status: 'pendente' },
    { id: 'item-2', plan_id: 'plan-1', planned_date: '2026-08-16', kind: 'ginasio', categories: ['Core'], target_duration_min: 30, status: 'pendente' },
  ];

  const mockGoalProposal = {
    id: 'goal-1',
    goals: { calorie_goal: 2200, protein_goal: 170 },
    rationale: 'Aumento aeróbico',
  };

  const mockProfile = {
    calorie_goal: 2000,
    protein_goal: 150,
  };

  it('não renderiza nada se não houver nem plano nem proposta de objetivos', () => {
    const { container } = render(<PlanProposalBottomSheet plan={null} goalProposal={null} items={[]} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza proposta de plano com botão de aceitar plano', () => {
    render(<PlanProposalBottomSheet plan={mockPlan} items={mockItems} onRespondPlan={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Nova Proposta de Plano')).toBeInTheDocument();
    expect(screen.getByText(/Período: 2026-08-15 a 2026-08-20/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aceitar Plano/i })).toBeInTheDocument();
  });

  it('renderiza proposta de alteração de objetivos independente', () => {
    const onRespondGoal = vi.fn();
    render(
      <PlanProposalBottomSheet
        plan={null}
        goalProposal={mockGoalProposal}
        profile={mockProfile}
        onRespondGoal={onRespondGoal}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('Proposta de Alteração de Objetivos')).toBeInTheDocument();
    expect(screen.getByText(/2200 kcal\/dia/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aceitar Objetivos/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Aceitar Objetivos/i }));
    expect(onRespondGoal).toHaveBeenCalledWith('goal-1', true);
  });
});
