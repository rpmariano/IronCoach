import { describe, it, expect } from 'vitest';
import { slotForHour, slotKey, decideWelcome, buildWelcome, readSeen, markSeen, readShownAt, markShownAt, WELCOME_MIN_GAP_MS, WELCOME_PHRASES, pickByDay } from './carolWelcome';
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

  it('conta a hora de Lisboa, não a do relógio do sistema', () => {
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
    expect(WELCOME_PHRASES.checkinFaltaTarde).toContain(w.lines[0]);
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
    expect(w.lines[0]).toMatch(/^Hoje.*rodagem/i);
    expect(WELCOME_PHRASES.sono).toContain(w.lines[1]);
  });

  it('dia de prova: nome, partida e o chip da distância', () => {
    const raceEvents = [{ id: 'r1', name: 'Maratona do Porto', date: '2026-11-08', status: 'agendada', distance_km: 42.195, start_time: '08:30:00' }];
    const w = buildWelcome('prova', { ...base, raceEvents }, at('2026-11-08T06:05:00'));
    expect(w.greeting).toBe('É hoje, Rui.');
    expect(w.lines[0]).toBe('Maratona do Porto, partida às 8:30.');
    expect(w.chip).toMatchObject({ label: '42,2 km', value: 'Partida às 08:30' });
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
    expect(WELCOME_PHRASES.checkinFalta).toContain(w.lines[0]);
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
    expect(w.chip).toMatchObject({ label: '21,1 km', value: 'Partida às 09:30', icon: 'trophy' });
    expect(w.lines.length).toBeLessThanOrEqual(2);
    expectCarolVoice([w.greeting, ...w.lines].join(' '));

    const feito = buildWelcome('vespera', { ...data, coachPlanItems: [{ ...data.coachPlanItems[0], status: 'concluido' }] }, at('2026-09-19T19:30:00'));
    expect(feito.lines[1]).toMatch(/^O treino de hoje já está feito/);
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
