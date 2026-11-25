import { describe, it, expect } from 'vitest';
import { heroRaceOf, pendingRaceOf, homeMoment, carolMessagesForMoment } from './homeV2Focus';

/* O foco do Início v2 (crítica de design de 2026-11-25): uma só prova manda no ecrã, e a Carol fala
   do momento dela. */

const T = '2026-11-25';
const r = (id, date, over = {}) => ({ id, name: id, date, status: 'agendada', ...over });

describe('heroRaceOf', () => {
  it('a prova de hoje passa à frente da que já passou e falta registar', () => {
    const races = [r('trail', '2026-11-23'), r('silvestre', T)];
    expect(heroRaceOf({ raceEvents: races, today: T }).id).toBe('silvestre');
  });
  it('sem prova hoje, a de amanhã; depois, a próxima', () => {
    expect(heroRaceOf({ raceEvents: [r('tejo', '2026-12-20'), r('amanha', '2026-11-26')], today: T }).id).toBe('amanha');
    expect(heroRaceOf({ raceEvents: [r('tejo', '2026-12-20'), r('porto', '2027-01-31')], today: T }).id).toBe('tejo');
  });
  it('depois de amanhã, a prova em foco do resumo da Carol (focusRace): a próxima principal, sem limite de dias', () => {
    const races = [r('b', '2026-12-01', { race_priority: 'b' }), r('meia', '2026-12-10', { race_priority: 'a' })];
    expect(heroRaceOf({ raceEvents: races, today: T }).id).toBe('meia');
    const longe = [r('b', '2026-12-01', { race_priority: 'b' }), r('maratona', '2027-02-01', { race_priority: 'a' })];
    expect(heroRaceOf({ raceEvents: longe, today: T }).id).toBe('maratona');
    // Sem principal nenhuma, a próxima.
    const semA = [r('c', '2026-12-20', { race_priority: 'c' }), r('b', '2026-12-01', { race_priority: 'b' })];
    expect(heroRaceOf({ raceEvents: semA, today: T }).id).toBe('b');
  });
  it('uma prova que já passou nunca é o herói; as registadas e as concluídas também não', () => {
    expect(heroRaceOf({ raceEvents: [r('trail', '2026-11-23')], today: T })).toBeNull();
    expect(heroRaceOf({ raceEvents: [r('hoje', T)], today: T, isRegistered: () => true })).toBeNull();
    expect(heroRaceOf({ raceEvents: [r('hoje', T, { status: 'concluida' })], today: T })).toBeNull();
  });
  it('as jornadas fixas do Troféu futuras saem; a de hoje fica', () => {
    const races = [r('j-hoje', T), r('j2', '2026-12-06')];
    expect(heroRaceOf({ raceEvents: races, today: T, cupFixed: () => true }).id).toBe('j-hoje');
    expect(heroRaceOf({ raceEvents: [r('j2', '2026-12-06')], today: T, cupFixed: () => true })).toBeNull();
  });
});

describe('pendingRaceOf', () => {
  it('a mais recente que passou nos últimos 7 dias e falta registar', () => {
    const races = [r('velha', '2026-11-10'), r('trail', '2026-11-23'), r('outra', '2026-11-20'), r('hoje', T)];
    expect(pendingRaceOf({ raceEvents: races, today: T }).id).toBe('trail');
    expect(pendingRaceOf({ raceEvents: races, today: T, isRegistered: (id) => id !== 'velha' })).toBeNull();
  });
});

describe('homeMoment', () => {
  it('prova hoje, véspera, ou normal', () => {
    expect(homeMoment(r('x', T), T)).toBe('prova');
    expect(homeMoment(r('x', '2026-11-26'), T)).toBe('vespera');
    expect(homeMoment(r('x', '2026-12-20'), T)).toBe('normal');
    expect(homeMoment(null, T)).toBe('normal');
  });
});

describe('carolMessagesForMoment', () => {
  const MSGS = [
    { key: 'recap', text: 'Ontem a rodagem de 5 km saiu bem.' },
    { key: 'warnings', text: 'A prova é hoje: São Silvestre, partida às 9:00.' },
    { key: 'meal_suggestion', text: 'Ao almoço, arroz.' },
    { key: 'tomorrow_prep', text: 'Amanhã, rodagem de 5 km.' },
    { key: 'cup_entry:jr1', text: 'Inscrições até sexta.' },
    { key: 'daily_concept', text: 'O que é o limiar.' },
  ];

  it('num dia de prova: a frase da prova primeiro; nada de treinos, nem de véspera, nem de lições', () => {
    const out = carolMessagesForMoment(MSGS, 'prova').map((m) => m.key);
    expect(out).toEqual(['warnings', 'meal_suggestion', 'cup_entry:jr1']);
  });

  it('na véspera: só a prova de amanhã (e o que comer, e os prazos)', () => {
    const vespera = [
      { key: 'warnings', text: 'Para hoje, o plano pede uma rodagem de 5 km.' },
      { key: 'tomorrow_prep', text: 'Amanhã é a São Silvestre: jantar até às 20:00.' },
      { key: 'meal_suggestion', text: 'Hidratos ao jantar.' },
    ];
    expect(carolMessagesForMoment(vespera, 'vespera').map((m) => m.key)).toEqual(['tomorrow_prep', 'meal_suggestion']);
  });

  it('num dia normal (mesmo com uma prova por registar): tudo, pela ordem do dia', () => {
    expect(carolMessagesForMoment(MSGS, 'normal')).toEqual(MSGS);
  });
});

describe('heroRaceOf — duas provas no mesmo dia', () => {
  it('a principal, pela mesma regra da Carol (pickRaceOfDay)', () => {
    const races = [r('tejo', '2026-11-26', { race_priority: 'b' }), r('silvestre', '2026-11-26', { race_priority: 'a' })];
    expect(heroRaceOf({ raceEvents: races, today: T }).id).toBe('silvestre');
  });
});

describe('carolMessagesForMoment — os avisos de segurança nunca se filtram', () => {
  it('véspera com dor alta: o aviso aparece (primeiro) e a rodagem de hoje não', () => {
    const vespera = [
      { key: 'warnings', text: 'Para hoje, o plano pede uma rodagem de 5 km. Disseste dor 8 no joelho: hoje não corras.', safety: 'Disseste dor 8 no joelho: hoje não corras.', rest: 'Para hoje, o plano pede uma rodagem de 5 km.' },
      { key: 'tomorrow_prep', text: 'Amanhã é a São Silvestre.' },
    ];
    const out = carolMessagesForMoment(vespera, 'vespera');
    expect(out.map((m) => m.key)).toEqual(['safety', 'tomorrow_prep']);
    expect(out[0].text).toBe('Disseste dor 8 no joelho: hoje não corras.');
    expect(out.map((m) => m.text).join(' ')).not.toMatch(/rodagem de 5 km/);
  });

  it('dia de prova com RED-S: o aviso aparece primeiro, e a frase da prova a seguir, sem o aviso repetido', () => {
    const prova = [
      { key: 'recap', text: 'Ontem, rodagem.' },
      { key: 'warnings', text: 'A prova é hoje. Sinais de energia baixa (RED-S): fala com a Carol.', safety: 'Sinais de energia baixa (RED-S): fala com a Carol.', rest: 'A prova é hoje.' },
    ];
    const out = carolMessagesForMoment(prova, 'prova');
    expect(out.map((m) => m.key)).toEqual(['safety', 'warnings']);
    expect(out[1].text).toBe('A prova é hoje.');
  });

  it('num dia normal, o aviso também vai primeiro', () => {
    const normal = [
      { key: 'recap', text: 'Ontem.' },
      { key: 'warnings', text: 'Treino. Perda de peso rápida.', safety: 'Perda de peso rápida.', rest: 'Treino.' },
    ];
    expect(carolMessagesForMoment(normal, 'normal').map((m) => m.key)).toEqual(['safety', 'recap', 'warnings']);
  });

  it('só o aviso, sem frase do dia: fica só o aviso', () => {
    const so = [{ key: 'warnings', text: 'Dor alta.', safety: 'Dor alta.', rest: null }];
    expect(carolMessagesForMoment(so, 'vespera').map((m) => m.key)).toEqual(['safety']);
  });
});

describe('carolMessagesForMoment — a dor do check-in (a frase do próprio cartão)', () => {
  it('véspera, treino por fazer, dor alta: a frase da dor é o aviso, primeiro; sem resto, não há warnings', () => {
    const dor = 'Hoje tens uma corrida contínua de 5 km no plano, mas com a dor de que me falaste quero falar contigo antes de treinares.';
    const out = carolMessagesForMoment([
      { key: 'warnings', text: dor, safety: dor, rest: null },
      { key: 'tomorrow_prep', text: 'Amanhã é a São Silvestre.' },
    ], 'vespera');
    expect(out.map((m) => m.key)).toEqual(['safety', 'tomorrow_prep']);
    expect(out[0].text).toBe(dor);
  });
});
