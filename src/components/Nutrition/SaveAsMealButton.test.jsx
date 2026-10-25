import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Bug #83: "Guardar como refeição" não pode aparecer numa refeição que já é
   uma predefinida. O Supabase rebenta se for chamado: a despensa vem do store. */
vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn(() => { throw new Error('sem rede nos testes'); }), rpc: vi.fn(() => { throw new Error('sem rede nos testes'); }) },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));
vi.mock('../Pantry/MealTemplateSheet', () => ({ default: () => <div data-testid="sheet" /> }));

const { useAppStore } = await import('../../store');
const { default: SaveAsMealButton } = await import('./SaveAsMealButton');

const MEAL = { meal_type: 'pequeno-almoco', meal_items: [{ name: 'Aveia em flocos', quantity_grams: 60 }, { name: 'Iogurte grego 0%', quantity_grams: 150 }] };
const TEMPLATE = { id: 't1', name: 'Pequeno-almoço de treino', items: [{ name: 'Iogurte grego 0%', grams: 170 }, { name: 'Aveia em flocos', grams: 40 }] };

beforeEach(() => {
  useAppStore.setState({ mealTemplates: [], pantryLoaded: true, loadPantry: vi.fn() });
});

describe('SaveAsMealButton', () => {
  it('sem predefinida igual mostra o botão', () => {
    render(<SaveAsMealButton meal={MEAL} />);
    expect(screen.getByRole('button', { name: /Guardar como refeição/ })).toBeInTheDocument();
  });

  it('com uma predefinida com os mesmos alimentos (gramas diferentes) mostra «Guardada como», sem botão', () => {
    useAppStore.setState({ mealTemplates: [TEMPLATE] });
    render(<SaveAsMealButton meal={MEAL} />);
    expect(screen.getByTestId('meal-already-saved')).toHaveTextContent('Guardada como «Pequeno-almoço de treino»');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('se os alimentos mudaram, o botão volta', () => {
    useAppStore.setState({ mealTemplates: [TEMPLATE] });
    render(<SaveAsMealButton meal={{ ...MEAL, meal_items: [...MEAL.meal_items, { name: 'Banana', quantity_grams: 100 }] }} />);
    expect(screen.getByRole('button', { name: /Guardar como refeição/ })).toBeInTheDocument();
  });

  it('despensa por ler: pede-a ao store', () => {
    const loadPantry = vi.fn();
    useAppStore.setState({ pantryLoaded: false, loadPantry });
    render(<SaveAsMealButton meal={MEAL} />);
    expect(loadPantry).toHaveBeenCalled();
  });

  it('sem alimentos não aparece nada', () => {
    const { container } = render(<SaveAsMealButton meal={{ meal_items: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
