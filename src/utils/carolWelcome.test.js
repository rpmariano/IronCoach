import { describe, it, expect, vi } from 'vitest';
import { slotForHour, slotKey, decideWelcome, buildWelcome, readSeen, markSeen, readShownAt, markShownAt, WELCOME_MIN_GAP_MS, WELCOME_PHRASES, pickByDay, welcomeReturnAction, carolDay, checkinDay, welcomeTimeZone } from './carolWelcome';
import { expectCarolVoice } from '../test/carolVoice';

/* As boas-vindas da Carol: aparecem na primeira abertura de cada faixa do
   dia (hora de Lisboa); no dia da prova, a da prova aparece uma vez e ocupa
   a faixa em que calhou. Setembro: Lisboa está em UTC+1. */

const at = (isoLocalLisboa) => new Date(`${isoLocalLisboa}+01:00`);

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

describe('faixas', () => {
  it('manhã 5–12, tarde 12–19, noite 19–23, madrugada 23–5', () => {
    expect([4, 5, 11, 12, 18, 19, 22, 23, 0].map(slotForHour))
      .toEqual(['madrugada', 'manha', 'manha', 'tarde', 'tarde', 'noite', 'noite', 'madrugada', 'madrugada']);
  });

  it('a madrugada é uma faixa só, mesmo passando a meia-noite', () => {
    expect(slotKey(at('2026-09-19T23:30:00')).key).toBe('2026-09-19:madrugada');
    expect(slotKey(at('2026-09-20T02:10:00')).key).toBe('2026-09-19:madrugada');
    expect(slotKey(at('2026-09-20T07:00:00')).key).toBe('2026-09-20:manha');
  });

  it('sem fuso no dispositivo (os testes correm em UTC), conta a hora de Lisboa', () => {
    // 11:30 UTC são 12:30 em Lisboa: já é tarde.
    expect(slotKey(new Date('2026-09-19T11:30:00Z')).slot).toBe('tarde');
  });
});

describe('decideWelcome', () => {
  it('primeira abertura na faixa: aparece; segunda: não', () => {
    const now = at('2026-09-19T07:10:00');
    const d = decideWelcome({ now, seen: [] });
    expect(d).toMatchObject({ variant: 'manha', key: '2026-09-19:manha' });
    expect(decideWelcome({ now, seen: d.markKeys })).toBeNull();
  });

  it('cada faixa nova volta a abrir — até quatro por dia', () => {
    const seen = ['2026-09-19:manha'];
    expect(decideWelcome({ now: at('2026-09-19T13:00:00'), seen })?.variant).toBe('tarde');
    expect(decideWelcome({ now: at('2026-09-19T20:00:00'), seen })?.variant).toBe('noite');
  });

  it('dia de prova: a da prova uma vez, a ocupar a faixa; depois, as faixas normais', () => {
    const raceEvents = [{ id: 'r1', name: 'Maratona do Porto', date: '2026-11-08', status: 'agendada' }];
    const manha = decideWelcome({ now: at('2026-11-08T06:05:00'), raceEvents, seen: [] });
    expect(manha.variant).toBe('prova');
    expect(manha.markKeys).toEqual(['2026-11-08:prova', '2026-11-08:manha']);
    // Mais tarde na mesma manhã: nada.
    expect(decideWelcome({ now: at('2026-11-08T10:00:00'), raceEvents, seen: manha.markKeys })).toBeNull();
    // À tarde: a saudação normal da tarde.
    expect(decideWelcome({ now: at('2026-11-08T15:00:00'), raceEvents, seen: manha.markKeys })?.variant).toBe('tarde');
  });

  it('uma prova já concluída não faz dia de prova', () => {
    const raceEvents = [{ id: 'r1', date: '2026-11-08', status: 'concluida' }];
    expect(decideWelcome({ now: at('2026-11-08T06:05:00'), raceEvents })?.variant).toBe('manha');
  });
});

describe('memória por dispositivo', () => {
  it('guarda as chaves vistas por utilizador, sem repetir', () => {
    const st = memoryStorage();
    markSeen('u1', ['a', 'b'], st);
    markSeen('u1', ['b', 'c'], st);
    expect(readSeen('u1', st)).toEqual(['a', 'b', 'c']);
    expect(readSeen('u2', st)).toEqual([]);
  });
});

describe('buildWelcome — o que ela diz', () => {
  const hoje = '2026-09-19';
  const base = {
    profile: { display_name: 'Rui Mariano', gender: 'M' },
    coachPlans: [{ id: 'p1', status: 'aceite' }],
    coachPlanItems: [
      { id: 'i1', plan_id: 'p1', planned_date: hoje, kind: 'corrida', training_type: 'rodagem', target_distance_km: 8, status: 'pendente' },
      { id: 'i2', plan_id: 'p1', planned_date: '2026-09-20', kind: 'descanso', status: 'pendente' },
    ],
    dailyCheckins: [{ date: hoje, sleep: 4 }],
    // Um registo antigo: sem nenhum, é o primeiro dia (sem check-in no Início).
    runs: [{ date: '2026-09-01', distance_km: 5 }], meals: [], raceEvents: [],
  };

  it('manhã: o sono do check-in e o treino do dia', () => {
    const w = buildWelcome('manha', base, at(`${hoje}T07:10:00`));
    expect(w.greeting).toBe('Bom dia, Rui.');
    expect(WELCOME_PHRASES.dormiuBem).toContain(w.lines[0]);
    expect(w.lines[1]).toMatch(/rodagem/i);
    expect(w.chip).toMatchObject({ label: 'Hoje' });
  });

  it('manhã sem check-in: pede-o', () => {
    const w = buildWelcome('manha', { ...base, dailyCheckins: [] }, at(`${hoje}T07:10:00`));
    expect(w.lines[0]).toMatch(/check-in/);
  });

  it('tarde sem refeições: pede uma foto', () => {
    const w = buildWelcome('tarde', base, at(`${hoje}T14:00:00`));
    expect(WELCOME_PHRASES.semRefeicoes).toContain(w.lines[0]);
    expect(w.chip).toMatchObject({ label: 'Por registar' });
  });

  it('tarde sem check-in: volta a pedi-lo, com o botão que o abre', () => {
    const w = buildWelcome('tarde', { ...base, dailyCheckins: [] }, at(`${hoje}T14:00:00`));
    expect(WELCOME_PHRASES.checkinFaltaTarde).toContain(w.lines[0]);
    expect(w.action).toBe('checkin');
    expect(w.cta).toBe('Fazer o check-in');
    // A segunda linha continua a ser a da tarde.
    expect(WELCOME_PHRASES.semRefeicoes).toContain(w.lines[1]);
  });

  it('tarde sem check-in, sem refeições e com corrida feita: a linha das refeições não sai (o chip fala delas)', () => {
    const w = buildWelcome('tarde', { ...base, dailyCheckins: [], runs: [...base.runs, { date: hoje, distance_km: 6 }] }, at(`${hoje}T14:00:00`));
    // A corrida já está feita: o check-in já não promete afinar o treino que falta.
    expect(WELCOME_PHRASES.checkinFaltaTardeSemTreino).toContain(w.lines[0]);
    expect(WELCOME_PHRASES.semRefeicoes).toContain(w.lines[1]);
    expect(w.chip).toMatchObject({ label: 'Por registar' });
  });

  it('noite sem check-in: já não o pede', () => {
    const w = buildWelcome('noite', { ...base, dailyCheckins: [] }, at(`${hoje}T21:40:00`));
    expect(w.action).toBeUndefined();
    expect(w.lines.join(' ')).not.toMatch(/check-in/);
  });

  it('noite: a corrida do dia, com o ritmo, e o amanhã', () => {
    const w = buildWelcome('noite', { ...base, runs: [{ date: hoje, distance_km: 8, duration_seconds: 8 * 331 }] }, at(`${hoje}T21:40:00`));
    expect(w.lines[0]).toMatch(/8 km.* a \d/);
    expect(WELCOME_PHRASES.amanhaDescanso).toContain(w.lines[1]);
  });

  it('madrugada: a treinadora manda dormir; depois da meia-noite, o treino é o de hoje', () => {
    const w = buildWelcome('madrugada', { ...base, profile: { display_name: 'Ana', gender: 'F' } }, at('2026-09-19T01:00:00'));
    expect(w.greeting).toBe('Ainda acordada, Ana?');
    expect(WELCOME_PHRASES.quando('Hoje', 'uma rodagem de 8 km')).toContain(w.lines[0]);
    expect(WELCOME_PHRASES.sono('hoje')).toContain(w.lines[1]);
    expect(w.lines.join(' ')).not.toMatch(/amanhã/i);
  });

  it('dia de prova: nome, partida e o chip da distância', () => {
    const raceEvents = [{ id: 'r1', name: 'Maratona do Porto', date: '2026-11-08', status: 'agendada', distance_km: 42.195, start_time: '08:30:00' }];
    const w = buildWelcome('prova', { ...base, raceEvents }, at('2026-11-08T06:05:00'));
    expect(w.greeting).toBe('É hoje, Rui.');
    expect(w.lines[0]).toBe('Maratona do Porto, partida às 8:30.');
    expect(w.chip).toMatchObject({ label: '42,2 km', value: 'Partida às 8:30' });
    expect(w.race).toBe(true);
    // Aberta já depois da partida: o balanço, não "sai de casa".
    const depois = buildWelcome('prova', { ...base, raceEvents }, at('2026-11-08T12:40:00'));
    expect(depois.lines[1]).toMatch(/balanço/);
    expect(depois.cta).toBe('Entrar');
  });

  it('nunca mais de duas frases, nunca exclamações, e sem nome fica sem nome', () => {
    for (const v of ['manha', 'tarde', 'noite', 'madrugada']) {
      const w = buildWelcome(v, { ...base, profile: {} }, at(`${hoje}T10:00:00`));
      expect(w.lines.length).toBeLessThanOrEqual(2);
      expectCarolVoice([w.greeting, ...w.lines].join(' '));
      expect(w.greeting).not.toMatch(/, \./);
    }
  });

  it('um plano só proposto (não aceite) não conta', () => {
    const w = buildWelcome('manha', { ...base, coachPlans: [{ id: 'p1', status: 'proposto' }] }, at(`${hoje}T07:10:00`));
    expect(w.chip).toBeNull();
  });
});

describe('revisão pré-master de 2026-09-19', () => {
  it('de madrugada, mesmo no dia da prova, é a madrugada — a da prova fica para a manhã', () => {
    const raceEvents = [{ id: 'r1', name: 'Maratona do Porto', date: '2026-11-08', status: 'agendada' }];
    const madrugada = decideWelcome({ now: at('2026-11-08T00:30:00'), raceEvents, seen: [] });
    expect(madrugada.variant).toBe('madrugada');
    expect(decideWelcome({ now: at('2026-11-08T06:30:00'), raceEvents, seen: madrugada.markKeys })?.variant).toBe('prova');
  });

  it('um treino não registado pergunta-se, não se dá como falhado', () => {
    const hoje = '2026-09-19';
    const data = {
      profile: { display_name: 'Rui' },
      coachPlans: [{ id: 'p1', status: 'aceite' }],
      coachPlanItems: [{ id: 'i', plan_id: 'p1', planned_date: hoje, kind: 'corrida', training_type: 'rodagem', target_distance_km: 8, status: 'pendente' }],
      runs: [], meals: [], raceEvents: [],
    };
    const w = buildWelcome('noite', data, at(`${hoje}T21:00:00`));
    expect(WELCOME_PHRASES.treinoNaoRegistado).toContain(w.lines[0]);
    expect(w.lines[0]).not.toMatch(/falhaste|falhado/);
  });

  it('o género lê-se normalizado; o botão da prova não tem género', () => {
    expect(buildWelcome('madrugada', { profile: { display_name: 'Ana', gender: 'feminino' } }, at('2026-09-19T01:00:00')).greeting).toBe('Ainda acordada, Ana?');
    const raceEvents = [{ id: 'r1', name: 'X', date: '2026-11-08', status: 'agendada' }];
    expect(buildWelcome('prova', { raceEvents }, at('2026-11-08T06:00:00')).cta).toBe('Vamos a isso');
  });
});

/* Pedido 2026-09-23: as frases eram sempre as mesmas, e o check-in da manhã
   não dizia o que era. */
describe('boas-vindas — variedade, dados e o check-in', () => {
  const base = {
    profile: { display_name: 'Rui' },
    coachPlans: [{ id: 'p1', status: 'aceite' }],
    coachPlanItems: [],
    dailyCheckins: [], runs: [{ date: '2026-09-01', distance_km: 5 }], meals: [], raceEvents: [],
  };

  it('a mesma frase durante o dia; outra no dia seguinte', () => {
    const d1 = buildWelcome('manha', base, at('2026-09-22T07:00:00')).lines[0];
    expect(buildWelcome('manha', base, at('2026-09-22T11:30:00')).lines[0]).toBe(d1);
    expect(buildWelcome('manha', base, at('2026-09-23T07:00:00')).lines[0]).not.toBe(d1);
    expect(pickByDay(['a', 'b', 'c'], '2026-09-22', 'x')).not.toBe(pickByDay(['a', 'b', 'c'], '2026-09-23', 'x'));
  });

  it('sem check-in: diz o que é, e o botão abre-o', () => {
    const w = buildWelcome('manha', base, at('2026-09-22T07:00:00'));
    // Sem nada no plano para hoje, o pedido não promete ajustar treino nenhum.
    expect(WELCOME_PHRASES.checkinFaltaSemTreino).toContain(w.lines[0]);
    expect(w.action).toBe('checkin');
    expect(w.cta).toBe('Fazer o check-in');
    // Com check-in feito, o botão volta a ser o de sempre.
    const feito = buildWelcome('manha', { ...base, dailyCheckins: [{ date: '2026-09-22', sleep: 4 }] }, at('2026-09-22T07:00:00'));
    expect(feito.action).toBeUndefined();
    expect(feito.cta).toBe('Começar o dia');
  });

  it('sem plano, uma linha com os números dele: dias até à prova, ontem, a semana', () => {
    const comProva = { ...base, dailyCheckins: [{ date: '2026-09-22', sleep: 4 }], raceEvents: [{ id: 'r', name: 'Meia de Lisboa', date: '2026-10-12', status: 'agendada' }] };
    expect(buildWelcome('manha', comProva, at('2026-09-22T07:00:00')).lines[1]).toMatch(/20 dias|a 20 dias/);
    const comOntem = { ...base, dailyCheckins: [{ date: '2026-09-22', sleep: 4 }], runs: [{ date: '2026-09-21', distance_km: 10 }] };
    expect(buildWelcome('manha', comOntem, at('2026-09-22T07:00:00')).lines[1]).toMatch(/10 km/);
    // Quarta-feira, 2026-09-23: a semana começou na segunda.
    const semana = { ...base, runs: [{ date: '2026-09-22', distance_km: 8 }, { date: '2026-09-23', distance_km: 5.5 }], meals: [{ date: '2026-09-23' }] };
    expect(buildWelcome('noite', semana, at('2026-09-23T21:00:00')).lines.join(' ')).toMatch(/13,5 km/);
  });

  it('um dia só com refeições não é "descanso"', () => {
    const data = { ...base, dailyCheckins: [{ date: '2026-09-22', sleep: 4 }], coachPlanItems: [{ id: 'm', plan_id: 'p1', planned_date: '2026-09-22', kind: 'descanso', categories: ['so-refeicoes'], status: 'pendente' }] };
    const w = buildWelcome('manha', data, at('2026-09-22T07:00:00'));
    expect(WELCOME_PHRASES.semTreinoHoje).toContain(w.lines[1]);
    expect(w.chip).toMatchObject({ value: 'Sem treino planeado' });
  });

  // Revisão pré-deploy: no primeiro dia o Início não mostra o cartão do
  // check-in — o botão não teria o que abrir.
  it('no primeiro dia (sem registos nem prova) não pede o check-in', () => {
    const w = buildWelcome('manha', { ...base, coachPlans: [], runs: [], meals: [], raceEvents: [] }, at('2026-09-22T07:00:00'));
    expect(w.action).toBeUndefined();
    expect(w.lines.join(' ')).not.toMatch(/check-in/);
  });
});


describe('ação P.11 — a véspera e o intervalo entre saudações', () => {
  const raceEvents = [{ id: 'r1', name: 'Meia de Lisboa', date: '2026-09-20', status: 'agendada', distance_km: 21.0975, start_time: '09:30:00' }];

  it('na véspera, a da véspera uma vez, a ocupar a faixa; depois, as faixas normais', () => {
    const tarde = decideWelcome({ now: at('2026-09-19T15:00:00'), raceEvents, seen: [] });
    expect(tarde).toMatchObject({ variant: 'vespera', key: '2026-09-19:vespera' });
    expect(tarde.markKeys).toEqual(['2026-09-19:vespera', '2026-09-19:tarde']);
    expect(decideWelcome({ now: at('2026-09-19T21:00:00'), raceEvents, seen: tarde.markKeys })?.variant).toBe('noite');
  });

  it('de madrugada não há véspera: às 23h a madrugada já fala do treino de amanhã', () => {
    expect(decideWelcome({ now: at('2026-09-19T23:30:00'), raceEvents, seen: [] })?.variant).toBe('madrugada');
  });

  it('uma prova hoje ganha à véspera de outra amanhã', () => {
    const duas = [...raceEvents, { id: 'r0', name: 'Corrida da Manhã', date: '2026-09-19', status: 'agendada' }];
    expect(decideWelcome({ now: at('2026-09-19T07:00:00'), raceEvents: duas, seen: [] })?.variant).toBe('prova');
  });

  it('menos de 2 h depois da última saudação, a faixa nova espera — sem se gastar', () => {
    const last = at('2026-09-19T11:50:00').getTime();
    const cedo = decideWelcome({ now: at('2026-09-19T12:30:00'), seen: ['2026-09-19:manha'], lastShownAt: last });
    expect(cedo).toBeNull();
    // A tarde continua por saudar: às 13:55 já passaram as 2 h.
    const depois = decideWelcome({ now: at('2026-09-19T13:55:00'), seen: ['2026-09-19:manha'], lastShownAt: last });
    expect(depois).toMatchObject({ variant: 'tarde', key: '2026-09-19:tarde' });
    expect(WELCOME_MIN_GAP_MS).toBe(2 * 60 * 60 * 1000);
  });

  it('a prova e a véspera não esperam pelo intervalo', () => {
    const last = at('2026-09-19T11:50:00').getTime();
    expect(decideWelcome({ now: at('2026-09-19T12:10:00'), raceEvents, seen: ['2026-09-19:manha'], lastShownAt: last })?.variant).toBe('vespera');
    const prova = [{ id: 'r1', name: 'Meia de Lisboa', date: '2026-09-19', status: 'agendada' }];
    expect(decideWelcome({ now: at('2026-09-19T06:10:00'), raceEvents: prova, seen: ['2026-09-18:madrugada'], lastShownAt: at('2026-09-19T05:30:00').getTime() })?.variant).toBe('prova');
  });

  it('um relógio adiantado noutro dispositivo não cala as boas-vindas', () => {
    const futuro = at('2026-09-19T18:00:00').getTime();
    expect(decideWelcome({ now: at('2026-09-19T13:00:00'), seen: [], lastShownAt: futuro })?.variant).toBe('tarde');
  });

  it('o texto da véspera: a prova, a partida e o plano de hoje — nada de manual', () => {
    const data = {
      profile: { display_name: 'Rui Mariano', gender: 'M' },
      coachPlans: [{ id: 'p1', status: 'aceite' }],
      coachPlanItems: [{ id: 'i1', plan_id: 'p1', planned_date: '2026-09-19', kind: 'corrida', training_type: 'rodagem', target_distance_km: 4, status: 'pendente' }],
      raceEvents, runs: [{ date: '2026-09-01', distance_km: 5 }], meals: [], dailyCheckins: [],
    };
    const w = buildWelcome('vespera', data, at('2026-09-19T15:00:00'));
    expect(w.greeting).toBe('Amanhã é dia de prova, Rui.');
    expect(w.lines[0]).toBe('Meia de Lisboa, partida às 9:30.');
    expect(w.lines[1]).toMatch(/^Hoje ainda tens .*rodagem/i);
    expect(w.chip).toMatchObject({ label: '21,1 km', value: 'Partida às 9:30', icon: 'trophy' });
    expect(w.lines.length).toBeLessThanOrEqual(2);
    expectCarolVoice([w.greeting, ...w.lines].join(' '));

    const feito = buildWelcome('vespera', { ...data, coachPlanItems: [{ ...data.coachPlanItems[0], status: 'concluido' }] }, at('2026-09-19T19:30:00'));
    expect(feito.lines[1]).toBe('Hoje já fizeste uma rodagem de 4 km.');
    const descanso = buildWelcome('vespera', { ...data, coachPlanItems: [{ id: 'i2', plan_id: 'p1', planned_date: '2026-09-19', kind: 'descanso', status: 'pendente' }] }, at('2026-09-19T10:00:00'));
    expect(descanso.lines[1]).toBe('Hoje é descanso.');
    // Sem plano: só a prova, e sem nome fica sem nome.
    const semPlano = buildWelcome('vespera', { ...data, profile: {}, coachPlans: [], coachPlanItems: [] }, at('2026-09-19T10:00:00'));
    expect(semPlano.lines).toEqual(['Meia de Lisboa, partida às 9:30.']);
    expect(semPlano.greeting).toBe('Amanhã é dia de prova.');
  });

  it('a hora da última saudação fica por utilizador', () => {
    const st = memoryStorage();
    expect(readShownAt('u1', st)).toBeNull();
    markShownAt('u1', 1_700_000_000_000, st);
    expect(readShownAt('u1', st)).toBe(1_700_000_000_000);
    expect(readShownAt('u2', st)).toBeNull();
  });
});

/* Revisão pré-deploy de 2026-09-25: ao voltar à app numa faixa nova com o
   momento do badge aberto, a cancela fechava ('pending') para ler as
   impressões, o badge desmontava-se, e o tryWelcome, já sem o ver, saudava
   no lugar dele. */
describe('welcomeReturnAction — voltar à app', () => {
  const decisao = { variant: 'tarde', key: '2026-09-25:tarde', markKeys: ['2026-09-25:tarde'] };

  it('com uma camada aberta (o momento do badge) não se toca em nada, nem na cancela', () => {
    expect(welcomeReturnAction({ busy: true, userLoaded: true, localDecision: decisao })).toBe('skip');
    expect(welcomeReturnAction({ busy: true, userLoaded: false, localDecision: null })).toBe('skip');
  });

  it('com uma saudação possível, lê primeiro as impressões; sem ela, decide já', () => {
    expect(welcomeReturnAction({ busy: false, userLoaded: true, localDecision: decisao })).toBe('refresh');
    expect(welcomeReturnAction({ busy: false, userLoaded: true, localDecision: null })).toBe('try');
    expect(welcomeReturnAction({ busy: false, userLoaded: false, localDecision: decisao })).toBe('try');
  });
});

/* Pedido 2026-09-26: às 03:53 de um sábado de descanso, a madrugada disse
   "Vai dormir. O treino de amanhã começa a fazer-se agora." — um treino que
   não existia, e "amanhã" por cima de um chip "Hoje · Descanso". As frases
   escolhiam-se pelo dia do calendário, sem olhar para o plano. Estes testes
   percorrem os dias seguidos (a frase roda com a data) e todos os tipos de
   dia, para nenhuma frase voltar a falar de um treino que não existe. */
describe('pedido 2026-09-26 — nenhuma frase fala de um treino que não existe', () => {
  const plano = (items) => ({
    profile: { display_name: 'Rui Mariano', gender: 'M' },
    coachPlans: [{ id: 'p', status: 'aceite' }],
    coachPlanItems: items.map((i, n) => ({ id: `i${n}`, plan_id: 'p', status: 'pendente', ...i })),
    runs: [{ date: '2026-09-01', distance_km: 5 }], meals: [], raceEvents: [], dailyCheckins: [],
  });
  const DIAS = ['2026-09-26', '2026-09-27', '2026-09-28'];
  const noDia = (date, tipo) => {
    if (tipo === 'treino') return [{ planned_date: date, kind: 'corrida', training_type: 'longo', target_distance_km: 16 }];
    if (tipo === 'descanso') return [{ planned_date: date, kind: 'descanso' }];
    if (tipo === 'semTreino') return [{ planned_date: date, kind: 'descanso', categories: ['so-refeicoes'] }];
    if (tipo === 'feito') return [{ planned_date: date, kind: 'corrida', training_type: 'continuo', target_distance_km: 8, status: 'concluido' }];
    return [];
  };
  // O que uma frase de um dia sem treino por fazer nunca pode dizer.
  const PRESSUPOE_TREINO = /treino de (hoje|amanhã)|ajusto o treino|acerto o treino|afino o treino|treino que falta|cumprir tudo|o treino é|faz-se sem puxar|antes de treinar|qualquer treino|melhor treino|por fazer/i;

  it('o caso do ecrã: sábado 26/09, 03:53, descanso', () => {
    const w = buildWelcome('madrugada', plano(noDia('2026-09-26', 'descanso')), at('2026-09-26T03:53:00'));
    expect(w.greeting).toBe('Ainda acordado, Rui?');
    expect(w.lines).toHaveLength(1);
    expect(WELCOME_PHRASES.sonoDescanso('hoje')).toContain(w.lines[0]);
    expect(w.lines[0]).not.toMatch(PRESSUPOE_TREINO);
    expect(w.lines[0]).not.toMatch(/amanhã/i);
    expect(w.chip).toMatchObject({ label: 'Hoje', value: 'Descanso', icon: 'moon' });
  });

  it('madrugada: cada tipo de dia com o seu conjunto, e "hoje" depois da meia-noite', () => {
    for (const d of DIAS) {
      for (const tipo of ['treino', 'descanso', 'semTreino', 'semPlano', 'feito']) {
        // 03:53 fala do próprio dia; 23:40 da véspera fala do dia seguinte.
        for (const [hora, quando] of [[`${d}T03:53:00`, 'Hoje'], [`${d}T23:40:00`, 'Amanhã']]) {
          const alvo = quando === 'Hoje' ? d : new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
          if (tipo === 'feito' && quando === 'Amanhã') continue; // amanhã ainda não se treinou
          const w = buildWelcome('madrugada', plano(noDia(alvo, tipo)), at(hora));
          const texto = w.lines.join(' ');
          const q = quando.toLowerCase();
          if (quando === 'Hoje') expect(texto, `${tipo} ${hora}`).not.toMatch(/amanhã/i);
          if (tipo === 'treino') {
            expect(WELCOME_PHRASES.quando(quando, 'uma rodagem longa de 16 km')).toContain(w.lines[0]);
            expect(WELCOME_PHRASES.sono(q)).toContain(w.lines[1]);
            expect(w.chip).toMatchObject({ label: quando, value: 'Rodagem longa · 16 km' });
          } else {
            expect(texto, `${tipo} ${hora}`).not.toMatch(PRESSUPOE_TREINO);
            const pool = tipo === 'descanso' ? WELCOME_PHRASES.sonoDescanso(q) : WELCOME_PHRASES.sonoLivre;
            expect(pool, `${tipo} ${hora}`).toContain(w.lines[0]);
          }
          expectCarolVoice([w.greeting, ...w.lines].join(' '));
        }
      }
    }
  });

  it('madrugada na véspera da prova, mesmo sem a prova no plano: fala da prova, não de um treino', () => {
    const data = { ...plano([]), coachPlans: [], raceEvents: [{ id: 'r', name: 'Meia da Nazaré', date: '2026-09-27', status: 'agendada', start_time: '09:30:00' }] };
    for (const hora of ['2026-09-26T23:30:00', '2026-09-27T01:10:00']) {
      const w = buildWelcome('madrugada', data, at(hora));
      const quando = hora.includes('T23') ? 'Amanhã' : 'Hoje';
      expect(w.lines[0]).toBe(`${quando} é a prova: Meia da Nazaré, partida às 9:30.`);
      expect(WELCOME_PHRASES.sonoProva).toContain(w.lines[1]);
      expect(w.lines.join(' ')).not.toMatch(/treino/);
      expect(w.chip).toMatchObject({ label: quando, value: 'Partida às 9:30', icon: 'trophy' });
    }
  });

  it('manhã: num dia sem treino por fazer, nem o check-in nem o sono falam de treino', () => {
    for (const d of DIAS) {
      for (const tipo of ['descanso', 'semTreino', 'semPlano', 'feito']) {
        for (const checkin of [null, { sleep: 5, energy: 4 }, { sleep: 1, energy: 3 }]) {
          const data = { ...plano(noDia(d, tipo)), dailyCheckins: checkin ? [{ date: d, ...checkin }] : [] };
          const w = buildWelcome('manha', data, at(`${d}T07:30:00`));
          // No dia do treino já feito, a única frase com treino é a que o dá como feito.
          const feito = WELCOME_PHRASES.treinoFeito('uma corrida contínua de 8 km');
          const outras = w.lines.filter((l) => !feito.includes(l));
          expect(outras.join(' '), `${tipo} ${d} ${JSON.stringify(checkin)}`).not.toMatch(PRESSUPOE_TREINO);
          expect(w.lines.length).toBeLessThanOrEqual(2);
          expectCarolVoice([w.greeting, ...w.lines].join(' '));
        }
      }
    }
    // O treino já feito diz-se feito.
    const feito = buildWelcome('manha', { ...plano(noDia('2026-09-28', 'feito')), dailyCheckins: [{ date: '2026-09-28', sleep: 3 }] }, at('2026-09-28T09:00:00'));
    expect(WELCOME_PHRASES.treinoFeito('uma corrida contínua de 8 km')).toContain(feito.lines[0]);
  });

  it('manhã com treino: o check-in e o sono podem falar dele', () => {
    const d = '2026-09-27';
    const w = buildWelcome('manha', { ...plano(noDia(d, 'treino')), dailyCheckins: [{ date: d, sleep: 1 }] }, at(`${d}T07:30:00`));
    expect(WELCOME_PHRASES.dormiuMal).toContain(w.lines[0]);
    expect(WELCOME_PHRASES.treinoHoje('uma rodagem longa de 16 km')).toContain(w.lines[1]);
    const sem = buildWelcome('manha', plano(noDia(d, 'treino')), at(`${d}T07:30:00`));
    expect(WELCOME_PHRASES.checkinFalta).toContain(sem.lines[0]);
  });

  it('uma dor acima do alarme passa à frente do "dormiste bem"', () => {
    const d = '2026-09-28';
    const data = { ...plano([{ planned_date: d, kind: 'corrida', training_type: 'intervalos', target_distance_km: 8 }]), dailyCheckins: [{ date: d, sleep: 5, energy: 4, pain: 7 }] };
    const w = buildWelcome('manha', data, at(`${d}T07:30:00`));
    expect(w.lines[0]).toBe(WELCOME_PHRASES.dorForte[0]);
    expect(w.lines.join(' ')).not.toMatch(/cumprir tudo/);
    // À tarde, com uma refeição registada, o treino por fazer não se empurra.
    const tarde = buildWelcome('tarde', { ...data, meals: [{ date: d }] }, at(`${d}T15:00:00`));
    expect(tarde.lines.join(' ')).not.toMatch(/por fazer/);
    expect(tarde.lines).toContain(WELCOME_PHRASES.dorForte[0]);
    // À noite, o treino que não apareceu não se pergunta: a dor explica-o.
    const noite = buildWelcome('noite', data, at(`${d}T21:30:00`));
    expect(noite.lines[0]).toBe(WELCOME_PHRASES.treinoNaoRegistadoComDor[0]);
  });

  it('tarde num dia de descanso: o check-in sem promessa de treino, e uma corrida pergunta-se', () => {
    const d = '2026-09-26';
    const w = buildWelcome('tarde', { ...plano(noDia(d, 'descanso')), meals: [{ date: d }] }, at(`${d}T14:30:00`));
    expect(WELCOME_PHRASES.checkinFaltaTardeSemTreino).toContain(w.lines[0]);
    const correu = buildWelcome('tarde', { ...plano(noDia(d, 'descanso')), meals: [{ date: d }], dailyCheckins: [{ date: d, sleep: 3 }], runs: [{ date: d, distance_km: 8 }] }, at(`${d}T14:30:00`));
    expect(WELCOME_PHRASES.corridaEmDescanso('8')).toContain(correu.lines[0]);
    // E a semana não repete a corrida de hoje.
    expect(correu.lines.join(' ')).not.toMatch(/semana/);
  });

  it('duas corridas no mesmo dia contam as duas', () => {
    const d = '2026-09-28';
    const w = buildWelcome('tarde', { ...plano([]), meals: [{ date: d }], dailyCheckins: [{ date: d, sleep: 3 }], runs: [{ date: d, distance_km: 5 }, { date: d, distance_km: 10 }] }, at(`${d}T15:00:00`));
    expect(WELCOME_PHRASES.corridaFeita('15', 2)).toContain(w.lines[0]);
  });

  it('noite: antes das 21h diz o que falta registar; depois, pergunta', () => {
    const d = '2026-09-28';
    const data = plano([{ planned_date: d, kind: 'corrida', training_type: 'intervalos', target_distance_km: 8 }]);
    expect(WELCOME_PHRASES.treinoPorRegistar('um treino intervalado de 8 km')).toContain(buildWelcome('noite', data, at(`${d}T19:10:00`)).lines[0]);
    expect(WELCOME_PHRASES.treinoNaoRegistado).toContain(buildWelcome('noite', data, at(`${d}T21:10:00`)).lines[0]);
    // Com o ginásio feito e a corrida por registar, pergunta-se só pela corrida.
    const parte = plano([
      { planned_date: d, kind: 'corrida', training_type: 'continuo', target_distance_km: 8 },
      { planned_date: d, kind: 'ginasio', categories: ['Pernas'], target_duration_min: 30, status: 'concluido' },
    ]);
    expect(buildWelcome('noite', parte, at(`${d}T21:10:00`)).lines[0]).toBe(WELCOME_PHRASES.treinoNaoRegistadoParte('uma corrida contínua de 8 km')[0]);
  });

  it('o treino dito numa frase: sem o separador do ecrã, e a distância com vírgula', () => {
    const d = '2026-09-28';
    const data = plano([
      { planned_date: d, kind: 'corrida', training_type: 'longo', target_distance_km: 16.5 },
      { planned_date: d, kind: 'ginasio', categories: ['Pernas', 'Core'], target_duration_min: 30 },
    ]);
    const dia = carolDay(d, data);
    expect(dia.falado).toBe('uma rodagem longa de 16,5 km e um treino de pernas e core de 30 minutos');
    expect(dia.titulo).toBe('Rodagem longa · 16,5 km + Pernas/Core · 30 min');
    const w = buildWelcome('manha', { ...data, dailyCheckins: [{ date: d, sleep: 3 }] }, at(`${d}T07:30:00`));
    expect(w.lines.join(' ')).not.toMatch(/·|\d\.\d/);
    // O item da prova no plano, com a distância do servidor: "21,1 km", não "21.0975 km".
    const prova = carolDay('2026-09-27', { ...plano([{ planned_date: '2026-09-27', kind: 'corrida', training_type: 'prova', target_distance_km: 21.0975 }]), raceEvents: [{ id: 'r', name: 'Meia da Nazaré', date: '2026-09-27', status: 'concluida' }] });
    expect(prova.titulo).toBe('Prova · Meia da Nazaré · 21,1 km');
  });

  it('sem género no perfil, a saudação da madrugada não tem género', () => {
    expect(buildWelcome('madrugada', { profile: { display_name: 'Ana' } }, at('2026-09-26T01:00:00')).greeting).toBe('Ainda a pé, Ana?');
    expect(buildWelcome('madrugada', {}, at('2026-09-26T01:00:00')).greeting).toBe('Ainda a pé?');
  });

  it('a véspera às 22h já não manda correr', () => {
    const data = { ...plano([{ planned_date: '2026-09-26', kind: 'corrida', training_type: 'regenerativo', target_distance_km: 4 }]), raceEvents: [{ id: 'r', name: 'Meia da Nazaré', date: '2026-09-27', status: 'agendada', start_time: '09:30:00' }] };
    expect(buildWelcome('vespera', data, at('2026-09-26T15:00:00')).lines[1]).toBe('Hoje ainda tens uma corrida regenerativa de 4 km.');
    // Às 22h já não se manda correr, nem se dá o treino como falhado.
    expect(buildWelcome('vespera', data, at('2026-09-26T22:00:00')).lines[1]).toBe('Ainda não vi o treino de hoje registado. Se ficou por fazer, amanhã é que conta.');
  });
});

describe('pedido 2026-09-26 — o dia da prova', () => {
  const meia = { id: 'r', name: 'Meia da Nazaré', date: '2026-09-27', status: 'agendada', distance_km: 21.0975, start_time: '09:30:00' };
  const base = { profile: { display_name: 'Rui' }, coachPlans: [], coachPlanItems: [], runs: [], meals: [], dailyCheckins: [] };

  it('quem acorda para a prova não ouve "ainda acordado?"', () => {
    // 04:40 no dia da prova: é a manhã da prova.
    expect(decideWelcome({ now: at('2026-09-27T04:40:00'), raceEvents: [meia], seen: [] })?.variant).toBe('prova');
    // 02:00 com partida às 9:30: ainda é madrugada.
    expect(decideWelcome({ now: at('2026-09-27T02:00:00'), raceEvents: [meia], seen: [] })?.variant).toBe('madrugada');
    // Um trail às 6:30: às 3:10 já se acordou para ele.
    const trail = { ...meia, start_time: '06:30:00' };
    expect(decideWelcome({ now: at('2026-09-27T03:10:00'), raceEvents: [trail], seen: [] })?.variant).toBe('prova');
    // Às 23h da véspera continua a ser a madrugada (a véspera já passou).
    expect(decideWelcome({ now: at('2026-09-26T23:30:00'), raceEvents: [meia], seen: [] })?.variant).toBe('madrugada');
  });

  it('sem plano, nada de "o que ensaiámos"; com plano para esta prova, sim', () => {
    const sem = buildWelcome('prova', { ...base, raceEvents: [meia] }, at('2026-09-27T06:30:00'));
    expect(sem.lines[1]).toBe('Sai de casa com tempo. Depois, quero saber como correu.');
    const com = buildWelcome('prova', { ...base, raceEvents: [meia], coachPlans: [{ id: 'p', status: 'aceite', race_id: 'r' }] }, at('2026-09-27T06:30:00'));
    expect(com.lines[1]).toBe('Come o que ensaiámos e sai de casa com tempo. O trabalho está feito.');
    const curta = buildWelcome('prova', { ...base, raceEvents: [{ ...meia, distance_km: 10 }], coachPlans: [{ id: 'p', status: 'aceite', race_id: 'r' }] }, at('2026-09-27T06:30:00'));
    expect(curta.lines[1]).toBe('Sai de casa com tempo. O trabalho está feito.');
  });

  it('uma prova ao fim do dia, aberta de manhã: poupar as pernas, não sair de casa', () => {
    const w = buildWelcome('prova', { ...base, raceEvents: [{ ...meia, start_time: '19:00:00' }] }, at('2026-09-27T07:00:00'));
    expect(w.lines[1]).toBe('Até à partida, poupa as pernas.');
  });

  it('aberta muito depois da partida (ou sem hora, à tarde): já cortou a meta', () => {
    const tarde = buildWelcome('prova', { ...base, raceEvents: [meia] }, at('2026-09-27T18:00:00'));
    expect(WELCOME_PHRASES.provaPorRegistar).toContain(tarde.lines[1]);
    // Acabada a prova, "É hoje" já não é a saudação.
    expect(tarde.greeting).toBe('Boa tarde, Rui.');
    const aCorrer = buildWelcome('prova', { ...base, raceEvents: [meia] }, at('2026-09-27T10:30:00'));
    expect(aCorrer.lines[1]).toMatch(/^Quando cortares a meta/);
    const semHora = buildWelcome('prova', { ...base, raceEvents: [{ ...meia, start_time: null }] }, at('2026-09-27T14:00:00'));
    expect(WELCOME_PHRASES.provaPorRegistar).toContain(semHora.lines[1]);
    // Sem hora marcada, a meio da manhã já pode estar a correr.
    expect(buildWelcome('prova', { ...base, raceEvents: [{ ...meia, start_time: null }] }, at('2026-09-27T10:00:00')).lines[1]).toBe(WELCOME_PHRASES.provaACorrer[0]);
    expect(buildWelcome('prova', { ...base, raceEvents: [{ ...meia, start_time: null }] }, at('2026-09-27T07:00:00')).lines[1]).toMatch(/^Sai de casa com tempo/);
    // Registada como corrida normal: não se pede o registo outra vez.
    const registada = buildWelcome('prova', { ...base, raceEvents: [meia], runs: [{ date: '2026-09-27', distance_km: 21.2 }] }, at('2026-09-27T21:30:00'));
    expect(registada.lines[1]).toBe('Vi 21,2 km registados hoje. Quero saber como correu a prova.');
    expect(registada.greeting).toBe('Boa noite, Rui.');
    expect(semHora.cta).toBe('Entrar');
  });

  it('à tarde do dia da prova, a prova não é "o treino por fazer"', () => {
    const data = { ...base, raceEvents: [meia], coachPlans: [{ id: 'p', status: 'aceite' }], coachPlanItems: [{ id: 'i', plan_id: 'p', planned_date: '2026-09-27', kind: 'corrida', training_type: 'prova', target_distance_km: 21.0975, status: 'pendente' }], meals: [{ date: '2026-09-27' }], dailyCheckins: [{ date: '2026-09-27', sleep: 3 }] };
    const w = buildWelcome('tarde', data, at('2026-09-27T15:00:00'));
    expect(WELCOME_PHRASES.provaPorRegistar).toContain(w.lines[0]);
    expect(w.lines.join(' ')).not.toMatch(/treino/);
    expect(w.chip).toMatchObject({ icon: 'trophy' });
    // Concluída e registada: diz-se pelo nome.
    const feita = buildWelcome('tarde', { ...data, raceEvents: [{ ...meia, status: 'concluida' }], runs: [{ date: '2026-09-27', distance_km: 21.0975 }] }, at('2026-09-27T15:00:00'));
    expect(feita.lines[0]).toBe('Vi os 21,1 km da prova de hoje. Quero fazer o balanço contigo.');
    expect(feita.chip).toMatchObject({ icon: 'trophy' });
    // Com um aquecimento registado à parte, contam os km da corrida da prova.
    const comAquecimento = buildWelcome('tarde', { ...data, raceEvents: [{ ...meia, status: 'concluida' }], runs: [{ date: '2026-09-27', distance_km: 2 }, { date: '2026-09-27', distance_km: 21.0975, race_id: 'r' }] }, at('2026-09-27T15:00:00'));
    expect(comAquecimento.lines[0]).toBe('Vi os 21,1 km da prova de hoje. Quero fazer o balanço contigo.');
  });

  it('checkinDay: o que a resposta ao check-in vê', () => {
    expect(checkinDay('2026-09-26', { ...base, raceEvents: [meia] })).toEqual({ tipo: 'semPlano', corrida: false, vespera: true, vida: null });
    expect(checkinDay('2026-09-27', { ...base, raceEvents: [meia] })).toMatchObject({ tipo: 'prova', vespera: false });
  });
});

/* Revisão adversarial do pedido 2026-09-26: os caminhos que a primeira
   versão da correção deixava partidos. */
describe('pedido 2026-09-26 — revisão', () => {
  const meia = { id: 'r', name: 'Meia da Nazaré', date: '2026-09-27', status: 'agendada', distance_km: 21.0975, start_time: '09:30:00' };
  const plano = (items, extra = {}) => ({
    profile: { display_name: 'Rui', gender: 'M' },
    coachPlans: [{ id: 'p', status: 'aceite' }],
    coachPlanItems: items.map((i, n) => ({ id: `i${n}`, plan_id: 'p', status: 'pendente', ...i })),
    runs: [{ date: '2026-09-01', distance_km: 5 }], meals: [], raceEvents: [], dailyCheckins: [], ...extra,
  });
  const DIAS = ['2026-09-26', '2026-09-27', '2026-09-28'];

  it('a da prova vista de madrugada ocupa também a manhã: não há um segundo "Bom dia" a anunciar a partida', () => {
    const d = decideWelcome({ now: at('2026-09-27T04:40:00'), raceEvents: [meia], seen: [] });
    expect(d.variant).toBe('prova');
    expect(d.markKeys).toEqual(['2026-09-27:prova', '2026-09-26:madrugada', '2026-09-27:manha']);
    const last = at('2026-09-27T04:40:00').getTime();
    expect(decideWelcome({ now: at('2026-09-27T07:00:00'), raceEvents: [meia], seen: d.markKeys, lastShownAt: last })).toBeNull();
    expect(decideWelcome({ now: at('2026-09-27T11:45:00'), raceEvents: [meia], seen: d.markKeys, lastShownAt: last })).toBeNull();
  });

  it('às 4h30 antes de uma prova ao fim do dia ainda não se acordou para ela; uma prova da meia-noite, sim', () => {
    expect(decideWelcome({ now: at('2026-09-27T04:30:00'), raceEvents: [{ ...meia, start_time: '18:00:00' }], seen: [] })?.variant).toBe('madrugada');
    expect(decideWelcome({ now: at('2026-09-27T00:10:00'), raceEvents: [{ ...meia, start_time: '00:30:00' }], seen: [] })?.variant).toBe('prova');
    // Às 23h50 da véspera, com a partida às 0h30: sair de casa, não ir dormir.
    const w = buildWelcome('madrugada', { ...plano([]), raceEvents: [{ ...meia, start_time: '00:30:00' }] }, at('2026-09-26T23:50:00'));
    expect(w.lines).toEqual(['Meia da Nazaré, partida às 0:30.', 'Sai de casa com tempo. Depois, quero saber como correu.']);
  });

  it('com a prova concluída, nenhuma frase fica a meio ("…registado: .")', () => {
    const feita = { ...meia, status: 'concluida' };
    const item = { planned_date: '2026-09-27', kind: 'corrida', training_type: 'prova', target_distance_km: 21.0975, status: 'concluido' };
    for (const checkin of [[], [{ date: '2026-09-27', sleep: 5 }]]) {
      for (const hora of ['07:30', '11:30']) {
        const w = buildWelcome('manha', plano([item], { raceEvents: [feita], dailyCheckins: checkin }), at(`2026-09-27T${hora}:00`));
        for (const l of w.lines) expect(l).not.toMatch(/:\s*\.$/);
        expect(w.lines).toEqual([WELCOME_PHRASES.provaRegistada[0]]);
        expect(w.chip).toMatchObject({ icon: 'trophy' });
      }
    }
    // Na véspera de outra prova, no dia de uma já feita, também não.
    const outra = { id: 'r2', name: 'Trail do Sicó', date: '2026-09-28', status: 'agendada' };
    const v = buildWelcome('vespera', plano([item], { raceEvents: [feita, outra] }), at('2026-09-27T15:00:00'));
    for (const l of v.lines) expect(l).not.toMatch(/:\s*\.$/);
  });

  it('a manhã da prova (se lá chegar) tem as frases da prova, e depois da partida já não a anuncia', () => {
    const data = plano([], { raceEvents: [meia], dailyCheckins: [{ date: '2026-09-27', sleep: 2 }] });
    const cedo = buildWelcome('manha', data, at('2026-09-27T06:30:00'));
    expect(cedo.lines[0]).toBe(WELCOME_PHRASES.dormiuMalProva[0]);
    expect(cedo.lines.join(' ')).not.toMatch(/Esta noite|não se força/);
    const tarde = buildWelcome('manha', data, at('2026-09-27T11:00:00'));
    expect(tarde.lines.join(' ')).not.toMatch(/partida às/);
    expect(tarde.lines).toEqual([WELCOME_PHRASES.provaACorrer[0]]);
    expect(tarde.action).toBeUndefined();
  });

  it('manhã: stress alto não deixa dizer "há margem para cumprir tudo"; energia em baixo diz-se', () => {
    for (const d of DIAS) {
      const base = plano([{ planned_date: d, kind: 'corrida', training_type: 'continuo', target_distance_km: 8 }]);
      const stress = buildWelcome('manha', { ...base, dailyCheckins: [{ date: d, sleep: 5, energy: 4, stress: 5 }] }, at(`${d}T07:30:00`));
      expect(stress.lines.join(' ')).not.toMatch(/margem para cumprir tudo|conta para o treino/);
      const energia = buildWelcome('manha', { ...base, dailyCheckins: [{ date: d, sleep: 4, energy: 1 }] }, at(`${d}T07:30:00`));
      expect(energia.lines[0]).toBe(WELCOME_PHRASES.energiaBaixa[0]);
    }
  });

  it('séries, ritmo, fartlek e subidas não se fazem "sem puxar"', () => {
    const d = '2026-09-28';
    const data = plano([{ planned_date: d, kind: 'corrida', training_type: 'tempo', target_distance_km: 10 }], { dailyCheckins: [{ date: d, sleep: 1 }], meals: [{ date: d }] });
    expect(buildWelcome('manha', data, at(`${d}T07:30:00`)).lines[0]).toBe(WELCOME_PHRASES.dormiuMalQualidade[0]);
    const tarde = buildWelcome('tarde', data, at(`${d}T15:00:00`));
    expect(tarde.lines.join(' ')).not.toMatch(/sem puxar/);
    expect(tarde.lines).toContain(WELCOME_PHRASES.treinoPorFazerQualidade('um treino de ritmo de 10 km')[0]);
  });

  it('noite: antes das 21h não se desculpa o treino; com parte feita, fala-se só do resto', () => {
    const d = '2026-09-28';
    const cansado = plano([{ planned_date: d, kind: 'corrida', training_type: 'continuo', target_distance_km: 8 }], { dailyCheckins: [{ date: d, sleep: 1 }] });
    expect(buildWelcome('noite', cansado, at(`${d}T19:10:00`)).lines.join(' ')).not.toMatch(/faz sentido/);
    expect(buildWelcome('noite', cansado, at(`${d}T21:30:00`)).lines[0]).toBe(WELCOME_PHRASES.treinoNaoRegistadoCansado[0]);
    const parte = plano([
      { planned_date: d, kind: 'corrida', training_type: 'continuo', target_distance_km: 8 },
      { planned_date: d, kind: 'ginasio', categories: ['Pernas'], target_duration_min: 45, status: 'concluido' },
      { planned_date: '2026-09-29', kind: 'corrida', training_type: 'longo', target_distance_km: 16 },
    ], { dailyCheckins: [{ date: d, sleep: 4, pain: 6 }] });
    const w = buildWelcome('noite', parte, at(`${d}T21:30:00`));
    expect(w.lines[0]).toBe(WELCOME_PHRASES.restoNaoRegistadoComDor[0]);
    // E o treino de amanhã não se anuncia sem ressalva.
    expect(w.lines[1]).toBe('Amanhã o plano tem uma rodagem longa de 16 km, mas antes falamos da dor.');
  });

  it('a véspera lê a dor do check-in e a corrida já registada', () => {
    const data = plano([{ planned_date: '2026-09-26', kind: 'corrida', training_type: 'regenerativo', target_distance_km: 4 }], { raceEvents: [meia] });
    const dor = buildWelcome('vespera', { ...data, dailyCheckins: [{ date: '2026-09-26', sleep: 4, pain: 6 }] }, at('2026-09-26T08:00:00'));
    expect(dor.lines[1]).toBe(WELCOME_PHRASES.dorVespera[0]);
    const correu = buildWelcome('vespera', { ...data, runs: [{ date: '2026-09-26', distance_km: 4 }] }, at('2026-09-26T22:00:00'));
    expect(WELCOME_PHRASES.corridaFeita('4')).toContain(correu.lines[1]);
  });

  it('o ginásio dito como se diz: aulas pelo nome, siglas em maiúsculas, sem barras', () => {
    const d = '2026-09-28';
    const falado = (categories) => carolDay(d, plano([{ planned_date: d, kind: 'ginasio', categories, target_duration_min: 45 }])).falado;
    expect(falado(['HIIT'])).toBe('um HIIT de 45 minutos');
    expect(falado(['Treino Funcional'])).toBe('um treino funcional de 45 minutos');
    expect(falado(['Core/Abdominais', 'Full Body'])).toBe('um treino de core e corpo inteiro de 45 minutos');
    expect(falado(['Peito', 'Tríceps'])).toBe('um treino de peito e tríceps de 45 minutos');
  });

  it('o chip da recuperação tem acento', () => {
    const d = '2026-09-28';
    expect(carolDay(d, plano([{ planned_date: d, kind: 'corrida', training_type: 'recuperacao', target_distance_km: 5 }])).titulo).toBe('Recuperação · 5 km');
  });
});

describe('pedido 2026-09-26 — a revisão do Lote 1, do lado das boas-vindas', () => {
  const plano = (items, extra = {}) => ({
    profile: { display_name: 'Rui', gender: 'M' },
    coachPlans: [{ id: 'p', status: 'aceite' }],
    coachPlanItems: items.map((i, n) => ({ id: `i${n}`, plan_id: 'p', status: 'pendente', ...i })),
    runs: [{ date: '2026-09-01', distance_km: 5 }], meals: [], raceEvents: [], dailyCheckins: [], ...extra,
  });

  it('uma prova à meia-noite diz-se "à meia-noite", e a uma, "à 1:00" — como no cartão da Carol', () => {
    const miut = { id: 'm', name: 'MIUT', date: '2026-09-27', status: 'agendada', start_time: '00:00:00' };
    expect(buildWelcome('madrugada', plano([], { raceEvents: [miut] }), at('2026-09-26T23:10:00')).lines[0]).toBe('MIUT, partida à meia-noite.');
    const vespera = buildWelcome('vespera', plano([], { raceEvents: [{ ...miut, start_time: '01:00:00' }] }), at('2026-09-26T15:00:00'));
    expect(vespera.lines[0]).toBe('MIUT, partida à 1:00.');
    expect(vespera.chip.value).toBe('Partida à 1:00');
  });

  it('5 km registados num dia de 16 km: "fizeste 5 km", não "fizeste a rodagem longa de 16 km"', () => {
    const d = '2026-09-28';
    const dados = plano([{ planned_date: d, kind: 'corrida', training_type: 'longo', target_distance_km: 16, status: 'concluido' }], {
      runs: [{ date: d, distance_km: 5 }], dailyCheckins: [{ date: d, sleep: 3 }],
    });
    const w = buildWelcome('manha', dados, at(`${d}T09:00:00`));
    expect(w.lines.join(' ')).not.toMatch(/rodagem longa de 16 km/);
    expect(WELCOME_PHRASES.treinoFeitoKm('5')).toContain(w.lines[0]);
    // A bater com o plano (16,4 km), diz-se o treino do plano.
    const bate = buildWelcome('manha', { ...dados, runs: [{ date: d, distance_km: 16.4 }] }, at(`${d}T09:00:00`));
    expect(WELCOME_PHRASES.treinoFeito('uma rodagem longa de 16 km')).toContain(bate.lines[0]);
  });
});

/* Revisão das boas-vindas de 2026-09-26 ("Outros" do backlog): a cara dela,
   o fuso do dispositivo e as duas frases do descanso que diziam mais do que
   os dados sustentavam. */
describe('revisão das boas-vindas de 2026-09-26 — a cara, o fuso e o descanso', () => {
  const plano = (items, extra = {}) => ({
    profile: { display_name: 'Rui' },
    coachPlans: [{ id: 'p', status: 'aceite' }],
    coachPlanItems: items.map((i, n) => ({ id: `i${n}`, plan_id: 'p', status: 'pendente', ...i })),
    runs: [{ date: '2026-09-01', distance_km: 5 }], gymSessions: [], meals: [], raceEvents: [], dailyCheckins: [], ...extra,
  });
  const menos = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
  // Três dias seguidos passam pelas três frases do conjunto (pickByDay).
  const TRES_DIAS = ['2026-09-28', '2026-09-29', '2026-09-30'];
  const SEMANA = 'Dia de descanso. É hoje que o corpo assimila o trabalho da semana.';
  const A_SERIO = 'Hoje é descanso. A sério.';

  describe('a cara dela', () => {
    it('às 23:05 antes de um dia de descanso não há nada que preocupe: cuidado, não "worried"', () => {
      const w = buildWelcome('madrugada', plano([{ planned_date: '2026-09-27', kind: 'descanso' }]), at('2026-09-26T23:05:00'));
      expect(w.mood).toBe('caring');
      for (const hora of ['2026-09-26T23:05:00', '2026-09-27T02:30:00']) {
        expect(buildWelcome('madrugada', plano([]), at(hora)).mood).not.toBe('worried');
      }
    });

    it('de manhã, depois de "Dormiste mal", a cara mostra cuidado', () => {
      const d = '2026-09-28';
      const w = buildWelcome('manha', plano([{ planned_date: d, kind: 'corrida', training_type: 'rodagem', target_distance_km: 8 }], { dailyCheckins: [{ date: d, sleep: 1 }] }), at(`${d}T07:30:00`));
      expect(WELCOME_PHRASES.dormiuMal).toContain(w.lines[0]);
      expect(w.mood).toBe('caring');
    });

    it('"worried" só com a dor acima do alarme', () => {
      const d = '2026-09-28';
      const data = plano([{ planned_date: d, kind: 'corrida', training_type: 'rodagem', target_distance_km: 8 }], { dailyCheckins: [{ date: d, sleep: 5, pain: 7 }] });
      expect(buildWelcome('manha', data, at(`${d}T07:30:00`)).mood).toBe('worried');
      expect(buildWelcome('manha', { ...data, dailyCheckins: [{ date: d, sleep: 5, pain: 2 }] }, at(`${d}T07:30:00`)).mood).toBe('neutral');
    });

    it('contente no dia da prova; neutra no resto', () => {
      const meia = { id: 'r', name: 'Meia da Nazaré', date: '2026-09-27', status: 'agendada', start_time: '09:30:00' };
      expect(buildWelcome('prova', plano([], { raceEvents: [meia] }), at('2026-09-27T06:30:00')).mood).toBe('happy');
      expect(buildWelcome('manha', plano([], { raceEvents: [meia], dailyCheckins: [{ date: '2026-09-27', sleep: 4 }] }), at('2026-09-27T06:30:00')).mood).toBe('happy');
      expect(buildWelcome('vespera', plano([], { raceEvents: [meia] }), at('2026-09-26T15:00:00')).mood).toBe('neutral');
      expect(buildWelcome('tarde', plano([]), at('2026-09-28T15:00:00')).mood).toBe('neutral');
    });
  });

  describe('o fuso do dispositivo', () => {
    // 23:30 nos Açores (UTC+0 no verão) são 00:30 do dia seguinte em Lisboa.
    const acores2330 = new Date('2026-09-26T23:30:00Z');

    it('usa o fuso do dispositivo; sem ele, ou só "UTC", fica Lisboa', () => {
      const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions');
      try {
        spy.mockReturnValue({ timeZone: 'Atlantic/Azores' });
        expect(welcomeTimeZone()).toBe('Atlantic/Azores');
        // Sem fuso passado (como em App.jsx), decide o do dispositivo.
        expect(slotKey(acores2330)).toMatchObject({ date: '2026-09-26', hour: 23 });
        spy.mockReturnValue({ timeZone: 'UTC' });
        expect(welcomeTimeZone()).toBe('Europe/Lisbon');
        spy.mockReturnValue({});
        expect(welcomeTimeZone()).toBe('Europe/Lisbon');
      } finally {
        spy.mockRestore();
      }
      expect(slotKey(acores2330)).toMatchObject({ date: '2026-09-27', hour: 0 });
    });

    it('nos Açores às 23:30, "hoje" ainda é o dia de lá: o treino do dia seguinte é "amanhã"', () => {
      const data = plano([
        { planned_date: '2026-09-26', kind: 'descanso' },
        { planned_date: '2026-09-27', kind: 'corrida', training_type: 'longo', target_distance_km: 16 },
      ]);
      const acores = buildWelcome('madrugada', data, acores2330, 'Atlantic/Azores');
      expect(WELCOME_PHRASES.quando('Amanhã', 'uma rodagem longa de 16 km')).toContain(acores.lines[0]);
      expect(acores.lines.join(' ')).not.toMatch(/hoje/i);
      expect(acores.chip).toMatchObject({ label: 'Amanhã' });
      // Em Lisboa já passou a meia-noite: aí, sim, é "hoje".
      const lisboa = buildWelcome('madrugada', data, acores2330, 'Europe/Lisbon');
      expect(WELCOME_PHRASES.quando('Hoje', 'uma rodagem longa de 16 km')).toContain(lisboa.lines[0]);
    });

    it('a faixa e o check-in leem-se pela data do dispositivo, a mesma com que o check-in se grava', () => {
      const acores2240 = new Date('2026-09-26T22:40:00Z');
      expect(decideWelcome({ now: acores2240, seen: [], timeZone: 'Atlantic/Azores' })?.variant).toBe('noite');
      expect(decideWelcome({ now: acores2240, seen: [], timeZone: 'Europe/Lisbon' })?.variant).toBe('madrugada');
      // O check-in do dia 26 (data do telemóvel nos Açores), com dor: ainda é o de hoje.
      const data = plano([], { dailyCheckins: [{ date: '2026-09-26', sleep: 4, pain: 7 }] });
      expect(buildWelcome('madrugada', data, acores2330, 'Atlantic/Azores').mood).toBe('worried');
    });
  });

  describe('as frases do descanso', () => {
    const manhaDeDescanso = (d, { runs = [], gymSessions = [], items = [] } = {}) => {
      const data = plano([{ planned_date: d, kind: 'descanso' }, ...items], { runs, gymSessions, dailyCheckins: [{ date: d, sleep: 3 }] });
      const w = buildWelcome('manha', data, at(`${d}T07:30:00`));
      expectCarolVoice([w.greeting, ...w.lines].join(' '));
      return w.lines;
    };

    it('num plano novo, sem registos, não há "trabalho da semana" nem "a sério"', () => {
      for (const d of TRES_DIAS) {
        const lines = manhaDeDescanso(d);
        expect(lines, d).not.toContain(SEMANA);
        expect(lines, d).not.toContain(A_SERIO);
        expect(['Hoje é descanso.', WELCOME_PHRASES.descansoHoje()[2]], d).toContain(lines[0]);
      }
    });

    it('"o trabalho da semana" só com corridas ou ginásio nos últimos 7 dias', () => {
      // Uma semana inteira sem registos (o último há 8 dias).
      for (const d of TRES_DIAS) expect(manhaDeDescanso(d, { runs: [{ date: menos(d, 8), distance_km: 10 }] }), d).not.toContain(SEMANA);
      const comCorrida = TRES_DIAS.map((d) => manhaDeDescanso(d, { runs: [{ date: menos(d, 2), distance_km: 10 }] }));
      expect(comCorrida.some((l) => l.includes(SEMANA))).toBe(true);
      const comGinasio = TRES_DIAS.map((d) => manhaDeDescanso(d, { gymSessions: [{ date: menos(d, 3) }] }));
      expect(comGinasio.some((l) => l.includes(SEMANA))).toBe(true);
    });

    it('"a sério" só a quem treinou num descanso do plano nas últimas 4 semanas', () => {
      const planoPassado = (d, diasAtras) => [
        { planned_date: menos(d, diasAtras), kind: 'descanso' },
        { planned_date: menos(d, diasAtras - 1), kind: 'corrida', training_type: 'rodagem', target_distance_km: 8, status: 'concluido' },
      ];
      // Treinou sempre nos dias de treino: nada que sustente o "a sério".
      for (const d of TRES_DIAS) {
        expect(manhaDeDescanso(d, { items: planoPassado(d, 10), runs: [{ date: menos(d, 9), distance_km: 8 }] }), d).not.toContain(A_SERIO);
      }
      // Correu num descanso há 10 dias: aparece no dia em que calha.
      const trocou = TRES_DIAS.map((d) => manhaDeDescanso(d, { items: planoPassado(d, 10), runs: [{ date: menos(d, 10), distance_km: 6 }] }));
      expect(trocou.some((l) => l.includes(A_SERIO))).toBe(true);
      // O ginásio num descanso também conta.
      const ginasio = TRES_DIAS.map((d) => manhaDeDescanso(d, { items: planoPassado(d, 12), gymSessions: [{ date: menos(d, 12) }] }));
      expect(ginasio.some((l) => l.includes(A_SERIO))).toBe(true);
      // Há mais de 4 semanas já não conta.
      for (const d of TRES_DIAS) {
        expect(manhaDeDescanso(d, { items: planoPassado(d, 35), runs: [{ date: menos(d, 35), distance_km: 6 }] }), d).not.toContain(A_SERIO);
      }
    });
  });
});
