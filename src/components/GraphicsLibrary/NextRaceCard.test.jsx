import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import NextRaceCard from './NextRaceCard';

describe('NextRaceCard — Timeline Status', () => {
  it('mostra os dias que faltam para o início quando o plano ainda não começou (daysToStart > 1)', () => {
    render(
      <NextRaceCard
        title="Corrida do Tejo"
        daysRemaining={40}
        daysToStart={12}
      />
    );
    expect(screen.getByText('Faltam 12 dias')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
  });

  it('mostra no singular quando falta 1 dia para o início do plano (daysToStart === 1)', () => {
    render(
      <NextRaceCard
        title="Corrida do Tejo"
        daysRemaining={30}
        daysToStart={1}
      />
    );
    expect(screen.getByText('Falta 1 dia')).toBeInTheDocument();
  });

  it('mostra "Começa hoje" quando daysToStart === 0', () => {
    render(
      <NextRaceCard
        title="Corrida do Tejo"
        daysRemaining={28}
        daysToStart={0}
      />
    );
    expect(screen.getByText('Começa hoje')).toBeInTheDocument();
  });

  it('mostra há quantos dias começou quando já está em curso (daysToStart < -1)', () => {
    render(
      <NextRaceCard
        title="Corrida do Tejo"
        daysRemaining={19}
        daysToStart={-9}
      />
    );
    expect(screen.getByText('Começou há 9 dias')).toBeInTheDocument();
    expect(screen.getByText('19')).toBeInTheDocument();
  });

  it('mostra no singular quando começou há 1 dia (daysToStart === -1)', () => {
    render(
      <NextRaceCard
        title="Corrida do Tejo"
        daysRemaining={25}
        daysToStart={-1}
      />
    );
    expect(screen.getByText('Começou há 1 dia')).toBeInTheDocument();
  });

  it('mostra "É hoje! 🏁" quando daysRemaining === 0', () => {
    render(
      <NextRaceCard
        title="Corrida do Tejo"
        daysRemaining={0}
        daysToStart={-50}
      />
    );
    expect(screen.getByText('É hoje! 🏁')).toBeInTheDocument();
  });

  it('mostra "Concluída" quando a prova já passou (daysRemaining < 0)', () => {
    render(
      <NextRaceCard
        title="Corrida do Tejo"
        daysRemaining={-2}
        daysToStart={-60}
      />
    );
    expect(screen.getByText('Concluída')).toBeInTheDocument();
  });

  it('respeita timelineStatusLabel customizado se fornecido', () => {
    render(
      <NextRaceCard
        title="Corrida do Tejo"
        daysRemaining={19}
        timelineStatusLabel="Semana 4 de 12"
      />
    );
    expect(screen.getByText('Semana 4 de 12')).toBeInTheDocument();
  });
});
