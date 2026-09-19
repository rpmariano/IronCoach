import { describe, it, expect } from 'vitest';
import { checkinReply, checkinStreak } from './checkinReply';

/* A resposta da Carol ao check-in: o que preocupa primeiro, o raro só com
   motivo, e o dia normal curto — tem de aguentar a centésima vez. */

const HOJE = '2026-09-19';
const dia = (date, o = {}) => ({ date, sleep: 3, energy: 3, stress: 2, pain: 0, ...o });

describe('checkinReply', () => {
  it('sem check-in hoje, nada', () => {
    expect(checkinReply([dia('2026-09-18')], HOJE)).toBeNull();
  });

  it('o dia normal é curto e seco', () => {
    expect(checkinReply([dia(HOJE)], HOJE)).toMatchObject({ text: 'Anotado. Dia normal, plano normal.', mood: 'neutral' });
  });

  it('a dor forte passa à frente de tudo, com o local', () => {
    const r = checkinReply([dia(HOJE, { pain: 6, pain_location: 'Canela', sleep: 1 })], HOJE);
    expect(r).toMatchObject({ mood: 'worried', tone: 'warn' });
    expect(r.text).toBe('Uma dor de 6 (canela) não se ignora. Hoje não se força, e quero falar contigo sobre ela.');
  });

  it('sono mau; e a segunda noite má seguida diz-se', () => {
    expect(checkinReply([dia(HOJE, { sleep: 2 })], HOJE).text).toMatch(/^Dormiste mal/);
    expect(checkinReply([dia('2026-09-18', { sleep: 1 }), dia(HOJE, { sleep: 2 })], HOJE).text).toMatch(/^Segunda noite má/);
  });

  it('melhor do que ontem', () => {
    expect(checkinReply([dia('2026-09-18', { sleep: 1 }), dia(HOJE, { sleep: 4 })], HOJE).text).toBe('Melhor do que ontem. Era disto que precisavas.');
  });

  it('energia em cheio com sono em dia', () => {
    expect(checkinReply([dia(HOJE, { sleep: 5, energy: 5 })], HOJE).mood).toBe('happy');
  });

  it('a sequência só se celebra nos números redondos', () => {
    const semana = Array.from({ length: 7 }, (_, i) => dia(`2026-09-${String(13 + i).padStart(2, '0')}`));
    expect(checkinStreak(semana, HOJE)).toBe(7);
    expect(checkinReply(semana, HOJE).text).toMatch(/^7 dias seguidos/);
    expect(checkinReply(semana.slice(1), HOJE).text).toBe('Anotado. Dia normal, plano normal.');
  });

  it('a voz dela: nunca exclamações', () => {
    const casos = [{ pain: 5 }, { sleep: 1 }, { stress: 5 }, { energy: 1 }, { pain: 2 }, { sleep: 5, energy: 5 }, {}];
    for (const o of casos) expect(checkinReply([dia(HOJE, o)], HOJE).text).not.toMatch(/!/);
  });
});
