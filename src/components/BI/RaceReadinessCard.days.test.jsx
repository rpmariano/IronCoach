import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import RaceReadinessCard from './RaceReadinessCard';

/* Os dias até à prova (revisão de 2026-09-26). O cartão contava com
   differenceInDays sobre a data UTC: com a prova a 27, às 10:00 do dia 26
   já dizia "É hoje" (as horas eram truncadas), e às 00:30 do dia a seguir à
   prova dizia "Faltam -1 dias" (a data UTC ainda era a da prova). Conta-se
   agora pelo dia de Lisboa e por dias de calendário, como o biEngine. */
describe('RaceReadinessCard — dias até à prova', () => {
  let tzAntes;
  beforeAll(() => { tzAntes = process.env.TZ; process.env.TZ = 'Europe/Lisbon'; });
  afterAll(() => { process.env.TZ = tzAntes; });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    useAppStore.setState({ dailyCheckins: [] });
  });
  afterEach(() => { vi.useRealTimers(); });

  const prova = { id: 'r1', name: 'Corrida do Tejo', date: '2026-09-27', distance_km: 10, status: 'agendada' };
  const abrir = (instante, raceEvents = [prova]) => {
    vi.setSystemTime(new Date(instante));
    return render(
      <RaceReadinessCard runs={[]} meals={[]} bodyAssessments={[]} gymSessions={[]} raceEvents={raceEvents} profile={{}} />,
    );
  };

  it('na véspera às 10:00 diz "Amanhã", não "É hoje"', () => {
    abrir('2026-09-26T10:00:00+01:00');
    expect(screen.getByText('Amanhã')).toBeInTheDocument();
    expect(screen.queryByText('É hoje')).not.toBeInTheDocument();
  });

  it('no dia da prova diz "É hoje"', () => {
    abrir('2026-09-27T07:00:00+01:00');
    expect(screen.getByText('É hoje')).toBeInTheDocument();
  });

  it('às 00:30 do dia a seguir, a prova já passou: nunca "Faltam -1 dias"', () => {
    abrir('2026-09-28T00:30:00+01:00');
    expect(screen.queryByText(/Faltam -1 dias/)).not.toBeInTheDocument();
    expect(screen.queryByText('É hoje')).not.toBeInTheDocument();
    expect(screen.getByText('Nenhuma prova agendada')).toBeInTheDocument();
  });

  it('às 00:30 conta pelo dia de Lisboa, não pelo UTC', () => {
    abrir('2026-09-23T00:30:00+01:00');
    expect(screen.getByText('Faltam 4 dias')).toBeInTheDocument();
  });
});
