import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';

vi.mock('../../utils/medalhoes', async () => {
  const { makeMedalhoes } = await import('../../test/medalhoesFixture');
  return { computeMedalhoes: vi.fn(() => makeMedalhoes()), MEDALHAO_KEYS: ['ano_km', 'distancias', 'recordes', 'terreno', 'sequencia', 'superacao'] };
});

import PalmaresCard from './PalmaresCard';

/* O cartão Palmarés dos medalhões: o herói com a legenda e a frase de
   progresso, a coleção dos outros 5, e cada um abre a sua persiana. As
   regras são de utils/medalhoes.js — aqui só a UI. */

describe('PalmaresCard — os medalhões', () => {
  beforeEach(() => {
    useAppStore.setState({
      profile: { id: 'user-1' }, runs: [], raceEvents: [], coachPlans: [], coachPlanItems: [],
      editingRaceId: null, editingRunId: null, openCreationMode: null,
    });
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

  it('um encaixe da legenda abre os registos que o fazem; a prova leva ao hub', () => {
    render(<PalmaresCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver os registos do mês' }));
    const sheet = screen.getByTestId('medalhao-contrib-sheet-mes');
    expect(sheet).toHaveTextContent('Palmarés · O Ano em Km');
    expect(sheet).toHaveTextContent('Mês · agosto de 2026');
    expect(screen.getByTestId('medalhao-contrib-resumo')).toHaveTextContent('182 km · 3 corridas');
    expect(screen.getByTestId('medalhao-contrib-race-race-meia')).toHaveTextContent('Meia do Porto');

    fireEvent.click(screen.getByTestId('medalhao-contrib-race-race-meia'));
    expect(useAppStore.getState().editingRaceId).toBe('race-meia');
    expect(screen.queryByTestId('medalhao-contrib-sheet-mes')).not.toBeInTheDocument();
  });

  it('uma corrida abre o registo dela; encaixe sem registos diz que ainda não há', () => {
    render(<PalmaresCard />);
    fireEvent.click(screen.getByTestId('palmares-legenda-mes'));
    fireEvent.click(screen.getByTestId('medalhao-contrib-run-run-longo'));
    expect(useAppStore.getState().editingRunId).toBe('run-longo');
    expect(useAppStore.getState().openCreationMode).toBe('run');

    fireEvent.click(screen.getByRole('button', { name: 'Ver os registos do trimestre' }));
    expect(screen.getByTestId('medalhao-contrib-vazio')).toHaveTextContent('Ainda não há registos para este encaixe.');
  });

  it('na persiana do medalhão, cada encaixe abre os seus registos por cima', () => {
    render(<PalmaresCard />);
    fireEvent.click(screen.getByTestId('palmares-progresso'));
    fireEvent.click(within(screen.getByTestId('medalhao-sheet-ano_km')).getByTestId('medalhao-slot-mes'));
    expect(screen.getByTestId('medalhao-contrib-sheet-mes')).toHaveTextContent('Mês · agosto de 2026');
    // A persiana do medalhão fica por baixo, para onde se volta ao fechar.
    expect(screen.getByTestId('medalhao-sheet-ano_km')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('medalhao-contrib-race-race-meia'));
    expect(useAppStore.getState().editingRaceId).toBe('race-meia');
    expect(screen.queryByTestId('medalhao-sheet-ano_km')).not.toBeInTheDocument();
  });
});
