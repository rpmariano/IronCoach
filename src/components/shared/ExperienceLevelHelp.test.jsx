import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ExperienceLevelHelp from './ExperienceLevelHelp';

function openHelp() {
  fireEvent.click(screen.getByRole('button', { name: /O que significa cada nível\?/i }));
}

describe('ExperienceLevelHelp — context="geral" (omissão, Perfil.jsx)', () => {
  it('mostra os critérios transversais, comportamento inalterado', () => {
    render(<ExperienceLevelHelp label="Nível como corredor">{null}</ExperienceLevelHelp>);
    openHelp();

    // Um card por nível, com os critérios de EXPERIENCE_LEVELS (não a tabela por prova).
    expect(screen.getByText('Iniciante')).toBeInTheDocument();
    expect(screen.getByText('Avançado')).toBeInTheDocument();
    expect(screen.getByText('15-25 km/semana (ou 1,5-3h)')).toBeInTheDocument();
    expect(screen.getByText(/Valores de referência para provas de 10 km a meia maratona/i)).toBeInTheDocument();
    // Não mostra a tabela de prova.
    expect(screen.queryByText('Prep. mínima')).not.toBeInTheDocument();
  });
});

describe('ExperienceLevelHelp — context="prova", estrada', () => {
  it('mostra a tabela por categoria de distância (10k), lida das mesmas tabelas que classificam', () => {
    render(
      <ExperienceLevelHelp label="Nível para esta prova" context="prova" raceType="estrada" distanceKm={10}>
        {null}
      </ExperienceLevelHelp>,
    );
    openHelp();

    expect(screen.getByText('Prep. mínima')).toBeInTheDocument();
    expect(screen.getByText('Volume semanal mín.')).toBeInTheDocument();

    // MIN_PREP_WEEKS/MIN_VOLUME_KM para "10k" (vocabulary.ts) — ver
    // specs/coach-investigacao.md BLOCO 1 #1/#2.
    const iniciante = screen.getByText('Iniciante').closest('tr');
    expect(within(iniciante).getByText('10 semanas')).toBeInTheDocument();
    expect(within(iniciante).getByText('15 km/semana')).toBeInTheDocument();

    const avancado = screen.getByText('Avançado').closest('tr');
    expect(within(avancado).getByText('4 semanas')).toBeInTheDocument();
    expect(within(avancado).getByText('45 km/semana')).toBeInTheDocument();

    expect(screen.getByText(/Valores para 10 km/i)).toBeInTheDocument();
    // Não mostra a tabela de trail.
    expect(screen.queryByText('Corres por semana')).not.toBeInTheDocument();
  });

  it('ultra + iniciante: mostra "Desaconselhado" em vez de um número de semanas', () => {
    render(
      <ExperienceLevelHelp label="Nível para esta prova" context="prova" raceType="estrada" distanceKm={80}>
        {null}
      </ExperienceLevelHelp>,
    );
    openHelp();

    const iniciante = screen.getByText('Iniciante').closest('tr');
    expect(within(iniciante).getByText('Desaconselhado')).toBeInTheDocument();
  });

  it('sem distância válida: mostra mensagem de fallback, sem tabela', () => {
    render(
      <ExperienceLevelHelp label="Nível para esta prova" context="prova" raceType="estrada" distanceKm={NaN}>
        {null}
      </ExperienceLevelHelp>,
    );
    openHelp();

    expect(screen.getByText(/Escolhe a distância da prova/i)).toBeInTheDocument();
    expect(screen.queryByText('Prep. mínima')).not.toBeInTheDocument();
  });
});

describe('ExperienceLevelHelp — context="prova", trail', () => {
  it('em linguagem simples: horas e metros desta prova, sem "D+" nem percentagens', () => {
    // 20 km com 1000 m D+ → 50 m/km → terreno "Montanha"; previsão de 4h.
    render(
      <ExperienceLevelHelp
        label="Nível para esta prova"
        context="prova"
        raceType="trail"
        distanceKm={20}
        elevationGainM={1000}
        predictedSeconds={4 * 3600}
      >
        {null}
      </ExperienceLevelHelp>,
    );
    openHelp();

    expect(screen.getByText('Corres por semana')).toBeInTheDocument();
    expect(screen.getByText('Sobes por semana')).toBeInTheDocument();
    expect(screen.getByText('Montanha')).toBeInTheDocument();
    expect(screen.getByText(/50 m a subir por cada km/i)).toBeInTheDocument();

    // Os pisos de TIME_ON_FEET_FLOORS_PCT / ELEVATION_FLOORS_PCT sobre 4h e 1000 m.
    const iniciante = screen.getByText('Iniciante').closest('tr');
    expect(within(iniciante).getByText('2h50 a 3h35')).toBeInTheDocument();
    expect(within(iniciante).getByText('300 m a 500 m')).toBeInTheDocument();
    const avancado = screen.getByText('Avançado').closest('tr');
    expect(within(avancado).getByText('5h35 ou mais')).toBeInTheDocument();
    expect(within(avancado).getByText('1000 m ou mais')).toBeInTheDocument();

    const dialogo = screen.getByRole('dialog');
    expect(dialogo.textContent).not.toMatch(/D\+|%|banda|Tempo em Pé/);

    // Não mostra a tabela de estrada.
    expect(screen.queryByText('Prep. mínima')).not.toBeInTheDocument();
  });

  it('sem previsão de tempo: a coluna do tempo diz-se por palavras', () => {
    render(
      <ExperienceLevelHelp label="Nível para esta prova" context="prova" raceType="trail" distanceKm={20} elevationGainM={1000}>
        {null}
      </ExperienceLevelHelp>,
    );
    openHelp();

    const basico = screen.getByText('Básico').closest('tr');
    expect(within(basico).getByText('mais ou menos o tempo da prova')).toBeInTheDocument();
    expect(within(basico).getByText('500 m a 800 m')).toBeInTheDocument();
  });

  it('trail sem D+ preenchido: mostra a tabela na mesma, sem nota de terreno (categoria desconhecida)', () => {
    render(
      <ExperienceLevelHelp
        label="Nível para esta prova"
        context="prova"
        raceType="trail"
        distanceKm={20}
        elevationGainM={NaN}
      >
        {null}
      </ExperienceLevelHelp>,
    );
    openHelp();

    expect(screen.getByText('Corres por semana')).toBeInTheDocument();
    expect(screen.queryByText(/Terreno desta prova/i)).not.toBeInTheDocument();
    const medio = screen.getByText('Médio').closest('tr');
    expect(within(medio).getByText('quase toda a subida da prova')).toBeInTheDocument();
  });
});
