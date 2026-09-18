import { describe, it, expect } from 'vitest';
import {
  paceFromTotal, totalFromPace, parseDistanceKm, formatDistanceKm, DISTANCIAS_RAPIDAS,
} from './paceMath';

describe('paceMath — a conta da calculadora de ritmo', () => {
  it('5 km a 5:00/km são 25:00, e ao contrário', () => {
    expect(totalFromPace(5, 300)).toBe(1500);
    expect(paceFromTotal(5, 1500)).toBe(300);
  });

  it('a meia a 5:00/km são 1:45:30', () => {
    expect(totalFromPace(21.1, 300)).toBe(6330);
  });

  it('a maratona em 3:30:00 dá 4:59/km', () => {
    // 12600/42,2 = 298,578... — arredonda para 299 s = 4:59.
    expect(paceFromTotal(42.2, 12600)).toBe(299);
  });

  it('sem distância, sem ritmo ou sem tempo não se inventa resultado', () => {
    expect(totalFromPace(0, 300)).toBeNull();
    expect(totalFromPace(null, 300)).toBeNull();
    expect(totalFromPace(5, 0)).toBeNull();
    expect(paceFromTotal(5, null)).toBeNull();
    expect(paceFromTotal(-1, 1500)).toBeNull();
  });

  it('ida e volta não deriva: o que sai do ritmo volta a dar o mesmo ritmo', () => {
    for (const km of [5, 10, 21.1, 42.2]) {
      const total = totalFromPace(km, 330);
      expect(paceFromTotal(km, total)).toBe(330);
    }
  });
});

describe('parseDistanceKm — a vírgula é o separador decimal em português', () => {
  it('lê vírgula e ponto como a mesma coisa', () => {
    expect(parseDistanceKm('21,1')).toBe(21.1);
    expect(parseDistanceKm('21.1')).toBe(21.1);
    expect(parseDistanceKm(' 10 ')).toBe(10);
  });

  it('o que não é uma distância válida é null, não NaN', () => {
    expect(parseDistanceKm('')).toBeNull();
    expect(parseDistanceKm(null)).toBeNull();
    expect(parseDistanceKm('abc')).toBeNull();
    expect(parseDistanceKm('0')).toBeNull();
    expect(parseDistanceKm('-5')).toBeNull();
  });
});

describe('formatDistanceKm', () => {
  it('mostra vírgula e corta o decimal que não diz nada', () => {
    expect(formatDistanceKm(5)).toBe('5 km');
    expect(formatDistanceKm(21.1)).toBe('21,1 km');
    expect(formatDistanceKm(5.0)).toBe('5 km');
  });

  it('sem distância não há texto', () => {
    expect(formatDistanceKm(0)).toBe('');
    expect(formatDistanceKm(null)).toBe('');
  });
});

describe('DISTANCIAS_RAPIDAS', () => {
  it('são as quatro que o atleta escolhe sem escrever', () => {
    expect(DISTANCIAS_RAPIDAS.map((d) => d.km)).toEqual([5, 10, 21.1, 42.2]);
  });
});
