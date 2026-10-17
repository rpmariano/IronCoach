import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

  it('até 5 perguntas, contadas por extenso, e a proteína entra no que podem mudar (bugs #58/#66)', () => {
    const fiambre = { id: 'q3', topic: 'fiambre', item_name: 'Fiambre de peru', question: 'As fatias eram de que espessura?', options: ['Finas', 'Médias'], assumed: 'Médias', impact_kcal: 17, impact_protein_g: 4.2, answer: null };
    const meal = { ...MEAL, carol_questions: [Q1, Q2, fiambre] };
    render(<CarolQuestions meal={meal} />);
    expect(screen.getByText(/três perguntas/)).toBeInTheDocument();
    expect(screen.getByText('177 kcal e 4,2 g de proteína')).toBeInTheDocument();
    expect(screen.getByText('± 17 kcal · 4,2 g prot.')).toBeInTheDocument();
    expect(screen.getByText('± 90 kcal')).toBeInTheDocument();
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

  it('numa pergunta de quantidade, "Outro…" sugere escrever as gramas (fase B dos #58/#66)', () => {
    const manteiga = { id: 'q3', kind: 'quantidade', topic: 'manteiga · quantidade', item_name: 'Manteiga', question: 'Quanta manteiga levou o pão?', options: ['Camada fina (~5 g)', 'Camada grossa (~15 g)'], assumed: 'Camada grossa (~15 g)', impact_kcal: 70, answer: null };
    render(<CarolQuestions meal={{ ...MEAL, carol_questions: [manteiga] }} />);
    expect(screen.getByText('Assumi camada grossa (~15 g).')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    expect(screen.getByLabelText(/Outra resposta: Quanta manteiga/)).toHaveAttribute('placeholder', 'ex.: 20 g, ou "duas fatias grossas"');
  });

  it('numa pergunta de preparação, "Outro…" não sugere gramas', () => {
    render(<CarolQuestions meal={MEAL} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Outro…' })[0]);
    expect(screen.getByLabelText(/Outra resposta: Os ovos/)).not.toHaveAttribute('placeholder');
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

describe('MealCard — guardar como refeição (fase 2 do #63)', () => {
  beforeEach(() => useAppStore.setState({ meals: [], profile: { id: 'u1' }, pantryFoods: [] }));

  it('abre a ficha da refeição predefinida já com o tipo e os alimentos com as gramas', () => {
    const meal = { id: 'm2', date: '2026-10-04', meal_type: 'almoco', carol_questions: null, meal_items: [
      { id: 'i1', name: 'Arroz basmati', quantity_grams: 150, calories_per_100g: 130 },
      { id: 'i2', name: 'Peito de frango', quantity_grams: 120, calories_per_100g: 165 },
    ] };
    render(<MealCard meal={meal} defaultExpanded onEdit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Guardar como refeição/ }));
    const ficha = screen.getByTestId('meal-template-sheet');
    // Nome com o 1.º alimento: só "Almoço" colidia à segunda vez (nome único).
    expect(within(ficha).getByLabelText(/^Nome/)).toHaveValue('Almoço · Arroz basmati');
    expect(within(ficha).getByRole('button', { name: 'Almoço' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(ficha).getByLabelText('Gramas de Arroz basmati')).toHaveValue(150);
    expect(within(ficha).getByLabelText('Gramas de Peito de frango')).toHaveValue(120);
  });

  it('sem alimentos não há botão; na pré-visualização também não', () => {
    const vazia = { id: 'm3', date: '2026-10-04', meal_type: 'jantar', meal_items: [] };
    const { unmount } = render(<MealCard meal={vazia} defaultExpanded />);
    expect(screen.queryByRole('button', { name: /Guardar como refeição/ })).not.toBeInTheDocument();
    unmount();
    render(<MealCard meal={{ ...vazia, meal_items: [{ id: 'i', name: 'Sopa', quantity_grams: 300 }] }} defaultExpanded hideActions />);
    expect(screen.queryByRole('button', { name: /Guardar como refeição/ })).not.toBeInTheDocument();
  });
});
