// Testa supabase/functions/_shared/formulas/vocabulary.ts (T0) a partir do
// frontend, através do alias @formulas configurado em vite.config.mjs — o
// mesmo ficheiro que as Edge Functions importam por caminho relativo. A
// contrapartida Deno-nativa (Deno.test) vive ao lado do próprio ficheiro,
// em supabase/functions/_shared/formulas/vocabulary.test.ts, porque um
// ficheiro de teste com imports de "vitest" ali dentro seria apanhado pelo
// glob por omissão do `deno test` e partia a suite Deno (ver
// specs/formulas-checklist.md Fase B).
import { describe, it, expect } from 'vitest';
import {
  normalizeGender,
  categorizeDistance,
  categorizeElevationRatio,
  isExperienceLevel,
  isRacePriority,
  MIN_PREP_WEEKS,
  MIN_VOLUME_KM,
} from '@formulas/vocabulary.ts';

describe('normalizeGender', () => {
  it('aceita os valores reais gravados em profiles.gender', () => {
    expect(normalizeGender('M')).toBe('M');
    expect(normalizeGender('F')).toBe('F');
  });

  it('aceita por extenso e minúsculas por defensividade', () => {
    expect(normalizeGender('masculino')).toBe('M');
    expect(normalizeGender('feminino')).toBe('F');
    expect(normalizeGender('m')).toBe('M');
    expect(normalizeGender('f')).toBe('F');
  });

  it('devolve null para valores desconhecidos ou em falta', () => {
    expect(normalizeGender(null)).toBeNull();
    expect(normalizeGender(undefined)).toBeNull();
    expect(normalizeGender('outro')).toBeNull();
    expect(normalizeGender('')).toBeNull();
  });
});

describe('categorizeDistance', () => {
  it('classifica as fronteiras exatas da doutrina (Bloco 1)', () => {
    expect(categorizeDistance(5.5)).toBe('5k');
    expect(categorizeDistance(5.51)).toBe('10k');
    expect(categorizeDistance(11.0)).toBe('10k');
    expect(categorizeDistance(11.01)).toBe('meia');
    expect(categorizeDistance(22.5)).toBe('meia');
    expect(categorizeDistance(22.51)).toBe('maratona');
    expect(categorizeDistance(50.0)).toBe('maratona');
    expect(categorizeDistance(50.01)).toBe('ultra');
  });

  it('devolve null para distância em falta', () => {
    expect(categorizeDistance(null)).toBeNull();
    expect(categorizeDistance(undefined)).toBeNull();
    expect(categorizeDistance(NaN)).toBeNull();
  });
});

describe('isExperienceLevel / isRacePriority', () => {
  it('reconhece só as chaves válidas', () => {
    expect(isExperienceLevel('iniciante')).toBe(true);
    expect(isExperienceLevel('avancado')).toBe(true);
    expect(isExperienceLevel('beginner')).toBe(false); // ver P0-8: fallback inglês nunca bateu
    expect(isRacePriority('a')).toBe(true);
    expect(isRacePriority('z')).toBe(false);
  });
});

describe('MIN_PREP_WEEKS / MIN_VOLUME_KM — tabela única partilhada', () => {
  it('iniciante × ultra continua desaconselhado (null)', () => {
    expect(MIN_PREP_WEEKS.iniciante.ultra).toBeNull();
  });

  it('todos os 4 níveis × 5 categorias estão presentes', () => {
    for (const level of ['iniciante', 'basico', 'medio', 'avancado']) {
      for (const cat of ['5k', '10k', 'meia', 'maratona', 'ultra']) {
        expect(MIN_PREP_WEEKS[level]).toHaveProperty(cat);
        expect(MIN_VOLUME_KM[level]).toHaveProperty(cat);
      }
    }
  });
});

describe('categorizeElevationRatio', () => {
  it('classifica pelos exemplos da doutrina (Bloco 8 #1/#2)', () => {
    expect(categorizeElevationRatio(20, 400)).toBe('rolante');        // 20 m/km
    expect(categorizeElevationRatio(30, 1000)).toBe('ondulado');      // 33,3 m/km
    expect(categorizeElevationRatio(40, 2500)).toBe('montanha');      // 62,5 m/km
    expect(categorizeElevationRatio(20, 2000)).toBe('alta_montanha'); // 100 m/km
  });

  it('fronteiras exatas pertencem à banda seguinte', () => {
    expect(categorizeElevationRatio(10, 249)).toBe('rolante');
    expect(categorizeElevationRatio(10, 250)).toBe('ondulado');       // 25 m/km exato
    expect(categorizeElevationRatio(10, 499)).toBe('ondulado');
    expect(categorizeElevationRatio(10, 500)).toBe('montanha');       // 50 m/km exato
    expect(categorizeElevationRatio(10, 799)).toBe('montanha');
    expect(categorizeElevationRatio(10, 800)).toBe('alta_montanha');  // 80 m/km exato
  });

  it('devolve null sem distância, D+ inválido ou negativo', () => {
    expect(categorizeElevationRatio(null, 500)).toBeNull();
    expect(categorizeElevationRatio(0, 500)).toBeNull();
    expect(categorizeElevationRatio(10, null)).toBeNull();
    expect(categorizeElevationRatio(10, undefined)).toBeNull();
    expect(categorizeElevationRatio(10, NaN)).toBeNull();
    expect(categorizeElevationRatio(10, -5)).toBeNull();
  });

  it('D+ zero é Rolante (prova plana), não null', () => {
    expect(categorizeElevationRatio(10, 0)).toBe('rolante');
  });
});
