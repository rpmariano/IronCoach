import { describe, it, expect } from 'vitest';
import { pendingTopicLines } from './carolTopics';
import { interventionReasonFor } from './checkin';
import { expectCarolVoice } from '../test/carolVoice';

/* O popup diz o assunto, na voz dela, sem o motivo técnico (2026-09-23). */
describe('pendingTopicLines', () => {
  const comMotivo = (reason) => ({ profile: { coach_intervention_status: 'needed', coach_intervention_reason: reason } });

  it('objetivos por definir e por rever, cada um com a sua frase', () => {
    expect(pendingTopicLines(comMotivo('[objetivos] O atleta acabou de registar uma avaliação corporal e ainda não tem objetivos definidos (os do corpo).')))
      .toEqual(['Vi a tua avaliação corporal. Quero definir contigo os teus objetivos.']);
    expect(pendingTopicLines(comMotivo('[objetivos] … os objetivos que tem deviam ser revistos: peso-alvo atingido.'))[0])
      .toMatch(/Quero revê-los contigo/);
  });

  it('o motivo antigo, sem etiqueta, também é de objetivos', () => {
    expect(pendingTopicLines(comMotivo('O atleta acabou de registar uma avaliação corporal e ainda não tem objetivos definidos (x).'))[0])
      .toMatch(/definir contigo os teus objetivos/);
  });

  it('check-in e desvio ao plano, sem mostrar o motivo técnico', () => {
    const checkin = pendingTopicLines(comMotivo('Check-in de hoje: dor 6/10.'))[0];
    expect(checkin).toMatch(/A dor que me contaste/);
    expect(checkin).not.toMatch(/6\/10/);
    const plano = pendingTopicLines(comMotivo('ACWR 1.8, três treinos falhados.'))[0];
    expect(plano).toMatch(/quero ver contigo/);
    expect(plano).not.toMatch(/ACWR/);
  });

  it('carga de corrida (runLoadAlert.ts): acima do plano e sem plano, sem números nem ACWR', () => {
    const acima = pendingTopicLines(comMotivo('[carga] Carga de corrida: 30 km nos últimos 7 dias, quando o plano previa 16 km; a média das últimas 4 semanas é 12,5 km/semana (ACWR 2,4).'))[0];
    expect(acima).toMatch(/mais do que o plano previa/);
    expect(acima).not.toMatch(/ACWR|km/);
    const semPlano = pendingTopicLines(comMotivo('[carga] Carga de corrida: 30 km nos últimos 7 dias, sem corridas no plano para esses dias; …'))[0];
    expect(semPlano).toMatch(/subiu muito face às últimas semanas/);
  });

  it('propostas por decidir; nada pendente, nada a dizer', () => {
    expect(pendingTopicLines({ coachPlans: [{ status: 'proposto' }], coachGoalProposals: [{ status: 'proposto' }] }))
      .toEqual(['Tens um plano meu à espera que o aceites ou recuses.', 'Tens objetivos meus à espera da tua decisão.']);
    expect(pendingTopicLines({ profile: { coach_intervention_status: 'resolved' }, coachPlans: [{ status: 'aceite' }] })).toEqual([]);
  });
});

/* ── pedido 2026-09-26: a Carol nunca soa a autómato ─────────────────────────
   O assunto do check-in dizia sempre "O teu check-in de hoje deixou-me de pé
   atrás. Quero ver contigo o treino de hoje.": um check-in de terça visto na
   quinta ainda era "de hoje", e num dia de descanso falava de um treino que
   não existia. Setembro em Lisboa é UTC+1. */

const TERCA = '2026-09-22';
/** Um instante à hora de Lisboa (setembro: UTC+1). */
const lisboa = (iso, hh, mm = 0) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 1, mm));
};
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

const PLANO = [{ id: 'p1', status: 'aceite' }];
const corrida = (date, extra = {}) => ({ plan_id: 'p1', planned_date: date, kind: 'corrida', training_type: 'continuo', target_distance_km: 8, status: 'planeado', ...extra });
const descanso = (date) => ({ plan_id: 'p1', planned_date: date, kind: 'descanso' });

const DOR_TERCA = { date: TERCA, sleep: 3, energy: 3, stress: 3, pain: 6, pain_location: 'gémeo' };
/** O motivo que o store escreve com a data (store/index.js, com o pedido deste dia). */
const motivoDaDor = interventionReasonFor([{ reason: 'Dor 6/10 (gémeo) no check-in de hoje.' }], TERCA);

const linha = (extra) => pendingTopicLines({
  profile: { coach_intervention_status: 'needed', coach_intervention_reason: motivoDaDor },
  coachPlans: PLANO,
  dailyCheckins: [DOR_TERCA],
  ...extra,
})[0];

describe('pendingTopicLines — o check-in diz de que dia é (2026-09-26)', () => {
  it('no próprio dia, com treino por fazer: hoje, e antes do treino', () => {
    const t = linha({ coachPlanItems: [corrida(TERCA)], now: lisboa(TERCA, 10) });
    expect(t).toBe('A dor que me contaste hoje preocupa-me. Antes de treinares hoje, quero falar contigo.');
    expectCarolVoice(t);
  });

  it('visto no dia seguinte é "ontem"; dois dias depois, o dia da semana; passada uma semana, a data', () => {
    expect(linha({ coachPlanItems: [], now: lisboa('2026-09-23', 10) })).toMatch(/^A dor que me contaste ontem preocupa-me\./);
    expect(linha({ coachPlanItems: [], now: lisboa('2026-09-24', 10) })).toMatch(/^A dor que me contaste na terça-feira preocupa-me\./);
    expect(linha({ coachPlanItems: [], now: lisboa('2026-09-30', 10) })).toMatch(/^A dor que me contaste a 22 de setembro preocupa-me\./);
    // Sábado e domingo levam "no".
    const domingo = interventionReasonFor([{ reason: 'Dor 5/10 no check-in de hoje.' }], '2026-09-20');
    const t = pendingTopicLines({ profile: { coach_intervention_status: 'needed', coach_intervention_reason: domingo }, now: lisboa(TERCA, 10) })[0];
    expect(t).toMatch(/^A dor que me contaste no domingo preocupa-me\./);
  });

  it('num dia de descanso não há "treino de hoje"', () => {
    const t = linha({ coachPlanItems: [descanso('2026-09-24')], now: lisboa('2026-09-24', 10) });
    expect(t).toBe('A dor que me contaste na terça-feira preocupa-me. Hoje não há treino: é a altura certa para falarmos.');
    expect(t).not.toMatch(/treino de hoje|treinares/);
  });

  it('sem o plano, a frase que é verdade em qualquer dia', () => {
    const t = linha({ now: lisboa('2026-09-23', 10) });
    expect(t).toBe('A dor que me contaste ontem preocupa-me. Quero falar contigo antes do próximo treino.');
  });

  it('dia de prova: antes da partida só até à partida; na véspera, antes da prova de amanhã', () => {
    const prova = { id: 'r1', name: 'Corrida do Tejo', date: '2026-09-24', start_time: '09:30:00', status: 'agendada' };
    const itemProva = corrida('2026-09-24', { training_type: 'prova' });
    expect(linha({ coachPlanItems: [itemProva], raceEvents: [prova], now: lisboa('2026-09-24', 7) }))
      .toMatch(/Quero falar contigo antes da partida\.$/);
    expect(linha({ coachPlanItems: [itemProva], raceEvents: [prova], now: lisboa('2026-09-24', 15) }))
      .toMatch(/Quero falar contigo antes do próximo treino\.$/);
    expect(linha({ coachPlanItems: [descanso('2026-09-23')], raceEvents: [prova], now: lisboa('2026-09-23', 18) }))
      .toMatch(/Antes da prova de amanhã, quero falar contigo\.$/);
    // Depois da meia-noite, "amanhã" já não se diz — e a prova ainda não é hoje.
    expect(linha({ coachPlanItems: [descanso('2026-09-23')], raceEvents: [{ ...prova, date: '2026-09-25' }], now: lisboa('2026-09-24', 0, 30) }))
      .not.toMatch(/amanhã/);
  });

  it('a dor pelo segundo dia seguido diz-se', () => {
    const motivo = interventionReasonFor([{ reason: 'Dor 6/10 (gémeo) no check-in de hoje, pelo segundo dia seguido.' }], TERCA);
    const t = pendingTopicLines({ profile: { coach_intervention_status: 'needed', coach_intervention_reason: motivo }, now: lisboa(TERCA, 10) })[0];
    expect(t).toMatch(/^A dor que me contaste hoje, pelo segundo dia seguido, preocupa-me\./);
    expectCarolVoice(t);
  });

  it('as noites mal dormidas: "tens contado" no próprio dia, "contaste" depois', () => {
    const motivo = interventionReasonFor([{ reason: 'Sono mau em 3 dos últimos 4 check-ins, com energia em baixo.' }], TERCA);
    const sono = (now) => pendingTopicLines({ profile: { coach_intervention_status: 'needed', coach_intervention_reason: motivo }, now })[0];
    expect(sono(lisboa(TERCA, 10))).toMatch(/^As noites mal dormidas que me tens contado preocupam-me\./);
    expect(sono(lisboa('2026-09-24', 10))).toMatch(/^As noites mal dormidas que me contaste preocupam-me\./);
  });

  it('o motivo antigo ("Check-in de hoje:") recupera o dia pelos check-ins', () => {
    const antigo = interventionReasonFor([{ reason: 'Dor 6/10 (gémeo) no check-in de hoje.' }]);
    expect(antigo.startsWith('Check-in de hoje:')).toBe(true);
    const base = { profile: { coach_intervention_status: 'needed', coach_intervention_reason: antigo }, now: lisboa('2026-09-24', 10) };
    expect(pendingTopicLines({ ...base, dailyCheckins: [DOR_TERCA] })[0]).toMatch(/^A dor que me contaste na terça-feira preocupa-me\./);
    // Sem check-ins carregados, não se sabe o dia: nem "hoje", nem outro.
    const semDia = pendingTopicLines(base)[0];
    expect(semDia).toMatch(/^A dor que me contaste no check-in preocupa-me\./);
    expect(semDia).not.toMatch(/hoje|ontem/);
  });

  it('o check-in corrigido (dor 6 por engano, depois 0) já não preocupa', () => {
    const corrigido = { ...DOR_TERCA, pain: 0, pain_location: null };
    const t = linha({ dailyCheckins: [corrigido], coachPlanItems: [corrida(TERCA)], now: lisboa(TERCA, 11) });
    expect(t).toBe('Vi que corrigiste o check-in de hoje. Quero confirmar contigo que está tudo bem.');
    expectCarolVoice(t);
    // Sem o check-in desse dia carregado, não se afirma que foi corrigido.
    expect(linha({ dailyCheckins: [], now: lisboa(TERCA, 11) })).toMatch(/^A dor que me contaste hoje preocupa-me/);
  });

  it('ela sabe da cirurgia (coach_notes) e di-lo', () => {
    const notas = [{ category: 'saude', note: 'Cirurgia a rutura do bíceps direito a 2026-09-25; paragem de corrida de pelo menos 2 semanas no pós-operatório.' }];
    const motivo = interventionReasonFor([{ reason: 'Dor 5/10 (braço) no check-in de hoje.' }], '2026-09-26');
    const vida = (now) => pendingTopicLines({ profile: { coach_intervention_status: 'needed', coach_intervention_reason: motivo }, coachNotes: notas, now })[0];
    expect(vida(lisboa('2026-09-26', 9))).toBe('A dor que me contaste hoje preocupa-me, ainda para mais com a cirurgia tão recente. Quero falar contigo antes do próximo treino.');
    expect(vida(lisboa('2026-09-30', 9))).toMatch(/ainda para mais em plena recuperação da cirurgia\./);
    expectCarolVoice(vida(lisboa('2026-09-30', 9)));
  });

  /* Os dois lados da meia-noite, dia a dia: "hoje" só no dia do check-in e
     de dia; "ontem" só no dia seguinte e de dia; depois da meia-noite nenhum
     dos dois; "treinares hoje" só num dia com treino por fazer, antes das 23h. */
  it('percorre dez dias seguidos, às 00:30, 10:00 e 23:30 de Lisboa', () => {
    const itens = [];
    for (let i = 0; i < 10; i++) {
      const d = addDays(TERCA, i);
      itens.push(i % 2 === 0 ? corrida(d) : descanso(d));
    }
    for (let i = 0; i < 10; i++) {
      const d = addDays(TERCA, i);
      const temTreino = i % 2 === 0;
      for (const [hh, mm] of [[0, 30], [10, 0], [23, 30]]) {
        const t = linha({ coachPlanItems: itens, now: lisboa(d, hh, mm) });
        expectCarolVoice(t);
        const madrugada = hh < 5;
        const situacao = `${d} ${hh}:${mm} — "${t}"`;
        expect(/contaste hoje/.test(t), situacao).toBe(i === 0 && !madrugada);
        expect(/contaste ontem/.test(t), situacao).toBe(i === 1 && !madrugada);
        expect(/treinares hoje/.test(t), situacao).toBe(temTreino && hh === 10);
        expect(/Hoje não há treino/.test(t), situacao).toBe(!temTreino && hh === 10);
        expect(t).not.toMatch(/de pé atrás|o treino de hoje/);
      }
    }
  });

  it('a carga conta-se nos últimos dias, não na semana do calendário', () => {
    const t = pendingTopicLines(comMotivoCarga())[0];
    expect(t).toBe('Nos últimos dias correste bem mais do que o plano previa. Quero ver contigo como ficam os próximos.');
    expect(t).not.toMatch(/esta semana/i);
    expectCarolVoice(t);
  });

  it('um registo sem origem conhecida não é "o último registo"', () => {
    const t = pendingTopicLines({ profile: { coach_intervention_status: 'needed', coach_intervention_reason: 'Almoço muito abaixo das proteínas do plano.' } })[0];
    expect(t).toBe('Num registo teu, há uma coisa que quero ver contigo.');
    expect(t).not.toMatch(/último registo/);
  });
});

function comMotivoCarga() {
  return { profile: { coach_intervention_status: 'needed', coach_intervention_reason: '[carga] Carga de corrida: 30 km nos últimos 7 dias, quando o plano previa 16 km; a média das últimas 4 semanas é 12,5 km/semana (ACWR 2,4).' } };
}
