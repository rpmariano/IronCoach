import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import { weekDone, weekDoneLine, wasWeekCelebrated } from './weekDone';
import WeekDoneRibbon from './WeekDoneRibbon';
import { expectCarolVoice } from '../../test/carolVoice';
import { lisbonParts } from '../../utils/carolWelcome';

/* A semana cumprida: a semana do PLANO (a do "semana N de M"), todos os
   treinos dela concluídos, pelo menos dois. CAROL.md: uma frase. */

const plan = { id: 'p1', status: 'aceite', period_start: '2026-09-14', period_end: '2026-10-11' };
const item = (id, planned_date, o = {}) => ({ id, plan_id: 'p1', planned_date, kind: 'corrida', status: 'concluido', ...o });

describe('weekDone', () => {
  it('a semana 1 com os três treinos feitos: cumprida', () => {
    const items = [item('a', '2026-09-14'), item('b', '2026-09-16', { kind: 'ginasio' }), item('c', '2026-09-18'), item('r', '2026-09-15', { kind: 'descanso', status: 'pendente' })];
    const d = weekDone({ plans: [plan], planItems: items, today: '2026-09-19' });
    expect(d).toMatchObject({ week: 1, count: 3, weekStart: '2026-09-14' });
    expect(d.days.map((x) => x.state)).toEqual(['done', 'rest', 'done', 'rest', 'done', 'rest', 'rest']);
    expect(d.days[5]).toMatchObject({ dateISO: '2026-09-19', isToday: true, initial: 'S' });
  });

  it('um treino por fazer: ainda não', () => {
    const items = [item('a', '2026-09-14'), item('b', '2026-09-18', { status: 'pendente' })];
    expect(weekDone({ plans: [plan], planItems: items, today: '2026-09-19' })).toBeNull();
  });

  it('os cancelados não contam, mas um treino sozinho não faz semana', () => {
    const items = [item('a', '2026-09-14'), item('b', '2026-09-18', { status: 'cancelado' })];
    expect(weekDone({ plans: [plan], planItems: items, today: '2026-09-19' })).toBeNull();
  });

  it('conta pela semana do plano, não do calendário; e pelo dia em que foi feito', () => {
    // Semana 2 do plano: 21 a 27. O treino de dia 20 feito a 21 conta na semana 2.
    const items = [item('a', '2026-09-20', { actual_date: '2026-09-21' }), item('b', '2026-09-23'), item('c', '2026-09-14')];
    const d = weekDone({ plans: [plan], planItems: items, today: '2026-09-24' });
    expect(d).toMatchObject({ week: 2, count: 2, weekStart: '2026-09-21' });
  });

  it('um plano só proposto não conta', () => {
    const items = [item('a', '2026-09-14'), item('b', '2026-09-16')];
    expect(weekDone({ plans: [{ ...plan, status: 'proposto' }], planItems: items, today: '2026-09-19' })).toBeNull();
  });
});

/* Pedido 2026-09-26: cumprida só quando a semana já não pode ganhar
   treinos, e a prova não é um treino. O plano de uma prova vai até ao dia
   dela, e os treinos entram por tranches (coach-chat). No código antigo, a
   semana de quarta a terça era celebrada no domingo, com a tranche escrita
   só até lá, e a prova contava como «três treinos». */
describe('weekDone — só com a semana toda escrita, ou no último dia dela', () => {
  // Plano para a prova de 15 nov, a começar na quarta, 16 set: a semana 1 vai de quarta a terça, 22.
  const bloco = { id: 'b1', status: 'aceite', race_id: 'r1', period_start: '2026-09-16', period_end: '2026-11-15' };
  const doBloco = (id, d, o = {}) => item(id, d, { plan_id: 'b1', ...o });
  // A primeira tranche: quarta, sexta e domingo — e o dia da prova, que o servidor põe logo.
  const provaLonge = doBloco('prova', '2026-11-15', { training_type: 'prova', status: 'pendente' });
  const tranche1 = [doBloco('a', '2026-09-16'), doBloco('b', '2026-09-18', { kind: 'ginasio' }), doBloco('c', '2026-09-20'), provaLonge];
  // A seguinte, escrita na segunda: segunda feita, terça por fazer, e a semana 2.
  const tranche2 = (terca = 'pendente') => [
    doBloco('d', '2026-09-21'),
    doBloco('e', '2026-09-22', { kind: 'ginasio', status: terca }),
    doBloco('f', '2026-09-24', { status: 'pendente' }),
  ];

  it('o caso do relato: tranche escrita só até domingo, tudo feito — domingo e segunda não a dão por cumprida', () => {
    for (const today of ['2026-09-20', '2026-09-21']) {
      expect(weekDone({ plans: [bloco], planItems: tranche1, today }), today).toBeNull();
    }
  });

  it('dos dois lados da meia-noite (hora de Lisboa): domingo→segunda nada; segunda→terça, no último dia, já terminou', () => {
    const em = (instante) => weekDone({ plans: [bloco], planItems: tranche1, today: lisbonParts(new Date(instante)).date });
    expect(em('2026-09-20T22:59:00Z')).toBeNull(); // domingo, 23:59
    expect(em('2026-09-20T23:01:00Z')).toBeNull(); // segunda, 00:01
    expect(em('2026-09-21T22:59:00Z')).toBeNull(); // segunda, 23:59
    const terca = em('2026-09-21T23:01:00Z'); // terça, 00:01 — o último dia da semana 1
    expect(terca).toMatchObject({ week: 1, count: 3, prova: null, weekStart: '2026-09-16' });
    expect(weekDoneLine(terca)).toBe('Semana 1 cumprida. Três treinos, três feitos.');
  });

  it('chega a tranche seguinte com os dois dias que faltavam: cumpre-se quando os dois estão feitos', () => {
    expect(weekDone({ plans: [bloco], planItems: [...tranche1, ...tranche2()], today: '2026-09-21' })).toBeNull();
    const d = weekDone({ plans: [bloco], planItems: [...tranche1, ...tranche2('concluido')], today: '2026-09-22' });
    expect(d).toMatchObject({ week: 1, count: 5, weekStart: '2026-09-16' });
    expect(weekDoneLine(d)).toBe('Semana 1 cumprida. Cinco treinos, cinco feitos.');
  });

  it('com a semana toda escrita, os dias vazios são descanso: cumpre-se antes do fim', () => {
    // A tranche 2 sem a terça (descanso): segunda feita, e já está escrita até quinta.
    const semTerca = tranche2().filter((i) => i.id !== 'e');
    expect(weekDone({ plans: [bloco], planItems: [...tranche1, ...semTerca], today: '2026-09-21' })).toMatchObject({ week: 1, count: 4 });
  });

  it('um plano sem prova escreve-se inteiro: acaba no domingo, e no domingo, com tudo feito, está cumprido', () => {
    const micro = { id: 'm1', status: 'aceite', period_start: '2026-09-16', period_end: '2026-09-20' };
    const items = tranche1.filter((i) => i.id !== 'prova').map((i) => ({ ...i, plan_id: 'm1' }));
    expect(weekDone({ plans: [micro], planItems: items, today: '2026-09-20' })).toMatchObject({ week: 1, count: 3 });
  });
});

describe('weekDone — a semana da prova', () => {
  // Plano de quarta, 16, até à prova, no sábado, 26: a semana 2 (23 a 29) acaba na prova.
  const bloco = { id: 'p2', status: 'aceite', race_id: 'r2', period_start: '2026-09-16', period_end: '2026-09-26' };
  const doBloco = (id, d, o = {}) => item(id, d, { plan_id: 'p2', ...o });
  const semana = (provaStatus) => [
    doBloco('a', '2026-09-23'),
    doBloco('b', '2026-09-24', { kind: 'ginasio' }),
    doBloco('r', '2026-09-26', { training_type: 'prova', target_distance_km: 21.0975, status: provaStatus }),
  ];

  it('dia a dia até à prova: nada; com a prova feita, a frase é da prova, e ela não conta como treino', () => {
    for (const today of ['2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26']) {
      expect(weekDone({ plans: [bloco], planItems: semana('pendente'), today }), today).toBeNull();
    }
    const d = weekDone({ plans: [bloco], planItems: semana('concluido'), today: '2026-09-26' });
    expect(d).toMatchObject({ week: 2, count: 2, prova: 'fim' });
    expect(d.days.find((x) => x.dateISO === '2026-09-26').state).toBe('done');
    const frase = weekDoneLine(d);
    expect(frase).toBe('Semana 2 cumprida, com a prova no fim.');
    expectCarolVoice(frase);
  });

  it('a prova com um só treino na semana chega; a prova sozinha, não', () => {
    const [a, , r] = semana('concluido');
    expect(weekDone({ plans: [bloco], planItems: [a, r], today: '2026-09-26' })).toMatchObject({ count: 1, prova: 'fim' });
    expect(weekDone({ plans: [bloco], planItems: [r], today: '2026-09-26' })).toBeNull();
  });

  it('uma prova a meio da semana, com treino depois dela: «pelo meio»', () => {
    const items = [item('a', '2026-09-21'), item('r', '2026-09-23', { training_type: 'prova' }), item('c', '2026-09-26')];
    const d = weekDone({ plans: [plan], planItems: items, today: '2026-09-26' });
    expect(d).toMatchObject({ week: 2, count: 2, prova: 'meio' });
    expect(weekDoneLine(d)).toBe('Semana 2 cumprida, com a prova pelo meio.');
  });
});

describe('weekDoneLine', () => {
  it('uma frase, o número por extenso, sem exclamação', () => {
    expect(weekDoneLine({ week: 6, count: 5 })).toBe('Semana 6 cumprida. Cinco treinos, cinco feitos.');
    expect(weekDoneLine({ week: 2, count: 12 })).toBe('Semana 2 cumprida. 12 treinos, 12 feitos.');
    for (const f of [weekDoneLine({ week: 6, count: 5 }), weekDoneLine({ week: 3, count: 2, prova: 'meio' })]) expectCarolVoice(f);
  });
});

/* Visto noutro dispositivo (ação 5.1): a impressão 'moment:weekdone:<semana>'
   lida do servidor conta como visto, mesmo sem a marca local. */
describe('wasWeekCelebrated', () => {
  const semStorage = { getItem: () => null, setItem: () => {} };

  it('a impressão desta semana conta como visto; outra semana ou nenhuma, não', () => {
    expect(wasWeekCelebrated('u1', '2026-09-14', new Set(['moment:weekdone:2026-09-14']), semStorage)).toBe(true);
    expect(wasWeekCelebrated('u1', '2026-09-14', new Set(['moment:weekdone:2026-09-07']), semStorage)).toBe(false);
    expect(wasWeekCelebrated('u1', '2026-09-14', null, semStorage)).toBe(false);
  });
});

describe('WeekDoneRibbon', () => {
  const done = weekDone({ plans: [plan], planItems: [item('a', '2026-09-14'), item('b', '2026-09-16')], today: '2026-09-19' });
  let logImpression;
  beforeEach(() => {
    window.localStorage.clear();
    logImpression = vi.fn();
    useAppStore.setState({ session: { user: { id: 'u1' } }, profile: { id: 'u1' }, welcomeGate: 'clear', logImpression, impressionShown: new Set() });
  });

  it('celebrada noutro dispositivo: fica só lá, sem momento nem nova impressão', () => {
    useAppStore.setState({ impressionShown: new Set(['moment:weekdone:2026-09-14']) });
    render(<WeekDoneRibbon done={done} />);
    expect(screen.getByTestId('week-done')).not.toHaveAttribute('data-celebrate');
    expect(screen.getByText('Semana 1 cumprida. Dois treinos, dois feitos.')).toBeInTheDocument();
    expect(logImpression).not.toHaveBeenCalled();
  });

  it('a primeira vez é o momento; da segunda, fica só lá', () => {
    const { unmount } = render(<WeekDoneRibbon done={done} />);
    expect(screen.getByTestId('week-done')).toHaveAttribute('data-celebrate', 'true');
    expect(screen.getByText('Semana 1 cumprida. Dois treinos, dois feitos.')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Os sete dias da semana 1' }).querySelectorAll('li')).toHaveLength(7);
    // O momento fica em coach_impressions (ação 5.1): a chave da semana, sem título.
    expect(logImpression).toHaveBeenCalledWith({ kind: 'moment', key: 'weekdone:2026-09-14', title: null });
    unmount();
    render(<WeekDoneRibbon done={done} />);
    expect(screen.getByTestId('week-done')).not.toHaveAttribute('data-celebrate');
    expect(logImpression).toHaveBeenCalledTimes(1);
  });
});
