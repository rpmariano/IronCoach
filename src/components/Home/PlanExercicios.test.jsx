import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import { todayISO, addDaysISO } from '../../lib/utils';
import DayPlanCard from './DayPlanCard';
import { PlanDayCard } from './WeeklyPlanCard';
import PlanoScreen from './PlanoScreen';
import PrescriptionExercises from '../shared/PrescriptionExercises';

/* Os exercícios que a Carol prescreve num treino de ginásio (prescription.blocks) têm de se ver
   onde o treino aparece: o dia aberto / a folha da proposta, «O que faço hoje» e «O plano». */

const today = todayISO();
const prescription = { blocks: [
  { type: 'forca', name: 'Cadeira extensora', sets: 3, reps: 12, goal: 'descida em 2 s, RPE 7' },
  { type: 'forca', name: 'Leg press', sets: 3, reps: 10, goal: 'sem bloquear os joelhos' },
  { type: 'cardio', name: 'Bicicleta', duration_min: 10, goal: 'Z2' },
  { type: 'forca', name: 'Gémeos', sets: 4, reps: 15, goal: null },
] };
const gym = (over = {}) => ({
  id: 'g1', plan_id: 'p1', planned_date: today, kind: 'ginasio', categories: ['Pernas'], status: 'pendente',
  notes: 'Foco na descida.', prescription, ...over,
});

describe('PrescriptionExercises', () => {
  it('lista: nome, séries×reps (ou duração) e objetivo', () => {
    render(<PrescriptionExercises prescription={prescription} />);
    const itens = screen.getAllByTestId('plan-exercicios-item');
    expect(itens).toHaveLength(4);
    expect(itens[0]).toHaveTextContent('Cadeira extensora');
    expect(itens[0]).toHaveTextContent('3×12');
    expect(itens[0]).toHaveTextContent('descida em 2 s, RPE 7');
    expect(itens[2]).toHaveTextContent('Bicicleta');
    expect(itens[2]).toHaveTextContent('10 min');
    expect(itens[3]).toHaveTextContent('4×15');
  });

  it('resumo: uma linha que abre a lista', () => {
    render(<PrescriptionExercises prescription={prescription} resumo />);
    expect(screen.getByText('4 exercícios: Cadeira extensora, Leg press, Bicicleta e mais 1')).toBeInTheDocument();
  });

  it('sem prescrição não desenha nada', () => {
    const { container } = render(<PrescriptionExercises prescription={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PlanDayCard (dia aberto, folha da proposta) — exercícios do ginásio', () => {
  const props = { dateISO: today, dayNumber: 1, isToday: false, isOverdue: false, onComplete: () => {}, onCancel: () => {}, expanded: true, readOnly: true };

  it('mostra os exercícios, e a nota geral continua lá', () => {
    render(<PlanDayCard {...props} items={[gym()]} />);
    const sec = screen.getByTestId('wpc-exercicios');
    expect(within(sec).getAllByTestId('wpc-exercicios-item')).toHaveLength(4);
    expect(screen.getByText('Foco na descida.')).toBeInTheDocument();
  });

  it('um treino de ginásio sem prescrição fica como antes (só a nota)', () => {
    render(<PlanDayCard {...props} items={[gym({ prescription: null })]} />);
    expect(screen.queryByTestId('wpc-exercicios')).not.toBeInTheDocument();
    expect(screen.getByText('Foco na descida.')).toBeInTheDocument();
  });
});

describe('DayPlanCard (O que faço hoje) — exercícios do ginásio', () => {
  const plan = { id: 'p1', status: 'aceite', period_start: today, period_end: today };
  const renderCard = (items) => render(<DayPlanCard plans={[plan]} planItems={items} raceEvents={[]} onComplete={vi.fn()} />);

  it('o resumo está à vista e a gaveta mostra a lista completa', () => {
    renderCard([gym()]);
    const resumo = screen.getByTestId('day-plan-exercicios-resumo');
    expect(resumo).toHaveTextContent('4 exercícios: Cadeira extensora, Leg press, Bicicleta e mais 1');
    expect(screen.queryByTestId('day-plan-exercicios')).not.toBeInTheDocument();
    fireEvent.click(resumo);
    expect(screen.getByTestId('day-plan-detail-toggle')).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByTestId('day-plan-exercicios')).getAllByTestId('day-plan-exercicios-item')).toHaveLength(4);
    expect(screen.getByTestId('day-plan-notes')).toHaveTextContent('Foco na descida.');
  });

  it('a gaveta existe mesmo sem nota, só com os exercícios', () => {
    renderCard([gym({ notes: null })]);
    fireEvent.click(screen.getByTestId('day-plan-detail-toggle'));
    expect(screen.getByTestId('day-plan-exercicios')).toBeInTheDocument();
  });

  it('o resumo alterna a gaveta (aria-expanded) e fecha-a ao segundo toque', () => {
    renderCard([gym()]);
    const resumo = screen.getByTestId('day-plan-exercicios-resumo');
    expect(resumo).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(resumo);
    expect(resumo).toHaveAttribute('aria-expanded', 'true');
    expect(resumo).toHaveAttribute('aria-controls', screen.getByTestId('day-plan-detail').id);
    fireEvent.click(resumo);
    expect(screen.queryByTestId('day-plan-detail')).not.toBeInTheDocument();
  });

  it('treino concluído: a gaveta mostra o que estava previsto; cancelado: nem resumo nem lista', () => {
    const { unmount } = renderCard([gym({ status: 'concluido' })]);
    expect(screen.queryByTestId('day-plan-exercicios-resumo')).not.toBeInTheDocument();
    unmount();
    renderCard([gym({ status: 'cancelado' })]);
    expect(screen.queryByTestId('day-plan-exercicios-resumo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('day-plan-exercicios')).not.toBeInTheDocument();
  });

  it('sem prescrição: sem resumo', () => {
    renderCard([gym({ prescription: null })]);
    expect(screen.queryByTestId('day-plan-exercicios-resumo')).not.toBeInTheDocument();
  });
});

describe('PlanoScreen — exercícios do ginásio', () => {
  const monday = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    return addDaysISO(today, -((d.getUTCDay() + 6) % 7));
  })();
  beforeEach(() => {
    useAppStore.setState({
      coachPlans: [{ id: 'p1', status: 'aceite', period_start: monday, period_end: addDaysISO(monday, 6) }],
      coachPlanItems: [gym()], raceEvents: [],
    });
  });

  it('cada dia de ginásio tem o resumo, que abre a lista', () => {
    render(<PlanoScreen onClose={() => {}} />);
    const dia = screen.getByTestId(`plano-dia-${today}`);
    expect(within(dia).getByText(/4 exercícios: Cadeira extensora/)).toBeInTheDocument();
    expect(within(dia).getAllByTestId('plano-exercicios-g1-item')).toHaveLength(4);
  });
});
