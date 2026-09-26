import { describe, it, expect } from 'vitest';
import {
  CALENDAR_FILTER_ALL,
  normalizeCalendarFilter,
  isCalendarFilterActive,
  raceMatchesStatus,
  filterCalendarRecords,
  calendarFilterLabel,
  emptyDayMessage,
} from './calendarFilter';

const RECORDS = {
  runs: [{ id: 'run-1' }],
  raceEvents: [
    { id: 'race-feita', status: 'concluida' },
    { id: 'race-agendada', status: 'agendada' },
    // Sem estado nenhum (registos antigos): conta como por realizar.
    { id: 'race-sem-estado' },
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

  it('o estado das provas só vale dentro de "Prova"', () => {
    expect(normalizeCalendarFilter({ type: 'prova', raceStatus: 'concluida' })).toEqual({ type: 'prova', raceStatus: 'concluida' });
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

  it('"Prova" com estado filtra as provas por ele', () => {
    expect(ids(filterCalendarRecords(RECORDS, { type: 'prova', raceStatus: 'concluida' }).raceEvents)).toEqual(['race-feita']);
    expect(ids(filterCalendarRecords(RECORDS, { type: 'prova', raceStatus: 'por_realizar' }).raceEvents)).toEqual(['race-agendada', 'race-sem-estado']);
    const todas = filterCalendarRecords(RECORDS, { type: 'prova' });
    expect(todas.raceEvents).toHaveLength(3);
    expect(todas.runs).toEqual([]);
  });

  it('listas em falta não rebentam', () => {
    expect(filterCalendarRecords({}, { type: 'prova' }).raceEvents).toEqual([]);
    expect(filterCalendarRecords(undefined, CALENDAR_FILTER_ALL).runs).toEqual([]);
  });
});

describe('calendarFilter — textos', () => {
  it('o nome do filtro ativo, ou null sem filtro', () => {
    expect(calendarFilterLabel(CALENDAR_FILTER_ALL)).toBeNull();
    expect(calendarFilterLabel({ type: 'prova' })).toBe('Provas');
    expect(calendarFilterLabel({ type: 'prova', raceStatus: 'por_realizar' })).toBe('Provas por realizar');
    expect(calendarFilterLabel({ type: 'prova', raceStatus: 'concluida' })).toBe('Provas concluídas');
    expect(calendarFilterLabel({ type: 'corrida' })).toBe('Corridas');
  });

  it('o dia vazio diz o que falta à luz do filtro', () => {
    expect(emptyDayMessage(CALENDAR_FILTER_ALL)).toBe('Sem registos neste dia');
    expect(emptyDayMessage({ type: 'prova', raceStatus: 'concluida' })).toBe('Sem provas concluídas neste dia');
    expect(emptyDayMessage({ type: 'nutricao' })).toBe('Sem refeições neste dia');
    expect(emptyDayMessage({ type: 'corpo' })).toBe('Sem avaliações neste dia');
  });
});
