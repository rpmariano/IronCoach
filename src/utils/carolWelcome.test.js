import { describe, it, expect } from 'vitest';
import { slotForHour, slotKey, decideWelcome, buildWelcome, readSeen, markSeen, WELCOME_PHRASES, pickByDay } from './carolWelcome';

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
    runs: [], meals: [], raceEvents: [],
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
      expect([w.greeting, ...w.lines].join(' ')).not.toMatch(/!/);
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
    dailyCheckins: [], runs: [], meals: [], raceEvents: [],
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
});

