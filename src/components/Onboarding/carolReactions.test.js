import { describe, it, expect } from 'vitest';
import { firstName, reactToGoal, reactToRunning, reactToFood, reactToRace } from './carolReactions';

/* A Carol responde às respostas do arranque. O que se testa: que responde
   ao que foi escolhido, que o que preocupa vem primeiro, e que a voz dela
   (CAROL.md) se mantém — sem exclamações, sem emojis. */

const semEmojiNemExclamacao = (r) => {
  expect(r.text).not.toMatch(/!/);
  expect(r.text).not.toMatch(/\p{Extended_Pictographic}/u);
};

describe('firstName', () => {
  it('fica com o primeiro nome', () => {
    expect(firstName('  Rui Mariano ')).toBe('Rui');
    expect(firstName('')).toBe('');
    expect(firstName(null)).toBe('');
  });
});

describe('reactToGoal', () => {
  it('responde a cada um dos quatro objetivos, e a nada sem escolha', () => {
    for (const goal of ['prova', 'ritmo', 'saude', 'regresso']) {
      const r = reactToGoal({ goal });
      expect(r.text.length).toBeGreaterThan(20);
      semEmojiNemExclamacao(r);
    }
    expect(reactToGoal({ goal: '' })).toBeNull();
  });

  it('o regresso depois de uma pausa preocupa-a', () => {
    expect(reactToGoal({ goal: 'regresso' }).mood).toBe('worried');
  });
});

describe('reactToRunning', () => {
  it('sete dias por semana é a primeira coisa que ela diz', () => {
    const r = reactToRunning({ experience_level: 'avancado', weekly_km: '60', days_per_week: '7' });
    expect(r.mood).toBe('worried');
    expect(r.text).toMatch(/descanso/);
  });

  it('muito volume para quem começa: guarda, mas desconfia', () => {
    const r = reactToRunning({ experience_level: 'iniciante', weekly_km: '40', days_per_week: '4' });
    expect(r.mood).toBe('worried');
    expect(r.text).toMatch(/^40 km/);
  });

  it('saídas longas em média: diz a conta', () => {
    const r = reactToRunning({ experience_level: 'medio', weekly_km: '75', days_per_week: '3' });
    expect(r.text).toMatch(/25 km por saída/);
  });

  it('sem números, responde ao nível', () => {
    expect(reactToRunning({ experience_level: 'avancado' }).mood).toBe('happy');
    expect(reactToRunning({ experience_level: 'iniciante' }).text).toMatch(/base/);
    expect(reactToRunning({})).toBeNull();
  });
});

describe('reactToFood', () => {
  it('uma restrição: diz o que muda nas sugestões', () => {
    expect(reactToFood({ dietary_restrictions: ['sem_gluten'] }).text).toMatch(/^Sem glúten, anotado/);
  });

  it('várias: fica tudo como regra', () => {
    expect(reactToFood({ dietary_restrictions: ['vegano', 'sem_gluten'] }).text).toMatch(/^As duas ficam como regra/);
  });

  it('só o texto livre também é ouvido', () => {
    expect(reactToFood({ dietary_restrictions: [], dietary_notes: 'marisco' }).text).toMatch(/Anotado/);
    expect(reactToFood({ dietary_restrictions: [], dietary_notes: '  ' })).toBeNull();
  });
});

describe('reactToRace', () => {
  const prova = { race_name: 'Maratona do Porto', race_date: '2026-11-08', race_distance_km: '42.2' };

  it('com menos de quatro semanas, avisa', () => {
    expect(reactToRace(prova, 2).mood).toBe('worried');
    expect(reactToRace(prova, 0).text).toMatch(/menos de uma semana/);
  });

  it('com tempo, deixa falar a nota que conta as semanas', () => {
    expect(reactToRace(prova, 12)).toBeNull();
  });

  it('sem prova completa, não diz nada', () => {
    expect(reactToRace({ ...prova, race_name: '' }, 2)).toBeNull();
  });
});
