import { describe, it, expect } from 'vitest';
import { isInsightHidden, insightStateForCarol } from './insightState';

const HOJE = '2026-09-27';
const ONTEM = '2026-09-26';

describe('isInsightHidden', () => {
  it('por ver: à vista', () => {
    expect(isInsightHidden('a', { states: {}, snoozes: {}, today: HOJE })).toBe(false);
  });

  it('"Percebi" (ou "Falar com a Carol"): escondido de vez', () => {
    expect(isInsightHidden('a', { states: { a: 'understood' }, today: HOJE })).toBe(true);
  });

  it('"Agora não" hoje: escondido; de ontem: volta', () => {
    expect(isInsightHidden('a', { states: { a: 'ignored' }, snoozes: { a: HOJE }, today: HOJE })).toBe(true);
    expect(isInsightHidden('a', { states: { a: 'ignored' }, snoozes: { a: ONTEM }, today: HOJE })).toBe(false);
  });

  it('um "ignored" sem dia (outro dispositivo, ou o "Ignorar" antigo) não esconde', () => {
    expect(isInsightHidden('a', { states: { a: 'ignored' }, snoozes: {}, today: HOJE })).toBe(false);
  });

  it('sem argumentos não rebenta', () => {
    expect(isInsightHidden('a')).toBe(false);
  });
});

describe('insightStateForCarol', () => {
  it('diz o estado com os nomes dos botões, sem inventar', () => {
    expect(insightStateForCarol('a', { states: { a: 'understood' }, today: HOJE })).toMatch(/^Tratado pelo atleta/);
    expect(insightStateForCarol('a', { states: { a: 'ignored' }, snoozes: { a: HOJE }, today: HOJE })).toMatch(/posto de lado hoje .*"Agora não"/);
    expect(insightStateForCarol('a', { states: { a: 'ignored' }, snoozes: { a: ONTEM }, today: HOJE })).toBe('Ativo (o atleta já o pôs de lado noutro dia)');
    expect(insightStateForCarol('a', { states: {}, today: HOJE })).toBe('Ativo (pendente)');
  });
});
