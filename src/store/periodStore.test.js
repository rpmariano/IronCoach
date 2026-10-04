import { describe, it, expect, beforeEach } from 'vitest';
import { usePeriodStore, selectTabPeriod } from './periodStore';

const get = (t) => usePeriodStore.getState().tabs[t];

describe('periodStore', () => {
  beforeEach(() => usePeriodStore.getState().reset());

  it('tem as omissões por separador', () => {
    expect(get('nutricao')).toEqual({ kind: 'semana', offset: 0 });
    expect(get('corrida')).toEqual({ kind: 'mes', offset: 0 });
    expect(get('ginasio')).toEqual({ kind: 'mes', offset: 0 });
    expect(get('corpo')).toEqual({ kind: 'trimestre', offset: 0 });
    expect(get('hub')).toEqual({ kind: 'semana', offset: 0 });
  });

  it('shift anda para trás e nunca passa do presente', () => {
    const { shift } = usePeriodStore.getState();
    shift('nutricao', 1);
    expect(get('nutricao').offset).toBe(0);
    shift('nutricao', -1);
    shift('nutricao', -1);
    expect(get('nutricao').offset).toBe(-2);
    shift('nutricao', 5);
    expect(get('nutricao').offset).toBe(0);
  });

  it('setKind repõe o offset e não mexe nos outros separadores', () => {
    const s = usePeriodStore.getState();
    s.shift('corrida', -3);
    s.shift('corpo', -1);
    s.setKind('corrida', 'ano');
    expect(get('corrida')).toEqual({ kind: 'ano', offset: 0 });
    expect(get('corpo').offset).toBe(-1);
  });

  it('setPeriod abre um separador num período e recusa o futuro', () => {
    const s = usePeriodStore.getState();
    s.setPeriod('nutricao', 'semana', -1);
    expect(get('nutricao')).toEqual({ kind: 'semana', offset: -1 });
    s.setPeriod('nutricao', 'mes', 2);
    expect(get('nutricao')).toEqual({ kind: 'mes', offset: 0 });
  });

  it('reset volta às omissões', () => {
    usePeriodStore.getState().setPeriod('hub', 'mes', -4);
    usePeriodStore.getState().reset();
    expect(get('hub')).toEqual({ kind: 'semana', offset: 0 });
  });

  it('selectTabPeriod devolve a mesma referência para um separador desconhecido', () => {
    const sel = selectTabPeriod('geral');
    const st = usePeriodStore.getState();
    expect(sel(st)).toBe(sel(st));
    expect(selectTabPeriod('geral')(st)).toBe(sel(st));
    expect(sel(st)).toEqual({ kind: 'semana', offset: 0 });
  });
});
