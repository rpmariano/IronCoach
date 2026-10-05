import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import PantrySection from './PantrySection';

/* Bugs #48/#52, fase C: a despensa no Armário do Perfil (mockup "Despensa e
   perguntas da Carol", ecrãs 6 a 9). */

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), calls: [], load: null }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      const chain = {
        upsert: (row, opts) => { mocks.calls.push({ table, op: 'upsert', row, opts }); return chain; },
        update: (row) => { mocks.calls.push({ table, op: 'update', row }); return chain; },
        delete: () => { mocks.calls.push({ table, op: 'delete' }); return chain; },
        eq: () => chain,
        select: () => chain,
        order: () => (mocks.load ? mocks.load(table) : Promise.resolve({ data: [], error: null })),
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

const realLoadPantry = useAppStore.getState().loadPantry;

describe('PantrySection', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.calls.length = 0;
    useAppStore.setState({ profile: { id: 'u1' }, pantryFoods: FOODS, foodRules: RULES, pantryLoaded: true, pantryUserId: 'u1', loadPantry: vi.fn() });
  });

  // Revisão pré-master: outra conta no mesmo separador.
  it('a despensa de outra conta não aparece no Armário', () => {
    useAppStore.setState({ pantryUserId: 'outra-conta' });
    render(<PantrySection />);
    expect(screen.queryByText('Aveia em flocos')).not.toBeInTheDocument();
    expect(screen.queryByText('Iogurte grego 0%')).not.toBeInTheDocument();
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
    // 2026-10-05: a Carol não deu micronutrientes — diz quais faltam, sem inventar zeros.
    expect(screen.getByTestId('pantry-micros')).toHaveTextContent('Micronutrientes por confirmar: fibra, açúcar, sódio, ferro, cálcio, vitamina C e potássio. A Carol completa-os quando registares este alimento numa refeição.');
    fireEvent.change(screen.getByLabelText('proteína g por 100 g'), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(mocks.calls.find((c) => c.op === 'upsert')).toBeTruthy());
    expect(mocks.calls.find((c) => c.op === 'upsert').row).toMatchObject({ name: 'Pão de mistura (Lidl)', protein_per_100g: 11, edited_by_athlete: true, in_pantry: true, fiber_per_100g: null });
  });

  it('a ajustar: diz que micronutrientes faltam — um só, no singular; todos, "os 7 conhecidos"', () => {
    const micros = { fiber_per_100g: 10, sugar_per_100g: 1, sodium_per_100g: 6, iron_mg_per_100g: 4, calcium_mg_per_100g: 50, vitamin_c_mg_per_100g: null, potassium_mg_per_100g: 400 };
    useAppStore.setState({ pantryFoods: [{ ...FOODS[0], ...micros }] });
    const { unmount } = render(<PantrySection />);
    fireEvent.click(screen.getByRole('button', { name: /Aveia em flocos/ }));
    expect(screen.getByTestId('pantry-micros')).toHaveTextContent('Micronutriente por confirmar: vitamina C. A Carol completa-o quando');
    unmount();
    // Um 0 numa linha marcada é dado.
    const NOW = '2026-10-05T10:00:00.000Z';
    useAppStore.setState({ pantryFoods: [{ ...FOODS[0], ...micros, vitamin_c_mg_per_100g: 0, micros_checked_at: NOW, updated_at: NOW }] });
    render(<PantrySection />);
    fireEvent.click(screen.getByRole('button', { name: /Aveia em flocos/ }));
    expect(screen.getByTestId('pantry-micros')).toHaveTextContent('Micronutrientes: os 7 conhecidos.');
  });

  it('tocar num alimento abre-o para ajustar, e dá para o tirar da despensa', async () => {
    render(<PantrySection />);
    fireEvent.click(screen.getByRole('button', { name: /Aveia em flocos/ }));
    expect(screen.getByDisplayValue('Aveia em flocos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tirar da despensa' }));
    await waitFor(() => expect(mocks.calls.some((c) => c.op === 'delete' && c.table === 'athlete_foods')).toBe(true));
  });
});

describe('loadPantry', () => {
  beforeEach(() => {
    mocks.load = null;
    useAppStore.setState({ session: null, profile: { id: 'u1' }, pantryFoods: FOODS, foodRules: RULES, pantryLoaded: true, pantryUserId: 'u1', loadPantry: realLoadPantry });
  });

  it('uma resposta que chega depois de trocar de conta é ignorada', async () => {
    const pending = [];
    mocks.load = () => new Promise((r) => { pending.push(() => r({ data: [{ id: 'z', name: 'De outra conta' }], error: null })); });
    const p = useAppStore.getState().loadPantry();
    useAppStore.setState({ profile: { id: 'u2' } });
    pending.forEach((release) => release());
    await p;
    expect(useAppStore.getState().pantryFoods).toBe(FOODS);
    expect(useAppStore.getState().pantryUserId).toBe('u1');
  });

  it('uma falha deixa-a por ler, para o registo voltar a tentar; de outra conta, limpa', async () => {
    mocks.load = () => Promise.reject(new Error('sem rede'));
    await useAppStore.getState().loadPantry();
    expect(useAppStore.getState()).toMatchObject({ pantryLoaded: false, pantryFoods: FOODS, pantryUserId: 'u1' });
    useAppStore.setState({ profile: { id: 'u2' }, pantryLoaded: true });
    await useAppStore.getState().loadPantry();
    expect(useAppStore.getState()).toMatchObject({ pantryLoaded: false, pantryFoods: [], foodRules: [], pantryUserId: 'u2' });
  });
});
