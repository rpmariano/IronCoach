import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    expect(screen.getByRole('button', { name: /Aceitar plano/i })).toBeInTheDocument();
  });

  it('anéis de macros de uma sugestão alimentar sem meal_macros usam as metas reais do perfil, não os defaults (regressão: profile não chegava ao PlanDayCard)', () => {
    const itemWithLegacyMeal = {
      id: 'item-meal',
      plan_id: 'plan-1',
      planned_date: '2026-08-15',
      kind: 'corrida',
      training_type: 'continuo',
      target_distance_km: 5,
      status: 'pendente',
      meal_suggestion: 'Foca-te em hidratos antes do treino.',
      // sem meal_macros: sugestão antiga ou validação de macros da Gemini falhou
    };
    const profileWithCustomGoals = {
      calorie_goal: 2600,
      protein_goal: 180,
      carbs_goal: 260,
      fat_goal: 95,
    };

    render(
      <PlanProposalBottomSheet
        plan={mockPlan}
        items={[itemWithLegacyMeal]}
        profile={profileWithCustomGoals}
        onRespondPlan={() => {}}
        onClose={() => {}}
      />
    );

    // O cartão do dia começa fechado — expande para revelar a sugestão alimentar.
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes do dia 1' }));

    expect(screen.getByText('180')).toBeInTheDocument(); // proteína real do perfil
    expect(screen.getByText('2600')).toBeInTheDocument(); // calorias reais do perfil
    expect(screen.queryByText('150')).not.toBeInTheDocument(); // DEFAULT_PROTEIN_GOAL não deve aparecer
    expect(screen.queryByText('2000')).not.toBeInTheDocument(); // DEFAULT_CALORIE_GOAL não deve aparecer
  });

  it('fecha o modal com animação ao clicar no botão de cruz (X)', async () => {
    const onClose = vi.fn();
    render(<PlanProposalBottomSheet plan={mockPlan} items={mockItems} onClose={onClose} />);

    const closeBtn = screen.getByRole('button', { name: 'Fechar' });
    expect(closeBtn).toBeInTheDocument();
    fireEvent.click(closeBtn);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('fecha o modal com animação ao clicar na pega de arrasto', async () => {
    const onClose = vi.fn();
    render(<PlanProposalBottomSheet plan={mockPlan} items={mockItems} onClose={onClose} />);

    const handles = screen.getAllByTitle('Toca para fechar persiana');
    fireEvent.click(handles[0]);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('renderiza proposta de objetivos com botão de aceitar objetivos', () => {
    render(<PlanProposalBottomSheet goalProposal={mockGoalProposal} profile={mockProfile} onRespondGoal={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Proposta de Objetivos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aceitar objetivos/i })).toBeInTheDocument();
  });

  it('mostra plano e objetivos juntos na mesma persiana quando ambos estão pendentes', () => {
    render(
      <PlanProposalBottomSheet
        plan={mockPlan}
        items={mockItems}
        onRespondPlan={() => {}}
        goalProposal={mockGoalProposal}
        profile={mockProfile}
        onRespondGoal={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('Propostas da Carol')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aceitar objetivos/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aceitar plano/i })).toBeInTheDocument();
  });

  it('responder aos objetivos não invoca onRespondPlan nem fecha a persiana inteira', () => {
    const onRespondGoal = vi.fn();
    const onRespondPlan = vi.fn();
    const onClose = vi.fn();
    render(
      <PlanProposalBottomSheet
        plan={mockPlan}
        items={mockItems}
        onRespondPlan={onRespondPlan}
        goalProposal={mockGoalProposal}
        profile={mockProfile}
        onRespondGoal={onRespondGoal}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Aceitar objetivos/i }));
    expect(onRespondGoal).toHaveBeenCalledWith('goal-1', true);
    expect(onRespondPlan).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

/* Bug relatado 2026-09-21: "O título refere 69 dias e 8 corridas, a que se
   refere?" — a persiana nunca dizia a que PROVA o plano se destinava.
   plan.period_end é sempre o dia da prova, quando há uma vinculada
   (coach-chat, runProposeTrainingPlan): um atleta com mais do que uma prova
   agendada não tinha como saber que "69 dias" não era para a prova mais
   próxima, mas para a prova A lá mais à frente. */
describe('PlanProposalBottomSheet — a que prova o plano se refere', () => {
  const raceEvents = [
    { id: 'race-a', name: 'Meia dos Descobrimentos', date: '2026-11-29', race_priority: 'a' },
    { id: 'race-b', name: 'Volkswagen Run', date: '2026-10-25', race_priority: 'b' },
  ];

  const planParaProvaA = {
    id: 'plan-2',
    race_id: 'race-a',
    period_start: '2026-09-21',
    period_end: '2026-11-29',
  };

  const itensParciais = [
    { id: 'i1', plan_id: 'plan-2', planned_date: '2026-09-22', kind: 'corrida', training_type: 'continuo', target_distance_km: 8, status: 'pendente' },
    { id: 'i2', plan_id: 'plan-2', planned_date: '2026-09-25', kind: 'corrida', training_type: 'longo', target_distance_km: 12, status: 'pendente' },
  ];

  it('o subtítulo diz para que prova o plano se destina', () => {
    render(<PlanProposalBottomSheet plan={planParaProvaA} items={itensParciais} raceEvents={raceEvents} onRespondPlan={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/Período: 2026-09-21 a 2026-11-29 — para Meia dos Descobrimentos/)).toBeInTheDocument();
  });

  it('a frase do plano nomeia a prova, em vez de só o número de dias', () => {
    render(<PlanProposalBottomSheet plan={planParaProvaA} items={itensParciais} raceEvents={raceEvents} onRespondPlan={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/Plano de 70 dias até Meia dos Descobrimentos, com 2 corridas/)).toBeInTheDocument();
  });

  it('quando os itens não cobrem o bloco todo, diz até quando estão detalhados', () => {
    render(<PlanProposalBottomSheet plan={planParaProvaA} items={itensParciais} raceEvents={raceEvents} onRespondPlan={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/detalhados até 2026-09-25 — o resto do bloco ainda vai ser definido/)).toBeInTheDocument();
  });

  it('sem prova vinculada, mantém a frase de sempre — sem "até" nem prova nenhuma', () => {
    const semProva = { id: 'plan-3', period_start: '2026-08-15', period_end: '2026-08-20' };
    const itens = [{ id: 'j1', plan_id: 'plan-3', planned_date: '2026-08-20', kind: 'corrida', training_type: 'continuo', target_distance_km: 5, status: 'pendente' }];
    render(<PlanProposalBottomSheet plan={semProva} items={itens} raceEvents={raceEvents} onRespondPlan={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/Plano de 6 dias, com 1 corrida\./)).toBeInTheDocument();
  });

  it('sem raceEvents (prop omitida), não rebenta e comporta-se como sem prova', () => {
    render(<PlanProposalBottomSheet plan={planParaProvaA} items={itensParciais} onRespondPlan={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/Período: 2026-09-21 a 2026-11-29/)).toBeInTheDocument();
    expect(screen.queryByText(/para Meia dos Descobrimentos/)).not.toBeInTheDocument();
  });
});
