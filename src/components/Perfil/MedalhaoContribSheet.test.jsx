import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import MedalhaoContribSheet from './MedalhaoContribSheet';
import { makeMedalhoes } from '../../test/medalhoesFixture';

/* A persiana dos registos de um encaixe: título com o período, o resumo, as
   linhas — a prova abre o hub, a corrida abre o registo, o ginásio não abre
   nada — e a frase quando ainda não há registos. */

const mes = makeMedalhoes().medalhoes[0].slots[0];

describe('MedalhaoContribSheet', () => {
  beforeEach(() => {
    useAppStore.setState({ editingRaceId: null, editingRunId: null, openCreationMode: null });
  });

  it('mostra o título, o resumo e as linhas; o ginásio não é tocável', () => {
    render(<MedalhaoContribSheet medalhaoName="O Ano em Km" slot={mes} onClose={() => {}} />);
    const sheet = screen.getByTestId('medalhao-contrib-sheet-mes');
    expect(sheet).toHaveTextContent('Mês · agosto de 2026');
    expect(sheet).toHaveTextContent('182 km · 3 corridas');
    expect(screen.getByTestId('medalhao-contrib-race-race-meia').tagName).toBe('BUTTON');
    expect(screen.getByTestId('medalhao-contrib-run-run-longo')).toHaveTextContent('30 km · 2:45:00');
    const gym = screen.getByTestId('medalhao-contrib-gym-item-gym');
    expect(gym.tagName).toBe('DIV');
    expect(gym).toHaveTextContent('Core');
  });

  it('a prova abre o hub e a corrida o registo, fechando as persianas antes', () => {
    const onNavigate = vi.fn();
    render(<MedalhaoContribSheet medalhaoName="O Ano em Km" slot={mes} onClose={() => {}} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('medalhao-contrib-race-race-meia'));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().editingRaceId).toBe('race-meia');

    fireEvent.click(screen.getByTestId('medalhao-contrib-run-run-longo'));
    expect(onNavigate).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().editingRunId).toBe('run-longo');
    expect(useAppStore.getState().openCreationMode).toBe('run');
  });

  it('sem registos, uma frase neutra', () => {
    render(<MedalhaoContribSheet slot={{ key: 'ano', label: 'Ano', contributions: [] }} onClose={() => {}} />);
    expect(screen.getByTestId('medalhao-contrib-vazio')).toHaveTextContent('Ainda não há registos para este encaixe.');
    expect(screen.queryByTestId('medalhao-contrib-resumo')).not.toBeInTheDocument();
  });
});
