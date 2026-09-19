import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import { todayISO, addDaysISO } from '../../lib/utils';
import { raceMilestoneLine, RACE_MILESTONES } from './raceMilestone';
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

describe('RaceCard — o marco no cartão', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAppStore.setState({ session: { user: { id: 'u1' } }, profile: { id: 'u1' } });
  });

  const renderAt = (days) => render(
    <RaceCard raceEvents={[{ id: 'r1', name: 'Meia de Lisboa', date: addDaysISO(todayISO(), days), status: 'agendada', distance_km: 21.1 }]} runs={[]} profile={{}} />,
  );

  it('a 30 dias, a Carol diz o marco — com o momento só na primeira vez', () => {
    const { unmount } = renderAt(30);
    expect(screen.getByTestId('race-milestone')).toHaveTextContent('Um mês.');
    expect(screen.getByTestId('race-milestone').querySelector('.race-milestone-line')).not.toBeNull();
    unmount();
    renderAt(30);
    expect(screen.getByTestId('race-milestone').querySelector('.race-milestone-line')).toBeNull();
  });

  it('a 29 dias, nada', () => {
    renderAt(29);
    expect(screen.queryByTestId('race-milestone')).not.toBeInTheDocument();
  });
});
