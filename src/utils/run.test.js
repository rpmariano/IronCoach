import { describe, it, expect } from 'vitest';
import {
  parsePaceToSeconds,
  formatPace,
  parseDurationToSeconds,
  RACE_TYPES,
  distanceForRaceType,
} from './run';

describe('parsePaceToSeconds', () => {
  it('aceita ponto, vírgula e dois-pontos como separador', () => {
    expect(parsePaceToSeconds('5.20')).toBe(320);
    expect(parsePaceToSeconds('5,20')).toBe(320);
    expect(parsePaceToSeconds('5:20')).toBe(320);
  });

  it('trata a parte decimal como segundos, não como fração de minuto', () => {
    // "5.20" são 5min20s. Se fosse lido como 5,20 minutos dariam 312 — foi
    // esta ambiguidade que obrigou a normalizar os dados existentes.
    expect(parsePaceToSeconds('5.20')).not.toBe(312);
  });

  it('completa uma só casa para dezenas de segundos', () => {
    expect(parsePaceToSeconds('5.2')).toBe(320);
    expect(parsePaceToSeconds('4.5')).toBe(290);
  });

  it('aceita só minutos', () => {
    expect(parsePaceToSeconds('5')).toBe(300);
  });

  it('devolve null para entradas inválidas', () => {
    expect(parsePaceToSeconds('')).toBeNull();
    expect(parsePaceToSeconds(null)).toBeNull();
    expect(parsePaceToSeconds('abc')).toBeNull();
    expect(parsePaceToSeconds('5.75')).toBeNull(); // 75 segundos não existe
  });
});

describe('formatPace', () => {
  it('apresenta sempre com ponto, segundos a dois dígitos', () => {
    expect(formatPace(320)).toBe('5.20');
    expect(formatPace(245)).toBe('4.05');
    expect(formatPace(300)).toBe('5.00');
  });

  it('é o inverso de parsePaceToSeconds', () => {
    for (const s of ['4.05', '5.20', '6.00']) {
      expect(formatPace(parsePaceToSeconds(s))).toBe(s);
    }
  });

  it('devolve vazio quando não há ritmo', () => {
    expect(formatPace(null)).toBe('');
    expect(formatPace(0)).toBe('');
  });
});

describe('parseDurationToSeconds', () => {
  it('lê hh:mm:ss e mm:ss', () => {
    expect(parseDurationToSeconds('1:55:00')).toBe(6900);
    expect(parseDurationToSeconds('50:00')).toBe(3000);
  });

  it('lê minutos com sufixo m', () => {
    expect(parseDurationToSeconds('50m')).toBe(3000);
  });
});

describe('RACE_TYPES', () => {
  // As chaves têm de bater certo com o check constraint de
  // race_events.race_type — divergirem foi o que impediu criar meias/maratonas.
  const CHAVES_NA_BD = ['estrada', 'trail', 'ultra', '5k', '10k', '21k', '42k', 'outro'];

  it('só usa chaves aceites pela base de dados', () => {
    for (const t of RACE_TYPES) {
      expect(CHAVES_NA_BD).toContain(t.key);
    }
  });

  it('implica distância nos tipos que a determinam', () => {
    expect(distanceForRaceType('5k')).toBe(5);
    expect(distanceForRaceType('10k')).toBe(10);
    expect(distanceForRaceType('21k')).toBeCloseTo(21.0975);
    expect(distanceForRaceType('42k')).toBeCloseTo(42.195);
  });

  it('não inventa distância onde o tipo não a determina', () => {
    expect(distanceForRaceType('estrada')).toBeNull();
    expect(distanceForRaceType('trail')).toBeNull();
    expect(distanceForRaceType('ultra')).toBeNull();
    expect(distanceForRaceType('outro')).toBeNull();
  });
});
