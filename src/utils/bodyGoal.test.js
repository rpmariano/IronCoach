import { describe, it, expect } from 'vitest';
import { bodyGoalMoment } from './bodyGoal';
import { expectCarolVoice } from '../test/carolVoice';

/* A meta do Corpo alcançada: só a travessia conta, a composição primeiro. */

const av = (id, date, o = {}) => ({ id, date, weight_kg: 76, body_fat_pct: 18, muscle_mass_kg: 34, ...o });

describe('bodyGoalMoment', () => {
  it('o peso chega à meta a descer', () => {
    const m = bodyGoalMoment(av('n', '2026-09-19', { weight_kg: 71.8 }), [av('a', '2026-09-01', { weight_kg: 72.6 })], { goal_weight_kg: 72 });
    expect(m).toMatchObject({ field: 'weight_kg', title: 'Chegaste aos 72 kg.' });
  });

  it('e também a subir, quando a meta é ganhar', () => {
    const m = bodyGoalMoment(av('n', '2026-09-19', { weight_kg: 70.2 }), [av('a', '2026-09-01', { weight_kg: 69.1 })], { goal_weight_kg: 70 });
    expect(m?.field).toBe('weight_kg');
  });

  it('a gordura passa a meta: vem antes do peso', () => {
    const m = bodyGoalMoment(av('n', '2026-09-19', { body_fat_pct: 14.9, weight_kg: 71.9 }), [av('a', '2026-09-01', { body_fat_pct: 15.6, weight_kg: 72.4 })], { goal_body_fat_pct: 15, goal_weight_kg: 72 });
    expect(m).toMatchObject({ field: 'body_fat_pct', title: 'Gordura corporal nos 14,9%.' });
  });

  it('quem já lá estava não recebe um "chegaste" a cada avaliação', () => {
    expect(bodyGoalMoment(av('n', '2026-09-19', { weight_kg: 71 }), [av('a', '2026-09-01', { weight_kg: 71.5 })], { goal_weight_kg: 72 })).toBeNull();
  });

  it('sem avaliação anterior, sem meta, ou ainda longe: nada', () => {
    expect(bodyGoalMoment(av('n', '2026-09-19', { weight_kg: 70 }), [], { goal_weight_kg: 72 })).toBeNull();
    expect(bodyGoalMoment(av('n', '2026-09-19'), [av('a', '2026-09-01')], {})).toBeNull();
    expect(bodyGoalMoment(av('n', '2026-09-19', { muscle_mass_kg: 34.5 }), [av('a', '2026-09-01')], { goal_muscle_mass_kg: 36 })).toBeNull();
  });

  it('conta sem a própria avaliação, e só com as de antes dela; nunca exclamações', () => {
    const nova = av('n', '2026-09-19', { muscle_mass_kg: 36.1 });
    const m = bodyGoalMoment(nova, [av('a', '2026-09-01'), nova, av('z', '2026-09-25', { muscle_mass_kg: 40 })], { goal_muscle_mass_kg: 36 });
    expect(m?.field).toBe('muscle_mass_kg');
    expectCarolVoice(`${m.title} ${m.sub}`);
  });
});
