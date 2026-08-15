import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import NutritionDashboard from './NutritionDashboard';
import { todayISO } from '../../lib/utils';

/* O dashboard passou a assentar em calculateMacroAdherence (utils/biEngine),
   o que muda duas coisas face à versão anterior deste teste:

   1. A forma dos dados é a REAL da base de dados — cada refeição traz
      meal_items[] com quantity_grams e *_per_100g, não macros achatados na
      própria refeição. O teste antigo usava a forma achatada, que nunca
      existiu em produção: passava por acaso porque o componente somava esses
      campos diretamente.
   2. Os valores mostrados são MÉDIAS DIÁRIAS no período (por omissão a
      semana), e os macros aparecem em g/kg de peso corporal — não totais
      absolutos. Só as calorias ficam em kcal/dia. */

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

  it('mostra os macros em g/kg de peso corporal, não em totais', () => {
    render(<NutritionDashboard />);

    // 80 g proteína / 70 kg = 1.1 g/kg (arredondado a uma casa)
    expect(screen.getByText('1.1')).toBeInTheDocument();
    // 150 g hidratos / 70 kg = 2.1 g/kg
    expect(screen.getByText('2.1')).toBeInTheDocument();
    // 40 g gordura / 70 kg = 0.6 g/kg
    expect(screen.getByText('0.6')).toBeInTheDocument();

    // Três KPIs de macro, todos em g/kg (as calorias ficam em kcal/dia).
    expect(screen.getAllByText('g/kg')).toHaveLength(3);
  });

  it('usa o peso da avaliação corporal mais recente em vez do perfil', () => {
    // Com 80 kg em vez de 70, a proteína por kg desce: 80/80 = 1.0 g/kg.
    useAppStore.setState({
      bodyAssessments: [
        { date: todayISO(), weight_kg: 80 },
        { date: '2020-01-01', weight_kg: 60 },
      ],
    });
    render(<NutritionDashboard />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('não rebenta sem refeições nenhumas', () => {
    useAppStore.setState({ meals: [] });
    render(<NutritionDashboard />);
    // Sem dados, os KPIs caem a zero em vez de rebentar ou desaparecer.
    expect(screen.getByText('Calorias')).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });
});
