import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';

/* A grelha dos badges e o ecrã de detalhe. As regras são de
   utils/badges.js (testadas lá); aqui só a UI: o anel com o número ao
   centro, os três estados, a regra numa frase, o bloco do dado em falta e as
   sessões agrupadas pelo que aconteceu a cada uma. */

const badge = (over) => ({
  key: 'x', name: 'X', rule: 'A regra do badge X, numa frase inteira.', cor: 'run', glifo: 'heart',
  state: 'empty', tier: null, ring: 0, centro: '—', centroAria: 'X: por ganhar', linha: null,
  count: 0, niveis: null, sessoes: [], indeterminadas: null, ...over,
});

const BADGES = [
  badge({
    key: 'z2_mestre', name: 'Mestre da Z2', cor: 'run', state: 'won', ring: 1, centro: '94', count: 2,
    linha: '2 vezes · a última a 10 set 2026',
    sessoes: [
      { kind: 'run', id: 'r1', runId: 'r1', raceId: null, date: '2026-09-10', title: 'Longo matinal', meta: '94% do tempo em Z1-Z2', status: 'conta', porque: 'Cumpriu a regra.' },
      { kind: 'run', id: 'r2', runId: 'r2', raceId: null, date: '2026-09-03', title: 'Contínuo', meta: '61% do tempo em Z1-Z2', status: 'falhou', porque: 'Ficou a +29 do alvo.' },
    ],
    indeterminadas: { n: 3, campoLabel: 'as zonas de frequência cardíaca', comoResolver: 'Abre o registo e preenche os minutos por zona.', frase: '3 sessões ficaram por decidir: não têm as zonas de frequência cardíaca. Não contam nem a favor nem contra.' },
  }),
  badge({
    key: 'escalada', name: 'A Escalada', cor: 'gym', glifo: 'peak', state: 'progress', ring: 0.5, centro: '5k',
    linha: 'faltam 5 000 m para bronze',
    niveis: [
      { key: 'bronze', label: 'Bronze', limiar: 10000, ganho: false },
      { key: 'prata', label: 'Prata', limiar: 25000, ganho: false },
      { key: 'ouro', label: 'Ouro', limiar: 50000, ganho: false },
    ],
  }),
  badge({ key: 'semana_100', name: 'Semana 100%', cor: 'ok', glifo: 'check', state: 'empty', centro: '+50', linha: 'a melhor: semana de 7 set 2026, índice 50' }),
  badge({
    key: 'recorde_pessoal', name: 'Recorde pessoal', cor: 'race', glifo: 'trophy', state: 'won', ring: 1, centro: '1', count: 1,
    sessoes: [{ kind: 'race', id: 'p2', raceId: 'p2', runId: 'run-p2', date: '2026-06-01', title: 'Prova p2', meta: '10 km · 48:20', status: 'conta', porque: 'O melhor tempo de sempre nesta distância.' }],
  }),
];

vi.mock('../../utils/useBadges', () => ({
  default: vi.fn(() => ({ badges: BADGES, due: [] })),
}));

import BadgesCard from './BadgesCard';

describe('BadgesCard — a grelha da Vitrina', () => {
  beforeEach(() => {
    useAppStore.setState({
      profile: { id: 'user-1' }, runs: [], raceEvents: [],
      editingRaceId: null, editingRunId: null, openCreationMode: null,
    });
  });

  it('mostra os badges em grelha, com o número dentro do anel e a contagem dos ganhos', () => {
    render(<BadgesCard />);
    const grelha = screen.getByTestId('badges-grelha');
    expect(grelha.querySelectorAll('button')).toHaveLength(4);
    expect(screen.getByTestId('badges-card')).toHaveTextContent('2 de 4');

    const ganho = screen.getByTestId('badge-tile-z2_mestre');
    expect(ganho).toHaveAttribute('data-state', 'won');
    expect(within(ganho).getByTestId('badge-ring-z2_mestre')).toHaveTextContent('94');
    expect(ganho).toHaveTextContent('2×');

    // Por ganhar: o número mostra a melhor tentativa, não um vazio.
    expect(screen.getByTestId('badge-ring-semana_100')).toHaveTextContent('+50');
    expect(screen.getByTestId('badge-tile-escalada')).toHaveAttribute('data-state', 'progress');
  });

  it('a frase de progresso é a do badge mais perto, e abre o detalhe dele', () => {
    render(<BadgesCard />);
    const progresso = screen.getByTestId('badges-progresso');
    expect(progresso).toHaveTextContent('A Escalada — faltam 5 000 m para bronze');
    fireEvent.click(progresso);
    expect(screen.getByTestId('badge-detalhe-escalada')).toBeInTheDocument();
  });

  it('o detalhe abre com a regra, o progresso e as sessões agrupadas', () => {
    render(<BadgesCard />);
    fireEvent.click(screen.getByTestId('badge-tile-z2_mestre'));
    const ecra = screen.getByTestId('badge-detalhe-z2_mestre');
    expect(ecra).toHaveTextContent('Vitrina · Badges');
    expect(within(ecra).getByTestId('badge-detalhe-regra')).toHaveTextContent('A regra do badge X, numa frase inteira.');
    expect(ecra).toHaveTextContent('Ganho · 2×');
    expect(ecra).toHaveTextContent('Contaram');
    expect(ecra).toHaveTextContent('Não chegaram lá');
    expect(within(ecra).getByTestId('badge-sessao-run-r1')).toHaveTextContent('Longo matinal');
  });

  /* O ponto crítico da fase: uma sessão sem o dado não conta para lado
     nenhum, e o ecrã tem de o dizer com o caminho para resolver. */
  it('o detalhe diz quantas sessões ficaram por decidir e o que fazer', () => {
    render(<BadgesCard />);
    fireEvent.click(screen.getByTestId('badge-tile-z2_mestre'));
    const bloco = screen.getByTestId('badge-detalhe-indeterminadas');
    expect(bloco).toHaveTextContent('3 sessões ficaram por decidir');
    expect(bloco).toHaveTextContent('Abre o registo e preenche os minutos por zona.');
  });

  it('os níveis aparecem nos badges com escala', () => {
    render(<BadgesCard />);
    fireEvent.click(screen.getByTestId('badge-tile-escalada'));
    const niveis = screen.getByTestId('badge-detalhe-niveis');
    expect(niveis).toHaveTextContent('Bronze');
    expect(niveis).toHaveTextContent('10 000');
    expect(screen.getByTestId('badge-nivel-ouro')).toHaveAttribute('data-ganho', '0');
  });

  it('uma corrida da lista abre o registo; uma prova abre o hub', () => {
    render(<BadgesCard />);
    fireEvent.click(screen.getByTestId('badge-tile-z2_mestre'));
    fireEvent.click(screen.getByTestId('badge-sessao-run-r1'));
    expect(useAppStore.getState().editingRunId).toBe('r1');
    expect(useAppStore.getState().openCreationMode).toBe('run');
    expect(screen.queryByTestId('badge-detalhe-z2_mestre')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('badge-tile-recorde_pessoal'));
    fireEvent.click(screen.getByTestId('badge-sessao-race-p2'));
    expect(useAppStore.getState().editingRaceId).toBe('p2');
  });
});
