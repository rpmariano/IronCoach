import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RaceCard from './RaceCard';
import { useAppStore } from '../../store';

vi.mock('../../store', () => ({
  useAppStore: vi.fn(),
}));

// Data fixa (ex.: '2026-10-15') tornava o teste refém do relógio: o plano de
// preparação para 10 km/nível médio dura 6 semanas (42 dias, ver
// MIN_PREP_WEEKS em supabase/functions/_shared/formulas/vocabulary.ts), e
// bastava a corrida real chegar a 42 dias dessa data fixa para o treino
// passar de "not_started" a "in_progress" e a asserção de "Início do
// Treino" (linha 75) deixar de bater certo — foi o que aconteceu ao chegar
// a 2026-09-03. Calcular a data sempre "bem no futuro" a partir de "agora"
// mantém o teste sempre no estado not_started, seja qual for o dia em que
// corre.
const futureDateISO = (daysFromNow) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
};

describe('RaceCard — Detalhe da Prova no Calendário', () => {
  const sampleRace = {
    id: 'race-1',
    name: 'Corrida do Tejo',
    date: futureDateISO(180), // 180 dias (~25 semanas) — bem acima das 6 exigidas, nunca "in_progress".
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

  it('antes do dia da prova não há nada para registar', () => {
    render(
      <RaceCard
        ev={sampleRace}
        onEdit={mockOnEdit}
        onToggleStatus={mockOnToggleStatus}
        onDelete={mockOnDelete}
        onRegisterRace={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Corrida do Tejo'));
    expect(screen.queryByRole('button', { name: /Registar a prova/i })).not.toBeInTheDocument();
  });
});

/* A partir do dia da prova, a ação primária do cartão passa a ser registá-la
   (specs/prova-concluida.md §3). "Marcar como concluída" fica como saída
   secundária para quem não quer registar nada, e desaparece assim que há
   corrida ligada — aí o que faz sentido é ver o registo. */
describe('RaceCard — a partir do dia da prova', () => {
  const hoje = new Date();
  const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const provaDeHoje = {
    id: 'race-1',
    name: 'Corrida do Tejo',
    date: localISO(hoje),
    distance_km: 10,
    race_type: 'estrada',
    race_priority: 'a',
    location: 'Lisboa',
    target_time: '50:00',
    target_pace_seconds_per_km: 300,
    status: 'agendada',
  };

  const expandir = () => fireEvent.click(screen.getByText('Corrida do Tejo'));
  const mockFns = { edit: vi.fn(), toggle: vi.fn(), del: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.mockReturnValue({ profile: { experience_level: 'medio' }, runs: [] });
  });

  it('oferece "Registar a prova" e mantém "Marcar como concluída" como secundária', () => {
    const onRegisterRace = vi.fn();
    render(<RaceCard ev={provaDeHoje} onEdit={mockFns.edit} onToggleStatus={mockFns.toggle} onDelete={mockFns.del} onRegisterRace={onRegisterRace} />);
    expandir();

    fireEvent.click(screen.getByRole('button', { name: /Registar a prova/i }));
    expect(onRegisterRace).toHaveBeenCalledWith(provaDeHoje);

    const secundaria = screen.getByRole('button', { name: /Marcar como concluída/i });
    fireEvent.click(secundaria);
    expect(mockFns.toggle).toHaveBeenCalledWith(provaDeHoje);
  });

  it('com corrida ligada, mostra "Ver registo" e já não oferece marcar nem registar', () => {
    useAppStore.mockReturnValue({
      profile: { experience_level: 'medio' },
      runs: [{ id: 'run-7', kind: 'competicao', race_id: 'race-1', date: provaDeHoje.date }],
    });
    const onViewRun = vi.fn();
    render(<RaceCard ev={{ ...provaDeHoje, status: 'concluida' }} onEdit={mockFns.edit} onToggleStatus={mockFns.toggle} onDelete={mockFns.del} onRegisterRace={vi.fn()} onViewRun={onViewRun} />);
    expandir();

    expect(screen.queryByRole('button', { name: /Registar a prova/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Marcar como concluída/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ver registo/i }));
    expect(onViewRun).toHaveBeenCalledWith('run-7');
  });
});
