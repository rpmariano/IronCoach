import React from 'react';
import { render, screen, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* Os interruptores («v1 lite», 2026-11-22), cada um desligado e ligado, nos componentes que
   esconde. Nos testes tudo nasce ligado (featureFlagsSlice, FEATURE_BASE); aqui desliga-se de
   propósito e repõe-se no fim. */

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(() => { throw new Error('sem rede nos testes'); }), rpc: vi.fn() },
  invokeEdgeFunctionWithTimeout: vi.fn(),
  logAppEvent: vi.fn(),
}));
vi.mock('../components/Pantry/MealTemplateSheet', () => ({ default: () => <div data-testid="sheet" /> }));

const { useAppStore } = await import('../store');
const { FEATURE_BASE } = await import('../store/featureFlagsSlice');
const { default: StatusCard } = await import('../components/Home/StatusCard');
const { default: DayNutritionCard } = await import('../components/Nutrition/DayNutritionCard');
const { default: SaveAsMealButton } = await import('../components/Nutrition/SaveAsMealButton');
const { default: PantrySection } = await import('../components/Pantry/PantrySection');
const { buildNutritionGauges } = await import('./homeModels');
const { useCup, useCupForHome, useCupForRace } = await import('./useCup');

const setFlag = (key, value) => useAppStore.setState((s) => ({ featureFlags: { ...s.featureFlags, [key]: value } }));

beforeEach(() => {
  useAppStore.setState({
    featureFlags: { ...FEATURE_BASE },
    session: { user: { id: 'u1' } }, profile: { id: 'u1', water_goal_ml: 2000 },
    mealTemplates: [], pantryFoods: [], foodRules: [], pantryUserId: 'u1', pantryLoaded: true, loadPantry: vi.fn(),
    raceEvents: [], runs: [],
  });
});
afterEach(() => useAppStore.setState({ featureFlags: { ...FEATURE_BASE } }));

describe('water', () => {
  const gauges = () => buildNutritionGauges({ meals: [], waterLogs: [{ date: '2026-11-22', amount_ml: 500 }], profile: { water_goal_ml: 2000 }, today: '2026-11-22' });
  const rows = [
    { key: 'kcal', label: 'Calorias', unit: 'kcal', value: 1000, target: 2000, status: 'abaixo' },
    { key: 'water', label: 'Água', unit: 'ml', value: 500, target: 2000, status: 'abaixo' },
  ];

  it('ligada: a barra da água no Início e a linha dela no dia da Nutrição', () => {
    render(<StatusCard gauges={gauges()} />);
    expect(screen.getByTestId('status-card-water')).toBeInTheDocument();
    render(<DayNutritionCard dayISO="2026-11-21" todayISO="2026-11-22" rows={rows} />);
    expect(screen.getByTestId('day-row-water')).toBeInTheDocument();
  });

  it('desligada: nem a barra, nem a linha', () => {
    setFlag('water', false);
    render(<StatusCard gauges={gauges()} />);
    expect(screen.queryByTestId('status-card-water')).toBeNull();
    render(<DayNutritionCard dayISO="2026-11-21" todayISO="2026-11-22" rows={rows} />);
    expect(screen.queryByTestId('day-row-water')).toBeNull();
    expect(screen.getByTestId('day-row-kcal')).toBeInTheDocument();
  });
});

describe('pantry_advanced', () => {
  const MEAL = { meal_type: 'almoco', meal_items: [{ name: 'Arroz', quantity_grams: 100 }] };

  it('ligada: «Guardar como refeição» e os três separadores da despensa', () => {
    render(<SaveAsMealButton meal={MEAL} />);
    expect(screen.getByRole('button', { name: /Guardar como refeição/ })).toBeInTheDocument();
    render(<PantrySection />);
    expect(screen.getByRole('tablist', { name: 'Despensa' })).toBeInTheDocument();
  });

  it('desligada: sem o botão nem as regras e os modelos — ficam os alimentos', () => {
    setFlag('pantry_advanced', false);
    const { container } = render(<SaveAsMealButton meal={MEAL} />);
    expect(container).toBeEmptyDOMElement();
    render(<PantrySection />);
    expect(screen.queryByRole('tablist', { name: 'Despensa' })).toBeNull();
    expect(screen.queryByText(/Como cozinhas/)).toBeNull();
  });
});

describe('cup', () => {
  it('desligada: os hooks da Taça devolvem nada e não leem nada; a jornada é uma prova normal', () => {
    setFlag('cup', false);
    const loadCup = vi.fn(() => Promise.resolve());
    useAppStore.setState({ loadCup, raceEvents: [{ id: 'r1', cup_round_id: 'jr1', date: '2099-01-01', status: 'agendada' }] });
    const { result } = renderHook(() => ({ cup: useCup(), home: useCupForHome(), race: useCupForRace({ id: 'r1', cup_round_id: 'jr1' }) }));
    expect(result.current).toEqual({ cup: null, home: null, race: null });
    expect(loadCup).not.toHaveBeenCalled();
  });

  it('ligada: useCup lê a competição', () => {
    const loadCup = vi.fn(() => Promise.resolve());
    useAppStore.setState({ loadCup, cup: { ...useAppStore.getState().cup, userId: null, status: 'idle' } });
    renderHook(() => useCup());
    expect(loadCup).toHaveBeenCalled();
  });
});
