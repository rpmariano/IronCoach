import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import PantrySection from './PantrySection';

/* Bugs #48/#52, fase C: a despensa no Armário do Perfil (mockup "Despensa e
   perguntas da Carol", ecrãs 6 a 9). */

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), calls: [] }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      const chain = {
        upsert: (row, opts) => { mocks.calls.push({ table, op: 'upsert', row, opts }); return chain; },
        update: (row) => { mocks.calls.push({ table, op: 'update', row }); return chain; },
        delete: () => { mocks.calls.push({ table, op: 'delete' }); return chain; },
        eq: () => chain,
        select: () => chain,
        single: () => Promise.resolve({ data: { id: 'novo' }, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (resolve) => resolve({ error: null }),
      };
      return chain;
    },
  },
  invokeEdgeFunctionWithTimeout: (...args) => mocks.invoke(...args),
}));
vi.mock('../../lib/image', () => ({ compressImage: () => Promise.resolve({ dataUrl: 'x', base64: 'AAA' }) }));

const FOODS = [
  { id: 'a', name: 'Aveia em flocos', name_key: 'aveia em flocos', times_seen: 5, portion_grams: 40, calories_per_100g: 372, protein_per_100g: 13, carbs_per_100g: 60, fat_per_100g: 7 },
  { id: 'i', name: 'Iogurte grego 0%', name_key: 'iogurte grego 0%', times_seen: 6, portion_grams: 170, calories_per_100g: 59, protein_per_100g: 10, carbs_per_100g: 3.6, fat_per_100g: 0.4 },
];
const RULES = [
  { id: 'r1', topic: 'fritos', value: 'azeite', status: 'confirmado', source: 'resposta', confirmations: 3 },
  { id: 'r2', topic: 'batata', value: 'cozida', status: 'varia', source: 'observacao', confirmations: 1 },
  { id: 'r3', topic: 'leite', value: 'magro', status: 'por_confirmar', source: 'observacao', confirmations: 1 },
];

describe('PantrySection', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.calls.length = 0;
    useAppStore.setState({ profile: { id: 'u1' }, pantryFoods: FOODS, foodRules: RULES, pantryLoaded: true, loadPantry: vi.fn() });
  });

  it('os alimentos, os mais usados primeiro, sem distinguir de onde vieram; procura pelo nome', () => {
    render(<PantrySection />);
    const lista = screen.getByRole('list', { name: 'Alimentos da despensa' });
    expect(within(lista).getAllByRole('button').map((b) => b.textContent)).toEqual([
      expect.stringContaining('Iogurte grego 0%'), expect.stringContaining('Aveia em flocos'),
    ]);
    expect(lista).toHaveTextContent('170 g · 59 kcal/100 g');
    fireEvent.change(screen.getByPlaceholderText('Procurar alimento'), { target: { value: 'ave' } });
    expect(within(screen.getByRole('list', { name: 'Alimentos da despensa' })).getAllByRole('button')).toHaveLength(1);
  });

  it('"Como cozinhas" mostra as confirmadas e as que variam — não as por confirmar', () => {
    render(<PantrySection />);
    fireEvent.click(screen.getByRole('tab', { name: /Como cozinhas · 2/ }));
    const lista = screen.getByRole('list', { name: 'Como cozinhas' });
    expect(lista).toHaveTextContent('azeite');
    expect(lista).toHaveTextContent('Respondeste 3 vezes igual');
    expect(lista).toHaveTextContent('Varia');
    expect(lista).not.toHaveTextContent('magro');
  });

  it('adicionar por descrição: a Carol confirma, o atleta ajusta e grava', async () => {
    mocks.invoke.mockResolvedValue({ data: { food: { name: 'Pão de mistura (Lidl)', portion_grams: 40, portion_label: '1 fatia', from_label: false, calories_per_100g: 245, protein_per_100g: 9, carbs_per_100g: 45, fat_per_100g: 3 } }, error: null });
    render(<PantrySection />);
    fireEvent.click(screen.getByTestId('pantry-add-food'));
    fireEvent.change(screen.getByPlaceholderText(/pão de mistura do Lidl/), { target: { value: 'Pão de mistura do Lidl, uma fatia de 40 g' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar com a Carol' }));

    await screen.findByText(/Confirmado pela Carol · ajusta se precisares/);
    expect(mocks.invoke.mock.calls[0][1].body).toMatchObject({ mode: 'pantry_food', description: 'Pão de mistura do Lidl, uma fatia de 40 g' });
    fireEvent.change(screen.getByLabelText('proteína g por 100 g'), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(mocks.calls.find((c) => c.op === 'upsert')).toBeTruthy());
    expect(mocks.calls.find((c) => c.op === 'upsert').row).toMatchObject({ name: 'Pão de mistura (Lidl)', protein_per_100g: 11, edited_by_athlete: true, in_pantry: true });
  });

  it('tocar num alimento abre-o para ajustar, e dá para o tirar da despensa', async () => {
    render(<PantrySection />);
    fireEvent.click(screen.getByRole('button', { name: /Aveia em flocos/ }));
    expect(screen.getByDisplayValue('Aveia em flocos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tirar da despensa' }));
    await waitFor(() => expect(mocks.calls.some((c) => c.op === 'delete' && c.table === 'athlete_foods')).toBe(true));
  });
});
