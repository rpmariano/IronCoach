import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PlannedVsDone } from './WeeklyPlanCard';

const RX = { blocks: [{ type: 'forca', name: 'Extensões de pernas', sets: 3, reps: 12, goal: 'chegar às 12' }, { type: 'cardio', name: 'Bicicleta', duration_min: 20 }] };

describe('PlannedVsDone — Planeado / Feito de um treino concluído (F4b)', () => {
  it('mostra o planeado, o feito e o selo quando o treino foi livre e contado como o do plano', () => {
    render(<PlannedVsDone item={{ prescription: RX, completion_source: 'auto', execution_note: 'Treino livre, contado como o treino do plano. 1 de 2 exercícios cumpridos. ficou de fora: Bicicleta.' }} />);
    expect(screen.getByText('Ligado automaticamente')).toBeInTheDocument();
    expect(screen.getByText(/Extensões de pernas 3×12 \(chegar às 12\); Bicicleta 20 min/)).toBeInTheDocument();
    expect(screen.getByText(/ficou de fora: Bicicleta/)).toBeInTheDocument();
  });

  it('treino escolhido do plano: sem selo', () => {
    render(<PlannedVsDone item={{ prescription: RX, completion_source: 'plano', execution_note: '2 de 2 exercícios cumpridos.' }} />);
    expect(screen.queryByText('Ligado automaticamente')).not.toBeInTheDocument();
    expect(screen.getByText(/2 de 2 exercícios cumpridos/)).toBeInTheDocument();
  });

  it('plano antigo, sem prescrição nem nota: não mostra nada', () => {
    const { container } = render(<PlannedVsDone item={{ prescription: null, completion_source: null, execution_note: null }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('só o selo quando não há prescrição (corrida ligada automaticamente)', () => {
    render(<PlannedVsDone item={{ completion_source: 'auto' }} />);
    expect(screen.getByText('Ligado automaticamente')).toBeInTheDocument();
    expect(screen.queryByText('Planeado')).not.toBeInTheDocument();
  });
});
