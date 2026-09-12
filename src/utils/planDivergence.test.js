import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectPlanDivergence, wasDivergenceHandled, markDivergenceHandled, MISSED_MIN,
} from './planDivergence';

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
    expect(r.reasons[0].text).toBe('A Corrida do Tejo (13 set) não está no plano.');
    expect(r.signature).toContain('p1|');
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
    expect(r.reasons[0].text).toBe('Corrida do Tejo (13 set): o plano tem Rodagem longa · 16 km no dia da prova.');
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
    expect(r.reasons[0].text).toBe('Corrida do Tejo (20 set): Intervalos a 19 set, na véspera da prova.');
    expect(r.reasons[1].text).toBe('Corrida do Tejo (20 set): pernas a 18 set, a dois dias da prova.');
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
    expect(r.reasons[0].text).toBe('2 sessões do plano ficaram por registar nos últimos 7 dias (9 set, 11 set).');
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

  it('a assinatura muda quando a divergência muda, e não com a ordem dos itens', () => {
    const a = detect({ raceEvents: [race()] });
    const b = detect({ raceEvents: [race()] });
    expect(a.signature).toBe(b.signature);
    const c = detect({ raceEvents: [race({ id: 'r2', name: 'Meia do Porto', date: '2026-09-20' })] });
    expect(c.signature).not.toBe(a.signature);
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
