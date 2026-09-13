import { describe, it, expect } from 'vitest';
import { orderDayRecords, dayRecordMinutes, minutesOfDay } from './dayOrder';

/* A ordem do dia no Calendário (pedido 2026-09-13): pela hora, entre tipos. */

describe('orderDayRecords', () => {
  it('intercala corridas, treinos, refeições e a avaliação pela hora do dia', () => {
    const out = orderDayRecords({
      runs: [{ id: 'run-1', start_time: '18:30:00' }],
      gym: [{ id: 'gym-1', start_time: '07:00' }],
      meals: [{ id: 'meal-1', meal_type: 'almoco' }, { id: 'meal-2', meal_type: 'pequeno-almoco' }],
      body: [{ id: 'body-1' }],
    });
    expect(out.map((e) => `${e.kind}:${e.item.id}`)).toEqual(['body:body-1', 'gym:gym-1', 'meal:meal-2', 'meal:meal-1', 'run:run-1']);
  });

  it('sem hora vai para o fim, pela ordem de sempre; empates mantêm a ordem de entrada', () => {
    const out = orderDayRecords({
      runs: [{ id: 'run-a' }, { id: 'run-b', start_time: '09:00' }],
      gym: [{ id: 'gym-a' }, { id: 'gym-b', start_time: '09:00' }],
      meals: [{ id: 'meal-x', meal_type: 'desconhecido' }],
    });
    expect(out.map((e) => e.item.id)).toEqual(['run-b', 'gym-b', 'run-a', 'gym-a', 'meal-x']);
  });

  it('lê as duas grafias da hora e ignora o que não é hora', () => {
    expect(minutesOfDay('09:05:00')).toBe(545);
    expect(minutesOfDay('9:05')).toBe(545);
    expect(minutesOfDay('lixo')).toBeNull();
    expect(dayRecordMinutes('meal', { meal_type: 'jantar' })).toBe(1200);
    expect(dayRecordMinutes('body', {})).toBe(0);
    expect(dayRecordMinutes('outro', {})).toBeNull();
  });
});
