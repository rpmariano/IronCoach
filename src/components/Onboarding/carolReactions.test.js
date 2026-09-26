import { describe, it, expect } from 'vitest';
import { firstName, reactToGoal, reactToRunning, reactToFood, reactToRace } from './carolReactions';
import { expectCarolVoice } from '../../test/carolVoice';

/* A Carol responde às respostas do arranque. O que se testa: que responde
   ao que foi escolhido, que o que preocupa vem primeiro, e que a voz dela
   (CAROL.md) se mantém — sem exclamações, sem emojis. */

const semEmojiNemExclamacao = (r) => expectCarolVoice(r.text);

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

  it('com a prova já marcada (reentrada), não promete perguntar o que já sabe', () => {
    const r = reactToGoal({ goal: 'prova', race_name: 'Maratona do Porto', race_date: '2026-11-08', race_distance_km: '42.2' });
    expect(r.text).toBe('Com a prova marcada, cada semana tem uma função. Daqui a três passos confirmamos a data.');
    expect(r.text).not.toMatch(/pergunto-te/);
    semEmojiNemExclamacao(r);
    // Sem data, continua a prometer a pergunta.
    expect(reactToGoal({ goal: 'prova', race_date: '' }).text).toMatch(/pergunto-te qual é/);
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
    expect(reactToRunning({ experience_level: 'iniciante', weekly_km: '35.5' }).text).toMatch(/^35,5 km/);
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

  it('um a três anos com semana declarada: começa pela semana que já faz', () => {
    expect(reactToRunning({ experience_level: 'medio', weekly_km: '20', days_per_week: '3' }).text)
      .toMatch(/Começo pela semana que já fazes/);
    expect(reactToRunning({ experience_level: 'medio', goal: 'regresso', weekly_km: '10', days_per_week: '2' }).text)
      .toMatch(/Começo pela semana que já fazes/);
  });

  it('sem semana de treino (regresso sem números, ou 0), não presume uma', () => {
    const esperado = 'Partimos do que o corpo aguenta hoje, não do que fazias antes. Depois subo.';
    const casos = [
      { experience_level: 'medio', goal: 'regresso', weekly_km: '', days_per_week: '' },
      { experience_level: 'medio', goal: 'regresso', weekly_km: '0', days_per_week: '0' },
      { experience_level: 'medio', goal: 'regresso' },
      { experience_level: 'medio', goal: 'saude', weekly_km: '0', days_per_week: '' },
      { experience_level: 'medio', goal: 'ritmo', weekly_km: '', days_per_week: '0' },
    ];
    for (const draft of casos) {
      const r = reactToRunning(draft);
      expect(r.text).toBe(esperado);
      expect(r.text).not.toMatch(/semana que já fazes/);
      semEmojiNemExclamacao(r);
    }
  });
});

describe('reactToFood', () => {
  it('uma restrição: diz o que muda nas sugestões', () => {
    expect(reactToFood({ dietary_restrictions: ['sem_gluten'] }).text).toMatch(/^Sem glúten, anotado/);
  });

  it('várias: fica tudo como regra', () => {
    expect(reactToFood({ dietary_restrictions: ['vegano', 'sem_gluten'] }).text).toMatch(/^As duas ficam como regra/);
    expect(reactToFood({ dietary_restrictions: ['vegano', 'sem_gluten', 'sem_lactose'] }).text).toMatch(/^As três/);
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

  it('"fresca" ou "fresco" só com o sexo conhecido; sem ele, frase neutra', () => {
    const f = reactToRace({ ...prova, gender: 'F' }, 2);
    expect(f.text).toMatch(/Dá para lá chegares fresca, e é nisso/);
    expect(f.text).not.toMatch(/fresco/);
    expect(reactToRace({ ...prova, gender: 'M' }, 2).text).toMatch(/Dá para lá chegares fresco, e é nisso/);
    for (const gender of ['', undefined, null]) {
      const r = reactToRace({ ...prova, gender }, 2);
      expect(r.text).toMatch(/Dá para chegares lá com as pernas frescas, e é nisso que o plano se vai concentrar\.$/);
      expect(r.text).not.toMatch(/fresc[oa],/);
      semEmojiNemExclamacao(r);
    }
  });
});
