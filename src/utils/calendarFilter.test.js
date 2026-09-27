import { describe, it, expect } from 'vitest';
import {
  CALENDAR_FILTER_ALL,
  normalizeCalendarFilter,
  isCalendarFilterActive,
  raceMatchesStatus,
  filterCalendarRecords,
  calendarFilterLabel,
  emptyDayMessage,
  listRacesByStatus,
  pageOf,
} from './calendarFilter';

const RECORDS = {
  runs: [{ id: 'run-1' }],
  raceEvents: [
    { id: 'race-feita', status: 'concluida', date: '2026-05-10' },
    { id: 'race-agendada', status: 'agendada', date: '2026-11-01' },
    // Sem estado nenhum (registos antigos): conta como por realizar.
    { id: 'race-sem-estado', date: '2026-10-05' },
  ],
  gymSessions: [{ id: 'gym-1' }],
  meals: [{ id: 'meal-1' }],
  bodyAssessments: [{ id: 'body-1' }],
};

const ids = (rows) => rows.map((r) => r.id);

describe('calendarFilter — normalizar', () => {
  it('sem filtro, ou com lixo, é "Tudo"', () => {
    expect(normalizeCalendarFilter(undefined)).toEqual(CALENDAR_FILTER_ALL);
    expect(normalizeCalendarFilter({ type: 'xpto', raceStatus: 'xpto' })).toEqual(CALENDAR_FILTER_ALL);
  });

  /* Pedido 2026-09-27: na "Prova" só há "Por realizar" e "Concluídas", e
     escolher "Prova" abre nas por realizar. */
  it('na "Prova" o estado é sempre um dos dois, e por omissão "por realizar"', () => {
    expect(normalizeCalendarFilter({ type: 'prova' })).toEqual({ type: 'prova', raceStatus: 'por_realizar' });
    expect(normalizeCalendarFilter({ type: 'prova', raceStatus: 'todas' })).toEqual({ type: 'prova', raceStatus: 'por_realizar' });
    expect(normalizeCalendarFilter({ type: 'prova', raceStatus: 'concluida' })).toEqual({ type: 'prova', raceStatus: 'concluida' });
  });

  it('fora da "Prova" o estado não se aplica', () => {
    expect(normalizeCalendarFilter({ type: 'corrida', raceStatus: 'concluida' })).toEqual({ type: 'corrida', raceStatus: 'todas' });
    expect(normalizeCalendarFilter({ type: 'todos', raceStatus: 'por_realizar' })).toEqual(CALENDAR_FILTER_ALL);
  });

  it('só está ativo com um tipo escolhido', () => {
    expect(isCalendarFilterActive(CALENDAR_FILTER_ALL)).toBe(false);
    expect(isCalendarFilterActive({ type: 'nutricao' })).toBe(true);
  });
});

describe('calendarFilter — estado das provas', () => {
  it('"Por realizar" é tudo o que ainda não está concluído, incluindo o que já passou', () => {
    expect(raceMatchesStatus({ status: 'agendada' }, 'por_realizar')).toBe(true);
    expect(raceMatchesStatus({}, 'por_realizar')).toBe(true);
    expect(raceMatchesStatus({ status: 'concluida' }, 'por_realizar')).toBe(false);
  });

  it('"Concluídas" é só status = concluida', () => {
    expect(raceMatchesStatus({ status: 'concluida' }, 'concluida')).toBe(true);
    expect(raceMatchesStatus({ status: 'agendada' }, 'concluida')).toBe(false);
  });
});

describe('calendarFilter — filtrar os registos', () => {
  it('"Tudo" deixa passar tudo', () => {
    const out = filterCalendarRecords(RECORDS, CALENDAR_FILTER_ALL);
    expect(ids(out.runs)).toEqual(['run-1']);
    expect(ids(out.raceEvents)).toEqual(['race-feita', 'race-agendada', 'race-sem-estado']);
    expect(ids(out.gymSessions)).toEqual(['gym-1']);
    expect(ids(out.meals)).toEqual(['meal-1']);
    expect(ids(out.bodyAssessments)).toEqual(['body-1']);
  });

  it('um tipo deixa só esse tipo', () => {
    const out = filterCalendarRecords(RECORDS, { type: 'ginasio' });
    expect(ids(out.gymSessions)).toEqual(['gym-1']);
    expect(out.runs).toEqual([]);
    expect(out.raceEvents).toEqual([]);
    expect(out.meals).toEqual([]);
    expect(out.bodyAssessments).toEqual([]);
  });

  it('"Prova" filtra as provas pelo estado (por omissão, as por realizar)', () => {
    expect(ids(filterCalendarRecords(RECORDS, { type: 'prova', raceStatus: 'concluida' }).raceEvents)).toEqual(['race-feita']);
    const porRealizar = filterCalendarRecords(RECORDS, { type: 'prova' });
    expect(ids(porRealizar.raceEvents)).toEqual(['race-agendada', 'race-sem-estado']);
    expect(porRealizar.runs).toEqual([]);
  });

  it('listas em falta não rebentam', () => {
    expect(filterCalendarRecords({}, { type: 'prova' }).raceEvents).toEqual([]);
    expect(filterCalendarRecords(undefined, CALENDAR_FILTER_ALL).runs).toEqual([]);
  });
});

describe('calendarFilter — a lista das provas', () => {
  it('por realizar: da mais próxima para a mais distante', () => {
    expect(ids(listRacesByStatus(RECORDS.raceEvents, 'por_realizar'))).toEqual(['race-sem-estado', 'race-agendada']);
  });

  it('concluídas: da mais recente para a mais antiga', () => {
    const races = [
      { id: 'a', status: 'concluida', date: '2025-03-01' },
      { id: 'b', status: 'concluida', date: '2026-04-01' },
      { id: 'c', status: 'agendada', date: '2026-12-01' },
    ];
    expect(ids(listRacesByStatus(races, 'concluida'))).toEqual(['b', 'a']);
  });

  it('sem data válida não entram', () => {
    expect(listRacesByStatus([{ id: 'x', status: 'agendada', date: null }, { id: 'y', status: 'agendada', date: 'amanhã' }], 'por_realizar')).toEqual([]);
  });

  it('pagina de 5 em 5, e a página fica sempre dentro dos limites', () => {
    const doze = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}` }));
    expect(pageOf(doze, 0)).toMatchObject({ page: 0, pages: 3, total: 12 });
    expect(ids(pageOf(doze, 0).items)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4']);
    expect(ids(pageOf(doze, 2).items)).toEqual(['r10', 'r11']);
    // Uma prova apagada na última página não a deixa vazia.
    expect(pageOf(doze, 7).page).toBe(2);
    expect(pageOf(doze, -1).page).toBe(0);
    expect(pageOf([], 0)).toMatchObject({ items: [], page: 0, pages: 1, total: 0 });
  });
});

describe('calendarFilter — textos', () => {
  it('o nome do filtro ativo, ou null sem filtro', () => {
    expect(calendarFilterLabel(CALENDAR_FILTER_ALL)).toBeNull();
    expect(calendarFilterLabel({ type: 'prova' })).toBe('Provas por realizar');
    expect(calendarFilterLabel({ type: 'prova', raceStatus: 'concluida' })).toBe('Provas concluídas');
    expect(calendarFilterLabel({ type: 'corrida' })).toBe('Corridas');
  });

  it('o vazio diz o que falta à luz do filtro', () => {
    expect(emptyDayMessage(CALENDAR_FILTER_ALL)).toBe('Sem registos neste dia');
    expect(emptyDayMessage({ type: 'prova' })).toBe('Sem provas por realizar');
    expect(emptyDayMessage({ type: 'prova', raceStatus: 'concluida' })).toBe('Ainda sem provas concluídas');
    expect(emptyDayMessage({ type: 'nutricao' })).toBe('Sem refeições neste dia');
    expect(emptyDayMessage({ type: 'corpo' })).toBe('Sem avaliações neste dia');
  });
});
