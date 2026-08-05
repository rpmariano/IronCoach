import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import MealRegistration from './MealRegistration';

// analyze-meal é a única coisa que estes testes exercitam de facto — o
// resto do supabase (insert/delete de meals e meal_items usados só pelo
// caminho manual) fica com stubs inertes.
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), insertMeal: vi.fn(), deleteMealItem: vi.fn(), deleteMeal: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'meals') {
        return {
          insert: (payload) => ({ select: () => ({ single: () => mocks.insertMeal(payload) }) }),
          delete: () => ({ eq: (col, val) => mocks.deleteMeal(val) }),
        };
      }
      if (table === 'meal_items') {
        return { delete: () => ({ eq: (col, val) => mocks.deleteMealItem(val) }) };
      }
      return {};
    },
  },
  invokeEdgeFunctionWithTimeout: (...args) => mocks.invoke(...args),
}));

// Evita FileReader/Image/canvas do jsdom — a compressão em si já está fora
// deste ficheiro, em src/lib/image.js.
vi.mock('../../lib/image', () => ({
  compressImage: () => Promise.resolve({ dataUrl: 'data:image/jpeg;base64,AAA', base64: 'AAA' }),
}));

const PROFILE = { id: 'user-1' };

const selectPhoto = async () => {
  const input = document.querySelector('input[type="file"]');
  const file = new File(['conteudo'], 'refeicao.jpg', { type: 'image/jpeg' });
  await fireEvent.change(input, { target: { files: [file] } });
  await screen.findByAltText('Foto 1');
};

describe('MealRegistration — Analisar Refeição por foto (analyze-meal)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.insertMeal.mockReset();
    mocks.deleteMealItem.mockReset();
    mocks.deleteMeal.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, meals: [] });
  });

  it('envia o payload correto (imagens, data, tipo de refeição, observações)', async () => {
    mocks.invoke.mockResolvedValue({ data: { meal: { id: 'meal-1' }, items: [] }, error: null });
    render(<MealRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Almoço' }));
    fireEvent.change(screen.getByPlaceholderText(/Detalhes que mudam os valores/), { target: { value: 'Big Mac' } });
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Refeição/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-meal');
    expect(body.images).toEqual(['AAA']);
    expect(body.mime_type).toBe('image/jpeg');
    expect(body.meal_type).toBe('almoco');
    expect(body.notes).toBe('Big Mac');
  });

  it('acrescenta a refeição devolvida (meal + items combinados) ao store e fecha o formulário', async () => {
    const newMeal = { id: 'meal-1', coach_notes: 'Boa proporção de proteína.' };
    const items = [{ id: 'item-1', name: 'Frango' }];
    mocks.invoke.mockResolvedValue({ data: { meal: newMeal, items }, error: null });
    render(<MealRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Refeição/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().meals).toEqual([{ ...newMeal, meal_items: items }]);
  });

  it('mostra o erro da Edge Function e não fecha o formulário', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha na análise.' });
    render(<MealRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Refeição/ }));

    await screen.findByText('Falha na análise.');
    expect(onClose).not.toHaveBeenCalled();
    expect(useAppStore.getState().meals).toEqual([]);
  });
});

describe('MealRegistration — cartão único: alternar entre Foto e Manual', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.insertMeal.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, meals: [] });
  });

  it('mostra o upload de fotos por omissão e esconde os campos manuais', () => {
    render(<MealRegistration onClose={onClose} />);
    expect(screen.getByText(/Podes juntar várias fotos/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/peito de frango grelhado/)).not.toBeInTheDocument();
  });

  it('ao escolher Manual, esconde o upload e mostra o formulário de alimentos', () => {
    render(<MealRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Manual' }));

    expect(screen.queryByText(/Podes juntar várias fotos/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/peito de frango grelhado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analisar Refeição' })).toBeInTheDocument();
  });
});

describe('MealRegistration — registo manual também passa pelo Coach (analyze-meal)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.insertMeal.mockReset();
    mocks.deleteMealItem.mockReset();
    mocks.deleteMeal.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, meals: [] });
  });

  const goManual = () => fireEvent.click(screen.getByRole('button', { name: 'Manual' }));

  it('cria a refeição vazia no primeiro alimento e estima-o via analyze-meal', async () => {
    mocks.insertMeal.mockResolvedValue({ data: { id: 'meal-2' }, error: null });
    mocks.invoke.mockResolvedValue({
      data: { item: { id: 'item-1', name: 'Peito de frango', quantity_grams: 150, calories_per_100g: 165, protein_per_100g: 31, carbs_per_100g: 0, fat_per_100g: 3.6 } },
      error: null,
    });
    render(<MealRegistration onClose={onClose} />);
    goManual();
    fireEvent.change(screen.getByPlaceholderText(/peito de frango grelhado/), { target: { value: 'Peito de frango' } });
    fireEvent.change(screen.getByPlaceholderText('g'), { target: { value: '150' } });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar alimento' }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect(mocks.insertMeal).toHaveBeenCalledTimes(1);
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-meal');
    expect(body.meal_id).toBe('meal-2');
    expect(body.item_name).toBe('Peito de frango');
    expect(body.item_grams).toBe(150);
    await screen.findByText(/Peito de frango/);
  });

  it('só cria a refeição uma vez ao adicionar um segundo alimento', async () => {
    mocks.insertMeal.mockResolvedValue({ data: { id: 'meal-2' }, error: null });
    mocks.invoke.mockResolvedValue({
      data: { item: { id: 'item-1', name: 'Arroz', quantity_grams: 100, calories_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fat_per_100g: 0.3 } },
      error: null,
    });
    render(<MealRegistration onClose={onClose} />);
    goManual();

    fireEvent.change(screen.getByPlaceholderText(/peito de frango grelhado/), { target: { value: 'Arroz' } });
    fireEvent.change(screen.getByPlaceholderText('g'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar alimento' }));
    await screen.findByText(/Arroz/);

    mocks.invoke.mockResolvedValue({
      data: { item: { id: 'item-2', name: 'Feijão', quantity_grams: 80, calories_per_100g: 130, protein_per_100g: 9, carbs_per_100g: 20, fat_per_100g: 0.5 } },
      error: null,
    });
    fireEvent.change(screen.getByPlaceholderText(/peito de frango grelhado/), { target: { value: 'Feijão' } });
    fireEvent.change(screen.getByPlaceholderText('g'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar alimento' }));
    await screen.findByText(/Feijão/);

    expect(mocks.insertMeal).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it('ao finalizar, chama analyze-meal em modo finalize e fecha com a refeição completa', async () => {
    mocks.insertMeal.mockResolvedValue({ data: { id: 'meal-2' }, error: null });
    mocks.invoke.mockResolvedValueOnce({
      data: { item: { id: 'item-1', name: 'Ovos', quantity_grams: 100, calories_per_100g: 155, protein_per_100g: 13, carbs_per_100g: 1, fat_per_100g: 11 } },
      error: null,
    });
    render(<MealRegistration onClose={onClose} />);
    goManual();
    fireEvent.change(screen.getByPlaceholderText(/peito de frango grelhado/), { target: { value: 'Ovos' } });
    fireEvent.change(screen.getByPlaceholderText('g'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar alimento' }));
    await screen.findByText(/Ovos/);

    const finalMeal = { id: 'meal-2', coach_notes: 'Boa fonte de proteína ao pequeno-almoço.', meal_items: [{ id: 'item-1' }] };
    mocks.invoke.mockResolvedValueOnce({ data: { meal: finalMeal }, error: null });

    fireEvent.click(screen.getByRole('button', { name: 'Analisar Refeição' }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(2));
    const [fnName, { body }] = mocks.invoke.mock.calls[1];
    expect(fnName).toBe('analyze-meal');
    expect(body.mode).toBe('finalize');
    expect(body.meal_id).toBe('meal-2');

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().meals).toEqual([finalMeal]);
  });

  it('não deixa finalizar sem nenhum alimento adicionado', () => {
    render(<MealRegistration onClose={onClose} />);
    goManual();

    expect(screen.getByRole('button', { name: 'Analisar Refeição' })).toBeDisabled();
  });
});
