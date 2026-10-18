import { describe, it, expect } from 'vitest';
import { parseDurationInput, formatDurationInput, flattenExercises } from './gymSets';

describe('parseDurationInput', () => {
  it('lê minutos, mm:ss e hh:mm:ss', () => {
    expect(parseDurationInput('45')).toBe(2700);
    expect(parseDurationInput('45m')).toBe(2700);
    expect(parseDurationInput('45:30')).toBe(2730);
    expect(parseDurationInput('1:05:10')).toBe(3910);
  });
  it('vazio ou lixo dá null', () => {
    expect(parseDurationInput('  ')).toBeNull();
    expect(parseDurationInput('abc')).toBeNull();
  });
});

describe('formatDurationInput', () => {
  it('é o inverso do parse', () => {
    expect(formatDurationInput(2730)).toBe('45:30');
    expect(formatDurationInput(3910)).toBe('1:05:10');
    expect(formatDurationInput(0)).toBe('');
    expect(formatDurationInput(null)).toBe('');
  });
});

describe('flattenExercises', () => {
  it('achata exercícios em linhas e salta nomes vazios e séries sem dados', () => {
    const rows = flattenExercises([
      { name: ' Prensa ', sets: [{ reps: '10', weight: '80' }, { reps: '', weight: '' }, { reps: '8', weight: '' }] },
      { name: '  ', sets: [{ reps: '5', weight: '5' }] },
    ]);
    expect(rows).toEqual([
      { exercise_name: 'Prensa', set_index: 0, reps: 10, weight: 80 },
      { exercise_name: 'Prensa', set_index: 2, reps: 8, weight: null },
    ]);
  });
});
