import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CupDoorCard, { decisionMeta, editionTitle } from './CupDoorCard';
import * as F from '@formulas/cup.fixtures.ts';

/* O cartão do Troféu em Provas (specs/trofeu.md §4.1). Revisão da Fase 1,
   2026-09-26: o convite diz o nome completo com o número da edição ("34.º
   Troféu de Atletismo de Cascais · 11 provas de dezembro a junho"), a linha
   de resumo só aparece com o catálogo lido (antes contava 0 provas e ficava
   vazia), e "Não fui" é uma decisão como as outras. */

const EDITION = { ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION };

function convite({ catalogReady = true, span = { count: 11, from: '2026-12-06', to: '2027-06-13' } } = {}) {
  return {
    edition: EDITION,
    competition: F.CASCAIS_COMPETITION,
    catalogReady,
    rounds: [],
    door: { kind: 'convite', nextRound: null, span },
  };
}

describe('CupDoorCard', () => {
  it('decisionMeta: "Não fui" tem texto e ícone, não cai em "Por decidir"', () => {
    expect(decisionMeta('nao_fui')).toMatchObject({ label: 'Não fui', icon: '✕' });
    expect(decisionMeta(null).label).toBe('Por decidir');
  });

  it('editionTitle: nome completo com o número da edição', () => {
    expect(editionTitle(EDITION, F.CASCAIS_COMPETITION)).toBe('34.º Troféu de Atletismo de Cascais');
    expect(editionTitle({}, F.CASCAIS_COMPETITION)).toBe('Troféu de Atletismo de Cascais');
  });

  it('convite: "34.º Troféu de Atletismo de Cascais" e "11 provas de dezembro a junho"', () => {
    render(<CupDoorCard view={convite()} />);
    expect(screen.getByTestId('cup-door-card')).toHaveTextContent('34.º Troféu de Atletismo de Cascais');
    expect(screen.getByTestId('cup-door-resumo')).toHaveTextContent('11 provas de dezembro a junho');
  });

  it('convite: enquanto o catálogo não chega, não há linha de resumo (nem "0 provas")', () => {
    render(<CupDoorCard view={convite({ catalogReady: false, span: { count: 0, from: null, to: null } })} />);
    expect(screen.getByTestId('cup-door-card')).toBeInTheDocument();
    expect(screen.queryByTestId('cup-door-resumo')).not.toBeInTheDocument();
  });

  it('convite: catálogo lido e sem jornadas → "Calendário ainda por sair"', () => {
    render(<CupDoorCard view={convite({ span: { count: 0, from: null, to: null } })} />);
    expect(screen.getByTestId('cup-door-resumo')).toHaveTextContent('Calendário ainda por sair');
  });

  it('inscrito: a próxima jornada com "Não fui" mostra "Não fui"', () => {
    const round = { id: 'r-x', name: 'Corrida CCD', date: '2027-01-24', date_status: 'confirmada', participation: { decision: 'nao_fui' }, course: null };
    render(<CupDoorCard view={{ ...convite(), rounds: [round], door: { kind: 'inscrito', nextRound: round } }} />);
    expect(screen.getByTestId('cup-door-card')).toHaveTextContent('Não fui');
    expect(screen.getByTestId('cup-door-card')).not.toHaveTextContent('Por decidir');
  });
});
