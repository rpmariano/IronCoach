import { describe, it, expect } from 'vitest';
import { describeRaceClassification, describeRaceTimes, RACE_RESULT_FIELDS } from './run';

/* O que o diploma traz (pedido 2026-09-13): dorsal, escalão, posições e
   participantes, guardados em runs.details e lidos numa linha só. */

describe('describeRaceClassification', () => {
  it('escreve só o que existe, pela ordem geral · escalão · género · dorsal', () => {
    const d = { position: 312, participants: 1850, age_group: 'M40', age_group_position: 41, gender_position: 280, bib_number: '1234' };
    expect(describeRaceClassification(d, 'M')).toBe('312.º geral de 1 850 · 41.º M40 · 280.º masculino · dorsal 1234');
    expect(describeRaceClassification({ position: 12 })).toBe('12.º geral');
    expect(describeRaceClassification({ participants: 900 })).toBe('900 participantes');
    expect(describeRaceClassification({ age_group: 'F35' })).toBe('escalão F35');
    expect(describeRaceClassification({ gender_position: 5 }, 'F')).toBe('5.º feminino');
    expect(describeRaceClassification({ gender_position: 5 })).toBe('5.º no género');
    expect(describeRaceClassification({ bib_number: 77 })).toBe('dorsal 77');
  });

  it('ignora zeros, lixo e a ausência de detalhes', () => {
    expect(describeRaceClassification({ position: 0, participants: 'abc', age_group: '  ' })).toBe('');
    expect(describeRaceClassification(null)).toBe('');
    expect(RACE_RESULT_FIELDS).toEqual(['bib_number', 'age_group', 'age_group_position', 'gender_position', 'participants', 'gun_time_seconds', 'official_splits']);
  });
});

describe('describeRaceTimes', () => {
  it('tempo bruto e parciais oficiais, só o que existe', () => {
    expect(describeRaceTimes({ gun_time_seconds: 3111, official_splits: [{ km: 5, seconds: 1515 }] })).toBe('tempo bruto 51:51 · passagem aos 5 km 25:15');
    expect(describeRaceTimes({ official_splits: [{ km: 0, seconds: 10 }, { km: 21.1, seconds: 6000 }] })).toBe('passagem aos 21.1 km 1:40:00');
    expect(describeRaceTimes({})).toBe('');
    expect(describeRaceTimes(null)).toBe('');
  });
});
