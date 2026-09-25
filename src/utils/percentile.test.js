import { describe, it, expect } from 'vitest';
import {
  PERCENTILE_CEILING,
  PERCENTILE_FLOOR,
  ageBandLabel,
  counterpartBand,
  densityCurve,
  isTruncated,
  percentileFrom,
  percentileSentence,
  segmentMedian,
  segmentTopDecile,
  shortDisplayName,
  widerSegments,
  ageBandWithGender,
  segmentPhrase,
  sameSegment,
} from './percentile';

/* Onde estás — o percentil dentro do escalão (gamificação, Fase 5). */

// 19 fronteiras: 5, 10, …, 95 (um segmento com o índice distribuído a direito).
const FRONTEIRAS = Array.from({ length: 19 }, (_, i) => (i + 1) * 5);

describe('percentileFrom', () => {
  it('conta as fronteiras já passadas, em degraus de 5', () => {
    expect(percentileFrom(50, FRONTEIRAS)).toBe(50);
    expect(percentileFrom(51, FRONTEIRAS)).toBe(50);
    expect(percentileFrom(55, FRONTEIRAS)).toBe(55);
    expect(percentileFrom(30, FRONTEIRAS)).toBe(30);
  });

  it('trunca sempre à faixa 5–95 — o 100.º percentil descreve os outros, não o atleta', () => {
    expect(percentileFrom(100, FRONTEIRAS)).toBe(PERCENTILE_CEILING);
    expect(percentileFrom(95, FRONTEIRAS)).toBe(PERCENTILE_CEILING);
    expect(percentileFrom(0, FRONTEIRAS)).toBe(PERCENTILE_FLOOR);
    expect(percentileFrom(4.9, FRONTEIRAS)).toBe(PERCENTILE_FLOOR);
    expect(isTruncated(percentileFrom(100, FRONTEIRAS))).toBe(true);
    expect(isTruncated(percentileFrom(50, FRONTEIRAS))).toBe(false);
  });

  it('sem segmento válido não há percentil nenhum — nunca um número inventado', () => {
    expect(percentileFrom(50, null)).toBeNull();
    expect(percentileFrom(50, [])).toBeNull();
    expect(percentileFrom(50, FRONTEIRAS.slice(0, 10))).toBeNull();
    expect(percentileFrom(null, FRONTEIRAS)).toBeNull();
    expect(percentileFrom(Number.NaN, FRONTEIRAS)).toBeNull();
  });

  it('aceita as fronteiras como vêm do Postgres (numeric[] chega em texto)', () => {
    expect(percentileFrom(50, FRONTEIRAS.map(String))).toBe(50);
  });
});

describe('as duas barras de comparação', () => {
  it('a mediana é a 10.ª fronteira e os 10% do topo a 18.ª', () => {
    expect(segmentMedian(FRONTEIRAS)).toBe(50);
    expect(segmentTopDecile(FRONTEIRAS)).toBe(90);
    expect(segmentMedian(null)).toBeNull();
    expect(segmentTopDecile([1, 2, 3])).toBeNull();
  });
});

describe('densityCurve', () => {
  it('dá 18 pontos entre as 19 fronteiras, e é mais alta onde elas estão mais juntas', () => {
    const curva = densityCurve(FRONTEIRAS);
    expect(curva).toHaveLength(18);
    // Distribuição a direito: a curva é plana.
    expect(curva.every((p) => Math.abs(p.y - 1) < 1e-9)).toBe(true);

    // Um segmento apertado ao meio: o pico da curva cai lá.
    const apertado = [10, 20, 30, 40, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 65, 75, 85, 90, 95];
    const pico = densityCurve(apertado).reduce((a, b) => (b.y > a.y ? b : a));
    expect(pico.x).toBeGreaterThan(45);
    expect(pico.x).toBeLessThan(60);
  });

  it('sem fronteiras não desenha nada', () => {
    expect(densityCurve(null)).toEqual([]);
    expect(densityCurve([1, 2, 3])).toEqual([]);
  });
});

describe('widerSegments', () => {
  const passos = widerSegments({ ageBand: 'M40', gender: 'M', terrain: 'trail' });

  it('a ordem é largar modalidade → alargar escalão → largar género', () => {
    expect(passos.map((p) => p.step)).toEqual(['modalidade', 'escalao', 'escalao', 'genero']);
  });

  it('cada passo é um segmento concreto, e diz por extenso contra quem se compara', () => {
    expect(passos[0].segment).toEqual({ ageBand: 'M40', gender: 'M', terrain: 'estrada' });
    expect(passos[0].label).toBe('Quem prepara provas de estrada');
    expect(passos[1].segment).toEqual({ ageBand: 'M35', gender: 'M', terrain: 'trail' });
    expect(passos[2].segment).toEqual({ ageBand: 'M45', gender: 'M', terrain: 'trail' });
    expect(passos[3].segment).toEqual({ ageBand: 'F40', gender: 'F', terrain: 'trail' });
    expect(passos.every((p) => p.label && p.detail)).toBe(true);
  });

  it('nos escalões das pontas só há um vizinho', () => {
    expect(widerSegments({ ageBand: 'sub23', gender: 'F', terrain: 'estrada' }).map((p) => p.step))
      .toEqual(['modalidade', 'escalao', 'genero']);
    expect(widerSegments({ ageBand: 'F50+', gender: 'F', terrain: 'estrada' }).map((p) => p.step))
      .toEqual(['modalidade', 'escalao', 'genero']);
  });

  it('no outro género, o escalão sem letra diz o género — senão lia-se como o escalão em que já se está', () => {
    const genero = widerSegments({ ageBand: '23-34', gender: 'M', terrain: 'estrada' }).find((p) => p.step === 'genero');
    expect(genero.segment).toEqual({ ageBand: '23-34', gender: 'F', terrain: 'estrada' });
    expect(genero.label).toBe('O escalão feminino dos 23 aos 34');
    expect(genero.detail).toBe('O escalão feminino da tua idade, na mesma modalidade.');
  });

  it('sem segmento não há nada a oferecer', () => {
    expect(widerSegments({})).toEqual([]);
    expect(widerSegments({ ageBand: 'M40', gender: 'M' })).toEqual([]);
  });
});

describe('counterpartBand', () => {
  it('troca a letra do escalão, e deixa em paz os que não têm', () => {
    expect(counterpartBand('M45', 'F')).toBe('F45');
    expect(counterpartBand('F50+', 'M')).toBe('M50+');
    expect(counterpartBand('sub23', 'F')).toBe('sub23');
    expect(counterpartBand('23-34', 'M')).toBe('23-34');
  });
});

describe('percentileSentence', () => {
  it('é a frase do cartão, com o escalão e a modalidade por extenso', () => {
    expect(percentileSentence(70, { ageBand: 'M40', terrain: 'estrada' }))
      .toBe('Cumpres mais do plano que 70% dos atletas M40 que preparam provas de estrada');
    expect(ageBandLabel('23-34')).toBe('dos 23 aos 34');
  });

  it('nos extremos diz "ou mais"/"ou menos" em vez de fingir um número exato', () => {
    expect(percentileSentence(95, { ageBand: 'F35', terrain: 'trail' }))
      .toBe('Cumpres mais do plano que 95% ou mais dos atletas F35 que preparam provas de trail');
    expect(percentileSentence(5, { ageBand: 'F35', terrain: 'trail' }))
      .toBe('Cumpres mais do plano que 5% ou menos dos atletas F35 que preparam provas de trail');
    expect(percentileSentence(null, { ageBand: 'F35', terrain: 'trail' })).toBeNull();
  });
});

describe('shortDisplayName', () => {
  it('é o primeiro nome e a inicial do último — nunca o nome completo', () => {
    expect(shortDisplayName('Rui Pedro Mariano')).toBe('Rui M.');
    expect(shortDisplayName('Ana Silva')).toBe('Ana S.');
    expect(shortDisplayName('  Ana   Silva  ')).toBe('Ana S.');
    expect(shortDisplayName('Ana')).toBe('Ana');
    expect(shortDisplayName('')).toBe('');
    expect(shortDisplayName(null)).toBe('');
  });
});

describe('segmentPhrase / ageBandWithGender / sameSegment', () => {
  it('o segmento por extenso, com artigo — antes saía "para dos 23 aos 34 em estrada"', () => {
    expect(segmentPhrase({ ageBand: '23-34', gender: 'M', terrain: 'estrada' })).toBe('o escalão masculino dos 23 aos 34, em estrada');
    expect(segmentPhrase({ ageBand: 'sub23', gender: 'F', terrain: 'trail' })).toBe('o escalão feminino até aos 22, em trail');
    expect(segmentPhrase({ ageBand: 'M35', gender: 'M', terrain: 'estrada' })).toBe('o escalão M35, em estrada');
    expect(segmentPhrase({})).toBe('');
  });

  it('o género só se acrescenta quando o nome do escalão não o traz', () => {
    expect(ageBandWithGender('F40', 'F')).toBe('F40');
    expect(ageBandWithGender('23-34', 'F')).toBe('feminino dos 23 aos 34');
  });

  it('sameSegment compara os três eixos', () => {
    const a = { ageBand: 'M40', gender: 'M', terrain: 'estrada' };
    expect(sameSegment(a, { ...a })).toBe(true);
    expect(sameSegment(a, { ...a, terrain: 'trail' })).toBe(false);
    expect(sameSegment(a, null)).toBe(false);
  });
});
