import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';

vi.mock('../../utils/medalhoes', async () => {
  const { makeMedalhoes } = await import('../../test/medalhoesFixture');
  return { computeMedalhoes: vi.fn(() => makeMedalhoes()), MEDALHAO_KEYS: ['ano_km', 'distancias', 'recordes', 'epoca', 'consistencia', 'superacao'] };
});

import PalmaresCard from './PalmaresCard';

/* O cartão Palmarés dos medalhões: o herói com a legenda e a frase de
   progresso, a coleção dos outros 5, e cada um abre a sua persiana. As
   regras são de utils/medalhoes.js — aqui só a UI. */

describe('PalmaresCard — os medalhões', () => {
  beforeEach(() => {
    useAppStore.setState({ profile: { id: 'user-1' }, runs: [], raceEvents: [], coachPlans: [], coachPlanItems: [] });
  });

  it('mostra o herói com a legenda dos 4 encaixes e a coleção dos outros 5', () => {
    render(<PalmaresCard />);
    const heroi = screen.getByTestId('palmares-heroi');
    expect(heroi).toHaveAttribute('data-key', 'ano_km');
    expect(heroi).toHaveTextContent('O Ano em Km');
    expect(heroi).toHaveTextContent('2 de 4 medalhas');
    expect(within(heroi).getByTestId('medalhao-lg')).toBeInTheDocument();

    const legenda = screen.getByTestId('palmares-legenda');
    expect(legenda.querySelectorAll('[data-state="won"]')).toHaveLength(2);
    expect(legenda).toHaveTextContent('Trim.');
    expect(legenda).toHaveTextContent('182 km');

    const colecao = screen.getByTestId('palmares-colecao');
    expect(within(colecao).getAllByTestId('medalhao-sm')).toHaveLength(5);
    expect(screen.getByTestId('palmares-medalhao-distancias')).toHaveTextContent('2 de 4');
    expect(screen.queryByTestId('palmares-medalhao-ano_km')).not.toBeInTheDocument();
  });

  it('a frase de progresso abre a persiana do herói; um da coleção abre a sua', () => {
    render(<PalmaresCard />);
    const progresso = screen.getByTestId('palmares-progresso');
    expect(progresso).toHaveTextContent('a 86 km de voltares a ganhar a medalha do mês');
    fireEvent.click(progresso);
    expect(screen.getByTestId('medalhao-sheet-ano_km')).toHaveTextContent('O Ano em Km · 2026');

    fireEvent.click(screen.getByTestId('palmares-medalhao-recordes'));
    expect(screen.getByTestId('medalhao-sheet-recordes')).toHaveTextContent('Os Recordes · 2026');
  });
});
