import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import MealRegistration from './MealRegistration';

// analyze-meal é a única coisa que estes testes exercitam de facto —
// "Adicionar alimento" no manual é puramente local (sem chamadas ao
// servidor), só "Analisar Refeição" toca no Gemini, seja por foto ou manual.
// Editar não passa pelo Gemini — é só update direto de meals/meal_items.
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), updateMeal: vi.fn(), updateItem: vi.fn(), deleteItem: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'meals') {
        return { update: (payload) => ({ eq: (col, val) => mocks.updateMeal(payload, val) }) };
      }
      if (table === 'meal_items') {
        return {
          update: (payload) => ({ eq: (col, val) => mocks.updateItem(payload, val) }),
          delete: () => ({ eq: (col, val) => mocks.deleteItem(val) }),
        };
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

describe('MealRegistration — registo manual: adicionar é local, análise só no fim (analyze-meal)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, meals: [] });
  });

  const goManual = () => fireEvent.click(screen.getByRole('button', { name: 'Manual' }));

  const addItem = (name, grams) => {
    fireEvent.change(screen.getByPlaceholderText(/peito de frango grelhado/), { target: { value: name } });
    fireEvent.change(screen.getByPlaceholderText('g'), { target: { value: String(grams) } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar alimento' }));
  };

  it('"Adicionar alimento" só junta à lista local, sem chamar o Gemini/Coach', () => {
    render(<MealRegistration onClose={onClose} />);
    goManual();
    addItem('Peito de frango', 150);

    expect(screen.getByText('Peito de frango')).toBeInTheDocument();
    expect(screen.getByText('150g')).toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('permite adicionar e remover vários alimentos, sempre localmente', () => {
    render(<MealRegistration onClose={onClose} />);
    goManual();
    addItem('Arroz', 100);
    addItem('Feijão', 80);

    expect(screen.getByText('Arroz')).toBeInTheDocument();
    expect(screen.getByText('Feijão')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remover Arroz' }));
    expect(screen.queryByText('Arroz')).not.toBeInTheDocument();
    expect(screen.getByText('Feijão')).toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('ao "Analisar Refeição", envia todos os alimentos numa só chamada em modo manual', async () => {
    const finalMeal = { id: 'meal-2', coach_notes: 'Boa fonte de proteína.', meal_items: [{ id: 'item-1' }, { id: 'item-2' }] };
    mocks.invoke.mockResolvedValue({ data: { meal: finalMeal }, error: null });
    render(<MealRegistration onClose={onClose} />);
    goManual();
    fireEvent.click(screen.getByRole('button', { name: 'Almoço' }));
    addItem('Ovos', 100);
    addItem('Aveia', 40);

    fireEvent.click(screen.getByRole('button', { name: 'Analisar Refeição' }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-meal');
    expect(body.mode).toBe('manual');
    expect(body.meal_type).toBe('almoco');
    expect(body.items).toEqual([
      { name: 'Ovos', grams: 100 },
      { name: 'Aveia', grams: 40 },
    ]);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().meals).toEqual([finalMeal]);
  });

  it('mostra o erro da Edge Function e não fecha o formulário', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha a analisar a refeição.' });
    render(<MealRegistration onClose={onClose} />);
    goManual();
    addItem('Ovos', 100);

    fireEvent.click(screen.getByRole('button', { name: 'Analisar Refeição' }));

    await screen.findByText('Falha a analisar a refeição.');
    expect(onClose).not.toHaveBeenCalled();
    expect(useAppStore.getState().meals).toEqual([]);
  });

  it('não deixa finalizar sem nenhum alimento adicionado', () => {
    render(<MealRegistration onClose={onClose} />);
    goManual();

    expect(screen.getByRole('button', { name: 'Analisar Refeição' })).toBeDisabled();
  });
});

describe('MealRegistration — editar refeição existente: é só update dos campos, sem Coach', () => {
  const onClose = vi.fn();
  const loadInitialData = vi.fn().mockResolvedValue();
  const EXISTING_MEAL = {
    id: 'meal-3',
    date: '2026-01-10',
    meal_type: 'jantar',
    notes: 'nota antiga',
    meal_items: [
      { id: 'item-1', name: 'Arroz', quantity_grams: 100 },
      { id: 'item-2', name: 'Frango', quantity_grams: 150 },
    ],
  };

  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.updateMeal.mockReset().mockResolvedValue({ error: null });
    mocks.updateItem.mockReset().mockResolvedValue({ error: null });
    mocks.deleteItem.mockReset().mockResolvedValue({ error: null });
    onClose.mockClear();
    loadInitialData.mockClear();
    useAppStore.setState({ profile: PROFILE, meals: [EXISTING_MEAL], loadInitialData });
  });

  it('pré-preenche os campos e esconde o seletor Foto/Manual e o formulário de adicionar', () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);

    expect(screen.getByText('Editar Refeição')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jantar' })).toBeInTheDocument();
    expect(screen.queryByText('Como queres registar?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adicionar alimento' })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Arroz')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Frango')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar Alterações' })).toBeInTheDocument();
  });

  it('ao guardar, atualiza a refeição e os alimentos alterados, sem chamar o Gemini', async () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);

    fireEvent.change(screen.getByDisplayValue('100'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Alterações' }));

    await waitFor(() => expect(mocks.updateMeal).toHaveBeenCalledTimes(1));
    const [mealPayload, mealId] = mocks.updateMeal.mock.calls[0];
    expect(mealId).toBe('meal-3');
    expect(mealPayload).toEqual({ date: '2026-01-10', meal_type: 'jantar', notes: 'nota antiga' });

    await waitFor(() => expect(mocks.updateItem).toHaveBeenCalledTimes(2));
    const arrozCall = mocks.updateItem.mock.calls.find(([, id]) => id === 'item-1');
    expect(arrozCall[0]).toEqual({ name: 'Arroz', quantity_grams: 120 });

    expect(mocks.deleteItem).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
    await waitFor(() => expect(loadInitialData).toHaveBeenCalledWith('user-1'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('remover um alimento apaga-o ao guardar', async () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);

    fireEvent.click(screen.getByRole('button', { name: 'Remover Frango' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Alterações' }));

    await waitFor(() => expect(mocks.deleteItem).toHaveBeenCalledWith('item-2'));
    expect(mocks.updateItem).toHaveBeenCalledTimes(1);
    expect(mocks.updateItem.mock.calls[0][1]).toBe('item-1');
  });
});
