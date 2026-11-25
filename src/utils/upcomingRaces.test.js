import { describe, it, expect } from 'vitest';
import { upcomingRaces } from './upcomingRaces';

/* A próxima prova, a mesma no «Para onde vou» e no Início v2 (revisão de 2026-11-25). */
const T = '2026-11-25';
describe('upcomingRaces', () => {
  it('as por fazer por data; as concluídas saem', () => {
    const r = upcomingRaces({ today: T, raceEvents: [
      { id: 'b', date: '2026-12-20', status: 'agendada' },
      { id: 'a', date: '2026-11-30', status: 'agendada' },
      { id: 'x', date: '2026-12-01', status: 'concluida' },
    ] });
    expect(r.map((e) => e.id)).toEqual(['a', 'b']);
  });
  it('as dos últimos 7 dias ficam enquanto não estão registadas', () => {
    const races = [{ id: 'p', date: '2026-11-20', status: 'agendada' }, { id: 'velha', date: '2026-11-10', status: 'agendada' }];
    expect(upcomingRaces({ today: T, raceEvents: races }).map((e) => e.id)).toEqual(['p']);
    expect(upcomingRaces({ today: T, raceEvents: races, isRegistered: (id) => id === 'p' })).toEqual([]);
  });
  it('as jornadas fixas do Troféu futuras saem; a de hoje fica', () => {
    const races = [{ id: 'j1', date: T, status: 'agendada' }, { id: 'j2', date: '2026-12-06', status: 'agendada' }];
    expect(upcomingRaces({ today: T, raceEvents: races, cupFixed: () => true }).map((e) => e.id)).toEqual(['j1']);
  });
});
