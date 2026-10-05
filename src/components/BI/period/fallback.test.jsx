import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MinDataNote from './MinDataNote';
import EarlyPeriodState from './EarlyPeriodState';
import { pickFallbackPeriod, fallbackAction, earlyVerdict, closedWeekStarts, nextWeekCloseISO, shortPeriodName } from './periodText';
import { calendarPeriod } from '@formulas/calendarPeriod.ts';

/* Limiares (2026-10-05): as notas de "ainda não chega" levam ao período onde os
   dados já estão ("Ver setembro ›", "Ver o ano ›"), com botão de ≥44 px na cor
   do módulo. */

describe('MinDataNote — a ação (M4)', () => {
  it('sem ação continua a ser só a frase tracejada', () => {
    render(<MinDataNote text="Séries por músculo: ainda não." />);
    expect(screen.getByTestId('min-data-note')).toHaveTextContent('Séries por músculo: ainda não.');
    expect(screen.getByTestId('min-data-note').tagName).toBe('P');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('com ação: botão ≥44 px na cor do módulo, que chama onAction', () => {
    const onAction = vi.fn();
    render(<MinDataNote module="corrida" text="Em outubro não há zonas." actionLabel="Ver setembro" onAction={onAction} />);
    const b = screen.getByRole('button', { name: 'Ver setembro' });
    expect(b.style.minHeight).toBe('var(--tap)');
    expect(b.style.color).toBe('var(--run)');
    fireEvent.click(b);
    expect(onAction).toHaveBeenCalledTimes(1);
    // O botão fica dentro da nota tracejada, por baixo da frase.
    expect(screen.getByTestId('min-data-note')).toHaveTextContent('Em outubro não há zonas.');
    expect(screen.getByTestId('min-data-note').style.border).toContain('dashed');
    expect(screen.getByTestId('min-data-note')).toContainElement(b);
  });

  it('sem rótulo ou sem função não desenha botão', () => {
    const { rerender } = render(<MinDataNote text="x" actionLabel="Ver ano" />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<MinDataNote text="x" onAction={() => {}} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('EarlyPeriodState — a ação (M5)', () => {
  const cal = { kind: 'mes', period: calendarPeriod('mes', '2026-10-04', 0), label: { title: 'outubro 2026' } };

  it('"cedo": a frase e, por baixo, o botão do módulo', () => {
    const onAction = vi.fn();
    render(<EarlyPeriodState state="cedo" cal={cal} module="ginasio" actionLabel="Ver o trimestre" onAction={onAction} />);
    expect(screen.getByTestId('early-cedo')).toHaveTextContent('Só 3 dias fechados em outubro — ainda é cedo para conclusões.');
    const b = screen.getByRole('button', { name: 'Ver o trimestre' });
    expect(b.style.minHeight).toBe('var(--tap)');
    expect(b.style.color).toBe('var(--gym)');
    fireEvent.click(b);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('"cedo" sem ação fica como era (só a frase)', () => {
    render(<EarlyPeriodState state="cedo" cal={cal} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('"a começar": a ação substitui o "Ver mês passado" (o Ano, quando o anterior não tem nada)', () => {
    const onAction = vi.fn();
    const onViewPrevious = vi.fn();
    render(<EarlyPeriodState state="a_comecar" kind="mes" module="corrida" onViewPrevious={onViewPrevious} actionLabel="Ver o ano" onAction={onAction} />);
    expect(screen.queryByRole('button', { name: 'Ver mês passado' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver o ano' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onViewPrevious).not.toHaveBeenCalled();
  });

  it('earlyVerdict: `extra` junta onde estão os dados; sem ele a frase é a de sempre', () => {
    expect(earlyVerdict(cal).text).toBe('Só 3 dias fechados em outubro — ainda é cedo para conclusões.');
    expect(earlyVerdict(cal, { extra: 'Em setembro tens 9 corridas.' }).text)
      .toBe('Só 3 dias fechados em outubro — ainda é cedo para conclusões. Em setembro tens 9 corridas.');
  });
});

describe('pickFallbackPeriod — o menor período com dados que cheguem', () => {
  const HOJE = '2026-10-04';
  // countIn por janela: conta as "corridas" de uma lista de datas.
  const datas = (ds) => (f, t) => ds.filter((d) => d >= f && d <= t).length;

  it('prefere o anterior equivalente', () => {
    const fb = pickFallbackPeriod({ kind: 'mes', todayISO: HOJE, dataStartISO: '2026-01-05', min: 3, countIn: datas(['2026-09-02', '2026-09-09', '2026-09-16', '2026-02-03']) });
    expect(fb).toMatchObject({ type: 'prev', kind: 'mes', label: 'Ver setembro', where: 'em setembro', name: 'setembro', count: 3 });
  });

  it('se o anterior não chega, sobe pelo tipo maior (trimestre antes do ano) — só quem está no período em curso', () => {
    // Hoje 4 out: o trimestre (out–dez) só tem 1–3 out; o Ano tem tudo.
    const ds = ['2026-02-02', '2026-04-09', '2026-09-16'];
    const fb = pickFallbackPeriod({ kind: 'mes', todayISO: HOJE, dataStartISO: '2026-01-05', min: 3, countIn: datas(ds) });
    expect(fb).toMatchObject({ type: 'kind', kind: 'ano', label: 'Ver o ano', where: 'neste ano', count: 3 });
    // Passado (julho): o tipo maior é o que CONTÉM julho — o trimestre jul–set só
    // tem 1; o ano de 2026 (que contém julho) tem as 3 (2026-10-05).
    expect(pickFallbackPeriod({ kind: 'mes', offset: -3, todayISO: HOJE, dataStartISO: '2026-01-05', min: 3, countIn: datas(ds) }))
      .toMatchObject({ type: 'kind', kind: 'ano', label: 'Ver o ano' });
    // Um ano passado só leva a um período que o contém: 2025 sem nada → null.
    expect(pickFallbackPeriod({ kind: 'mes', offset: -12, todayISO: HOJE, dataStartISO: '2025-01-05', min: 3, countIn: datas(ds) })).toBeNull();
  });

  it('semana passada sem o que chega: leva ao mês que contém o seu início ("Ver setembro"), não ao mês de hoje (2026-10-05)', () => {
    // Hoje 5 out (segunda): a semana passada é 28 set – 4 out; a anterior (21–27 set) não tem nada.
    const ds = ['2026-09-02', '2026-09-09', '2026-09-29'];
    const fb = pickFallbackPeriod({ kind: 'semana', offset: -1, todayISO: '2026-10-05', dataStartISO: '2026-01-05', min: 3, countIn: datas(ds) });
    expect(fb).toMatchObject({ type: 'period', kind: 'mes', offset: -1, label: 'Ver setembro', where: 'em setembro', count: 3 });
    const setPeriod = vi.fn();
    const act = fallbackAction(fb, { prev: vi.fn(), setKind: vi.fn(), setPeriod });
    expect(act.actionLabel).toBe('Ver setembro');
    act.onAction();
    expect(setPeriod).toHaveBeenCalledWith('mes', -1);
    // Sem setPeriod no `cal` não se promete um botão que não funciona.
    expect(fallbackAction(fb, { prev: vi.fn(), setKind: vi.fn() })).toEqual({});
  });

  it('o trimestre atual é o que se oferece primeiro quando já chega', () => {
    const fb = pickFallbackPeriod({ kind: 'semana', todayISO: '2026-10-20', dataStartISO: '2026-01-05', min: 3, countIn: datas(['2026-10-02', '2026-10-05', '2026-10-09']) });
    expect(fb).toMatchObject({ type: 'kind', kind: 'mes', label: 'Ver o mês' });
  });

  it('respeita os tipos que o separador tem (o Ginásio não tem Ano) e o 1.º registo', () => {
    const ds = ['2026-02-02', '2026-04-09', '2026-09-16'];
    expect(pickFallbackPeriod({ kind: 'mes', todayISO: HOJE, dataStartISO: '2026-01-05', kinds: ['semana', 'mes', 'trimestre'], min: 3, countIn: datas(ds) })).toBeNull();
    // Só se contam dias a partir do 1.º registo.
    expect(pickFallbackPeriod({ kind: 'mes', todayISO: HOJE, dataStartISO: '2026-09-10', min: 1, countIn: datas(['2026-09-02']) })).toBeNull();
  });

  it('sem countIn, sem data de hoje ou sem nada que chegue → null; fallbackAction liga aos botões do cal', () => {
    expect(pickFallbackPeriod({ kind: 'mes', todayISO: HOJE })).toBeNull();
    expect(pickFallbackPeriod({ kind: 'mes', todayISO: HOJE, min: 1, countIn: () => 0 })).toBeNull();
    const cal = { prev: vi.fn(), setKind: vi.fn() };
    const a = fallbackAction({ type: 'prev', label: 'Ver setembro' }, cal);
    a.onAction();
    expect(cal.prev).toHaveBeenCalledTimes(1);
    const b = fallbackAction({ type: 'kind', kind: 'ano', label: 'Ver o ano' }, cal);
    b.onAction();
    expect(cal.setKind).toHaveBeenCalledWith('ano');
    expect(fallbackAction(null, cal)).toEqual({});
  });
});

describe('semanas fechadas que tocam o período', () => {
  it('outubro a 12 out: 28 set – 4 out e 5 – 11 out (a de 12 – 18 ainda não fechou)', () => {
    const p = calendarPeriod('mes', '2026-10-12', 0);
    expect(closedWeekStarts(p.start, p.end, '2026-10-12', '2026-01-05')).toEqual(['2026-09-28', '2026-10-05']);
  });

  it('semanas que começam antes do 1.º registo ficam de fora; sem registo não há semanas', () => {
    const p = calendarPeriod('mes', '2026-10-12', 0);
    expect(closedWeekStarts(p.start, p.end, '2026-10-12', '2026-09-30')).toEqual(['2026-10-05']);
    expect(closedWeekStarts(p.start, p.end, '2026-10-12', null)).toEqual([]);
  });

  it('nextWeekCloseISO: o domingo em que fecha a 1.ª semana ainda aberta; null num período passado', () => {
    const p = calendarPeriod('mes', '2026-10-04', 0);
    expect(nextWeekCloseISO(p.start, p.end, '2026-10-04', '2026-01-05')).toBe('2026-10-04');
    const q = calendarPeriod('mes', '2026-10-04', -1);
    expect(nextWeekCloseISO(q.start, q.end, '2026-11-20', '2026-01-05')).toBeNull();
  });

  it('shortPeriodName: o mês do ano corrente só pelo nome', () => {
    expect(shortPeriodName('setembro 2026', 'mes', '2026-10-04')).toBe('setembro');
    expect(shortPeriodName('setembro 2025', 'mes', '2026-10-04')).toBe('setembro 2025');
    expect(shortPeriodName('Semana passada', 'semana', '2026-10-04')).toBe('semana passada');
  });
});
