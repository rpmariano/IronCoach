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
  });
});

describe('phaseGuidance — construção', () => {
  it('o que entra depende do nível', () => {
    expect(phaseGuidance({ ...meia, phaseId: 'build', experienceLevel: 'iniciante' })).toMatch(/ainda não há limiar nem intervalos/);
    expect(phaseGuidance({ ...meia, phaseId: 'build', experienceLevel: 'basico' })).toMatch(/os intervalos ficam para quando/);
    expect(phaseGuidance({ ...meia, phaseId: 'build', experienceLevel: 'avancado' })).toMatch(/entra tudo/);
  });

  it('o ritmo-alvo, quando há — nunca ao iniciante', () => {
    expect(phaseGuidance({ ...meia, phaseId: 'build', experienceLevel: 'medio', targetPaceSeconds: 320 }))
      .toContain('O teu ritmo-alvo é 5.20/km');
    expect(phaseGuidance({ ...meia, phaseId: 'build', experienceLevel: 'iniciante', targetPaceSeconds: 320 }))
      .not.toContain('ritmo-alvo');
  });
});

describe('phaseGuidance — pico', () => {
  it('o longo pelo volume do atleta, com o teto do nível', () => {
    expect(phaseGuidance({ ...meia, phaseId: 'peak', experienceLevel: 'medio', weeklyVolumeKm: 40 }))
      .toBe('No pico, o teu longo mais comprido fica pelos 12 km: 30% do que corres por semana. É nesses longos que testas o que vais comer e beber na prova.');
    // Com muito volume, manda o teto.
    expect(phaseGuidance({ distanceKm: 10, phaseId: 'peak', experienceLevel: 'basico', weeklyVolumeKm: 70 }))
      .toBe('No pico, o teu longo mais comprido fica pelos 18 km: é o teto para o teu nível, mesmo com o volume que tens.');
    // Sem volume conhecido, só o teto.
    expect(phaseGuidance({ distanceKm: 10, phaseId: 'peak', experienceLevel: 'medio' }))
      .toBe('No pico, o teu longo mais comprido não passa dos 25 a 28 km, nem dos 150 minutos.');
  });

  it('o avançado na maratona usa o teto de Pfitzinger; o trail mede-se em tempo', () => {
    expect(phaseGuidance({ distanceKm: 42.195, phaseId: 'peak', experienceLevel: 'avancado' })).toContain('35 a 38 km, nem dos 180 minutos');
    expect(phaseGuidance({ distanceKm: 30, raceType: 'trail', phaseId: 'peak', experienceLevel: 'medio' }))
      .toMatch(/^No pico, o longo mede-se em tempo e não em distância: até 150 minutos/);
  });
});

describe('phaseGuidance — polimento', () => {
  it('os dias, pela prioridade', () => {
    expect(phaseGuidance({ ...meia, phaseId: 'taper', experienceLevel: 'medio' }))
      .toBe('É a tua prova principal: 14 dias de polimento até à partida. Não compenses agora o que ficou para trás.');
    expect(phaseGuidance({ ...meia, racePriority: 'b', phaseId: 'taper', experienceLevel: 'medio' }))
      .toBe('É uma prova secundária: o polimento é curto, de 4 dias, e o resto da semana é normal.');
  });
});

describe('phaseGuidance — em todas as combinações, na voz dela', () => {
  it('sem emoji, "!", suavizar, terceira pessoa, "undefined" ou "NaN"', () => {
    for (const phaseId of ['base', 'build', 'peak', 'taper']) {
      for (const experienceLevel of ['iniciante', 'basico', 'medio', 'avancado', undefined]) {
        for (const distanceKm of [5, 10, 21.1, 42.195, 60]) {
          for (const raceType of ['estrada', 'trail']) {
            for (const weeklyVolumeKm of [null, 12, 45.5, 90]) {
              const text = phaseGuidance({ phaseId, experienceLevel, distanceKm, raceType, elevationGainM: 800, racePriority: 'a', weeklyVolumeKm, targetPaceSeconds: 300 });
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
