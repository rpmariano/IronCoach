import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import StatusCard from './StatusCard';

/* As refeições que a Carol sugere para hoje mudaram-se de "O que faço hoje"
   para aqui (2026-09-15): o que elas dizem é sobre a nutrição do dia, e é
   aqui que estão os anéis. Uma linha só, para hoje — o dia a dia das
   sugestões vive no ecrã "O plano". */

const rings = [
  { label: 'Calorias', value: 1460, target: 2100, color: 'var(--nutrition)' },
  { label: 'Proteína', value: 96, target: 130, unit: 'g', color: 'var(--body)' },
  { label: 'Água', value: 0.8, target: 2, unit: 'L', color: 'var(--run)' },
];

const mealsModel = { kcal: 2300, meals: [{ tipo: 'almoco', label: 'Almoço', texto: 'Atum com grão-de-bico' }], racional: null };

describe('StatusCard — "O que a Carol sugere comer hoje"', () => {
  it('com sugestão para hoje, a linha aparece e abre a persiana', () => {
    const onOpenMeals = vi.fn();
    render(<StatusCard rings={rings} mealsModel={mealsModel} onOpenMeals={onOpenMeals} />);
    const linha = screen.getByTestId('status-card-meals');
    expect(linha).toHaveTextContent('O que a Carol sugere comer hoje');
    fireEvent.click(linha);
    expect(onOpenMeals).toHaveBeenCalled();
  });

  it('sem sugestão nenhuma, a linha não existe — e não deixa um vazio no lugar', () => {
    render(<StatusCard rings={rings} />);
    expect(screen.getByTestId('status-card')).toBeInTheDocument();
    expect(screen.queryByTestId('status-card-meals')).not.toBeInTheDocument();
    expect(screen.queryByText(/sugere comer hoje/)).not.toBeInTheDocument();
  });

  it('o primeiro dia (anéis tracejados) continua sem nada disto', () => {
    render(<StatusCard empty mealsModel={mealsModel} onRegisterMeal={vi.fn()} />);
    expect(screen.getByTestId('status-card-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('status-card-meals')).not.toBeInTheDocument();
  });
});
