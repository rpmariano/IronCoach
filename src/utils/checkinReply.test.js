import { describe, it, expect } from 'vitest';
import { checkinReply, checkinStreak, DIA_NORMAL } from './checkinReply';
import { expectCarolVoice } from '../test/carolVoice';

/* A resposta da Carol ao check-in: o que preocupa primeiro, o raro só com
   motivo, e o dia normal curto — tem de aguentar a centésima vez. */

const HOJE = '2026-09-19';
const dia = (date, o = {}) => ({ date, sleep: 3, energy: 3, stress: 2, pain: 0, ...o });
const addDaysISO = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

describe('checkinReply', () => {
  it('sem check-in hoje, nada', () => {
    expect(checkinReply([dia('2026-09-18')], HOJE)).toBeNull();
  });

  it('o dia normal é curto, cordial, e muda de um dia para o outro', () => {
    const r = checkinReply([dia(HOJE)], HOJE);
    expect(r.mood).toBe('neutral');
    expect(DIA_NORMAL).toContain(r.text);
    const dias = ['2026-09-19', '2026-09-20', '2026-09-21'].map((d) => checkinReply([dia(d)], d).text);
    expect(new Set(dias).size).toBe(3);
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
    expect(checkinReply(semana, HOJE).text).toBe('Sete dias seguidos de check-in. Já começo a conhecer os teus dias.');
    expect(DIA_NORMAL).toContain(checkinReply(semana.slice(1), HOJE).text);
  });

  /* Revisão de 2026-09-26: aos 100 dias, "já começo a conhecer" era pouco, e
     o número ia em algarismos. Por extenso, e o que ela sabe cresce com o marco. */
  const seguidos = (n) => Array.from({ length: n }, (_, i) => dia(addDaysISO(HOJE, i - n + 1)));
  it('cada marco da sequência diz-se por extenso, e o que ela sabe cresce com ele', () => {
    const esperado = {
      7: 'Sete dias seguidos de check-in. Já começo a conhecer os teus dias.',
      14: 'Catorze dias seguidos de check-in. Já começo a conhecer os teus dias.',
      30: 'Trinta dias seguidos de check-in. Já sei como são as tuas semanas.',
      60: 'Sessenta dias seguidos de check-in. Já sei como são as tuas semanas.',
      100: 'Cem dias seguidos de check-in. Já sei como são os teus meses.',
    };
    for (const [n, texto] of Object.entries(esperado)) {
      const r = checkinReply(seguidos(Number(n)), HOJE);
      expect(checkinStreak(seguidos(Number(n)), HOJE)).toBe(Number(n));
      expect(r).toMatchObject({ mood: 'happy', text: texto });
      expect(r.text).not.toMatch(/\d/);
      expectCarolVoice(r.text);
    }
    // Aos 100 dias, nada de "já começo".
    expect(checkinReply(seguidos(100), HOJE).text).not.toMatch(/começo/);
    // Fora dos marcos, o dia normal.
    for (const n of [8, 31, 99]) expect(DIA_NORMAL).toContain(checkinReply(seguidos(n), HOJE).text);
  });

  /* Pedido 2026-09-26: a resposta sabe o que o dia é. "Nem se olha para o
     relógio" num dia de descanso, ou "Dia normal" na manhã da prova, lembram
     ao atleta que está a falar com uma máquina. */
  const TIPOS = ['treino', 'feito', 'descanso', 'semTreino', 'semPlano', 'prova', 'provaFeita'];
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
    expect(checkinReply([dia(HOJE)], HOJE, sem('prova')).text).toBe('Obrigada. Hoje é dia de prova: vamos a isso.');
    expect(checkinReply([dia(HOJE)], HOJE, { tipo: 'descanso', corrida: false, vespera: true }).text).toMatch(/^Obrigada\. Amanhã é dia de prova/);
    expect(checkinReply([dia(HOJE, { sleep: 1 })], HOJE, sem('prova')).text).toBe('Dormir mal na noite antes da prova é normal. Não estraga a corrida.');
    // Na véspera não se diz que "a noite que conta é a de hoje": no dia a seguir ela diz que dormir mal é normal.
    expect(checkinReply([dia(HOJE, { sleep: 1 })], HOJE, { tipo: 'descanso', vespera: true }).text).not.toMatch(/a noite que conta/i);
    // Na véspera, o que vem a seguir é a prova, não "o próximo treino".
    for (const o of [{ pain: 6 }, { sleep: 5, energy: 5 }]) {
      expect(checkinReply([dia(HOJE, o)], HOJE, { tipo: 'descanso', vespera: true }).text).not.toMatch(/próximo treino/);
    }
    expect(checkinReply([dia(HOJE, { stress: 5 })], HOJE, sem('prova')).text).toMatch(/^Nervos de dia de prova/);
    expect(checkinReply([dia(HOJE, { pain: 6 })], HOJE, sem('prova')).text).toBe('Uma dor de 6 não se ignora. Quero falar contigo antes da partida.');
  });

  it('com a prova já feita, a resposta não passa a "dia normal"', () => {
    expect(checkinReply([dia(HOJE)], HOJE, sem('provaFeita')).text).toMatch(/^Obrigada\. Hoje foi dia de prova/);
    expect(checkinReply([dia(HOJE, { energy: 1 })], HOJE, sem('provaFeita')).text).not.toMatch(/treino/);
  });

  it('mais de uma semana de noites más não começa por um algarismo', () => {
    const noites = Array.from({ length: 9 }, (_, i) => dia(`2026-09-${String(11 + i).padStart(2, '0')}`, { sleep: 1 }));
    expect(checkinReply(noites, HOJE).text).toMatch(/^Há mais de uma semana que dormes mal\./);
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

  /* Pedido 2026-09-26: ela sabe da cirurgia (a memória dela, coach_notes) e
     a resposta ao check-in parte daí nos dias da recuperação. */
  it('depois de uma cirurgia de que ela sabe, a resposta parte daí', () => {
    const vida = { tipo: 'cirurgia', dias: 1, recupera: 14, a: 'a cirurgia', da: 'da cirurgia', parte: 'o braço' };
    const comVida = (o) => checkinReply([dia(HOJE, o)], HOJE, { tipo: 'descanso', corrida: false, vespera: false, vida });
    expect(comVida({ sleep: 1 }).text).toBe('Dormiste mal. Nos primeiros dias depois da cirurgia é normal; hoje, descansar é o teu treino.');
    expect(comVida({ pain: 6, pain_location: 'Braço' }).text).toBe('Uma dor de 6 (braço) depois da cirurgia não se ignora. Se não aliviar, fala com a equipa médica, e conta-me como estás.');
    expect(comVida({ energy: 1 }).text).toMatch(/recuperação da cirurgia é normal/);
    expect(comVida({}).text).toBe('Obrigada. Um dia de cada vez na recuperação da cirurgia.');
    for (const o of [{ sleep: 1 }, { pain: 6 }, { energy: 1 }, {}]) expectCarolVoice(comVida(o).text);
  });
});
