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

  it('não renderiza nada se o plano for nulo', () => {
    const { container } = render(<PlanProposalBottomSheet plan={null} items={[]} onRespond={() => {}} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza o título, período, resumo e botões de ação', () => {
    render(<PlanProposalBottomSheet plan={mockPlan} items={mockItems} onRespond={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Nova Proposta de Plano')).toBeInTheDocument();
    expect(screen.getByText(/Período: 2026-08-15 a 2026-08-20/)).toBeInTheDocument();
    expect(screen.getByText(/Plano de corrida de 5 dias focado em ritmo fácil/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aceitar Plano/i })).toBeInTheDocument();
  });

  it('chama onRespond ao clicar em Aceitar ou Recusar', () => {
    const onRespond = vi.fn();
    const onClose = vi.fn();
    render(<PlanProposalBottomSheet plan={mockPlan} items={mockItems} onRespond={onRespond} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /Aceitar Plano/i }));
    expect(onRespond).toHaveBeenCalledWith('plan-1', true);
    expect(onClose).toHaveBeenCalled();
  });
});
