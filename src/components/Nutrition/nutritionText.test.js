import { describe, it, expect } from 'vitest';
import { completenessText, markedDaysNote, summaryHeaderText } from './nutritionText';

/* Opção B (2026-11-01): os dias com registo parcial inferem-se e saem das médias; o cabeçalho diz
   quantos dias têm o registo completo, e o atleta ocasional vê contagens em vez de médias. */
describe('textos dos dias com registo parcial (opção B)', () => {
  it('os parciais dizem quantos ficaram fora das médias', () => {
    expect(markedDaysNote({ n: 1 })).toBe('1 dia com registo parcial ficou fora das médias.');
    expect(markedDaysNote({ n: 3 })).toBe('3 dias com registo parcial ficaram fora das médias.');
    expect(markedDaysNote({ n: 0 })).toBe(null);
    expect(markedDaysNote(undefined)).toBe(null);
  });

  it('«X de Y dias com registo completo»', () => {
    expect(completenessText({ complete: 5, of: 6 })).toBe('5 de 6 dias com registo completo');
    expect(completenessText({ complete: 1, of: 1 })).toBe('1 de 1 dia com registo completo');
    expect(completenessText(null)).toBe('0 de 0 dias com registo completo');
  });

  it('o cabeçalho: média com o intervalo para quem regista tudo; contagens para o ocasional', () => {
    const view = { completeness: { complete: 3, of: 6 }, recordedRange: { first: '2026-10-01', last: '2026-10-03' } };
    expect(summaryHeaderText({ ...view, loggingKind: 'completo' }, '2026-10-04')).toBe('Média por dia · 3 de 6 dias com registo completo (1–3 out)');
    expect(summaryHeaderText({ ...view, loggingKind: 'ocasional' }, '2026-10-04')).toBe('Dias no objetivo · 3 de 6 dias com registo completo');
    expect(summaryHeaderText({ completeness: { complete: 0, of: 2 } }, '2026-10-04')).toBe('Média por dia · 0 de 2 dias com registo completo');
  });
});
