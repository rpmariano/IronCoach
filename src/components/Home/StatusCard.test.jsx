import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import StatusCard from './StatusCard';

/* As refeições que a Carol sugere para hoje mudaram-se de "O que faço hoje"
   para aqui (2026-09-15): o que elas dizem é sobre a nutrição do dia, e é
   aqui que estão os anéis. Uma linha só, para hoje — o dia a dia das
   sugestões vive no ecrã "O plano". */

const gauges = {
  macros: [
    { key: 'calories', label: 'Calorias', value: 1460, target: 2100, unit: 'kcal', color: 'var(--neon-kcal)' },
    { key: 'protein', label: 'Proteína', value: 96, target: 130, unit: 'g', color: 'var(--neon-proteina)' },
    { key: 'carbs', label: 'Hidratos', value: 180, target: 260, unit: 'g', color: 'var(--neon-hidratos)' },
    { key: 'fat', label: 'Gordura', value: 52, target: 70, unit: 'g', color: 'var(--neon-gordura)' },
  ],
  water: { label: 'Água', value: 0.8, target: 2, unit: 'L', display: '0,8', targetDisplay: '2,0', color: 'var(--neon-agua)' },
};

const mealsModel = { kcal: 2300, meals: [{ tipo: 'almoco', label: 'Almoço', texto: 'Atum com grão-de-bico' }], racional: null };

describe('StatusCard — "O que a Carol sugere comer hoje"', () => {
  it('com sugestão para hoje, a linha aparece e abre a persiana', () => {
    const onOpenMeals = vi.fn();
    render(<StatusCard gauges={gauges} mealsModel={mealsModel} onOpenMeals={onOpenMeals} />);
    const linha = screen.getByTestId('status-card-meals');
    expect(linha).toHaveTextContent('O que a Carol sugere comer hoje');
    fireEvent.click(linha);
    expect(onOpenMeals).toHaveBeenCalled();
  });

  it('sem sugestão nenhuma, a linha não existe — e não deixa um vazio no lugar', () => {
    render(<StatusCard gauges={gauges} />);
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

/* Bug #51 (2026-10-03): «um círculo por cada macro e as cores têm de ser
   apelativas, neon» — e continua a mostrar o objetivo do dia. */
describe('StatusCard — um anel neon por macro', () => {
  it('quatro anéis, cada um com o nome, o comido e o objetivo do dia', () => {
    render(<StatusCard gauges={gauges} />);
    for (const [key, label, alvo] of [['calories', 'Calorias', '/ 2100 kcal'], ['protein', 'Proteína', '/ 130 g'], ['carbs', 'Hidratos', '/ 260 g'], ['fat', 'Gordura', '/ 70 g']]) {
      const ring = screen.getByTestId(`ring-${key}`);
      expect(ring).toHaveTextContent(label);
      expect(ring).toHaveTextContent(alvo);
    }
    expect(screen.getByTestId('ring-calories')).toHaveTextContent('1460');
    expect(screen.getByTestId('status-card-water')).toHaveTextContent('0,8 / 2,0 L');
  });

  it('"Ver dias anteriores" abre o histórico; sem quem o abra, não aparece', () => {
    const onOpenHistory = vi.fn();
    const { unmount } = render(<StatusCard gauges={gauges} onOpenHistory={onOpenHistory} />);
    fireEvent.click(screen.getByTestId('status-card-history'));
    expect(onOpenHistory).toHaveBeenCalled();
    unmount();
    render(<StatusCard gauges={gauges} />);
    expect(screen.queryByTestId('status-card-history')).not.toBeInTheDocument();
  });
});
