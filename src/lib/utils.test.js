import { describe, it, expect } from 'vitest';
import { currentPageLabel } from './utils';

describe('currentPageLabel', () => {
  it('devolve o rótulo do separador ativo quando não há registo aberto', () => {
    expect(currentPageLabel({ activeTab: 'coach' })).toBe('Coach');
    expect(currentPageLabel({ activeTab: 'nutricao' })).toBe('Dashboard · Nutrição');
  });

  it('usa a chave crua como fallback para um separador sem rótulo mapeado', () => {
    expect(currentPageLabel({ activeTab: 'algo-novo' })).toBe('algo-novo');
  });

  it('devolve um fallback estável quando não há activeTab nenhum', () => {
    expect(currentPageLabel({})).toBe('Desconhecida');
    expect(currentPageLabel()).toBe('Desconhecida');
  });

  it('identifica os ecrãs de registo por openCreationMode', () => {
    expect(currentPageLabel({ activeTab: 'nutricao', openCreationMode: 'meal' })).toBe('Registo · Refeição');
    expect(currentPageLabel({ activeTab: 'corrida', openCreationMode: 'run' })).toBe('Registo · Corrida');
  });

  it('trata a Prova como caso especial (nova vs. edição), com prioridade sobre o activeTab', () => {
    expect(currentPageLabel({ activeTab: 'home', openCreationMode: 'race' })).toBe('Prova · Nova');
    expect(currentPageLabel({ activeTab: 'home', editingRaceId: 'race-123' })).toBe('Prova · Edição');
    // editingRaceId implica openCreationMode 'race' no store, mas a função não deve depender disso
    expect(currentPageLabel({ activeTab: 'home', openCreationMode: 'race', editingRaceId: 'race-123' })).toBe('Prova · Edição');
  });
});
