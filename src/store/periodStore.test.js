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

describe('openTab — abre no período anterior quando o da omissão está a começar (2026-10-05)', () => {
  beforeEach(() => usePeriodStore.getState().reset());
  const open = (tab, today, dataStartISO) => usePeriodStore.getState().openTab(tab, today, { dataStartISO });

  it('Corrida no dia 1 do mês, com registos antes: abre no mês anterior', () => {
    expect(open('corrida', '2026-11-01', '2026-06-10')).toBe(true);
    expect(get('corrida')).toEqual({ kind: 'mes', offset: -1 });
  });

  it('Corpo no dia 1 do trimestre; Ginásio idem', () => {
    expect(open('corpo', '2026-10-01', '2026-02-01')).toBe(true);
    expect(get('corpo')).toEqual({ kind: 'trimestre', offset: -1 });
    expect(open('ginasio', '2026-10-01', '2026-02-01')).toBe(true);
    expect(get('ginasio')).toEqual({ kind: 'mes', offset: -1 });
  });

  it('com dias fechados no período (a meio do mês, ou 2 de um mês) fica onde está', () => {
    expect(open('corrida', '2026-11-02', '2026-06-10')).toBe(false);
    expect(get('corrida').offset).toBe(0);
  });

  it('só a partir do 1.º registo: sem registos (null) ou ainda a carregar (undefined) não muda', () => {
    expect(open('corrida', '2026-11-01', null)).toBe(false);
    expect(get('corrida').offset).toBe(0);
    // undefined = a vista ainda não existe: não decide nem gasta a abertura.
    usePeriodStore.getState().reset();
    expect(open('corrida', '2026-11-01', undefined)).toBe(false);
    expect(usePeriodStore.getState().opened.corrida).toBeUndefined();
    expect(open('corrida', '2026-11-01', '2026-06-10')).toBe(true);
    // O 1.º registo no próprio período (hoje, dia 1) não tem anterior com dados.
    usePeriodStore.getState().reset();
    expect(open('corrida', '2026-11-01', '2026-11-01')).toBe(false);
  });

  it('null (sem registos) seguido de uma data é decisão final: quem chama passa undefined até os dados chegarem', () => {
    // Contrato (revisão 2026-10-05): null grava a decisão "nunca registou". Os dashboards só passam
    // null/data quando a fatia chegou (sliceReady); undefined não gasta a abertura.
    expect(open('corrida', '2026-11-01', undefined)).toBe(false);
    expect(open('corrida', '2026-11-01', '2026-06-10')).toBe(true);
    expect(get('corrida').offset).toBe(-1);
    usePeriodStore.getState().reset();
    expect(open('corrida', '2026-11-01', null)).toBe(false);
    expect(open('corrida', '2026-11-01', '2026-06-10')).toBe(false);
    expect(get('corrida').offset).toBe(0);
  });

  it('só uma vez por sessão: depois de abrir, voltar a › não é desfeito', () => {
    open('corrida', '2026-11-01', '2026-06-10');
    usePeriodStore.getState().shift('corrida', 1);
    expect(get('corrida').offset).toBe(0);
    expect(open('corrida', '2026-11-01', '2026-06-10')).toBe(false);
    expect(get('corrida').offset).toBe(0);
  });

  it('o que o atleta escolheu (período, tipo, seta) nunca é mexido', () => {
    usePeriodStore.getState().setKind('corrida', 'ano');
    expect(open('corrida', '2027-01-01', '2026-06-10')).toBe(false);
    expect(get('corrida')).toEqual({ kind: 'ano', offset: 0 });
    usePeriodStore.getState().shift('ginasio', -1);
    usePeriodStore.getState().shift('ginasio', 1);
    expect(open('ginasio', '2026-11-01', '2026-06-10')).toBe(false);
    expect(get('ginasio').offset).toBe(0);
  });

  it('Nutrição e Geral abrem na semana e mantêm o ecrã "segunda-feira" do mock-up', () => {
    expect(open('nutricao', '2026-10-05', '2026-06-10')).toBe(false); // segunda-feira
    expect(open('hub', '2026-10-05', '2026-06-10')).toBe(false);
    expect(get('nutricao').offset).toBe(0);
    expect(get('hub').offset).toBe(0);
  });

  it('reset volta a permitir a abertura', () => {
    open('corrida', '2026-11-01', '2026-06-10');
    usePeriodStore.getState().reset();
    expect(get('corrida')).toEqual({ kind: 'mes', offset: 0 });
    expect(open('corrida', '2026-11-01', '2026-06-10')).toBe(true);
  });
});
