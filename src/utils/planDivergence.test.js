import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectPlanDivergence, detectRaceConflict, wasDivergenceHandled, markDivergenceHandled, MISSED_MIN, listaDias,
} from './planDivergence';
import { expectCarolVoice } from '../test/carolVoice';
import { lisbonParts } from './carolWelcome';

/* specs/plano-de-prova.md, "O plano tem de saber da prova" (Alerta de
   ajuste). Datas fixas: "hoje" é injetável de propósito, para os testes não
   dependerem do relógio da máquina. */

const TODAY = '2026-09-13';
const plan = (over = {}) => ({ id: 'p1', status: 'aceite', period_start: '2026-09-07', period_end: '2026-09-27', ...over });
const item = (over = {}) => ({ id: 'i1', plan_id: 'p1', kind: 'corrida', status: 'pendente', planned_date: TODAY, ...over });
const race = (over = {}) => ({ id: 'r1', name: 'Corrida do Tejo', date: TODAY, status: 'agendada', distance_km: 10, ...over });

const detect = (over = {}) => detectPlanDivergence({ today: TODAY, coachPlans: [plan()], ...over });
const keys = (result) => result.reasons.map((r) => r.key);

describe('detectPlanDivergence — quando a realidade se afastou do plano', () => {
  it('sem plano aceite não há nada a ajustar', () => {
    expect(detectPlanDivergence({ today: TODAY, coachPlans: [], raceEvents: [race()] })).toEqual({ reasons: [], signature: null });
    expect(detectPlanDivergence({ today: TODAY, coachPlans: [plan({ status: 'proposto' })], raceEvents: [race()] }).reasons).toEqual([]);
  });

  it('um plano que já terminou não se ajusta', () => {
    const r = detectPlanDivergence({
      today: TODAY,
      coachPlans: [plan({ period_start: '2026-08-01', period_end: '2026-09-12' })],
      raceEvents: [race({ date: '2026-09-10' })],
    });
    expect(r.reasons).toEqual([]);
  });

  it('prova dentro do plano sem item de prova nesse dia', () => {
    const r = detect({ raceEvents: [race()] });
    expect(keys(r)).toEqual(['prova_sem_item']);
    expect(r.reasons[0].text).toBe('Corrida do Tejo (13 set) não está no plano.');
    expect(r.signature).toContain('p1|');
  });

  /* Revisão de 2026-09-26: era «A ${raceLabel} não está no plano.» — «A
     Trail do Sico (13 set)», e sem nome «A a prova (13 set)». */
  it('a prova sem item diz-se pelo nome, sem artigo à frente; sem nome, «A prova»', () => {
    const texto = (over) => detect({ raceEvents: [race(over)] }).reasons[0].text;
    expect(texto({ name: 'Trail do Sico' })).toBe('Trail do Sico (13 set) não está no plano.');
    expect(texto({ name: '' })).toBe('A prova (13 set) não está no plano.');
    expect(texto({ name: null })).not.toMatch(/A a prova/);
    expectCarolVoice(texto({ name: 'Trail do Sico' }));
  });

  it('com o item de prova lá, não há motivo nenhum', () => {
    const r = detect({
      raceEvents: [race()],
      coachPlanItems: [item({ training_type: 'prova', target_distance_km: 10 })],
    });
    expect(r).toEqual({ reasons: [], signature: null });
  });

  it('uma prova fora do período do plano é assunto do próximo plano', () => {
    expect(detect({ raceEvents: [race({ date: '2026-10-15' })] }).reasons).toEqual([]);
  });

  it('uma prova já concluída não conta', () => {
    expect(detect({ raceEvents: [race({ status: 'concluida' })] }).reasons).toEqual([]);
  });

  it('um treino marcado no dia da prova', () => {
    const r = detect({
      raceEvents: [race()],
      coachPlanItems: [
        item({ id: 'i-prova', training_type: 'prova' }),
        item({ id: 'i-longo', training_type: 'longo', target_distance_km: 16 }),
      ],
    });
    expect(keys(r)).toEqual(['treino_no_dia_da_prova']);
    // Revisão de 2026-09-26: era «o plano tem Rodagem longa · 16 km no dia
    // da prova» — o rótulo do chip a meio da frase.
    expect(r.reasons[0].text).toBe('Corrida do Tejo (13 set): no dia da prova o plano ainda tem uma rodagem longa de 16 km.');
    expect(r.reasons[0].text).not.toContain('·');
    expectCarolVoice(r.reasons[0].text);
  });

  it('o treino no dia da prova sem nome e com ginásio também se diz como frase', () => {
    const r = detect({
      raceEvents: [race({ name: null })],
      coachPlanItems: [
        item({ id: 'i-prova', training_type: 'prova' }),
        item({ id: 'i-gym', kind: 'ginasio', categories: ['Pernas'], target_duration_min: 45 }),
      ],
    });
    expect(r.reasons[0].text).toBe('A prova (13 set): no dia da prova o plano ainda tem um treino de pernas de 45 minutos.');
  });

  it('descanso no dia da prova não é queixa (só a falta do item de prova é)', () => {
    const r = detect({
      raceEvents: [race()],
      coachPlanItems: [item({ id: 'i-prova', training_type: 'prova' }), item({ id: 'i-rest', kind: 'descanso' })],
    });
    expect(r.reasons).toEqual([]);
  });

  // Prova daqui a uma semana, para a véspera e a antevéspera caírem também
  // no futuro — no passado seriam, e bem, sessões falhadas.
  it('trabalho duro na véspera e ginásio na antevéspera', () => {
    const r = detect({
      raceEvents: [race({ date: '2026-09-20' })],
      coachPlanItems: [
        item({ id: 'i-prova', planned_date: '2026-09-20', training_type: 'prova' }),
        item({ id: 'i-int', planned_date: '2026-09-19', training_type: 'intervalos' }),
        item({ id: 'i-gym', planned_date: '2026-09-18', kind: 'ginasio', categories: ['pernas'] }),
        // Recuperação na véspera é exatamente o que deve lá estar.
        item({ id: 'i-rec', planned_date: '2026-09-19', training_type: 'regenerativo' }),
      ],
    });
    expect(keys(r)).toEqual(['treino_forte_na_vespera', 'treino_forte_na_vespera']);
    // Revisão de 2026-09-26: era «Intervalos a 19 set, na véspera da prova.»,
    // sem dizer o que estava mal.
    expect(r.reasons[0].text).toBe('Corrida do Tejo (20 set): a 19 set tens um treino intervalado. Na véspera da prova só cabe corrida leve.');
    expect(r.reasons[1].text).toBe('Corrida do Tejo (20 set): a 18 set tens um treino de pernas. A dois dias da prova só cabe corrida leve.');
    r.reasons.forEach((x) => expectCarolVoice(x.text));
  });

  /* Revisão de 2026-09-26: 20 minutos de mobilidade ligeira a dois dias de
     uma prova de treino (c) contavam como «treino duro». */
  it('ginásio leve a dois dias da prova não é trabalho duro', () => {
    const r = detect({
      raceEvents: [race({ date: '2026-09-20' })],
      coachPlanItems: [
        item({ id: 'i-prova', planned_date: '2026-09-20', training_type: 'prova' }),
        item({ id: 'i-mob', planned_date: '2026-09-18', kind: 'ginasio', categories: ['Mobilidade'], target_duration_min: 20 }),
        item({ id: 'i-yoga', planned_date: '2026-09-19', kind: 'ginasio', categories: ['Yoga', 'Alongamentos'] }),
      ],
    });
    expect(r.reasons).toEqual([]);
  });

  it('ginásio sem categorias, ou com pernas ao lado da mobilidade, conta como antes', () => {
    const r = detect({
      raceEvents: [race({ date: '2026-09-20' })],
      coachPlanItems: [
        item({ id: 'i-prova', planned_date: '2026-09-20', training_type: 'prova' }),
        item({ id: 'i-sem', planned_date: '2026-09-18', kind: 'ginasio' }),
        item({ id: 'i-mix', planned_date: '2026-09-19', kind: 'ginasio', categories: ['Mobilidade', 'Pernas'] }),
      ],
    });
    expect(keys(r)).toEqual(['treino_forte_na_vespera', 'treino_forte_na_vespera']);
  });

  it('antes de uma prova de treino (c) não há véspera a guardar', () => {
    const items = [
      item({ id: 'i-prova', planned_date: '2026-09-20', training_type: 'prova' }),
      item({ id: 'i-int', planned_date: '2026-09-19', training_type: 'intervalos' }),
      item({ id: 'i-mob', planned_date: '2026-09-18', kind: 'ginasio', categories: ['Mobilidade'], target_duration_min: 20 }),
      item({ id: 'i-gym', planned_date: '2026-09-18', kind: 'ginasio', categories: ['Pernas'] }),
    ];
    expect(detect({ raceEvents: [race({ date: '2026-09-20', race_priority: 'c' })], coachPlanItems: items }).reasons).toEqual([]);
    // Secundária (b) guarda-se como antes.
    expect(keys(detect({ raceEvents: [race({ date: '2026-09-20', race_priority: 'b' })], coachPlanItems: items })))
      .toEqual(['treino_forte_na_vespera', 'treino_forte_na_vespera']);
  });

  it('a três dias da prova já se pode treinar forte', () => {
    const r = detect({
      raceEvents: [race({ date: '2026-09-20' })],
      coachPlanItems: [
        item({ id: 'i-prova', planned_date: '2026-09-20', training_type: 'prova' }),
        item({ id: 'i-int', planned_date: '2026-09-17', training_type: 'intervalos' }),
      ],
    });
    expect(r.reasons).toEqual([]);
  });

  it('duas ou mais sessões por registar nos últimos 7 dias', () => {
    const r = detect({
      coachPlanItems: [
        item({ id: 'a', planned_date: '2026-09-09', training_type: 'longo' }),
        item({ id: 'b', planned_date: '2026-09-11', kind: 'ginasio' }),
      ],
    });
    expect(keys(r)).toEqual(['sessoes_falhadas']);
    // Pedido 2026-09-26: sem abrir com um número, e a perguntar (CAROL.md §3).
    expect(r.reasons[0].text).toBe('Não vi registo dos treinos de 9 e 11 set. Aconteceu alguma coisa?');
  });

  it('uma só não chega, e um dia com registo deixa de contar', () => {
    const items = [
      item({ id: 'a', planned_date: '2026-09-09', training_type: 'longo' }),
      item({ id: 'b', planned_date: '2026-09-11', kind: 'ginasio' }),
    ];
    expect(detect({ coachPlanItems: [items[0]] }).reasons).toEqual([]);
    expect(MISSED_MIN).toBe(2);
    // Uma corrida a 09-09 e uma sessão de ginásio a 09-11 resolvem as duas.
    expect(detect({ coachPlanItems: items, runs: [{ date: '2026-09-09' }], gymSessions: [{ date: '2026-09-11' }] }).reasons).toEqual([]);
  });

  it('sessões de hoje e do futuro, ou já concluídas, não são falhadas', () => {
    const r = detect({
      coachPlanItems: [
        item({ id: 'a', planned_date: TODAY }),
        item({ id: 'b', planned_date: '2026-09-15' }),
        item({ id: 'c', planned_date: '2026-09-11', status: 'concluido' }),
        item({ id: 'd', planned_date: '2026-09-10', status: 'cancelado' }),
        // Fora da janela de 7 dias.
        item({ id: 'e', planned_date: '2026-09-05' }),
      ],
    });
    expect(r.reasons).toEqual([]);
  });

  /* Relatado 2026-09-13: o ajuste de um plano aceite escreve os itens novos
     no plano original e deixa os dias passados como "pendente". As falhadas
     de antes do ajuste já foram vistas pela Carol — não voltam a chamar. */
  it('sessões falhadas antes da última reescrita do plano não contam', () => {
    const r = detect({
      coachPlanItems: [
        item({ id: 'a', planned_date: '2026-09-08', created_at: '2026-09-06T10:00:00Z' }),
        item({ id: 'b', planned_date: '2026-09-09', created_at: '2026-09-06T10:00:00Z' }),
        // O ajuste de hoje: a prova e a semana que vem.
        item({ id: 'c', planned_date: '2026-09-13', training_type: 'prova', created_at: '2026-09-13T09:30:00Z' }),
        item({ id: 'd', planned_date: '2026-09-15', created_at: '2026-09-13T09:30:00Z' }),
      ],
    });
    expect(keys(r)).not.toContain('sessoes_falhadas');
  });

  it('as falhadas depois da reescrita voltam a contar', () => {
    const r = detect({
      today: '2026-09-17',
      coachPlans: [plan()],
      coachPlanItems: [
        item({ id: 'a', planned_date: '2026-09-08', created_at: '2026-09-06T10:00:00Z' }),
        item({ id: 'd', planned_date: '2026-09-14', created_at: '2026-09-13T09:30:00Z' }),
        item({ id: 'e', planned_date: '2026-09-15', created_at: '2026-09-13T09:30:00Z' }),
      ],
    });
    expect(keys(r)).toEqual(['sessoes_falhadas']);
    expect(r.reasons[0].text).toContain('14 e 15 set');
  });

  it('sem created_at nos itens, as falhadas contam como antes', () => {
    const r = detect({
      coachPlanItems: [
        item({ id: 'a', planned_date: '2026-09-08' }),
        item({ id: 'b', planned_date: '2026-09-09' }),
      ],
    });
    expect(keys(r)).toEqual(['sessoes_falhadas']);
  });

  it('a assinatura muda quando a divergência muda, e não com a ordem dos itens', () => {
    const a = detect({ raceEvents: [race()] });
    const b = detect({ raceEvents: [race()] });
    expect(a.signature).toBe(b.signature);
    const c = detect({ raceEvents: [race({ id: 'r2', name: 'Meia do Porto', date: '2026-09-20' })] });
    expect(c.signature).not.toBe(a.signature);
  });
});

/* Pedido 2026-09-26: os treinos de terça e quinta feitos na quarta e na
   sexta, pelo separador Corrida, apareciam no calendário e o aviso dizia
   que nada tinha sido registado — a abrir com um número. Ela diz o que viu
   e pergunta. No código antigo, todas estas frases eram
   «N sessões do plano ficaram por registar nos últimos 7 dias (…)». */
describe('detectPlanDivergence — as sessões falhadas, ditas por quem viu o calendário', () => {
  const corrida = (id, date) => ({ id, date, distance_km: 8 });
  const falhadas = (r) => r.reasons.find((x) => x.key === 'sessoes_falhadas')?.text ?? null;
  const tercaQuinta = [
    item({ id: 'ter', planned_date: '2026-09-08', training_type: 'intervalos' }),
    item({ id: 'qui', planned_date: '2026-09-10', training_type: 'continuo' }),
  ];

  it('o caso do relato: corridas no dia a seguir a cada treino — pergunta se trocou os dias', () => {
    const r = detect({ coachPlanItems: tercaQuinta, runs: [corrida('r9', '2026-09-09'), corrida('r11', '2026-09-11')] });
    expect(falhadas(r)).toBe('Não vi os treinos de 8 e 10 set nesses dias, mas vi corridas a 9 e 11 set. Trocaste os dias?');
    expectCarolVoice(falhadas(r));
  });

  it('dia a dia, e dos dois lados da meia-noite (hora de Lisboa): a frase acompanha o que já aconteceu', () => {
    const quarta = [corrida('r9', '2026-09-09')];
    const noInstante = (instante, runs) => detect({ today: lisbonParts(new Date(instante)).date, coachPlanItems: tercaQuinta, runs });
    // Quinta, 23:59: o treino de quinta ainda é de hoje — só uma falhada, sem aviso.
    expect(falhadas(noInstante('2026-09-10T22:59:00Z', quarta))).toBeNull();
    // Sexta, 00:01: a de quinta passou; a corrida de quarta explica uma delas, não as duas.
    expect(falhadas(noInstante('2026-09-10T23:01:00Z', quarta)))
      .toBe('Não vi o treino de 8 set nesse dia, mas vi uma corrida a 9 set. Trocaste os dias? E do treino de 10 set não vi registo nenhum.');
    // Sábado, com a corrida de sexta: as duas explicadas.
    expect(falhadas(noInstante('2026-09-12T10:00:00Z', [...quarta, corrida('r11', '2026-09-11')])))
      .toBe('Não vi os treinos de 8 e 10 set nesses dias, mas vi corridas a 9 e 11 set. Trocaste os dias?');
  });

  it('a corrida num dia com treino seu no plano é esse treino, não um dos falhados', () => {
    const r = detect({
      coachPlanItems: [...tercaQuinta, item({ id: 'qua', planned_date: '2026-09-09', training_type: 'regenerativo' })],
      runs: [corrida('r9', '2026-09-09')],
    });
    expect(falhadas(r)).toBe('Não vi registo dos treinos de 8 e 10 set. Aconteceu alguma coisa?');
  });

  it('um registo já ligado a outro item também não conta, nem um de outro tipo, nem a mais de dois dias', () => {
    const ligado = detect({
      coachPlanItems: [...tercaQuinta, item({ id: 'x', planned_date: '2026-09-01', status: 'concluido', completed_run_id: 'r9' })],
      runs: [corrida('r9', '2026-09-09')],
    });
    expect(falhadas(ligado)).toMatch(/^Não vi registo dos treinos de 8 e 10 set\./);
    const ginasio = detect({ coachPlanItems: tercaQuinta, gymSessions: [{ id: 'g9', date: '2026-09-09' }] });
    expect(falhadas(ginasio)).toMatch(/^Não vi registo/);
    const longe = detect({ coachPlanItems: tercaQuinta, runs: [corrida('r13', '2026-09-13')] });
    expect(falhadas(longe)).toMatch(/^Não vi registo/);
  });

  it('ginásio trocado de dia diz-se como ginásio', () => {
    const r = detect({
      coachPlanItems: [item({ id: 'g1', planned_date: '2026-09-08', kind: 'ginasio' }), item({ id: 'g2', planned_date: '2026-09-10', kind: 'ginasio' })],
      gymSessions: [{ id: 's7', date: '2026-09-07' }],
    });
    expect(falhadas(r)).toBe('Não vi o treino de 8 set nesse dia, mas vi uma sessão de ginásio a 7 set. Trocaste os dias? E do treino de 10 set não vi registo nenhum.');
  });

  it('a prova do plano não é uma sessão falhada: regista-se, não se reorganiza', () => {
    const r = detect({
      coachPlanItems: [item({ id: 'a', planned_date: '2026-09-09' }), item({ id: 'p', planned_date: '2026-09-11', training_type: 'prova' })],
    });
    expect(keys(r)).not.toContain('sessoes_falhadas');
  });

  it('cabe nos 200 caracteres que o coach-chat aceita por motivo, e fala na voz dela', () => {
    const items = ['2026-09-06', '2026-09-08', '2026-09-10', '2026-09-12'].map((d, k) => item({ id: `i${k}`, planned_date: d }));
    const r = detect({ coachPlanItems: items, runs: [corrida('a', '2026-09-07'), corrida('b', '2026-09-09'), corrida('c', '2026-09-11')] });
    const t = falhadas(r);
    expect(t).toBe('Não vi os treinos de 6, 8 e 10 set nesses dias, mas vi corridas a 7, 9 e 11 set. Trocaste os dias? E do treino de 12 set não vi registo nenhum.');
    expect(t.length).toBeLessThanOrEqual(200);
    expectCarolVoice(t);
    // A assinatura continua a ser pelas datas: a frase muda, o aviso não volta a chamar por isso.
    expect(r.signature).toContain('sessoes_falhadas:2026-09-06+2026-09-08+2026-09-10+2026-09-12');
  });

  /* Revisão de 2026-09-26. No código anterior: o registo ia para a primeira
     falhada da lista, e não para a mais perto; um dia com corrida e ginásio,
     só um explicado, aparecia dos dois lados da frase; e os registos de
     tipos diferentes eram «treinos a 9 e 11 set». */
  it('cada registo explica a falhada mais perto dele, não a primeira da lista', () => {
    // Treinos a 8 e 9, uma corrida a 10: é o de 9 feito um dia depois, não o de 8 feito dois.
    const r = detect({ coachPlanItems: [item({ id: 'a', planned_date: '2026-09-08' }), item({ id: 'b', planned_date: '2026-09-09' })], runs: [corrida('r10', '2026-09-10')] });
    expect(falhadas(r)).toBe('Não vi o treino de 9 set nesse dia, mas vi uma corrida a 10 set. Trocaste os dias? E do treino de 8 set não vi registo nenhum.');
  });

  it('corrida e ginásio no mesmo dia, só um explicado: o outro diz-se pelo tipo — dia a dia, e dos dois lados da meia-noite', () => {
    const items = [item({ id: 'c8', planned_date: '2026-09-08' }), item({ id: 'g8', planned_date: '2026-09-08', kind: 'ginasio' })];
    const ginasio7 = [{ id: 's7', date: '2026-09-07' }];
    const noInstante = (instante) => falhadas(detect({ today: lisbonParts(new Date(instante)).date, coachPlanItems: items, gymSessions: ginasio7 }));
    const frase = 'Não vi o treino de 8 set nesse dia, mas vi uma sessão de ginásio a 7 set. Trocaste os dias? E da corrida de 8 set não vi registo nenhum.';
    // Segunda, 8, às 23:59: os dois ainda são de hoje.
    expect(noInstante('2026-09-08T22:59:00Z')).toBeNull();
    // Terça, 00:01, e cada dia até ao último da janela de 7 dias: a mesma frase.
    expect(noInstante('2026-09-08T23:01:00Z')).toBe(frase);
    for (let d = 10; d <= 15; d += 1) expect(noInstante(`2026-09-${d}T10:00:00Z`), `dia ${d}`).toBe(frase);
    // Terça seguinte, 00:01: o dia 8 saiu da janela.
    expect(noInstante('2026-09-15T23:01:00Z')).toBeNull();
    expectCarolVoice(frase);
  });

  it('uma corrida e uma sessão de ginásio vistas: cada uma pelo que é', () => {
    const r = detect({
      coachPlanItems: [item({ id: 'c8', planned_date: '2026-09-08' }), item({ id: 'g10', planned_date: '2026-09-10', kind: 'ginasio' })],
      runs: [corrida('r9', '2026-09-09')],
      gymSessions: [{ id: 's11', date: '2026-09-11' }],
    });
    expect(falhadas(r)).toBe('Não vi os treinos de 8 e 10 set nesses dias, mas vi uma corrida a 9 set e uma sessão de ginásio a 11 set. Trocaste os dias?');
  });

  it('com muitos dias por explicar, o resto cabe em «dos outros»: a frase nunca passa dos 200 caracteres', () => {
    const r = detect({
      coachPlanItems: [
        item({ id: 'c6', planned_date: '2026-09-06' }), item({ id: 'g6', planned_date: '2026-09-06', kind: 'ginasio' }),
        item({ id: 'c9', planned_date: '2026-09-09' }), item({ id: 'g9', planned_date: '2026-09-09', kind: 'ginasio' }),
        item({ id: 'g10', planned_date: '2026-09-10', kind: 'ginasio' }),
      ],
      runs: [corrida('r7', '2026-09-07')],
      gymSessions: [{ id: 's12', date: '2026-09-12' }],
    });
    const t = falhadas(r);
    expect(t).toBe('Não vi os treinos de 6 e 10 set nesses dias, mas vi uma corrida a 7 set e uma sessão de ginásio a 12 set. Trocaste os dias? E dos outros não vi registo nenhum.');
    expect(t.length).toBeLessThanOrEqual(200);
    expectCarolVoice(t);
  });

  it('os dias dizem-se com o mês uma vez por mês', () => {
    expect(listaDias(['2026-09-14', '2026-09-12'])).toBe('12 e 14 set');
    expect(listaDias(['2026-09-29', '2026-09-30', '2026-10-02'])).toBe('29, 30 set e 2 out');
    expect(listaDias(['2026-09-12'])).toBe('12 set');
  });
});

describe('wasDivergenceHandled / markDivergenceHandled', () => {
  beforeEach(() => window.localStorage.clear());

  it('só a assinatura exata conta como tratada', () => {
    expect(wasDivergenceHandled('u1', 'sig-a')).toBe(false);
    markDivergenceHandled('u1', 'sig-a');
    expect(wasDivergenceHandled('u1', 'sig-a')).toBe(true);
    expect(wasDivergenceHandled('u1', 'sig-b')).toBe(false);
    // Guarda-se por utilizador.
    expect(wasDivergenceHandled('u2', 'sig-a')).toBe(false);
  });

  it('sem assinatura não há nada a marcar nem a verificar', () => {
    expect(wasDivergenceHandled('u1', null)).toBe(false);
    expect(() => markDivergenceHandled('u1', null)).not.toThrow();
  });
});

/* Uma prova principal a meio de um plano que prepara outra
   (specs/plano-vinculado-a-prova.md §2.4). Sai por um canal próprio, não
   pelas divergências: enquanto houver duas principais no mesmo bloco não há
   plano correto possível, e o aviso não se dispensa. */
describe('detectRaceConflict — duas provas principais no mesmo bloco', () => {
  const objetivo = { id: 'r-obj', name: 'Maratona do Porto', date: '2026-09-27', status: 'agendada', race_priority: 'a' };
  const vinculado = (over = {}) => plan({ race_id: 'r-obj', period_end: '2026-09-27', ...over });
  const intermedia = (over = {}) => race({ id: 'r-int', name: 'São Silvestre', date: '2026-09-20', race_priority: 'a', ...over });
  const conflito = (over = {}) => detectRaceConflict({
    today: TODAY, coachPlans: [vinculado()], raceEvents: [objetivo, intermedia()], ...over,
  });

  it('uma principal pelo caminho é conflito, e traz a objetivo para a conversa', () => {
    const r = conflito();
    expect(r.races.map((x) => x.id)).toEqual(['r-int']);
    expect(r.target.id).toBe('r-obj');
    expect(r.plan.id).toBe('p1');
  });

  it('secundária ou de treino pelo caminho não é conflito nenhum — é treino', () => {
    expect(conflito({ raceEvents: [objetivo, intermedia({ race_priority: 'b' })] })).toBeNull();
    expect(conflito({ raceEvents: [objetivo, intermedia({ race_priority: 'c' })] })).toBeNull();
  });

  it('a própria prova-objetivo nunca conflitua consigo mesma', () => {
    expect(detectRaceConflict({ today: TODAY, coachPlans: [vinculado()], raceEvents: [objetivo] })).toBeNull();
  });

  it('um plano sem prova-objetivo não tem com que conflituar', () => {
    expect(conflito({ coachPlans: [plan()] })).toBeNull();
  });

  it('decidido pelo atleta cala o assunto nessa prova, em qualquer dispositivo', () => {
    expect(conflito({ raceEvents: [objetivo, intermedia({ conflict_acknowledged_at: '2026-09-13T10:00:00Z' })] })).toBeNull();
  });

  it('uma principal já concluída, ou passada, não conflitua', () => {
    expect(conflito({ raceEvents: [objetivo, intermedia({ status: 'concluida' })] })).toBeNull();
    expect(conflito({ raceEvents: [objetivo, intermedia({ date: '2026-09-10' })] })).toBeNull();
  });

  it('o conflito tira a mesma prova das divergências — um assunto, um tom', () => {
    const args = { today: TODAY, coachPlans: [vinculado()], raceEvents: [objetivo, intermedia()] };
    expect(detectRaceConflict(args)).not.toBeNull();
    // A intermédia não está no plano, mas isso não vira "prova_sem_item":
    // o assunto dela é o conflito, e sai pelo outro canal.
    expect(keys(detectPlanDivergence(args)).filter((k) => k === 'prova_sem_item').length).toBe(1);
    expect(detectPlanDivergence(args).reasons.some((r) => r.text.includes('São Silvestre'))).toBe(false);
  });

  /* O estado real depois de apagar a prova: a FK põe race_id a null e o
     trigger marca race_lost_at. A versão anterior deste teste usava um
     race_id sem prova na agenda — um estado que a BD não produz, e que
     fazia o teste passar com o aviso a nunca disparar em produção. */
  it('o plano que perdeu a prova-objetivo é uma divergência', () => {
    const perdeu = plan({ race_id: null, race_lost_at: '2026-09-12T10:00:00Z', period_end: '2026-09-27' });
    const r = detectPlanDivergence({ today: TODAY, coachPlans: [perdeu], raceEvents: [] });
    expect(keys(r)).toContain('plano_sem_prova');
  });

  it('um plano de base, que nunca teve prova, não é confundido com um que a perdeu', () => {
    const base = plan({ race_id: null, race_lost_at: null });
    expect(keys(detectPlanDivergence({ today: TODAY, coachPlans: [base], raceEvents: [] }))).not.toContain('plano_sem_prova');
  });

  it('uma segunda principal no próprio dia do objetivo também é conflito (intervalo fechado, como no servidor)', () => {
    const noMesmoDia = intermedia({ id: 'r-dia', name: 'Outra no mesmo dia', date: '2026-09-27' });
    const r = detectRaceConflict({ today: TODAY, coachPlans: [vinculado()], raceEvents: [objetivo, noMesmoDia] });
    expect(r.races.map((x) => x.id)).toEqual(['r-dia']);
  });
});

/* "O plano encurtou" — a prova-objetivo foi antecipada e o trigger cancelou
   os treinos que ficavam depois (migration 20260918081148). */
describe('detectPlanDivergence — o plano encurtou', () => {
  const objetivo = { id: 'r-obj', name: 'Maratona do Porto', date: '2026-09-20', status: 'agendada', race_priority: 'a' };
  const encurtado = (over = {}) => plan({ race_id: 'r-obj', period_end: '2026-09-20', trimmed_at: '2026-09-13T08:00:00Z', ...over });

  it('avisa, com a prova e o porquê', () => {
    const r = detectPlanDivergence({ today: TODAY, coachPlans: [encurtado()], raceEvents: [objetivo] });
    const aviso = r.reasons.find((x) => x.key === 'plano_encurtou');
    // Revisão de 2026-09-26: era «A Maratona do Porto (20 set) foi
    // antecipada e o plano encurtou até ela» — o artigo e o género a
    // adivinhar pelo nome.
    expect(aviso.text).toBe('Maratona do Porto (20 set) passou para mais cedo e o plano encurtou até lá: os treinos que ficavam depois foram cancelados.');
    expectCarolVoice(aviso.text);
  });

  it('com um nome masculino, ou sem nome, a frase não pede género nem artigo', () => {
    const texto = (nome) => detectPlanDivergence({ today: TODAY, coachPlans: [encurtado()], raceEvents: [{ ...objetivo, name: nome }] })
      .reasons.find((x) => x.key === 'plano_encurtou').text;
    expect(texto('Trail do Sico')).toMatch(/^Trail do Sico \(20 set\) passou para mais cedo e o plano encurtou até lá:/);
    expect(texto(null)).toMatch(/^A prova \(20 set\) passou para mais cedo/);
  });

  it('vem antes do "a prova não está no plano" — é a causa dele', () => {
    const r = detectPlanDivergence({ today: TODAY, coachPlans: [encurtado()], raceEvents: [objetivo] });
    expect(keys(r)[0]).toBe('plano_encurtou');
    expect(keys(r)).toContain('prova_sem_item');
  });

  it('sem trimmed_at não há aviso — encurtar sem cortar treinos não o merece', () => {
    const r = detectPlanDivergence({ today: TODAY, coachPlans: [encurtado({ trimmed_at: null })], raceEvents: [objetivo] });
    expect(keys(r)).not.toContain('plano_encurtou');
  });

  it('a assinatura muda se voltar a encurtar, para a Carol ser chamada outra vez', () => {
    const a = detectPlanDivergence({ today: TODAY, coachPlans: [encurtado()], raceEvents: [objetivo] });
    const b = detectPlanDivergence({ today: TODAY, coachPlans: [encurtado({ trimmed_at: '2026-09-15T08:00:00Z' })], raceEvents: [objetivo] });
    expect(a.signature).not.toBe(b.signature);
  });
});
