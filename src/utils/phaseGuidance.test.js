import { describe, it, expect } from 'vitest';
import { phaseGuidance, raceLabel } from './phaseGuidance';
import { expectCarolVoice } from '../test/carolVoice';

// O que cada fase pede a este atleta (2026-09-25): os números da doutrina,
// com o nível, a distância, o volume dele, o ritmo-alvo, a prioridade e o D+.

const meia = { distanceKm: 21.1, raceType: 'estrada', racePriority: 'a' };

describe('phaseGuidance — base', () => {
  it('o volume semanal mínimo para a distância e o nível, face ao que ele corre', () => {
    expect(phaseGuidance({ ...meia, phaseId: 'base', experienceLevel: 'medio', weeklyVolumeKm: 32.5 }))
      .toBe('Para a meia, quero que chegues aos 45 km por semana; andas nos 32,5. Sobe devagar: no máximo 10% por semana.');
    expect(phaseGuidance({ ...meia, phaseId: 'base', experienceLevel: 'medio', weeklyVolumeKm: 50 }))
      .toContain('já andas nos 50, por isso aqui é mantê-los fáceis');
    // Sem histórico, sem número dele.
    expect(phaseGuidance({ ...meia, phaseId: 'base', experienceLevel: 'medio', weeklyVolumeKm: null }))
      .toBe('Para a meia, quero que chegues aos 45 km por semana, quase todos em ritmo fácil.');
  });

  it('o iniciante sobe mais devagar; o trail com D+ tem subidas desde já', () => {
    expect(phaseGuidance({ distanceKm: 10, phaseId: 'base', experienceLevel: 'iniciante', weeklyVolumeKm: 8 }))
      .toContain('Sobe devagar: no máximo 2 a 3 km por semana.');
    expect(phaseGuidance({ distanceKm: 25, raceType: 'trail', elevationGainM: 1200, phaseId: 'base', experienceLevel: 'medio' }))
      .toContain('Com 1200 m de D+ na prova, as subidas entram já.');
    // Corrida 2.2 #2: ao iniciante, as subidas curtas só depois de semanas de base.
    expect(phaseGuidance({ distanceKm: 25, raceType: 'trail', elevationGainM: 1200, phaseId: 'base', experienceLevel: 'iniciante' }))
      .toContain('as subidas curtas entram quando tiveres quatro a seis semanas seguidas de base.');
  });

  it('sem nível declarado, nem "no teu nível" nem os limites do iniciante: pergunta (revisão de 2026-09-26)', () => {
    const pergunta = 'Diz-me há quanto tempo corres e afino isto.';
    expect(phaseGuidance({ distanceKm: 10, phaseId: 'base', experienceLevel: null, weeklyVolumeKm: 8 }))
      .toBe(`Para os 10 km, quero que chegues aos 15 km por semana; andas nos 8. Sobe devagar. ${pergunta}`);
    expect(phaseGuidance({ distanceKm: 25, raceType: 'trail', elevationGainM: 1200, phaseId: 'base', experienceLevel: null }))
      .toBe(`Para o trail, quero que chegues aos 35 km por semana, quase todos em ritmo fácil. Com 1200 m de D+ na prova, as subidas também vão entrar. ${pergunta}`);
    // Nem o teto do longo (10 a 12 km, 1h30) nem os dias de polimento (10) do iniciante.
    for (const phaseId of ['base', 'build', 'peak', 'taper']) {
      for (const weeklyVolumeKm of [null, 8, 70]) {
        for (const daysToRace of [18, 9]) {
          const text = phaseGuidance({ ...meia, phaseId, experienceLevel: null, weeklyVolumeKm, daysToRace });
          expect(text).not.toMatch(/teu nível|2 a 3 km|ainda não há limiar|quatro a seis semanas|12 km|1h30|últimos 10 dias/);
          expect(text.endsWith(pergunta)).toBe(true);
        }
      }
    }
    expect(phaseGuidance({ ...meia, phaseId: 'peak', experienceLevel: null, weeklyVolumeKm: 70 }))
      .toBe(`No pico, o longo chega ao mais comprido do ciclo, e até onde vai depende da experiência que já tens. É nesses longos que testas o que vais comer e beber na prova. ${pergunta}`);
    expect(phaseGuidance({ distanceKm: 25, raceType: 'trail', elevationGainM: 1200, phaseId: 'peak', experienceLevel: null }))
      .toBe(`No pico, o longo mede-se em tempo e não em distância, com subida como a da prova, e a duração dele depende da experiência que já tens. É nesses longos que testas o que vais comer e beber na prova. ${pergunta}`);
    expect(phaseGuidance({ distanceKm: 10, phaseId: 'peak', experienceLevel: null, weeklyVolumeKm: 70 }))
      .toBe(`No pico, o longo chega ao mais comprido do ciclo, e até onde vai depende da experiência que já tens. ${pergunta}`);
    expect(phaseGuidance({ ...meia, phaseId: 'taper', experienceLevel: null, daysToRace: 18 }))
      .toBe(`É a tua prova principal: o polimento a sério são os últimos 10 a 14 dias, conforme a experiência que já tens. Até lá, cumpre o plano e não metas treinos novos. ${pergunta}`);
    expect(phaseGuidance({ ...meia, phaseId: 'taper', experienceLevel: null, daysToRace: 9 }))
      .toBe(`É a tua prova principal, e já estás no polimento. Nada de treinos novos. ${pergunta}`);
    // Um "iniciante" declarado continua a ouvir os limites dele.
    expect(phaseGuidance({ distanceKm: 10, phaseId: 'base', experienceLevel: 'iniciante', weeklyVolumeKm: 8 })).not.toContain(pergunta);
  });
});

describe('phaseGuidance — construção', () => {
  it('o que entra depende do nível', () => {
    expect(phaseGuidance({ ...meia, phaseId: 'build', experienceLevel: 'iniciante' })).toMatch(/ainda não há limiar nem intervalos/);
    expect(phaseGuidance({ ...meia, phaseId: 'build', experienceLevel: 'basico' })).toMatch(/os intervalos ficam para quando/);
    expect(phaseGuidance({ ...meia, phaseId: 'build', experienceLevel: 'basico', baseWeeksDone: 4 })).toMatch(/os intervalos ficam para quando/);
    // Com as seis a oito semanas de base já feitas, não se lhe diz que ainda faltam.
    for (const baseWeeksDone of [6, 8]) {
      expect(phaseGuidance({ ...meia, phaseId: 'build', experienceLevel: 'basico', baseWeeksDone }))
        .toBe('Com a base que fizeste, entram as subidas, o fartlek e o limiar, e no fim da fase os intervalos.');
    }
    expect(phaseGuidance({ ...meia, phaseId: 'build', experienceLevel: 'avancado' })).toMatch(/entra tudo/);
  });

  it('o ritmo-alvo, quando há — só ao avançado, que é quem tem blocos a ritmo de prova', () => {
    expect(phaseGuidance({ ...meia, phaseId: 'build', experienceLevel: 'avancado', targetPaceSeconds: 320 }))
      .toContain('O teu ritmo-alvo é 5.20/km');
    for (const experienceLevel of ['iniciante', 'basico', 'medio']) {
      expect(phaseGuidance({ ...meia, phaseId: 'build', experienceLevel, targetPaceSeconds: 320 })).not.toContain('ritmo-alvo');
    }
  });
});

describe('phaseGuidance — pico', () => {
  it('o longo pelo volume do atleta, com o teto do nível', () => {
    expect(phaseGuidance({ ...meia, phaseId: 'peak', experienceLevel: 'medio', weeklyVolumeKm: 40 }))
      .toBe('No pico, o teu longo mais comprido fica pelos 12 km, 30% do que corres por semana, sem passar de 2h30 de corrida. É nesses longos que testas o que vais comer e beber na prova.');
    // Com muito volume, manda o teto — em km ou em tempo, o que vier primeiro (Corrida 2.1 #4).
    expect(phaseGuidance({ distanceKm: 10, phaseId: 'peak', experienceLevel: 'basico', weeklyVolumeKm: 70 }))
      .toBe('No pico, o teu longo mais comprido fica pelos 18 km ou 2h de corrida, o que vier primeiro: é o teto para o teu nível.');
    // Sem volume conhecido, só o teto.
    expect(phaseGuidance({ distanceKm: 10, phaseId: 'peak', experienceLevel: 'medio' }))
      .toBe('No pico, o teu longo mais comprido não passa dos 25 a 28 km, nem de 2h30 de corrida: o que vier primeiro.');
  });

  it('o avançado na maratona usa o teto de Pfitzinger; o trail mede-se em tempo', () => {
    expect(phaseGuidance({ distanceKm: 42.195, phaseId: 'peak', experienceLevel: 'avancado' })).toContain('35 a 38 km, nem de 3h de corrida');
    expect(phaseGuidance({ distanceKm: 30, raceType: 'trail', elevationGainM: 900, phaseId: 'peak', experienceLevel: 'medio' }))
      .toMatch(/^No pico, o longo mede-se em tempo e não em distância: até 2h30 de corrida, com subida como a da prova\./);
    // Um trail sem D+ registado não presume subida.
    expect(phaseGuidance({ distanceKm: 30, raceType: 'trail', phaseId: 'peak', experienceLevel: 'medio' })).not.toContain('subida');
  });
});

describe('phaseGuidance — polimento', () => {
  it('os dias de polimento da doutrina, contados a partir da prova', () => {
    expect(phaseGuidance({ ...meia, phaseId: 'taper', experienceLevel: 'medio', daysToRace: 9 }))
      .toBe('É a tua prova principal: estás nos últimos 14 dias, os do polimento. Nada de treinos novos.');
    // A fase ocupa semanas inteiras: o polimento do iniciante na meia (10 dias) ainda não começou a 13 dias.
    expect(phaseGuidance({ ...meia, phaseId: 'taper', experienceLevel: 'iniciante', daysToRace: 13, weekLighterThanLast: true }))
      .toBe('É a tua prova principal: o polimento a sério são os últimos 10 dias. Até lá, a semana já é mais leve, sem treinos novos.');
    // Com o plano desta semana igual ao da anterior, ou sem plano, a semana não é mais leve.
    for (const weekLighterThanLast of [false, undefined]) {
      expect(phaseGuidance({ ...meia, phaseId: 'taper', experienceLevel: 'medio', daysToRace: 18, weekLighterThanLast }))
        .toBe('É a tua prova principal: o polimento a sério são os últimos 14 dias. Até lá, cumpre o plano e não metas treinos novos.');
    }
    // Numa prova B ou C, o polimento cabe na última semana, que tem texto próprio.
    expect(phaseGuidance({ ...meia, racePriority: 'b', phaseId: 'taper', experienceLevel: 'medio', daysToRace: 9 })).toBeNull();
  });

  it('o ultra é desaconselhado ao iniciante: não se prepara', () => {
    for (const phaseId of ['base', 'build', 'peak', 'taper']) {
      expect(phaseGuidance({ distanceKm: 60, phaseId, experienceLevel: 'iniciante', weeklyVolumeKm: 30 }))
        .toMatch(/^Um ultra é desaconselhado no teu nível/);
    }
  });

  it('com o plano do ultra aceite, fica o aviso e não a recusa; sem nível declarado, pergunta', () => {
    for (const phaseId of ['base', 'build', 'peak', 'taper']) {
      expect(phaseGuidance({ distanceKm: 60, phaseId, experienceLevel: 'iniciante', weeklyVolumeKm: 30, hasAcceptedPlan: true }))
        .toBe('Continuo a achar que um ultra é cedo para ti. Se vamos a ele, vamos com margem: fala comigo antes de cada longo.');
      for (const hasAcceptedPlan of [true, false]) {
        const text = phaseGuidance({ distanceKm: 60, phaseId, experienceLevel: null, weeklyVolumeKm: 30, hasAcceptedPlan });
        expect(text).toBe('Num ultra, o que cada fase te pede depende muito da experiência que já tens. Diz-me há quanto tempo corres e afino isto.');
      }
    }
  });
});

describe('phaseGuidance — em todas as combinações, na voz dela', () => {
  it('sem emoji, "!", suavizar, terceira pessoa, "undefined" ou "NaN"', () => {
    for (const phaseId of ['base', 'build', 'peak', 'taper']) {
      for (const experienceLevel of ['iniciante', 'basico', 'medio', 'avancado', undefined, null]) {
        for (const distanceKm of [5, 10, 21.1, 42.195, 60]) {
          for (const raceType of ['estrada', 'trail']) {
            for (const weeklyVolumeKm of [null, 12, 45.5, 90]) {
              for (const extra of [{}, { baseWeeksDone: 8, hasAcceptedPlan: true, weekLighterThanLast: true }]) {
                const text = phaseGuidance({ phaseId, experienceLevel, distanceKm, raceType, elevationGainM: 800, racePriority: 'a', weeklyVolumeKm, targetPaceSeconds: 300, daysToRace: 12, ...extra });
                expectCarolVoice(text);
                expect(text).not.toMatch(/undefined|NaN|null/);
              }
            }
          }
        }
      }
    }
    expect(phaseGuidance({ phaseId: 'race_recovery', distanceKm: 10 })).toBeNull();
    expect(raceLabel(60)).toBe('o ultra');
  });
});
