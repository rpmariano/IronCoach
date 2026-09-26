import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import { expectCarolVoice } from '../../test/carolVoice';
import { todayISO, addDaysISO } from '../../lib/utils';
import { raceMilestoneLine, RACE_MILESTONES, wasMilestoneSeen } from './raceMilestone';
import RaceCard from './RaceCard';

/* Os marcos da contagem: 100, 50, 30, 14, 7 e 3 dias — só nesses dias. */

describe('raceMilestoneLine', () => {
  it('uma frase por marco, e nada nos outros dias', () => {
    expect(RACE_MILESTONES.sort((a, b) => b - a)).toEqual([100, 50, 30, 14, 7, 3]);
    expect(raceMilestoneLine(30)).toBe('Um mês. A forma que vais ter no dia está a ser feita agora.');
    expect(raceMilestoneLine(29)).toBeNull();
    expect(raceMilestoneLine(1)).toBeNull();
    for (const d of RACE_MILESTONES) expectCarolVoice(raceMilestoneLine(d));
  });
});

/* Pedido 2026-09-26: cada marco escolhe-se pela condição que o torna
   verdadeiro — a prioridade da prova, a viabilidade que o hub mostra, e se há
   plano. No código antigo, cada um destes dizia a frase de sempre. */
describe('raceMilestoneLine — o marco pelo que a prova é', () => {
  it('prova B ou C: sem os marcos do polimento (14, 7, 3), dia a dia de 120 até à véspera', () => {
    for (const prioridade of ['b', 'c']) {
      const ditos = [];
      for (let d = 120; d >= 1; d -= 1) if (raceMilestoneLine(d, { prioridade, flags: [], comPlano: true })) ditos.push(d);
      expect(ditos).toEqual([100, 50, 30]);
    }
    // A principal tem-nos todos; sem prioridade, é a principal (o valor por omissão da coluna).
    for (const contexto of [{ prioridade: 'a' }, { prioridade: 'A' }, { prioridade: null }, {}]) {
      const ditos = [];
      for (let d = 120; d >= 1; d -= 1) if (raceMilestoneLine(d, { flags: [], comPlano: true, ...contexto })) ditos.push(d);
      expect(ditos).toEqual([100, 50, 30, 14, 7, 3]);
    }
  });

  it('a uma semana de uma prova C a meio de um bloco: nada de «descansa a sério»', () => {
    expect(raceMilestoneLine(7, { prioridade: 'c', comPlano: true })).toBeNull();
  });

  it('a uma semana da principal: com plano, o plano manda; sem plano, sem apontar para ele', () => {
    const comPlano = raceMilestoneLine(7, { prioridade: 'a', comPlano: true });
    expect(comPlano).toBe('Uma semana. Já não se ganha forma, só se perde frescura. Faz o que está no plano, e nada a mais.');
    const semPlano = raceMilestoneLine(7, { prioridade: 'a' });
    expect(semPlano).not.toMatch(/plano|Descansa a sério/);
    for (const t of [comPlano, semPlano]) expectCarolVoice(t);
  });

  it('aos 100 dias, o que o hub diz do tempo: insuficiente, suficiente, ou por ler', () => {
    const curto = raceMilestoneLine(100, { flags: ['tempo_insuficiente'] });
    expect(curto).toBe('Faltam 100 dias. Para esta distância é menos do que eu queria; cada semana tem de contar.');
    expect(raceMilestoneLine(100, { flags: [] })).toBe('Faltam 100 dias. Parece muito; é o tempo certo para construir sem pressa.');
    expect(raceMilestoneLine(100, { flags: ['volume_insuficiente'] })).toMatch(/tempo certo/);
    // Sem a viabilidade lida, ou a vermelho por outra razão: nem «tempo certo» nem «pouco».
    for (const flags of [null, ['ultra_para_iniciante']]) {
      const t = raceMilestoneLine(100, { flags });
      expect(t).toMatch(/^Faltam 100 dias\./);
      expect(t).not.toMatch(/tempo certo|menos do que eu queria/);
      expectCarolVoice(t);
    }
    expectCarolVoice(curto);
  });

  /* Revisão de 2026-09-26: a duas semanas da prova, «o que te vai levar lá
     já está feito» a quem não tinha uma única corrida registada no ciclo. */
  it('a duas semanas: «já está feito» só com corridas registadas no ciclo', () => {
    expect(raceMilestoneLine(14, { comCorridas: true })).toBe('Duas semanas. O que te vai levar lá já está feito; agora é afinar.');
    for (const contexto of [{ comCorridas: false }, {}]) {
      const t = raceMilestoneLine(14, contexto);
      expect(t).toBe('Duas semanas. Agora é chegar lá com as pernas frescas.');
      expect(t).not.toMatch(/já está feito/);
      expectCarolVoice(t);
    }
  });
});

/* Visto noutro dispositivo (ação 5.1): a impressão 'moment:milestone:<prova>:<dias>'
   lida do servidor conta como visto, mesmo sem a marca local. */
describe('wasMilestoneSeen', () => {
  const semStorage = { getItem: () => null, setItem: () => {} };

  it('a impressão deste marco conta como visto; outro marco ou outra prova, não', () => {
    expect(wasMilestoneSeen('u1', 'r1', 30, new Set(['moment:milestone:r1:30']), semStorage)).toBe(true);
    expect(wasMilestoneSeen('u1', 'r1', 30, new Set(['moment:milestone:r1:14']), semStorage)).toBe(false);
    expect(wasMilestoneSeen('u1', 'r1', 30, new Set(['moment:milestone:r2:30']), semStorage)).toBe(false);
  });
});

describe('RaceCard — o marco no cartão', () => {
  let logImpression;
  beforeEach(() => {
    window.localStorage.clear();
    logImpression = vi.fn();
    useAppStore.setState({ session: { user: { id: 'u1' } }, profile: { id: 'u1' }, welcomeGate: 'clear', logImpression, impressionShown: new Set() });
  });

  const renderAt = (days, runs = []) => render(
    <RaceCard raceEvents={[{ id: 'r1', name: 'Meia de Lisboa', date: addDaysISO(todayISO(), days), status: 'agendada', distance_km: 21.1 }]} runs={runs} profile={{}} />,
  );

  it('a 30 dias, a Carol diz o marco — com o momento só na primeira vez', () => {
    const { unmount } = renderAt(30);
    expect(screen.getByTestId('race-milestone')).toHaveTextContent('Um mês.');
    expect(screen.getByTestId('race-milestone').querySelector('.race-milestone-line')).not.toBeNull();
    // O momento fica em coach_impressions (ação 5.1): prova e dias, sem título.
    expect(logImpression).toHaveBeenCalledWith({ kind: 'moment', key: 'milestone:r1:30', title: null });
    unmount();
    renderAt(30);
    expect(screen.getByTestId('race-milestone').querySelector('.race-milestone-line')).toBeNull();
    expect(logImpression).toHaveBeenCalledTimes(1);
  });

  it('marco visto noutro dispositivo: a frase fica, sem momento nem nova impressão', () => {
    useAppStore.setState({ impressionShown: new Set(['moment:milestone:r1:30']) });
    renderAt(30);
    expect(screen.getByTestId('race-milestone')).toHaveTextContent('Um mês.');
    expect(screen.getByTestId('race-milestone').querySelector('.race-milestone-line')).toBeNull();
    expect(logImpression).not.toHaveBeenCalled();
  });

  it('a 14 dias sem uma corrida registada no ciclo: nada de «já está feito»', () => {
    const { unmount } = renderAt(14);
    expect(screen.getByTestId('race-milestone')).toHaveTextContent('Duas semanas. Agora é chegar lá com as pernas frescas.');
    unmount();
    // Uma corrida de há mais de um ano não é deste ciclo.
    const { unmount: fora } = renderAt(14, [{ id: 'x0', date: addDaysISO(todayISO(), -400), distance_km: 10 }]);
    expect(screen.getByTestId('race-milestone')).not.toHaveTextContent(/já está feito/);
    fora();
    renderAt(14, [{ id: 'x1', date: addDaysISO(todayISO(), -3), distance_km: 10 }]);
    expect(screen.getByTestId('race-milestone')).toHaveTextContent('Duas semanas. O que te vai levar lá já está feito; agora é afinar.');
  });

  it('a 29 dias, nada', () => {
    renderAt(29);
    expect(screen.queryByTestId('race-milestone')).not.toBeInTheDocument();
    expect(logImpression).not.toHaveBeenCalled();
  });
});
