import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import MealCard from './MealCard';
import { setDesignV2 } from '../../utils/designV2';

/* O cartão da refeição no Design v2 (MealCardV2): a linha plana, a Carol numa linha com «Ler
   mais», «Ver tudo» com o resto, Editar/Eliminar discretos com a confirmação de sempre. Os mocks
   são os de CarolQuestions.test.jsx, mais o eliminar e as fotografias. */
vi.setConfig({ testTimeout: 15000 });

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), del: vi.fn(), signed: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => ({ delete: () => ({ eq: (col, val) => mocks.del(table, col, val) }) }),
    storage: { from: () => ({ createSignedUrls: (...a) => mocks.signed(...a) }) },
  },
  invokeEdgeFunctionWithTimeout: (...args) => mocks.invoke(...args),
}));

const Q1 = { id: 'q1', topic: 'fritos', item_name: 'Ovo estrelado', question: 'Os ovos foram estrelados em quê?', options: ['Azeite', 'Manteiga'], assumed: 'Azeite', impact_kcal: 90, answer: null };
const LONG = 'Boa refeição para o treino de amanhã. A proteína está no sítio e os hidratos chegam para a corrida longa. Junta uma peça de fruta ao lanche.';
const MEAL = {
  id: 'm1', date: '2026-10-04', meal_time: '13:05', meal_type: 'almoco', notes: 'Caseiro',
  coach_notes: LONG, carol_questions: null,
  meal_items: [
    { id: 'i1', name: 'Frango', quantity_grams: 200, calories_per_100g: 165, protein_per_100g: 31, carbs_per_100g: 0, fat_per_100g: 4 },
    { id: 'i2', name: 'Arroz', quantity_grams: 150, calories_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fat_per_100g: 0.3 },
  ],
};

describe('MealCard — Design v2', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.del.mockReset().mockResolvedValue({ error: null });
    mocks.signed.mockReset().mockImplementation((paths) => Promise.resolve({ data: paths.map((p) => ({ signedUrl: `https://signed/${p}` })), error: null }));
    useAppStore.setState({ meals: [MEAL], profile: { id: 'u1' }, loadInitialData: vi.fn().mockResolvedValue(), pantryUserId: 'u1', pantryLoaded: true, pantryFoods: [], mealTemplates: [] });
    act(() => setDesignV2(true));
  });
  afterEach(() => act(() => setDesignV2(false)));

  it('a linha plana: ponto, tipo, título, hora, kcal e proteína', () => {
    render(<MealCard meal={MEAL} />);
    const card = screen.getByTestId('meal-card-v2');
    expect(card.querySelector('.v2-dot').getAttribute('style')).toContain('--nutrition');
    expect(within(card).getByText('Refeição')).toBeInTheDocument();
    expect(within(card).getByRole('heading', { name: 'Almoço' })).toBeInTheDocument();
    expect(screen.getByTestId('meal-card-v2-time')).toHaveTextContent('04/10/2026 · 13:05');
    // 330 + 195 kcal; a proteína como o mealNutrients a soma
    expect(screen.getByTestId('meal-card-v2-kcal')).toHaveTextContent('525 kcal');
    expect(screen.getByTestId('meal-card-v2-protein')).toHaveTextContent('66 g proteína');
    expect(screen.queryByTestId('meal-card-v2-details')).not.toBeInTheDocument();
  });

  it('a Carol numa linha, e «Ler mais» abre no sítio', () => {
    render(<MealCard meal={MEAL} />);
    const carol = screen.getByTestId('meal-card-v2-carol');
    expect(carol).toHaveClass('v2-say');
    const toggle = screen.getByTestId('meal-card-v2-carol-toggle');
    expect(toggle).toHaveTextContent('Ler mais');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveTextContent('Ler menos');
    expect(carol.querySelector('.coach-text')).not.toBeNull();
  });

  it('«Ver tudo» mostra os macros, as observações e os alimentos', () => {
    render(<MealCard meal={MEAL} onEdit={() => {}} />);
    const more = screen.getByTestId('meal-card-v2-more');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const det = screen.getByTestId('meal-card-v2-details');
    expect(within(det).getByText('Hidratos')).toBeInTheDocument();
    expect(within(det).getByText(/Caseiro/)).toBeInTheDocument();
    const items = within(screen.getByTestId('meal-card-v2-items')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Frango');
    expect(items[0]).toHaveTextContent('200 g');
    expect(within(det).getByRole('button', { name: /Guardar como refeição/ })).toBeInTheDocument();
  });

  it('Editar chama onEdit; Eliminar pede a confirmação de sempre e apaga', async () => {
    const onEdit = vi.fn();
    render(<MealCard meal={MEAL} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(onEdit).toHaveBeenCalledWith('m1');

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar refeição' }));
    expect(screen.getByText('Tem a certeza que deseja eliminar esta refeição? Esta ação não pode ser desfeita.')).toBeInTheDocument();
    expect(mocks.del).not.toHaveBeenCalled();
    const dialogBtns = screen.getAllByRole('button', { name: 'Eliminar' });
    fireEvent.click(dialogBtns[dialogBtns.length - 1]);
    await waitFor(() => expect(mocks.del).toHaveBeenCalledWith('meals', 'id', 'm1'));
    await waitFor(() => expect(useAppStore.getState().loadInitialData).toHaveBeenCalledWith('u1'));
  });

  it('hideActions esconde Editar, Eliminar, as perguntas e guardar; defaultExpanded abre a análise toda', () => {
    render(<MealCard meal={{ ...MEAL, carol_questions: [Q1] }} onEdit={() => {}} defaultExpanded hideActions />);
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('meal-card-questions')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Guardar como refeição/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('meal-card-v2-details')).toBeInTheDocument();
    expect(screen.getByTestId('meal-card-v2-carol-toggle')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('meal-card-v2-carol').querySelector('.coach-text')).not.toBeNull();
  });

  it('as perguntas por responder continuam à vista e abrem-se', () => {
    render(<MealCard meal={{ ...MEAL, carol_questions: [Q1] }} />);
    const chip = screen.getByTestId('meal-card-questions');
    expect(chip).toHaveTextContent('A Carol tem 1 pergunta');
    fireEvent.click(chip);
    expect(screen.getByText('Perguntas da Carol')).toBeInTheDocument();
  });

  it('as fotografias são miniaturas que abrem a mesma imagem (o link de sempre)', async () => {
    render(<MealCard meal={{ ...MEAL, photo_paths: ['u1/a.jpg', 'u1/b.jpg'] }} />);
    expect(mocks.signed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('meal-card-v2-more'));
    const links = await screen.findAllByRole('link', { name: /Abrir fotografia/ });
    expect(mocks.signed).toHaveBeenCalledWith(['u1/a.jpg', 'u1/b.jpg'], 3600);
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', 'https://signed/u1/a.jpg');
    expect(links[0]).toHaveAttribute('target', '_blank');
  });

  it('com o v2 desligado volta o cartão de sempre', () => {
    act(() => setDesignV2(false));
    render(<MealCard meal={MEAL} defaultExpanded />);
    expect(screen.queryByTestId('meal-card-v2')).not.toBeInTheDocument();
    expect(screen.getByTestId('macro-kcal')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar detalhes da refeição' })).toBeInTheDocument();
  });
});
