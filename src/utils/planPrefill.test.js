import { describe, it, expect } from 'vitest';
import { findPendingPlanItems, describePlanItem, exercisesFromPrescription, appendExercises } from './planPrefill';
import { flattenExercises, lockerIndex, markAllDone, newExercise, newSet, setSuggestion } from './gymSets';

const PLANS = [{ id: 'p1', status: 'aceite' }, { id: 'p2', status: 'proposto' }, { id: 'p3', status: 'recusado' }];
const item = (over) => ({ id: 'i', plan_id: 'p1', planned_date: '2026-10-18', kind: 'ginasio', status: 'pendente', ...over });

describe('findPendingPlanItems', () => {
  it('só planos aceites, pendentes, do tipo e do dia', () => {
    const items = [
      item({ id: 'a' }),
      item({ id: 'b', plan_id: 'p2' }),
      item({ id: 'c', status: 'concluido' }),
      item({ id: 'd', kind: 'corrida' }),
      item({ id: 'e', planned_date: '2026-10-19' }),
      item({ id: 'f', plan_id: 'p3' }),
      item({ id: 'g' }),
    ];
    expect(findPendingPlanItems('ginasio', '2026-10-18', PLANS, items).map(i => i.id)).toEqual(['a', 'g']);
    expect(findPendingPlanItems('ginasio', '2026-10-18', null, null)).toEqual([]);
  });
});

describe('exercisesFromPrescription — os alvos do plano são sugestão, não valores', () => {
  const LOCKER = lockerIndex([{ name: 'Extensões de pernas', name_key: 'extensoes de pernas', last_weight: 40, last_reps: 10 }]);
  const RX = { blocks: [
    { type: 'forca', name: 'Extensões de pernas', sets: 3, reps: 12, goal: 'chegar às 12' },
    { type: 'forca', name: 'Prensa', sets: 2, reps: 10 },
    { type: 'cardio', name: 'Remo', duration_min: 10, distance_km: 2 },
    { type: 'cardio', name: 'Piscina', laps: 20 },
    { name: '  ' },
  ] };

  it('força: N séries vazias com o alvo em plan; a sugestão junta o kg da última vez', () => {
    const [ext, prensa] = exercisesFromPrescription(RX);
    expect(ext).toMatchObject({ name: 'Extensões de pernas', type: 'forca', goal: 'chegar às 12', planBlockIndex: 0 });
    expect(ext.sets.map(s => [s.reps, s.weight, s.plan.reps])).toEqual([['', '', '12'], ['', '', '12'], ['', '', '12']]);
    expect(setSuggestion(ext, 0, LOCKER.get('extensoes de pernas'))).toEqual({ reps: '12', weight: 40 });
    expect(setSuggestion(prensa, 0, null)).toEqual({ reps: '10', weight: '' });
  });

  it('nada por confirmar se grava; "Marcar todas" grava o plano tal e qual', () => {
    const [ext] = exercisesFromPrescription(RX);
    expect(flattenExercises([ext])).toEqual([]);
    const feito = markAllDone(ext, LOCKER.get('extensoes de pernas'));
    expect(flattenExercises([feito]).map(r => [r.reps, r.weight])).toEqual([[12, 40], [12, 40], [12, 40]]);
  });

  it('cardio: os campos do exercício, com os alvos em plan; o remo em metros', () => {
    const [, , remo, piscina] = exercisesFromPrescription(RX);
    expect(remo).toMatchObject({ type: 'cardio', fields: ['duration', 'distance'], distanceUnit: 'm', planBlockIndex: 2 });
    expect(remo.sets[0]).toMatchObject({ durationMin: '', distance: '', plan: { durationMin: '10', distance: '2000' } });
    expect(piscina.fields).toEqual(['duration', 'laps']);
    expect(flattenExercises([markAllDone(remo, null)])[0]).toMatchObject({ duration_seconds: 600, distance_km: 2 });
  });

  it('sem prescrição ou lixo: lista vazia; séries limitadas a 10', () => {
    expect(exercisesFromPrescription(null)).toEqual([]);
    expect(exercisesFromPrescription({ blocks: 'x' })).toEqual([]);
    expect(exercisesFromPrescription({ blocks: [{ type: 'forca', name: 'A', sets: 99, reps: 5 }] })[0].sets).toHaveLength(10);
  });
});

describe('appendExercises e describePlanItem', () => {
  it('junta sem repetir nomes e tira linhas em branco', () => {
    const vazio = newExercise({ type: 'forca' });
    const meu = newExercise({ name: 'prensa', type: 'forca', sets: [newSet({ reps: '10' })] });
    const r = appendExercises([vazio, meu], [newExercise({ name: 'Prensa', type: 'forca' }), newExercise({ name: 'Remo', type: 'cardio' })]);
    expect(r.map(e => e.name)).toEqual(['prensa', 'Remo']);
  });
  it('describePlanItem: grupos, duração e exercícios', () => {
    expect(describePlanItem({ categories: ['Pernas Inferiores'], target_duration_min: 45, prescription: { blocks: [{ type: 'forca', name: 'Prensa', sets: 3, reps: 10 }] } }))
      .toBe('Pernas Inferiores · 45 min — Prensa 3×10');
    expect(describePlanItem({})).toBe('Treino de ginásio');
  });
});
