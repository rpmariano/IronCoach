import { describe, it, expect } from 'vitest';
import { computeMedalhoes, MEDALHAO_KEYS } from './medalhoes';

/* Os medalhões (specs/palmares-medalhoes.md §"Testes"). O que estes testes
   guardam é sobretudo o calendário: quando é que uma medalha se ganha (no
   fecho ou no dia em que se passa o melhor), e que as fronteiras de mês,
   trimestre e ano não escorregam um dia. */

const PROFILE = { id: 'atleta', experience_level: 'medio' };

const med = (result, key) => result.medalhoes.find((m) => m.key === key);
const slotOf = (result, key, slotKey) => med(result, key).slots.find((s) => s.key === slotKey);
const dueOf = (result, medalhao, slot) => result.due.filter((d) => d.medalhao === medalhao && d.slot === slot);

const run = (date, km, over = {}) => ({ id: `run-${date}-${km}`, date, distance_km: km, duration_seconds: Math.round(km * 330), kind: 'treino', ...over });

const compute = (over) => computeMedalhoes({
  runs: [], raceEvents: [], coachPlans: [], coachPlanItems: [], profile: PROFILE, ...over,
});

describe('computeMedalhoes — forma', () => {
  const r = compute({ today: '2026-09-15' });

  it('devolve os seis medalhões pela ordem fixa, sem O Trail', () => {
    expect(r.medalhoes.map((m) => m.key)).toEqual(MEDALHAO_KEYS);
    expect(MEDALHAO_KEYS).toEqual(['ano_km', 'distancias', 'recordes', 'epoca', 'consistencia', 'superacao']);
  });

  it('sem dados: tudo por ganhar, nada devido, herói O Ano em Km', () => {
    expect(r.medalhoes.every((m) => m.wonCount === 0)).toBe(true);
    expect(r.due).toEqual([]);
    expect(r.heroKey).toBe('ano_km');
    expect(med(r, 'ano_km').slots.map((s) => s.key)).toEqual(['mes', 'trimestre', 'semestre', 'ano']);
    expect(med(r, 'consistencia').slots.map((s) => s.key)).toEqual(['w4', 'w12', 'w26', 'w52']);
    expect(med(r, 'superacao').slots.map((s) => s.key)).toEqual(['o1', 'o3', 'o5', 'o10']);
    expect(med(r, 'distancias').summary).toBe('0 de 4 · falta 5, 10, 21,1 e 42,2');
  });
});

describe('O Ano em Km — o mês', () => {
  const runs = [
    run('2026-01-15', 10),
    run('2026-02-10', 8),
    run('2026-03-05', 6),
    run('2026-03-20', 5),
  ];

  it('primeiro mês com 10 km ganha no fecho, não no último dia', () => {
    const noUltimoDia = compute({ runs, today: '2026-01-31' });
    expect(slotOf(noUltimoDia, 'ano_km', 'mes').state).toBe('empty');
    expect(dueOf(noUltimoDia, 'ano_km', 'mes')).toEqual([]);

    const noFecho = compute({ runs, today: '2026-02-01' });
    const s = slotOf(noFecho, 'ano_km', 'mes');
    expect(s.state).toBe('won');
    expect(s.periodKey).toBe('2026-01');
    expect(s.awardedOn).toBe('2026-02-01');
    expect(s.valueLabel).toBe('10');
    expect(dueOf(noFecho, 'ano_km', 'mes')).toEqual([expect.objectContaining({
      periodKey: '2026-01', awardedOn: '2026-02-01', value: 10, title: 'Primeiro mês',
      line: '10 km em janeiro — a primeira medalha do mês.',
    })]);
  });

  it('segundo mês com 8 km não ganha; terceiro ganha no dia em que passa os 10 km', () => {
    const r = compute({ runs, today: '2026-04-10' });
    const mes = dueOf(r, 'ano_km', 'mes');
    expect(mes.map((d) => d.periodKey)).toEqual(['2026-01', '2026-03']);
    expect(mes[1].awardedOn).toBe('2026-03-20');
    expect(mes[1].value).toBe(11);
    expect(mes[1].title).toBe('Mês recorde');
    const s = slotOf(r, 'ano_km', 'mes');
    expect(s.wins).toBe(2);
    expect(s.value).toBe(11);
    expect(s.periodKey).toBe('2026-03');
  });

  it('a meio do período: re-ganha antes do fecho, e antes disso diz quanto falta', () => {
    const antes = compute({ runs, today: '2026-03-15' });
    const s = slotOf(antes, 'ano_km', 'mes');
    expect(s.state).toBe('won');
    expect(s.wins).toBe(1);
    expect(s.progress).toBeCloseTo(0.6);
    expect(s.remainingLabel).toBe('a 4 km de voltares a ganhar a medalha do mês');
    expect(s.detail).toBe('ganha em janeiro · para repetir: mais de 10 km num mês');

    const depois = compute({ runs, today: '2026-03-25' });
    const d = dueOf(depois, 'ano_km', 'mes');
    expect(d.map((x) => x.periodKey)).toEqual(['2026-01', '2026-03']);
    expect(d[1].awardedOn).toBe('2026-03-20');
    // O mês em curso já ganhou: não há "falta" para este encaixe até fechar.
    expect(slotOf(depois, 'ano_km', 'mes').progress).toBeNull();
  });

  it('a frase do recorde: número primeiro, sem exclamação', () => {
    const r = compute({ runs: [run('2026-07-10', 100), run('2026-08-05', 90), run('2026-08-28', 92)], today: '2026-09-15' });
    const ago = dueOf(r, 'ano_km', 'mes').find((d) => d.periodKey === '2026-08');
    expect(ago.line).toBe('182 km em agosto — o teu melhor mês de sempre.');
    expect(ago.awardedOn).toBe('2026-08-28');
    expect(r.due.every((d) => !d.line.includes('!'))).toBe(true);
    expect(slotOf(r, 'ano_km', 'mes').remainingLabel).toBe('a 182 km de voltares a ganhar a medalha do mês');
    expect(med(r, 'ano_km').footer).toBe('282 KM CORRIDOS');
    expect(med(r, 'ano_km').year).toBe('2026');
  });

  it('corridas sem distance_km (ou a zero, ou futuras) são ignoradas', () => {
    const r = compute({
      runs: [run('2026-01-10', null), { id: 'x', date: '2026-01-11', distance_km: '0' }, run('2026-02-03', 5), run('2026-09-30', 50)],
      today: '2026-03-01',
    });
    const mes = dueOf(r, 'ano_km', 'mes');
    expect(mes.map((d) => d.periodKey)).toEqual(['2026-02']);
    expect(mes[0].awardedOn).toBe('2026-03-01');
  });
});

describe('O Ano em Km — fronteiras', () => {
  it('31 de março e 1 de abril caem em meses e trimestres diferentes', () => {
    const r = compute({ runs: [run('2026-03-31', 10), run('2026-04-01', 12)], today: '2026-07-02' });
    expect(dueOf(r, 'ano_km', 'mes').map((d) => [d.periodKey, d.awardedOn])).toEqual([
      ['2026-03', '2026-04-01'],
      ['2026-04', '2026-04-01'],
    ]);
    expect(dueOf(r, 'ano_km', 'trimestre').map((d) => [d.periodKey, d.awardedOn, d.value])).toEqual([
      ['2026-Q1', '2026-04-01', 10],
      ['2026-Q2', '2026-04-01', 12],
    ]);
    // Semestre: jan–jun fechou a 30 de junho; ganha a 1 de julho.
    expect(dueOf(r, 'ano_km', 'semestre').map((d) => [d.periodKey, d.awardedOn, d.value])).toEqual([
      ['2026-H1', '2026-07-01', 22],
    ]);
    // O ano ainda não fechou: nada devido, e o encaixe diz quantos dias faltam.
    expect(dueOf(r, 'ano_km', 'ano')).toEqual([]);
    const ano = slotOf(r, 'ano_km', 'ano');
    expect(ano.state).toBe('empty');
    expect(ano.remainingLabel).toBe('a 183 dias de ganhares a medalha do ano');
  });

  it('31 de dezembro fecha o ano; 1 de janeiro já é o ano seguinte', () => {
    const r = compute({ runs: [run('2025-12-31', 5), run('2026-01-01', 6)], today: '2026-01-02' });
    const ano = dueOf(r, 'ano_km', 'ano');
    expect(ano.map((d) => [d.periodKey, d.awardedOn])).toEqual([['2025', '2026-01-01'], ['2026', '2026-01-01']]);
    expect(ano[0].line).toBe('5 km em 2025 — a primeira medalha do ano.');
    expect(dueOf(r, 'ano_km', 'semestre').map((d) => d.periodKey)).toEqual(['2025-H2', '2026-H1']);
    expect(dueOf(r, 'ano_km', 'trimestre')[0].line).toBe('5 km no 4.º trimestre de 2025 — a primeira medalha do trimestre.');
  });
});

// ── Provas ───────────────────────────────────────────────────────────────

const TREINOS = [
  run('2026-04-02', 10, { duration_seconds: 3000 }),
  run('2026-04-20', 16, { duration_seconds: 5100 }),
];

const prova = (over) => ({ race_type: 'estrada', status: 'concluida', ...over });
const competicao = (over) => ({ kind: 'competicao', ...over });

describe('As Distâncias', () => {
  it('21,1 concluída com corrida ligada enche o encaixe; prova sem corrida ligada não', () => {
    const raceEvents = [
      prova({ id: 'meia', name: 'Meia de Lisboa', date: '2026-05-10', distance_km: 21.0975 }),
      prova({ id: 'dez', name: 'Corrida do Tejo', date: '2026-06-10', distance_km: 10 }),
    ];
    const runs = [...TREINOS, competicao({ id: 'rm', race_id: 'meia', date: '2026-05-10', distance_km: 21.0975, duration_seconds: 6822 })];
    const r = compute({ runs, raceEvents, today: '2026-09-15' });
    const meia = slotOf(r, 'distancias', '21k');
    expect(meia.state).toBe('won');
    expect(meia.enamel).toBe('amber');
    expect(meia.raceId).toBe('meia');
    expect(meia.awardedOn).toBe('2026-05-10');
    expect(slotOf(r, 'distancias', '10k').state).toBe('empty');
    expect(med(r, 'distancias').summary).toBe('1 de 4 · falta 5, 10 e 42,2');
    expect(dueOf(r, 'distancias', '21k')).toEqual([expect.objectContaining({
      periodKey: '', raceId: 'meia', title: 'Primeira meia maratona',
    })]);
  });

  it('uma prova de 15 km não dá a medalha dos 21,1, nem uma de 30 km a dos 42,2', () => {
    const raceEvents = [
      prova({ id: 'quinze', name: 'Quinze de Sintra', date: '2026-05-10', distance_km: 15 }),
      prova({ id: 'trinta', name: 'Trinta do Tejo', date: '2026-06-10', distance_km: 30 }),
    ];
    const runs = [
      ...TREINOS,
      competicao({ id: 'r15', race_id: 'quinze', date: '2026-05-10', distance_km: 15, duration_seconds: 4800 }),
      competicao({ id: 'r30', race_id: 'trinta', date: '2026-06-10', distance_km: 30, duration_seconds: 10200 }),
    ];
    const r = compute({ runs, raceEvents, today: '2026-09-15' });
    expect(slotOf(r, 'distancias', '21k').state).toBe('empty');
    expect(slotOf(r, 'distancias', '42k').state).toBe('empty');
    expect(r.due.filter((d) => d.medalhao === 'distancias')).toEqual([]);
  });
});

describe('Os Recordes', () => {
  const dez = (id, date, seconds) => ({
    race: prova({ id, name: `Dez ${id}`, date, distance_km: 10 }),
    run: competicao({ id: `run-${id}`, race_id: id, date, distance_km: 10, duration_seconds: seconds }),
  });

  it('a primeira prova na distância não enche; a segunda mais rápida enche', () => {
    const a = dez('a', '2026-05-01', 3200);
    const so1 = compute({ runs: [...TREINOS, a.run], raceEvents: [a.race], today: '2026-09-15' });
    expect(slotOf(so1, 'recordes', '10k').state).toBe('empty');
    expect(slotOf(so1, 'recordes', '10k').detail).toBe('para ganhar: abaixo de 53:20 numa prova de 10 km');
    expect(slotOf(so1, 'distancias', '10k').state).toBe('won');

    const b = dez('b', '2026-06-01', 3107);
    const so2 = compute({ runs: [...TREINOS, a.run, b.run], raceEvents: [a.race, b.race], today: '2026-09-15' });
    const s = slotOf(so2, 'recordes', '10k');
    expect(s.state).toBe('won');
    expect(s.enamel).toBe('cyan');
    expect(s.value).toBe(3107);
    expect(s.valueLabel).toBe('51:47');
    expect(s.raceId).toBe('b');
    expect(dueOf(so2, 'recordes', '10k')).toEqual([expect.objectContaining({
      periodKey: 'b', value: 3107, title: 'Recorde nos 10 km',
      line: '51:47 — Dez b, 1:33 abaixo do teu melhor anterior.',
    })]);
  });

  it('re-cunhada a cada PB: uma entrada devida por prova', () => {
    const a = dez('a', '2026-05-01', 3200);
    const b = dez('b', '2026-06-01', 3107);
    const c = dez('c', '2026-07-01', 3150); // mais lenta: não é PB
    const d = dez('d', '2026-08-01', 3050);
    const r = compute({ runs: [...TREINOS, a.run, b.run, c.run, d.run], raceEvents: [a.race, b.race, c.race, d.race], today: '2026-09-15' });
    expect(dueOf(r, 'recordes', '10k').map((x) => x.periodKey)).toEqual(['b', 'd']);
    const s = slotOf(r, 'recordes', '10k');
    expect(s.wins).toBe(2);
    expect(s.valueLabel).toBe('50:50');
  });

  it('um 15 km rápido não conta para o recorde da meia', () => {
    const quinze = {
      race: prova({ id: 'q', name: 'Quinze', date: '2026-04-01', distance_km: 15 }),
      run: competicao({ id: 'run-q', race_id: 'q', date: '2026-04-01', distance_km: 15, duration_seconds: 4500 }),
    };
    const meia = (id, date, seconds) => ({
      race: prova({ id, name: `Meia ${id}`, date, distance_km: 21.0975 }),
      run: competicao({ id: `run-${id}`, race_id: id, date, distance_km: 21.0975, duration_seconds: seconds }),
    });
    const a = meia('a', '2026-05-01', 7000);
    const b = meia('b', '2026-06-01', 6800);
    const r = compute({ runs: [...TREINOS, quinze.run, a.run, b.run], raceEvents: [quinze.race, a.race, b.race], today: '2026-09-15' });
    expect(dueOf(r, 'recordes', '21k').map((x) => x.periodKey)).toEqual(['b']);
    expect(slotOf(r, 'recordes', '21k').valueLabel).toBe('1:53:20');
  });
});

describe('A Superação', () => {
  it('conta objetivos batidos (basis objetivo), com progresso para os seguintes', () => {
    const race = prova({ id: 'obj', name: 'Corrida X', date: '2026-06-01', distance_km: 10, target_time_seconds: 3300 });
    const semObjetivo = prova({ id: 'sem', name: 'Corrida Y', date: '2026-07-01', distance_km: 10 });
    const runs = [
      ...TREINOS,
      competicao({ id: 'r1', race_id: 'obj', date: '2026-06-01', distance_km: 10, duration_seconds: 3107 }),
      competicao({ id: 'r2', race_id: 'sem', date: '2026-07-01', distance_km: 10, duration_seconds: 2000 }),
    ];
    const r = compute({ runs, raceEvents: [race, semObjetivo], today: '2026-09-15' });
    expect(slotOf(r, 'superacao', 'o1').state).toBe('won');
    expect(slotOf(r, 'superacao', 'o1').raceId).toBe('obj');
    const o3 = slotOf(r, 'superacao', 'o3');
    expect(o3.state).toBe('empty');
    expect(o3.progress).toBeCloseTo(1 / 3);
    expect(o3.remainingLabel).toBe('a 2 objetivos batidos da medalha dos 3 objetivos');
    expect(med(r, 'superacao').summary).toBe('1 de 4 · falta 3, 5 e 10 objetivos');
    expect(dueOf(r, 'superacao', 'o1')[0].title).toBe('Primeiro objetivo batido');
  });
});

describe('A Época', () => {
  const concluida = prova({ id: 'e1', name: 'Meia de Lisboa', date: '2026-03-10', distance_km: 21.0975 });
  const runsEpoca = [...TREINOS, competicao({ id: 're1', race_id: 'e1', date: '2026-03-10', distance_km: 21.0975, duration_seconds: 6822 })];

  it('encaixes = provas marcadas no ano, mínimo 4', () => {
    const raceEvents = [
      concluida,
      prova({ id: 'e2', name: 'Maratona do Porto', date: '2026-11-01', distance_km: 42.195, status: 'agendada' }),
      prova({ id: 'velha', name: 'São Silvestre', date: '2025-12-31', distance_km: 10 }),
    ];
    const r = compute({ runs: runsEpoca, raceEvents, today: '2026-09-15' });
    const m = med(r, 'epoca');
    expect(m.totalSlots).toBe(4);
    expect(m.wonCount).toBe(1);
    expect(m.year).toBe('2026');
    expect(m.slots[0]).toEqual(expect.objectContaining({ key: 'p1', state: 'won', enamel: 'silver', label: 'Meia de Lisboa', periodKey: 'e1' }));
    expect(m.slots[1]).toEqual(expect.objectContaining({ key: 'p2', state: 'empty', label: 'Maratona do Porto', periodKey: 'e2' }));
    expect(m.slots[3]).toEqual(expect.objectContaining({ key: 'p4', state: 'empty', periodKey: '' }));
    expect(dueOf(r, 'epoca', 'prova')).toEqual([expect.objectContaining({ periodKey: 'e1', raceId: 'e1' })]);

    const seis = [concluida, ...[2, 3, 4, 5, 6].map((n) => prova({ id: `e${n}`, name: `Prova ${n}`, date: `2026-1${n % 3}-0${n}`, distance_km: 10, status: 'agendada' }))];
    expect(med(compute({ runs: runsEpoca, raceEvents: seis, today: '2026-09-15' }), 'epoca').totalSlots).toBe(6);
  });
});

// ── A Consistência ───────────────────────────────────────────────────────

const PLAN = { id: 'p1', status: 'aceite', period_start: '2026-08-01', period_end: '2026-10-31' };
let seq = 0;
const item = (planned_date, status, over = {}) => ({
  id: `i${seq += 1}`, plan_id: 'p1', kind: 'corrida', planned_date, status, created_at: '2026-08-01T10:00:00Z', ...over,
});

describe('A Consistência', () => {
  it('semana sem plano não quebra; 4 semanas cumpridas ganham no fecho da 4.ª', () => {
    const items = [
      item('2026-08-04', 'concluido'),
      item('2026-08-11', 'concluido'), item('2026-08-13', 'concluido', { kind: 'ginasio' }),
      // semana de 17 ago: sem itens
      item('2026-08-25', 'concluido'), item('2026-08-26', 'cancelado'),
      item('2026-09-01', 'concluido'),
      item('2026-09-15', 'pendente'), // semana ainda aberta: não conta
    ];
    const r = compute({ coachPlans: [PLAN], coachPlanItems: items, today: '2026-09-15' });
    const w4 = slotOf(r, 'consistencia', 'w4');
    expect(w4.state).toBe('won');
    expect(w4.periodKey).toBe('2026-08-31');
    expect(w4.awardedOn).toBe('2026-09-07');
    expect(slotOf(r, 'consistencia', 'w12').progress).toBeCloseTo(4 / 12);
    expect(slotOf(r, 'consistencia', 'w12').remainingLabel).toBe('a 8 semanas de ganhares a medalha das 12 semanas');
    expect(dueOf(r, 'consistencia', 'w4')[0].title).toBe('4 semanas de plano cumprido');
  });

  it('item pendente depois do fecho quebra', () => {
    const items = [
      item('2026-08-04', 'concluido'),
      item('2026-08-11', 'concluido'),
      item('2026-08-18', 'pendente'),
      item('2026-08-25', 'concluido'),
      item('2026-09-01', 'concluido'),
    ];
    const r = compute({ coachPlans: [PLAN], coachPlanItems: items, today: '2026-09-15' });
    const w4 = slotOf(r, 'consistencia', 'w4');
    expect(w4.state).toBe('empty');
    expect(w4.progress).toBeCloseTo(0.5);
  });

  it('plano reescrito não conta os dias pendentes antes da reescrita', () => {
    const items = [
      item('2026-08-04', 'concluido'),
      item('2026-08-11', 'pendente'),
      item('2026-08-18', 'concluido', { created_at: '2026-08-17T09:00:00' }),
      item('2026-08-25', 'concluido', { created_at: '2026-08-17T09:00:00' }),
      item('2026-09-01', 'concluido', { created_at: '2026-08-17T09:00:00' }),
    ];
    const r = compute({ coachPlans: [PLAN], coachPlanItems: items, today: '2026-09-15' });
    expect(slotOf(r, 'consistencia', 'w4').state).toBe('won');
  });

  it('planos não aceites não contam', () => {
    const items = ['2026-08-04', '2026-08-11', '2026-08-18', '2026-08-25'].map((d) => item(d, 'concluido'));
    const r = compute({ coachPlans: [{ ...PLAN, status: 'proposto' }], coachPlanItems: items, today: '2026-09-15' });
    expect(slotOf(r, 'consistencia', 'w4').state).toBe('empty');
  });
});

// ── Herói e devidos ──────────────────────────────────────────────────────

describe('heroKey', () => {
  it('o mais perto da próxima medalha ganha', () => {
    const items = ['2026-08-18', '2026-08-25', '2026-09-01'].map((d) => item(d, 'concluido'));
    const r = compute({ coachPlans: [PLAN], coachPlanItems: items, today: '2026-09-15' });
    expect(slotOf(r, 'consistencia', 'w4').progress).toBeCloseTo(0.75);
    expect(r.heroKey).toBe('consistencia');
  });

  it('em empate, O Ano em Km', () => {
    // 14 fev: meio fevereiro (14/28) e meio trimestre (45/90) — 0,5 exato.
    // A Consistência com 2 semanas de 4 — também 0,5.
    const items = [item('2026-01-06', 'concluido', { created_at: '2026-01-01T10:00:00Z' }), item('2026-01-13', 'concluido', { created_at: '2026-01-01T10:00:00Z' })];
    const r = compute({
      runs: [run('2026-02-01', 5)],
      coachPlans: [{ ...PLAN, period_start: '2026-01-01' }],
      coachPlanItems: items,
      today: '2026-02-14',
    });
    expect(slotOf(r, 'ano_km', 'mes').progress).toBe(0.5);
    expect(slotOf(r, 'consistencia', 'w4').progress).toBe(0.5);
    expect(r.heroKey).toBe('ano_km');
  });
});

describe('due', () => {
  it('uma entrada por (medalhão, encaixe, período), mesmo com muito histórico', () => {
    const runs = [];
    for (let m = 1; m <= 12; m += 1) {
      runs.push(run(`2025-${String(m).padStart(2, '0')}-10`, 10 + m));
      runs.push(run(`2025-${String(m).padStart(2, '0')}-28`, 5 + m));
    }
    runs.push(run('2026-01-05', 40), run('2026-01-06', 30));
    const r = compute({ runs, today: '2026-09-15' });
    const keys = r.due.map((d) => `${d.medalhao}|${d.slot}|${d.periodKey}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(r.due.length).toBeGreaterThan(10);
    expect(r.due.every((d) => d.title && d.line && d.awardedOn)).toBe(true);
    expect(r.due.every((d) => MEDALHAO_KEYS.includes(d.medalhao))).toBe(true);
  });
});
