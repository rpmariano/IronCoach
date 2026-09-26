import { describe, it, expect } from 'vitest';
import { pendingTopicLines } from './carolTopics';
import { interventionReasonFor, newCheckinAlarms } from './checkin';
import { linhaDoTreinoDeHoje } from '../components/Home/carolCardLines';
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
  it('no próprio dia, com treino por fazer: hoje, e antes do treino — "hoje" uma vez só', () => {
    const t = linha({ coachPlanItems: [corrida(TERCA)], now: lisboa(TERCA, 10) });
    expect(t).toBe('A dor que me contaste hoje preocupa-me. Antes de treinares, quero falar contigo.');
    expectCarolVoice(t);
    // Com o check-in de outro dia, o "hoje" é o do treino, e diz-se.
    expect(linha({ coachPlanItems: [corrida('2026-09-23')], now: lisboa('2026-09-23', 10) }))
      .toBe('A dor que me contaste ontem preocupa-me. Antes de treinares hoje, quero falar contigo.');
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
     dos dois; "treinares" só num dia com treino por fazer, entre as 5h e as
     19h (revisão de 2026-09-26: das 19h o cartão da Carol já não dá o
     treino por fazer); e nunca "hoje" duas vezes. */
  it('percorre dez dias seguidos, às 00:30, 10:00, 20:00 e 23:30 de Lisboa', () => {
    const itens = [];
    for (let i = 0; i < 10; i++) {
      const d = addDays(TERCA, i);
      itens.push(i % 2 === 0 ? corrida(d) : descanso(d));
    }
    for (let i = 0; i < 10; i++) {
      const d = addDays(TERCA, i);
      const temTreino = i % 2 === 0;
      for (const [hh, mm] of [[0, 30], [10, 0], [20, 0], [23, 30]]) {
        const t = linha({ coachPlanItems: itens, now: lisboa(d, hh, mm) });
        expectCarolVoice(t);
        const madrugada = hh < 5;
        const situacao = `${d} ${hh}:${mm} — "${t}"`;
        expect(/contaste hoje/.test(t), situacao).toBe(i === 0 && !madrugada);
        expect(/contaste ontem/.test(t), situacao).toBe(i === 1 && !madrugada);
        expect(/treinares/.test(t), situacao).toBe(temTreino && hh === 10);
        expect(/não há treino|não tens treino/.test(t), situacao).toBe(!temTreino && (hh === 10 || hh === 20));
        expect((t.match(/hoje/gi) || []).length, situacao).toBeLessThanOrEqual(1);
        expect(t).not.toMatch(/de pé atrás|o treino de hoje/);
      }
    }
  });

  /* Revisão de 2026-09-26. Às 19h30 do dia da dor, com o treino por fazer, o
     cartão da Carol, no mesmo Início, já dizia "Não vi o treino de hoje
     registado, e com a dor de que me falaste faz sentido." — e o popup
     ainda dizia "Antes de treinares hoje, quero falar contigo.". Os dois
     dizem agora a mesma coisa sobre o treino, a qualquer hora do dia. */
  it('das 19h, o treino por fazer já não é "antes de treinares" — como no cartão da Carol', () => {
    const plano = { coachPlanItems: [corrida(TERCA)] };
    expect(linha({ ...plano, now: lisboa(TERCA, 18, 59) })).toMatch(/Antes de treinares, quero falar contigo\.$/);
    for (const [hh, mm] of [[19, 0], [19, 30], [21, 30], [22, 59]]) {
      expect(linha({ ...plano, now: lisboa(TERCA, hh, mm) })).toBe('A dor que me contaste hoje preocupa-me. Quero falar contigo antes do próximo treino.');
    }
    // Com a prova amanhã, das 19h é para ela que se aponta.
    const prova = { id: 'r1', name: 'Corrida do Tejo', date: '2026-09-23', start_time: '09:30:00', status: 'agendada' };
    expect(linha({ ...plano, raceEvents: [prova], now: lisboa(TERCA, 20) })).toMatch(/Antes da prova de amanhã, quero falar contigo\.$/);

    // A mesma régua do cartão, hora a hora: o popup fala do treino à frente
    // só enquanto o cartão o dá por fazer.
    for (let hh = 5; hh <= 23; hh++) {
      const agora = lisboa(TERCA, hh, 30);
      const cartao = linhaDoTreinoDeHoje({ pendentes: [corrida(TERCA)], feitos: [], agora, checkin: DOR_TERCA });
      const popup = linha({ ...plano, now: agora });
      expect(/treinares/.test(popup), `${hh}:30 — cartão "${cartao}" / popup "${popup}"`).toBe(/antes de treinares/.test(cartao));
    }
  });

  it('num dia sem treino, depois de "hoje", não se volta a dizer "hoje"', () => {
    const t = linha({ coachPlanItems: [descanso(TERCA)], now: lisboa(TERCA, 10) });
    expect(t).toBe('A dor que me contaste hoje preocupa-me. Como não tens treino, é a altura certa para falarmos.');
    expectCarolVoice(t);
  });

  /* Revisão de 2026-09-26: a dor e o sono no mesmo check-in, e a dor
     corrigida para 0 (o cartão passa a dizer "Sem dor"). O sono continua a
     preocupar, a dor não: ela fala das noites, e não da dor que já não há. */
  it('com a dor corrigida e as noites mal dormidas por corrigir, fala das noites', () => {
    const dias = [
      { date: '2026-09-19', sleep: 2, energy: 2, stress: 3 },
      { date: '2026-09-20', sleep: 1, energy: 2, stress: 3 },
      { date: '2026-09-21', sleep: 3, energy: 3, stress: 3 },
    ];
    const antes = [...dias, { date: TERCA, sleep: 2, energy: 2, stress: 3, pain: 5, pain_location: 'joelho' }];
    const motivo = interventionReasonFor(newCheckinAlarms(dias, antes, TERCA, {}), TERCA);
    expect(motivo).toMatch(/Dor 5\/10.*Sono mau/);
    const perfil = { coach_intervention_status: 'needed', coach_intervention_reason: motivo };
    const com = (dailyCheckins) => pendingTopicLines({ profile: perfil, coachPlans: PLANO, coachPlanItems: [corrida(TERCA)], dailyCheckins, now: lisboa(TERCA, 11) })[0];
    expect(com(antes)).toMatch(/^A dor que me contaste hoje preocupa-me\./);

    const semDor = [...dias, { date: TERCA, sleep: 2, energy: 2, stress: 3, pain: 0 }];
    const t = com(semDor);
    expect(t).toBe('As noites mal dormidas que me tens contado preocupam-me. Antes de treinares hoje, quero falar contigo.');
    // A palavra, e não o "dor" de "dormidas".
    expect(t).not.toMatch(/(?<!\p{L})dor(?!\p{L})/iu);
    // Corrigidos os dois, é o check-in corrigido.
    expect(com([...dias, { date: TERCA, sleep: 4, energy: 4, stress: 2, pain: 0 }]))
      .toBe('Vi que corrigiste o check-in de hoje. Quero confirmar contigo que está tudo bem.');
  });

  /* Revisão de 2026-09-26: a dor de terça abriu a intervenção, e na quarta o
     check-in diz "Sem dor". No mesmo Início, a resposta dela ao check-in
     dizia "Obrigada. Tudo dentro do normal: é seguir." e o popup "A dor que
     me contaste ontem preocupa-me." — como se não tivesse lido o de hoje. */
  it('com a dor de outro dia e o check-in de hoje sem dor, ela di-lo', () => {
    const QUARTA = '2026-09-23';
    const hoje = (extra) => ({ date: QUARTA, sleep: 4, energy: 4, stress: 2, ...extra });
    const com = (dailyCheckins, now = lisboa(QUARTA, 9)) => linha({ dailyCheckins, coachPlanItems: [corrida(QUARTA)], now });
    const t = com([DOR_TERCA, hoje({ pain: 0 })]);
    expect(t).toBe('A dor que me contaste ontem preocupou-me, e hoje dizes-me que já passou. Antes de treinares, quero falar contigo.');
    expectCarolVoice(t);
    // Uma dor mais baixa não "passou"; sem o check-in de hoje, não se sabe.
    expect(com([DOR_TERCA, hoje({ pain: 2, pain_location: 'gémeo' })])).toMatch(/^A dor que me contaste ontem preocupa-me\./);
    expect(com([DOR_TERCA])).toMatch(/^A dor que me contaste ontem preocupa-me\./);
    // Dois dias depois, o dia da semana; o check-in de hoje é o de hoje.
    expect(linha({ dailyCheckins: [DOR_TERCA, { ...hoje({ pain: 0 }), date: '2026-09-24' }], coachPlanItems: [descanso('2026-09-24')], now: lisboa('2026-09-24', 10) }))
      .toBe('A dor que me contaste na terça-feira preocupou-me, e hoje dizes-me que já passou. Como não tens treino, é a altura certa para falarmos.');
    // Com a cirurgia pelo meio, duas frases, e não uma de quatro orações.
    const notas = [{ category: 'saude', note: 'Cirurgia ao joelho a 2026-09-21; paragem de 3 semanas.' }];
    const t2 = linha({ dailyCheckins: [DOR_TERCA, hoje({ pain: 0 })], coachPlanItems: [descanso(QUARTA)], coachNotes: notas, now: lisboa(QUARTA, 10) });
    expect(t2).toBe('A dor que me contaste ontem preocupou-me, ainda para mais com a cirurgia tão recente. Hoje dizes-me que já passou. Como não tens treino, é a altura certa para falarmos.');
    expectCarolVoice(t2);
  });

  /* Revisão de 2026-09-26: o store só carrega 119 dias de check-ins, e o
     sono mau precisa dos 7 dias antes do check-in. Relido sem eles, um
     motivo velho parecia corrigido ("Vi que corrigiste o check-in") a quem
     não corrigiu nada. Para lá de 30 dias, fica o que o motivo diz. */
  it('um motivo com mais de 30 dias não se dá por corrigido só porque faltam os dias antes dele', () => {
    const DIA = '2026-06-01';
    const motivo = interventionReasonFor([{ reason: 'Sono mau em 3 dos últimos 4 check-ins, com energia em baixo.' }], DIA);
    // Só o próprio dia carregado: os dias 26 a 31 de maio ficaram de fora da janela.
    const t = pendingTopicLines({
      profile: { coach_intervention_status: 'needed', coach_intervention_reason: motivo },
      dailyCheckins: [{ date: DIA, sleep: 2, energy: 2, stress: 3 }],
      now: lisboa('2026-09-26', 10),
    })[0];
    expect(t).toBe('As noites mal dormidas que me contaste preocupam-me. Quero falar contigo antes do próximo treino.');
    expect(t).not.toMatch(/corrigiste/);
  });

  /* Revisão de 2026-09-26: um motivo antigo (sem data) com a dor e o sono de
     terça. Na quarta a janela de 7 dias perde o dia 16 e ganha o 23, e a
     frase do sono sai igual, letra a letra — o dia recuperado era a quarta,
     e ela dizia "A dor que me contaste hoje" a quem na quarta disse "sem
     dor". O dia é o do alarme de que ela fala. */
  it('num motivo antigo, o dia da dor é o da dor, e não o do sono', () => {
    const antigo = 'Check-in de hoje: Dor 6/10 (gémeo) no check-in de hoje. Sono mau em 3 dos últimos 4 check-ins, com energia em baixo.';
    const dias = [
      { date: '2026-09-16', sleep: 2, energy: 2, stress: 3 },
      { date: '2026-09-19', sleep: 2, energy: 2, stress: 3 },
      { date: '2026-09-20', sleep: 4, energy: 3, stress: 3 },
      { date: TERCA, sleep: 1, energy: 2, stress: 3, pain: 6, pain_location: 'gémeo' },
      { date: '2026-09-23', sleep: 2, energy: 2, stress: 3, pain: 0 },
    ];
    const t = pendingTopicLines({ profile: { coach_intervention_status: 'needed', coach_intervention_reason: antigo }, dailyCheckins: dias, now: lisboa('2026-09-23', 10) })[0];
    // E, com o "sem dor" de quarta, a dor de terça já passou.
    expect(t).toMatch(/^A dor que me contaste ontem preocupou-me, e hoje dizes-me que já passou\./);
    expect(t).not.toMatch(/contaste hoje/);
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
