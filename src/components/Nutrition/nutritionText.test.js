import { describe, it, expect } from 'vitest';
import { incompleteDaysNote, markedDaysNote } from './nutritionText';

/* 2026-10-06: as notas do período sobre dias incompletos — as que parecem
   (e onde se marcam) e as que o atleta já marcou (fora das contas). */
describe('notas dos dias incompletos', () => {
  it('os que parecem incompletos mandam ao Dia, com o plural certo', () => {
    expect(incompleteDaysNote({ n: 1, of: 5 })).toBe('1 dia parece incompleto — abre-o no Dia para o marcar.');
    expect(incompleteDaysNote({ n: 2, of: 3 })).toBe('2 dias parecem incompletos — abre-os no Dia para os marcar.');
    expect(incompleteDaysNote({ n: 0, of: 3 })).toBe(null);
    expect(incompleteDaysNote(null)).toBe(null);
  });

  it('os marcados dizem quantos ficaram fora das contas', () => {
    expect(markedDaysNote({ n: 1 })).toBe('1 dia marcado como incompleto ficou fora das contas.');
    expect(markedDaysNote({ n: 3 })).toBe('3 dias marcados como incompletos ficaram fora das contas.');
    expect(markedDaysNote({ n: 0 })).toBe(null);
    expect(markedDaysNote(undefined)).toBe(null);
  });
});
