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

describe('registo unificado — exercícios', async () => {
  const { exercisesFromSession, renameExercise, newExercise, newSet, buildExercisesMeta, flattenExercises: flat } = await import('./gymSets');

  it('exercisesFromSession: agrupa, lê o objetivo do exercises_meta e reconhece o cardio', () => {
    const ex = exercisesFromSession({
      exercises_meta: [{ name: 'Prensa', goal: 'descida em 3 s', block_type: 'forca' }],
      workout_session_sets: [
        { id: 'a', exercise_name: 'Prensa', set_index: 1, reps: 8, weight: 85 },
        { id: 'b', exercise_name: 'Prensa', set_index: 0, reps: 10, weight: 80 },
        { id: 'c', exercise_name: 'Remo', set_index: 0, reps: null, weight: null, duration_seconds: 600, distance_km: 2 },
      ],
    });
    expect(ex.map(e => [e.name, e.type, e.goal])).toEqual([['Prensa', 'forca', 'descida em 3 s'], ['Remo', 'cardio', '']]);
    expect(ex[0].sets.map(s => s.reps)).toEqual([10, 8]);
    expect(ex[1].sets[0]).toMatchObject({ durationMin: '10', distance: '2000' });
    expect(ex[1].fields).toEqual(['duration', 'distance']);
  });

  it('ida e volta: o remo em metros grava-se em km', () => {
    const [remo] = exercisesFromSession({ workout_session_sets: [{ exercise_name: 'Remo', set_index: 0, duration_seconds: 600, distance_km: 2 }] });
    expect(flat([remo])).toEqual([{ exercise_name: 'Remo', set_index: 0, reps: null, weight: null, duration_seconds: 600, distance_km: 2, laps: null }]);
  });

  it('renameExercise: um exercício vazio passa a cardio; com valores não mexe', () => {
    expect(renameExercise(newExercise({ type: 'forca' }), 'Elíptica').type).toBe('cardio');
    const cheio = newExercise({ type: 'forca', sets: [newSet({ reps: '10' })] });
    expect(renameExercise(cheio, 'Elíptica').type).toBe('forca');
  });

  it('buildExercisesMeta: um por nome, sem vazios', () => {
    const meta = buildExercisesMeta([newExercise({ name: 'Supino', type: 'forca', goal: ' RIR 2 ' }), newExercise({ name: 'supino' }), newExercise({ name: '' })]);
    expect(meta).toEqual([{ name: 'Supino', goal: 'RIR 2', block_type: 'forca', plan_block_index: null, goal_met: null }]);
  });
});
