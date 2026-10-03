import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import NutritionDashboard from './NutritionDashboard';
import { todayISO, addDaysISO } from '../../lib/utils';

/* O dashboard passou a assentar em calculateMacroAdherence (utils/biEngine),
   o que muda duas coisas face à versão anterior deste teste:

   1. A forma dos dados é a REAL da base de dados — cada refeição traz
      meal_items[] com quantity_grams e *_per_100g, não macros achatados na
      própria refeição. O teste antigo usava a forma achatada, que nunca
      existiu em produção: passava por acaso porque o componente somava esses
      campos diretamente.
   2. Os valores mostrados são MÉDIAS DIÁRIAS no período (por omissão a
      semana), em gramas absolutas por dia (g/dia) — já não em g/kg, que o
      utilizador achou pouco útil (2026-09-29). Uma legenda por cima diz que
      é média e de quantos dias, para a semana não se ler como total. */

const PROFILE = {
  weight_kg: 70,
  calorie_goal: 3000,
  protein_goal: 200,
  carbs_goal: 300,
  fat_goal: 100,
};

// Um alimento com valores por 100 g; a quantidade decide o total.
const item = (grams, kcal, prot, carbs, fat) => ({
  quantity_grams: grams,
  calories_per_100g: kcal,
  protein_per_100g: prot,
  carbs_per_100g: carbs,
  fat_per_100g: fat,
});

describe('NutritionDashboard', () => {
  beforeEach(() => {
    useAppStore.setState({
      profile: PROFILE,
      bodyAssessments: [],
      runs: [],
      gymSessions: [],
      // Um único dia com duas refeições, para a média diária ser igual ao
      // total do dia e os números ficarem fáceis de conferir à mão:
      //   100 g a 1000 kcal/100 g  → 1000 kcal, 50 g prot, 100 g hc, 30 g gord
      //   100 g a  500 kcal/100 g  →  500 kcal, 30 g prot,  50 g hc, 10 g gord
      //   total .................. → 1500 kcal, 80 g prot, 150 g hc, 40 g gord
      meals: [
        { id: 1, date: todayISO(), meal_items: [item(100, 1000, 50, 100, 30)] },
        { id: 2, date: todayISO(), meal_items: [item(100, 500, 30, 50, 10)] },
      ],
    });
  });

  it('mostra as calorias como média diária do período', () => {
    render(<NutritionDashboard />);
    expect(screen.getByText('1500')).toBeInTheDocument();
    expect(screen.getByText('kcal/dia')).toBeInTheDocument();
  });

  it('mostra os macros em gramas absolutas por dia, não em g/kg', () => {
    render(<NutritionDashboard />);

    // O 80 aparece também como número grande do gráfico de adesão (a
    // proteína do último dia) — aqui interessa o KPI.
    const kpiProtein = screen.getAllByText('80').filter(el => el.className.includes('text-2xl'));
    expect(kpiProtein).toHaveLength(1);
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getAllByText('g/dia')).toHaveLength(3);
    expect(screen.queryByText('g/kg')).not.toBeInTheDocument();
  });

  it('o gráfico de adesão mostra gramas e os alvos do perfil em gramas', () => {
    render(<NutritionDashboard />);
    expect(screen.getByText('g de proteína no último dia')).toBeInTheDocument();
    expect(screen.getByText('Proteína · alvo 200 g')).toBeInTheDocument();
    expect(screen.getByText('Hidratos · alvo 300 g')).toBeInTheDocument();
    expect(screen.getByText('Gordura · alvo 100 g')).toBeInTheDocument();
  });

  it('diz que a semana é uma média diária e de quantos dias', () => {
    render(<NutritionDashboard />);
    expect(screen.getByTestId('nutrition-kpi-caption'))
      .toHaveTextContent('Média diária de 1 dia com registo');
  });

  /* Bug #51: "Ver dias anteriores" no Início abre aqui, na vista Dia, em
     ontem — e as setas andam de dia em dia até hoje. */
  it('a vista Dia abre no dia pedido e anda de dia em dia até hoje', () => {
    useAppStore.setState({ nutritionDayFocus: addDaysISO(todayISO(), -1), waterLogs: [], coachPlans: [], coachPlanItems: [] });
    render(<NutritionDashboard />);
    expect(screen.getByTestId('day-nutrition-title')).toHaveTextContent('Ontem');
    expect(screen.getByTestId('day-row-calories')).toHaveAttribute('data-status', 'sem_registo');
    expect(useAppStore.getState().nutritionDayFocus).toBe(null);

    fireEvent.click(screen.getByRole('button', { name: 'Dia seguinte' }));
    expect(screen.getByTestId('day-nutrition-title')).toHaveTextContent('Hoje');
    // 1500 de 3000 kcal: abaixo.
    expect(screen.getByTestId('day-row-calories')).toHaveTextContent('1500 / 3000 kcal');
    expect(screen.getByTestId('day-row-calories')).toHaveAttribute('data-status', 'abaixo');
    expect(screen.getByRole('button', { name: 'Dia seguinte' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Dia anterior' }));
    expect(screen.getByTestId('day-nutrition-title')).toHaveTextContent('Ontem');
  });

  /* Ponto 7 do redesenho: sem refeições no período, o ecrã deixa de mostrar
     os quatro KPIs a zero (que se liam como "comeste zero calorias", e não
     como "não sei o que comeste") e passa ao cartão do mock "Dashboard ·
     sem dados" — o veredicto, o convite a registar e a moldura do gráfico
     a "—". A asserção antiga era exatamente o comportamento substituído. */
  it('sem refeições nenhumas, mostra o estado vazio em vez de KPIs a zero', () => {
    useAppStore.setState({ meals: [] });
    render(<NutritionDashboard />);

    expect(screen.getByTestId('empty-module-state')).toBeInTheDocument();
    expect(screen.getByText('Ainda não há dados')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registar refeição' })).toBeInTheDocument();
    expect(screen.getByTestId('chart-frame-value')).toHaveTextContent('—');
    // A frase de veredicto continua lá, a dizer que não há o que dizer.
    expect(screen.getByTestId('verdict-line')).toBeInTheDocument();
    // E nenhum KPI a fingir um número.
    expect(screen.queryByText('Calorias')).not.toBeInTheDocument();
  });
});
