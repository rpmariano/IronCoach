import { describe, it, expect } from 'vitest';
import { checkinReply, checkinStreak } from './checkinReply';
import { expectCarolVoice } from '../test/carolVoice';

/* A resposta da Carol ao check-in: o que preocupa primeiro, o raro só com
   motivo, e o dia normal curto — tem de aguentar a centésima vez. */

const HOJE = '2026-09-19';
const dia = (date, o = {}) => ({ date, sleep: 3, energy: 3, stress: 2, pain: 0, ...o });

describe('checkinReply', () => {
  it('sem check-in hoje, nada', () => {
    expect(checkinReply([dia('2026-09-18')], HOJE)).toBeNull();
  });

  it('o dia normal é curto e seco', () => {
    expect(checkinReply([dia(HOJE)], HOJE)).toMatchObject({ text: 'Anotado. Dia normal.', mood: 'neutral' });
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
    expect(checkinReply(semana.slice(1), HOJE).text).toBe('Anotado. Dia normal.');
  });

  /* Pedido 2026-09-26: a resposta sabe o que o dia é. "Nem se olha para o
     relógio" num dia de descanso, ou "Dia normal" na manhã da prova, lembram
     ao atleta que está a falar com uma máquina. */
  const TIPOS = ['treino', 'feito', 'descanso', 'semTreino', 'semPlano', 'prova'];
  const sem = (tipo) => ({ tipo, corrida: tipo === 'treino', vespera: false });

  it('num dia sem treino por fazer, nenhuma resposta fala do treino de hoje', () => {
    const casos = [{ pain: 5 }, { sleep: 1 }, { stress: 5 }, { energy: 1 }, { pain: 2 }, { sleep: 5, energy: 5 }, {}];
    for (const tipo of ['descanso', 'semTreino', 'semPlano', 'feito']) {
      for (const o of casos) {
        const { text } = checkinReply([dia(HOJE, o)], HOJE, sem(tipo));
        expect(text, `${tipo} ${JSON.stringify(o)}`).not.toMatch(/relógio|treino de hoje (apanha|faz-se)|Se o plano|não somo|Hoje não se força, e/);
      }
    }
  });

  it('dia de descanso: o sono mau e a energia em baixo dizem o descanso', () => {
    expect(checkinReply([dia(HOJE, { sleep: 2 })], HOJE, sem('descanso')).text).toBe('Dormiste mal. Ainda bem que hoje é descanso.');
    expect(checkinReply([dia(HOJE, { energy: 1 })], HOJE, sem('descanso')).text).toBe('Energia em baixo. Hoje é descanso, e é disso que precisas.');
    expect(checkinReply([dia(HOJE, { sleep: 5, energy: 5 })], HOJE, sem('descanso')).text).toBe('Energia em cheio e sono em dia. Hoje descansas na mesma: guarda-a para o próximo treino.');
  });

  it('com uma corrida por fazer, e só com ela, "nem se olha para o relógio"', () => {
    expect(checkinReply([dia(HOJE, { sleep: 2 })], HOJE, sem('treino')).text).toBe('Dormiste mal. Hoje não se força nada, nem se olha para o relógio.');
    expect(checkinReply([dia(HOJE, { sleep: 2 })], HOJE, { tipo: 'treino', corrida: false }).text).toBe('Dormiste mal. Hoje não se força nada.');
  });

  it('o dia da prova e a véspera não são dias normais', () => {
    expect(checkinReply([dia(HOJE)], HOJE, sem('prova')).text).toBe('Anotado. Hoje é dia de prova.');
    expect(checkinReply([dia(HOJE)], HOJE, { tipo: 'descanso', corrida: false, vespera: true }).text).toBe('Anotado. Amanhã é dia de prova.');
    expect(checkinReply([dia(HOJE, { sleep: 1 })], HOJE, sem('prova')).text).toBe('Dormiste mal. Na noite antes da prova é normal, e não estraga a corrida.');
    expect(checkinReply([dia(HOJE, { stress: 5 })], HOJE, sem('prova')).text).toMatch(/^Nervos de dia de prova/);
    expect(checkinReply([dia(HOJE, { pain: 6 })], HOJE, sem('prova')).text).toBe('Uma dor de 6 não se ignora. Quero falar contigo antes da partida.');
  });

  it('a terceira noite má seguida não se conta como a segunda', () => {
    const noites = [dia('2026-09-17', { sleep: 2 }), dia('2026-09-18', { sleep: 1 }), dia(HOJE, { sleep: 2 })];
    expect(checkinReply(noites, HOJE).text).toMatch(/^Três noites más seguidas\./);
  });

  it('o reconhecimento não passa por cima de um dia em baixo', () => {
    // Dormiu melhor, mas sem energia: não é "era disto que precisavas".
    expect(checkinReply([dia('2026-09-18', { sleep: 1 }), dia(HOJE, { sleep: 4, energy: 1 })], HOJE).text).toMatch(/^Energia em baixo/);
    // Energia em cheio com uma dor: a dor diz-se.
    expect(checkinReply([dia(HOJE, { sleep: 5, energy: 5, pain: 2 })], HOJE).text).toMatch(/^Uma dor ligeira/);
  });

  it('a voz dela em todos os tipos de dia', () => {
    const casos = [{ pain: 5 }, { sleep: 1 }, { stress: 5 }, { energy: 1 }, { pain: 2 }, { sleep: 5, energy: 5 }, {}];
    for (const tipo of TIPOS) for (const o of casos) expectCarolVoice(checkinReply([dia(HOJE, o)], HOJE, sem(tipo)).text);
  });

  it('a voz dela: nunca exclamações', () => {
    const casos = [{ pain: 5 }, { sleep: 1 }, { stress: 5 }, { energy: 1 }, { pain: 2 }, { sleep: 5, energy: 5 }, {}];
    for (const o of casos) expectCarolVoice(checkinReply([dia(HOJE, o)], HOJE).text);
  });
});
