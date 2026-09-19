import { describe, it, expect } from 'vitest';
import { goalFromNotes, knownFacts, firstDayAsk } from './firstDay';

/* A Home no primeiro dia lembra-se do arranque: as notas que o Onboarding
   grava (objetivo_pessoal, disponibilidade) e o perfil. */

const notas = [
  { category: 'objetivo_pessoal', note: 'Correr mais rápido — sem prova, foco em ritmo.' },
  { category: 'disponibilidade', note: 'No arranque declarou 38 km por semana, 5 dias por semana.' },
];

describe('goalFromNotes', () => {
  it('lê o objetivo pelo título que o arranque escreve', () => {
    expect(goalFromNotes(notas)).toBe('ritmo');
    expect(goalFromNotes([{ category: 'objetivo_pessoal', note: 'Voltar depois de uma pausa — retomar sem me lesionar.' }])).toBe('regresso');
  });

  it('sem nota, ou com uma nota escrita à mão, não inventa', () => {
    expect(goalFromNotes([])).toBeNull();
    expect(goalFromNotes([{ category: 'objetivo_pessoal', note: 'Quero perder 3 kg' }])).toBeNull();
  });
});

describe('knownFacts', () => {
  it('só o que foi dito: nível, km, dias, restrições', () => {
    expect(knownFacts({ profile: { experience_level: 'medio', dietary_restrictions: ['sem_lactose'] }, coachNotes: notas }))
      .toEqual(['Corres há 1 a 3 anos', '38 km por semana', '5 dias por semana', 'Sem lactose']);
  });

  it('sem nada dito, nada mostrado', () => {
    expect(knownFacts({ profile: {}, coachNotes: [] })).toEqual([]);
  });
});

describe('firstDayAsk', () => {
  it('cada objetivo pede a sua primeira coisa', () => {
    expect(firstDayAsk('prova', 'Rui')).toMatchObject({ title: 'Rui, falta a data da prova.', primary: 'race' });
    expect(firstDayAsk('ritmo', 'Rui').primary).toBe('run');
    expect(firstDayAsk('saude', 'Rui').primary).toBe('meal');
    expect(firstDayAsk('regresso', 'Rui').primary).toBe('run');
  });

  it('sem objetivo: o texto do mock, escolher a prova', () => {
    expect(firstDayAsk(null, 'Rui')).toMatchObject({ title: 'Olá, Rui. Vamos escolher a tua prova.', primary: 'talk' });
    expect(firstDayAsk(null, '').title).toBe('Olá. Vamos escolher a tua prova.');
  });

  it('a voz dela: sem exclamações', () => {
    for (const g of ['prova', 'ritmo', 'saude', 'regresso', null]) {
      const a = firstDayAsk(g, 'Rui');
      expect(`${a.title} ${a.body}`).not.toMatch(/!/);
    }
  });
});
