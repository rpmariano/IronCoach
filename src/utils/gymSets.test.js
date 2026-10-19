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

describe('ler prints e notas para o formulário (F2)', async () => {
  const { mergePreview, exercisesFromPreview, readSummary, newExercise, newSet } = await import('./gymSets');
  const form = (over = {}) => ({ kind: 'forca', categories: [], classTypes: [], name: '', durationStr: '', calories: '', avgHr: '', maxHr: '', exertion: '', exercises: [], ...over });
  const PREVIEW = {
    session_name: 'Pernas', categories: ['Pernas Inferiores'], class_types: [],
    metrics: { duration_seconds: 3000, calories_kcal: 400, avg_hr: null, max_hr: 150, exertion: 7 },
    exercises: [
      { name: 'Extensões de pernas', type: 'forca', plan_block_index: 0, sets: [{ reps: 12, weight: 40 }, { reps: 12, weight: 40 }] },
      { name: 'Bicicleta', type: 'cardio', plan_block_index: null, sets: [{ duration_seconds: 1200, distance_km: 8 }] },
    ],
  };

  it('exercisesFromPreview: força com séries, cardio com tempo/km, e o objetivo vem do plano pelo índice', () => {
    const [ext, bike] = exercisesFromPreview(PREVIEW, [{ name: 'Extensões de pernas', goal: 'chegar às 12' }]);
    expect(ext).toMatchObject({ name: 'Extensões de pernas', type: 'forca', goal: 'chegar às 12', planBlockIndex: 0 });
    expect(ext.sets.map(s => [s.reps, s.weight])).toEqual([[12, 40], [12, 40]]);
    expect(bike).toMatchObject({ type: 'cardio', fields: ['duration', 'distance'] });
    expect(bike.sets[0]).toMatchObject({ durationMin: '20', distance: '8' });
  });

  it('o remo lido em km volta a metros no formulário', () => {
    const [remo] = exercisesFromPreview({ exercises: [{ name: 'Remo', type: 'cardio', sets: [{ duration_seconds: 600, distance_km: 2 }] }] });
    expect(remo.sets[0].distance).toBe('2000');
    expect(remo.distanceUnit).toBe('m');
  });

  it('mergePreview: formulário vazio recebe tudo e conta', () => {
    const r = mergePreview(form(), PREVIEW);
    expect(r.patch).toMatchObject({ categories: ['Pernas Inferiores'], name: 'Pernas', durationStr: '50:00', calories: '400', maxHr: '150', exertion: 7 });
    expect(r.patch.avgHr).toBeUndefined();
    expect(r).toMatchObject({ exercises: 2, metrics: 4 });
    expect(r.patch.exercises).toHaveLength(2);
  });

  it('mergePreview: o que o atleta escreveu ganha à leitura', () => {
    const mine = newExercise({ name: 'extensoes de pernas', type: 'forca', sets: [newSet({ reps: '10', weight: '35' })] });
    const r = mergePreview(form({ categories: ['Ombros'], name: 'Meu treino', durationStr: '40m', exercises: [mine] }), PREVIEW);
    expect(r.patch.categories).toBeUndefined();
    expect(r.patch.name).toBeUndefined();
    expect(r.patch.durationStr).toBeUndefined();
    expect(r.patch.exercises.map(e => e.name)).toEqual(['extensoes de pernas', 'Bicicleta']);
    expect(r).toMatchObject({ exercises: 1, skipped: 1 });
  });

  it('mergePreview: uma linha em branco deixada aberta sai quando entram exercícios', () => {
    const r = mergePreview(form({ exercises: [newExercise({ type: 'forca' })] }), PREVIEW);
    expect(r.patch.exercises.map(e => e.name)).toEqual(['Extensões de pernas', 'Bicicleta']);
  });

  it('readSummary: a frase certa em cada caso', () => {
    expect(readSummary({ exercises: 3, metrics: 1, skipped: 0 }, 'foto')).toMatch(/Li 3 exercícios e 1 métrica\. Revê/);
    expect(readSummary({ exercises: 0, metrics: 0, skipped: 2 }, 'foto')).toMatch(/já tens esses exercícios/);
    expect(readSummary({ exercises: 0, metrics: 0, skipped: 0 }, 'foto')).toMatch(/Não consegui ler/);
    expect(readSummary({ exercises: 0, metrics: 0, skipped: 0 }, 'notas')).toMatch(/3x12 extensões/);
  });
});

describe('séries do plano: a sugestão segue a carga usada e o kg em branco completa-se ao gravar (N10)', async () => {
  const { setSuggestion, completePlanSets, newExercise, newSet, lockerIndex } = await import('./gymSets');
  const LOCKER = lockerIndex([{ name: 'Prensa', name_key: 'prensa', last_weight: 100, last_reps: 10 }]);
  const ex = () => newExercise({ name: 'Prensa', type: 'forca', planBlockIndex: 0, sets: [
    newSet({ plan: { reps: '12', weight: '' }, reps: '10', weight: '110' }),
    newSet({ plan: { reps: '12', weight: '' } }),
  ] });

  it('a série 2 sugere as reps do plano com a carga que ele usou na 1', () => {
    expect(setSuggestion(ex(), 1, LOCKER.get('prensa'))).toEqual({ reps: '12', weight: '110' });
  });

  it('completePlanSets: reps escritas sem kg levam o kg sugerido; o resto não mexe', () => {
    const e = ex();
    e.sets[1] = { ...e.sets[1], reps: '9' };
    const [out] = completePlanSets([e], LOCKER);
    expect(out.sets.map(s => [s.reps, s.weight])).toEqual([['10', '110'], ['9', '110']]);
    const livre = newExercise({ name: 'Prensa', type: 'forca', sets: [newSet({ reps: '8' })] });
    expect(completePlanSets([livre], LOCKER)[0]).toBe(livre);
  });
});

describe('goal_met misto no exercises_meta (decisão 9)', async () => {
  const { buildExercisesMeta, newExercise, exercisesFromSession } = await import('./gymSets');
  it('só o qualitativo leva o que ele confirmou; o mensurável vai null (a Carol julga)', () => {
    const meta = buildExercisesMeta([
      { ...newExercise({ name: 'Supino', type: 'forca', goal: 'descida em 3 s' }), goalMet: true },
      { ...newExercise({ name: 'Prensa', type: 'forca', goal: 'chegar às 12 reps' }), goalMet: true },
      newExercise({ name: 'Remo sentado', type: 'forca', goal: 'descida em 2 s' }),
    ]);
    expect(meta.map(m => m.goal_met)).toEqual([true, null, null]);
  });
  it('editar uma sessão traz de volta o que ele confirmou', () => {
    const [ex] = exercisesFromSession({
      exercises_meta: [{ name: 'Supino', goal: 'descida em 3 s', block_type: 'forca', goal_met: false }],
      workout_session_sets: [{ id: 'a', exercise_name: 'Supino', set_index: 0, reps: 8, weight: 50 }],
    });
    expect(ex.goalMet).toBe(false);
  });
});

describe('afinação da máquina no exercises_meta (decisão 10)', async () => {
  const { buildExercisesMeta, newExercise } = await import('./gymSets');
  it('só vai quando ele a escreveu (ou apagou); senão fica de fora', () => {
    const meta = buildExercisesMeta([
      newExercise({ name: 'Leg Press', type: 'forca' }),
      { ...newExercise({ name: 'Supino', type: 'forca' }), machineSettings: ' banco furo 5 ' },
      { ...newExercise({ name: 'Remo sentado', type: 'forca' }), machineSettings: '' },
    ]);
    expect('machine_settings' in meta[0]).toBe(false);
    expect(meta[1].machine_settings).toBe('banco furo 5');
    expect(meta[2].machine_settings).toBe('');
  });
});
