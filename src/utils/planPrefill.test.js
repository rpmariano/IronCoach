import { describe, it, expect } from 'vitest';
import { findPendingPlanItems, describePlanItem, exercisesFromPrescription, fillWeightsFromLocker, appendExercises } from './planPrefill';
import { lockerIndex, newExercise, newSet } from './gymSets';

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

describe('exercisesFromPrescription', () => {
  const LOCKER = lockerIndex([{ name: 'Extensões de pernas', name_key: 'extensoes de pernas', last_weight: 40, last_reps: 10 }]);
  const RX = { blocks: [
    { type: 'forca', name: 'Extensões de pernas', sets: 3, reps: 12, goal: 'chegar às 12' },
    { type: 'forca', name: 'Prensa', sets: 2, reps: 10 },
    { type: 'cardio', name: 'Remo', duration_min: 10, distance_km: 2 },
    { type: 'cardio', name: 'Piscina', laps: 20 },
    { name: '  ' },
  ] };

  it('força: N séries com as reps alvo e o kg da última vez; sem histórico, kg vazio', () => {
    const [ext, prensa] = exercisesFromPrescription(RX, LOCKER);
    expect(ext).toMatchObject({ name: 'Extensões de pernas', type: 'forca', goal: 'chegar às 12', planBlockIndex: 0 });
    expect(ext.sets.map(s => [s.reps, s.weight])).toEqual([['12', '40'], ['12', '40'], ['12', '40']]);
    expect(prensa.sets.map(s => [s.reps, s.weight])).toEqual([['10', ''], ['10', '']]);
  });

  it('cardio: os campos do exercício, com os alvos; o remo em metros', () => {
    const [, , remo, piscina] = exercisesFromPrescription(RX, LOCKER);
    expect(remo).toMatchObject({ type: 'cardio', fields: ['duration', 'distance'], distanceUnit: 'm', planBlockIndex: 2 });
    expect(remo.sets[0]).toMatchObject({ durationMin: '10', distance: '2000' });
    expect(piscina.fields).toEqual(['duration', 'laps']);
    expect(piscina.sets[0].laps).toBe('20');
  });

  it('sem prescrição ou lixo: lista vazia; séries limitadas a 10', () => {
    expect(exercisesFromPrescription(null, LOCKER)).toEqual([]);
    expect(exercisesFromPrescription({ blocks: 'x' }, LOCKER)).toEqual([]);
    expect(exercisesFromPrescription({ blocks: [{ type: 'forca', name: 'A', sets: 99, reps: 5 }] }, LOCKER)[0].sets).toHaveLength(10);
  });
});

describe('fillWeightsFromLocker', () => {
  const LOCKER = lockerIndex([{ name: 'Prensa', name_key: 'prensa', last_weight: 80 }]);
  it('só preenche kg vazios de séries do plano por confirmar; o resto fica', () => {
    const plano = newExercise({ name: 'Prensa', type: 'forca', planBlockIndex: 0, sets: [newSet({ reps: '10' }), newSet({ reps: '10', weight: '70' }), newSet({ reps: '10', done: true })] });
    const livre = newExercise({ name: 'Prensa', type: 'forca', sets: [newSet({ reps: '10' })] });
    const [a, b] = fillWeightsFromLocker([plano, livre], LOCKER);
    expect(a.sets.map(s => s.weight)).toEqual(['80', '70', '']);
    expect(b.sets[0].weight).toBe('');
  });
  it('nada a mudar devolve a mesma lista', () => {
    const list = [newExercise({ name: 'Outro', type: 'forca', planBlockIndex: 0 })];
    expect(fillWeightsFromLocker(list, LOCKER)).toBe(list);
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
