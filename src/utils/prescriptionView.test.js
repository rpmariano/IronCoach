import { describe, it, expect } from 'vitest';
import { blockTarget, prescriptionExercises, exercisesSummary } from './prescriptionView';

describe('prescriptionView', () => {
  it('força: nome, séries×reps e objetivo, por ordem', () => {
    const ex = prescriptionExercises({ blocks: [
      { type: 'forca', name: ' Cadeira extensora ', sets: 3, reps: 12, goal: 'descida em 2 s' },
      { type: 'forca', name: 'Leg press', sets: 3, reps: 10 },
    ] });
    expect(ex).toEqual([
      { name: 'Cadeira extensora', target: '3×12', goal: 'descida em 2 s' },
      { name: 'Leg press', target: '3×10', goal: '' },
    ]);
  });

  it('blocos sem reps: cardio por duração/distância/voltas, ou só séries', () => {
    expect(blockTarget({ type: 'cardio', duration_min: 20 })).toBe('20 min');
    expect(blockTarget({ type: 'cardio', distance_km: 2, laps: 4 })).toBe('2 km · 4 voltas');
    expect(blockTarget({ type: 'cardio', laps: 1 })).toBe('1 volta');
    expect(blockTarget({ type: 'cardio', duration_min: 12.5 })).toBe('12,5 min');
    expect(blockTarget({ type: 'forca', sets: 4 })).toBe('4 séries');
    expect(blockTarget({ type: 'forca', name: 'x' })).toBe('');
  });

  it('valores absurdos não são alvos (defesa extra)', () => {
    expect(blockTarget({ sets: 999, reps: 12 })).toBe('12 reps');
    expect(blockTarget({ sets: 3, reps: 5000 })).toBe('3 séries');
    expect(blockTarget({ duration_min: 99999, distance_km: 2 })).toBe('2 km');
    expect(blockTarget({ sets: 3, reps: 12 })).toBe('3×12');
  });

  it('um bloco sem nome cai; sem prescrição, lista vazia e sem resumo', () => {
    expect(prescriptionExercises({ blocks: [{ sets: 3, reps: 8 }, null, { name: '  ' }] })).toEqual([]);
    expect(prescriptionExercises(null)).toEqual([]);
    expect(prescriptionExercises({ blocks: 'x' })).toEqual([]);
    expect(exercisesSummary([])).toBeNull();
  });

  it('resumo: conta, três nomes e «e mais N»', () => {
    const n = (name) => ({ name, target: '', goal: '' });
    expect(exercisesSummary([n('A')])).toBe('1 exercício: A');
    expect(exercisesSummary([n('A'), n('B'), n('C')])).toBe('3 exercícios: A, B, C');
    expect(exercisesSummary([n('A'), n('B'), n('C'), n('D'), n('E')])).toBe('5 exercícios: A, B, C e mais 2');
  });
});
