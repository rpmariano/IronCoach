import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import CarolQuestions, { openCarolQuestions, learnedLine } from './CarolQuestions';
import MealCard from './MealCard';

/* Bug #52 (fase B): a Carol pergunta em vez de adivinhar — no ecrã do
   resultado e, enquanto houver alguma por responder, no cartão da refeição. */

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => ({}), storage: { from: () => ({}) } },
  invokeEdgeFunctionWithTimeout: (...args) => mocks.invoke(...args),
}));

const Q1 = { id: 'q1', topic: 'fritos', item_name: 'Ovo estrelado', question: 'Os ovos foram estrelados em quê?', options: ['Azeite', 'Manteiga', 'Óleo'], assumed: 'Azeite', impact_kcal: 90, answer: null };
const Q2 = { id: 'q2', topic: 'salada', item_name: 'Salada mista', question: 'A salada tinha tempero?', options: ['Azeite e vinagre', 'Sem tempero'], assumed: 'Azeite e vinagre', impact_kcal: 70, answer: null };
const MEAL = { id: 'm1', date: '2026-10-04', meal_type: 'almoco', meal_items: [], carol_questions: [Q1, Q2] };

describe('CarolQuestions', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    useAppStore.setState({ meals: [MEAL] });
  });

  it('diz quantas são, quanto podem mudar e o que ela assumiu', () => {
    render(<CarolQuestions meal={MEAL} />);
    expect(screen.getByText(/duas perguntas/)).toBeInTheDocument();
    expect(screen.getByText('160 kcal')).toBeInTheDocument();
    expect(screen.getByText('Assumi azeite.')).toBeInTheDocument();
    expect(screen.getByTestId('carol-questions-submit')).toBeDisabled();
  });

  it('responde com um toque: manda só as escolhidas, atualiza a refeição e diz o que aprendeu', async () => {
    const updated = { ...MEAL, carol_questions: [{ ...Q1, answer: 'Manteiga' }, Q2] };
    mocks.invoke.mockResolvedValue({ data: { meal: updated, learned: [{ topic: 'fritos', value: 'Manteiga', status: 'por_confirmar' }] }, error: null });
    const onAnswered = vi.fn();
    render(<CarolQuestions meal={MEAL} onAnswered={onAnswered} />);

    fireEvent.click(screen.getByRole('button', { name: 'Manteiga' }));
    expect(screen.getByRole('button', { name: 'Manteiga' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('carol-questions-submit'));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fn, { body }] = mocks.invoke.mock.calls[0];
    expect(fn).toBe('analyze-meal');
    expect(body).toEqual({ mode: 'answer', meal_id: 'm1', answers: [{ id: 'q1', answer: 'Manteiga' }] });
    await screen.findByTestId('carol-questions-done');
    expect(screen.getByText(/Se da próxima vez também for, deixo de perguntar/)).toBeInTheDocument();
    expect(useAppStore.getState().meals[0]).toBe(updated);
    expect(onAnswered).toHaveBeenCalledWith(updated, expect.any(Array));
  });

  /* Convenção única dos botões da Carol (2026-10-05): "Responder" é o
     primário dela (gradiente, tinta --coach-ink); "Agora não" fecha sem
     responder e as perguntas ficam. */
  it('"Responder" no gradiente da Carol; "Agora não" só fecha, sem mandar nada', () => {
    const onLater = vi.fn();
    render(<CarolQuestions meal={MEAL} onLater={onLater} />);
    const responder = screen.getByTestId('carol-questions-submit');
    expect(responder.getAttribute('style')).toContain('--grad-coach-legible');
    expect(responder.getAttribute('style')).toContain('--coach-ink');
    const agoraNao = screen.getByTestId('carol-questions-later');
    expect(agoraNao).toHaveTextContent('Agora não');
    fireEvent.click(agoraNao);
    expect(onLater).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('sem quem a feche (onLater), não há "Agora não"', () => {
    render(<CarolQuestions meal={MEAL} />);
    expect(screen.queryByTestId('carol-questions-later')).not.toBeInTheDocument();
  });

  it('"Outro…" abre um campo e manda o que lá se escreve', async () => {
    mocks.invoke.mockResolvedValue({ data: { meal: MEAL, learned: [] }, error: null });
    render(<CarolQuestions meal={MEAL} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Outro…' })[0]);
    fireEvent.change(screen.getByLabelText(/Outra resposta: Os ovos/), { target: { value: 'Banha' } });
    fireEvent.click(screen.getByTestId('carol-questions-submit'));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalled());
    expect(mocks.invoke.mock.calls[0][1].body.answers).toEqual([{ id: 'q1', answer: 'Banha' }]);
  });

  it('uma falha diz-se e deixa tentar outra vez', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Rede em baixo.' });
    render(<CarolQuestions meal={MEAL} />);
    fireEvent.click(screen.getByRole('button', { name: 'Óleo' }));
    fireEvent.click(screen.getByTestId('carol-questions-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Rede em baixo.');
    expect(screen.getByTestId('carol-questions-submit')).toBeEnabled();
  });

  it('as frases do que ficou: anotado, guardado, varia', () => {
    expect(learnedLine({ topic: 'salada', value: 'azeite e vinagre', status: 'confirmado' })).toMatch(/Guardei.*Não volto a perguntar/);
    expect(learnedLine({ topic: 'batata', value: 'frita', status: 'varia' })).toMatch(/continuo a perguntar/);
    expect(openCarolQuestions({ carol_questions: [Q1, { ...Q2, answer: 'Sem tempero' }] })).toEqual([Q1]);
    expect(openCarolQuestions({})).toEqual([]);
  });
});

describe('MealCard — perguntas por responder', () => {
  beforeEach(() => useAppStore.setState({ meals: [MEAL], profile: { id: 'u1' } }));

  it('mostra quantas faltam com o cartão fechado, e abre-as', () => {
    render(<MealCard meal={MEAL} />);
    const chip = screen.getByTestId('meal-card-questions');
    expect(chip).toHaveTextContent('A Carol tem 2 perguntas');
    expect(chip).toHaveTextContent('até 160 kcal');
    fireEvent.click(chip);
    expect(screen.getByTestId('carol-questions')).toBeInTheDocument();
    // "Agora não" fecha a persiana; as perguntas ficam no cartão.
    fireEvent.click(screen.getByTestId('carol-questions-later'));
    expect(screen.queryByTestId('carol-questions')).not.toBeInTheDocument();
    expect(screen.getByTestId('meal-card-questions')).toBeInTheDocument();
  });

  it('sem perguntas abertas, ou no pré-visualizar do resultado, não aparece', () => {
    const { unmount } = render(<MealCard meal={{ ...MEAL, carol_questions: [{ ...Q1, answer: 'Azeite' }] }} />);
    expect(screen.queryByTestId('meal-card-questions')).not.toBeInTheDocument();
    unmount();
    render(<MealCard meal={MEAL} hideActions />);
    expect(screen.queryByTestId('meal-card-questions')).not.toBeInTheDocument();
  });
});
