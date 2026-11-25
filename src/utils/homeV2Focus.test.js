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
  it('a principal (A) na janela de afinação passa à frente de uma B mais perto', () => {
    const races = [r('b', '2026-12-01', { race_priority: 'b' }), r('meia', '2026-12-10', { race_priority: 'a' })];
    expect(heroRaceOf({ raceEvents: races, today: T }).id).toBe('meia');
    // Fora da janela (mais de 21 dias), fica a mais perto.
    const longe = [r('b', '2026-12-01', { race_priority: 'b' }), r('maratona', '2027-02-01', { race_priority: 'a' })];
    expect(heroRaceOf({ raceEvents: longe, today: T }).id).toBe('b');
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
