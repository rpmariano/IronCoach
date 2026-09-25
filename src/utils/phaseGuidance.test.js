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
});

describe('phaseGuidance — construção', () => {
  it('o que entra depende do nível', () => {
    expect(phaseGuidance({ ...meia, phaseId: 'build', experienceLevel: 'iniciante' })).toMatch(/ainda não há limiar nem intervalos/);
    expect(phaseGuidance({ ...meia, phaseId: 'build', experienceLevel: 'basico' })).toMatch(/os intervalos ficam para quando/);
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
    expect(phaseGuidance({ ...meia, phaseId: 'taper', experienceLevel: 'iniciante', daysToRace: 13 }))
      .toBe('É a tua prova principal: o polimento são os últimos 10 dias, e ainda faltam 13. Até lá, treino normal, sem acrescentar nada.');
    // Numa prova B ou C, o polimento cabe na última semana, que tem texto próprio.
    expect(phaseGuidance({ ...meia, racePriority: 'b', phaseId: 'taper', experienceLevel: 'medio', daysToRace: 9 })).toBeNull();
  });

  it('o ultra é desaconselhado ao iniciante: não se prepara', () => {
    for (const phaseId of ['base', 'build', 'peak', 'taper']) {
      expect(phaseGuidance({ distanceKm: 60, phaseId, experienceLevel: 'iniciante', weeklyVolumeKm: 30 }))
        .toMatch(/^Um ultra é desaconselhado no teu nível/);
    }
  });
});

describe('phaseGuidance — em todas as combinações, na voz dela', () => {
  it('sem emoji, "!", suavizar, terceira pessoa, "undefined" ou "NaN"', () => {
    for (const phaseId of ['base', 'build', 'peak', 'taper']) {
      for (const experienceLevel of ['iniciante', 'basico', 'medio', 'avancado', undefined]) {
        for (const distanceKm of [5, 10, 21.1, 42.195, 60]) {
          for (const raceType of ['estrada', 'trail']) {
            for (const weeklyVolumeKm of [null, 12, 45.5, 90]) {
              const text = phaseGuidance({ phaseId, experienceLevel, distanceKm, raceType, elevationGainM: 800, racePriority: 'a', weeklyVolumeKm, targetPaceSeconds: 300, daysToRace: 12 });
              expectCarolVoice(text);
              expect(text).not.toMatch(/undefined|NaN|null/);
            }
          }
        }
      }
    }
    expect(phaseGuidance({ phaseId: 'race_recovery', distanceKm: 10 })).toBeNull();
    expect(raceLabel(60)).toBe('o ultra');
  });
});
