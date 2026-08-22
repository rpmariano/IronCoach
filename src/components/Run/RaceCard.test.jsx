import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RaceCard from './RaceCard';
import { useAppStore } from '../../store';

vi.mock('../../store', () => ({
  useAppStore: vi.fn(),
}));

describe('RaceCard — Detalhe da Prova no Calendário', () => {
  const sampleRace = {
    id: 'race-1',
    name: 'Corrida do Tejo',
    date: '2026-10-15',
    distance_km: 10,
    race_type: 'estrada',
    race_priority: 'a',
    location: 'Lisboa',
    target_time: '50:00',
    target_pace_seconds_per_km: 300,
    website: 'https://corradadotejo.pt',
    notes: 'Manter hidratação regular',
    status: 'planeada',
  };

  const mockOnEdit = vi.fn();
  const mockOnToggleStatus = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.mockReturnValue({
      profile: { experience_level: 'medio' },
      runs: [],
    });
  });

  it('renderiza o cabeçalho do cartão fechado com nome e pílulas', () => {
    render(
      <RaceCard
        ev={sampleRace}
        onEdit={mockOnEdit}
        onToggleStatus={mockOnToggleStatus}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByText('Corrida do Tejo')).toBeInTheDocument();
    expect(screen.getByText('10 km')).toBeInTheDocument();
    expect(screen.getByText('Estrada')).toBeInTheDocument();
    expect(screen.getByText('Principal')).toBeInTheDocument();
  });

  it('expande e apresenta os dados de prova prévia ao início (Início do Treino e Recomendações da Carol sem pílula de preparação adequada)', () => {
    render(
      <RaceCard
        ev={sampleRace}
        onEdit={mockOnEdit}
        onToggleStatus={mockOnToggleStatus}
        onDelete={mockOnDelete}
      />
    );

    // Clicar para expandir
    const card = screen.getByText('Corrida do Tejo').closest('.card');
    fireEvent.click(card);

    // Verifica secções essenciais quando o treino ainda não se iniciou
    expect(screen.getByText(/Local & Distância/i)).toBeInTheDocument();
    expect(screen.getByText('Lisboa')).toBeInTheDocument();
    expect(screen.getByText(/Objetivo/i)).toBeInTheDocument();
    expect(screen.getByText(/Tempo: 50:00/i)).toBeInTheDocument();
    expect(screen.getByText(/Contagem/i)).toBeInTheDocument();
    expect(screen.getByText(/Início do Treino/i)).toBeInTheDocument();
    expect(screen.getByText(/Início da 1ª Fase/i)).toBeInTheDocument();
    expect(screen.getByText(/Recomendações Prévias da Carol/i)).toBeInTheDocument();

    // Verifica que NÃO exibe a pílula de "Preparação Adequada" antes do início do treino
    expect(screen.queryByText('Preparação Adequada')).not.toBeInTheDocument();

    // Verifica que NÃO renderiza a secção de scraper do site
    expect(screen.queryByText('Informação da Prova')).not.toBeInTheDocument();
    expect(screen.queryByText('Obter do site')).not.toBeInTheDocument();

    // Verifica que os botões de ação continuam presentes
    expect(screen.getByRole('button', { name: /Concluída/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Editar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Eliminar/i })).toBeInTheDocument();
  });

  it('invoca a callback de editar', () => {
    render(
      <RaceCard
        ev={sampleRace}
        onEdit={mockOnEdit}
        onToggleStatus={mockOnToggleStatus}
        onDelete={mockOnDelete}
      />
    );

    fireEvent.click(screen.getByText('Corrida do Tejo'));
    fireEvent.click(screen.getByRole('button', { name: /Editar/i }));
    expect(mockOnEdit).toHaveBeenCalledWith('race-1');
  });

  it('invoca a callback de alternar status', () => {
    render(
      <RaceCard
        ev={sampleRace}
        onEdit={mockOnEdit}
        onToggleStatus={mockOnToggleStatus}
        onDelete={mockOnDelete}
      />
    );

    fireEvent.click(screen.getByText('Corrida do Tejo'));
    fireEvent.click(screen.getByRole('button', { name: /Concluída/i }));
    expect(mockOnToggleStatus).toHaveBeenCalled();
  });

  it('invoca a callback de eliminar', () => {
    render(
      <RaceCard
        ev={sampleRace}
        onEdit={mockOnEdit}
        onToggleStatus={mockOnToggleStatus}
        onDelete={mockOnDelete}
      />
    );

    fireEvent.click(screen.getByText('Corrida do Tejo'));
    fireEvent.click(screen.getByRole('button', { name: /Eliminar/i }));
    expect(mockOnDelete).toHaveBeenCalledWith('race-1');
  });
});
