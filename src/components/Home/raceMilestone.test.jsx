import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
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
    for (const d of RACE_MILESTONES) expect(raceMilestoneLine(d)).not.toMatch(/!/);
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

  const renderAt = (days) => render(
    <RaceCard raceEvents={[{ id: 'r1', name: 'Meia de Lisboa', date: addDaysISO(todayISO(), days), status: 'agendada', distance_km: 21.1 }]} runs={[]} profile={{}} />,
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

  it('a 29 dias, nada', () => {
    renderAt(29);
    expect(screen.queryByTestId('race-milestone')).not.toBeInTheDocument();
    expect(logImpression).not.toHaveBeenCalled();
  });
});
