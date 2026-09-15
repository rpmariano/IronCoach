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

const compute = (over) => computeMedalhoes({ runs: [], raceEvents: [], profile: PROFILE, ...over });

describe('computeMedalhoes — forma', () => {
  const r = compute({ today: '2026-09-15' });

  it('devolve os seis medalhões pela ordem fixa, sem O Trail', () => {
    expect(r.medalhoes.map((m) => m.key)).toEqual(MEDALHAO_KEYS);
    expect(MEDALHAO_KEYS).toEqual(['ano_km', 'distancias', 'recordes', 'terreno', 'sequencia', 'superacao']);
  });

  it('sem dados: tudo por ganhar, nada devido, herói O Ano em Km', () => {
    expect(r.medalhoes.every((m) => m.wonCount === 0)).toBe(true);
    expect(r.due).toEqual([]);
    expect(r.heroKey).toBe('ano_km');
    expect(med(r, 'ano_km').slots.map((s) => s.key)).toEqual(['mes', 'trimestre', 'semestre', 'ano']);
    expect(med(r, 'terreno').slots.map((s) => s.key)).toEqual(['estrada1', 'trail1', 'estrada5', 'trail5']);
    expect(med(r, 'sequencia').slots.map((s) => s.key)).toEqual(['seq2', 'seq3', 'seq5', 'seq8']);
    expect(med(r, 'superacao').slots.map((s) => s.key)).toEqual(['o1', 'o3', 'o5', 'o10']);
    expect(med(r, 'distancias').summary).toBe('0 de 4 · falta 5, 10, 21,1 e 42,2');
  });

  /* "Uma cor, um significado": ciano é a corrida (volume e tempo), âmbar é a
     prova em si, verde é o objetivo batido — o mesmo tom da conquista
     `objetivo_batido`. Quem só conta ocorrências fica em prata. */
  it('as cores de cada medalhão', () => {
    const enamelOf = (key) => [...new Set(med(r, key).slots.map((s) => s.enamel))];
    expect(enamelOf('ano_km')).toEqual(['cyan']);
    expect(enamelOf('distancias')).toEqual(['amber']);
    expect(enamelOf('recordes')).toEqual(['cyan']);
    expect(enamelOf('terreno')).toEqual(['silver']);
    expect(enamelOf('sequencia')).toEqual(['silver']);
    expect(enamelOf('superacao')).toEqual(['ok']);
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
    expect(slotOf(r, 'superacao', 'o1').enamel).toBe('ok');
    expect(slotOf(r, 'superacao', 'o1').raceId).toBe('obj');
    const o3 = slotOf(r, 'superacao', 'o3');
    expect(o3.state).toBe('empty');
    expect(o3.progress).toBeCloseTo(1 / 3);
    expect(o3.remainingLabel).toBe('a 2 objetivos batidos da medalha dos 3 objetivos');
    expect(med(r, 'superacao').summary).toBe('1 de 4 · falta 3, 5 e 10 objetivos');
    expect(dueOf(r, 'superacao', 'o1')[0].title).toBe('Primeiro objetivo batido');
  });
});

/* O Terreno banda por `race_type` — estrada ou trail, os dois únicos valores
   de RACE_TERRAIN_TYPES (utils/run.js) —, um eixo que nada tem a ver com a
   distância d'As Distâncias. Regra: `race_type === 'trail'` é trail, tudo o
   resto (incluindo uma prova antiga sem terreno) é estrada. */

describe('O Terreno', () => {
  const noTerreno = (id, date, race_type) => ({
    race: prova({ id, name: `Prova ${id}`, date, distance_km: 10, race_type }),
    run: competicao({ id: `run-${id}`, race_id: id, date, distance_km: 10, duration_seconds: 3300 }),
  });
  const cinco = ['a', 'b', 'c', 'd', 'e'].map((id, i) => noTerreno(id, `2026-0${i + 1}-10`, 'estrada'));
  const trail = noTerreno('t1', '2026-06-10', 'trail');
  const todas = [...cinco, trail];
  const comTodas = () => compute({
    runs: [...TREINOS, ...todas.map((e) => e.run)],
    raceEvents: todas.map((e) => e.race),
    today: '2026-09-15',
  });

  it('a primeira de cada terreno, e a quinta como marco de veterano', () => {
    const r = comTodas();
    const e1 = slotOf(r, 'terreno', 'estrada1');
    expect(e1.state).toBe('won');
    expect(e1.enamel).toBe('silver');
    expect(e1.valueLabel).toBeNull(); // sem esmalte não se grava número
    expect(e1.awardedOn).toBe('2026-01-10');
    expect(e1.raceId).toBe('a');
    expect(e1.detail).toBe('1.ª prova em estrada · ganha a 10 jan · Prova a');
    expect(slotOf(r, 'terreno', 'estrada5').awardedOn).toBe('2026-05-10');
    expect(slotOf(r, 'terreno', 'trail1').awardedOn).toBe('2026-06-10');
    expect(med(r, 'terreno').footer).toBe('5 EM ESTRADA · 1 EM TRAIL');

    const t5 = slotOf(r, 'terreno', 'trail5');
    expect(t5.state).toBe('empty');
    expect(t5.progress).toBeCloseTo(0.2);
    expect(t5.remainingLabel).toBe('a 4 provas em trail de ganhares a medalha das 5 em trail');
  });

  it('uma entrada devida por encaixe, com a prova que o encheu', () => {
    const r = comTodas();
    expect(dueOf(r, 'terreno', 'estrada1')).toEqual([expect.objectContaining({
      periodKey: '', raceId: 'a', awardedOn: '2026-01-10', value: 1, valueLabel: null,
      title: 'Primeira em estrada', line: 'Prova a — a tua primeira prova em estrada.',
    })]);
    expect(dueOf(r, 'terreno', 'estrada5')[0]).toEqual(expect.objectContaining({
      raceId: 'e', awardedOn: '2026-05-10', value: 5, title: '5 provas em estrada',
      line: 'Prova e — a tua 5.ª prova em estrada.',
    }));
    expect(dueOf(r, 'terreno', 'trail5')).toEqual([]);
    const chaves = r.due.filter((d) => d.medalhao === 'terreno').map((d) => d.slot);
    expect(chaves).toEqual(['estrada1', 'trail1', 'estrada5']);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it('uma prova sem terreno conta como estrada; uma sem corrida ligada não conta', () => {
    const semTerreno = noTerreno('s', '2026-02-10', undefined);
    const semCorrida = prova({ id: 'x', name: 'Sem registo', date: '2026-01-05', distance_km: 10, race_type: 'trail' });
    const r = compute({
      runs: [...TREINOS, semTerreno.run],
      raceEvents: [semTerreno.race, semCorrida],
      today: '2026-09-15',
    });
    expect(slotOf(r, 'terreno', 'estrada1').raceId).toBe('s');
    expect(slotOf(r, 'terreno', 'trail1').state).toBe('empty');
    expect(slotOf(r, 'terreno', 'trail1').detail).toBe('0 de 1 prova em trail');
    expect(med(r, 'terreno').summary).toBe('1 de 4 · falta 1.ª trail, 5 estrada e 5 trail');
  });

  it('os registos por trás do encaixe: as provas que contam para ele', () => {
    const r = comTodas();
    const e5 = slotOf(r, 'terreno', 'estrada5');
    expect(e5.contributions.map((c) => [c.kind, c.raceId, !!c.first])).toEqual([
      ['race', 'e', false], ['race', 'd', false], ['race', 'c', false], ['race', 'b', false], ['race', 'a', true],
    ]);
    expect(e5.contributionsSummary).toBe('5 de 5 provas em estrada');
    expect(slotOf(r, 'terreno', 'trail5').contributions.map((c) => c.raceId)).toEqual(['t1']);
    expect(slotOf(r, 'terreno', 'trail5').contributionsSummary).toBe('1 de 5 provas em trail');
  });
});

// ── A Sequência ──────────────────────────────────────────────────────────

/* A conquista `sequencia` de achievements.js conta a sequência que chega a
   HOJE; o medalhão conta a MAIOR de sempre (um máximo corrente, como O Ano
   em Km faz com o melhor período). É essa diferença que estes testes
   guardam: quebrar a sequência não tira medalhas já ganhas. */

describe('A Sequência', () => {
  const elo = (id, date) => ({
    race: prova({ id, name: `Prova ${id}`, date, distance_km: 10 }),
    run: competicao({ id: `run-${id}`, race_id: id, date, distance_km: 10, duration_seconds: 3300 }),
  });
  const correr = (elos, extraRaces = []) => compute({
    runs: [...TREINOS, ...elos.map((e) => e.run)],
    raceEvents: [...elos.map((e) => e.race), ...extraRaces],
    today: '2026-09-15',
  });

  it('guarda a maior de sempre: quebrar a sequência não tira o que já está ganho', () => {
    const elos = [elo('a', '2026-01-10'), elo('b', '2026-02-10'), elo('c', '2026-03-10'), elo('d', '2026-05-10')];
    const porRegistar = prova({ id: 'x', name: 'Falhada', date: '2026-04-10', status: 'agendada', distance_km: 10 });
    const r = correr(elos, [porRegistar]);

    const seq2 = slotOf(r, 'sequencia', 'seq2');
    expect(seq2.state).toBe('won');
    expect(seq2.enamel).toBe('silver');
    expect(seq2.valueLabel).toBeNull();
    expect(seq2.awardedOn).toBe('2026-02-10');
    expect(seq2.detail).toBe('ganha a 10 fev · Prova b · melhor sequência: 3 provas');
    expect(slotOf(r, 'sequencia', 'seq3').awardedOn).toBe('2026-03-10');
    expect(med(r, 'sequencia').footer).toBe('3 PROVAS SEGUIDAS');

    // A sequência que chega a hoje é de 1 (a de abril ficou por registar) —
    // e mesmo assim as medalhas das 2 e das 3 ficam onde estão.
    const seq5 = slotOf(r, 'sequencia', 'seq5');
    expect(seq5.state).toBe('empty');
    expect(seq5.detail).toBe('1 de 5 provas seguidas');
    expect(seq5.progress).toBeCloseTo(0.2);
    expect(seq5.remainingLabel).toBe('a 4 provas de ganhares a medalha das 5 provas seguidas');
    expect(med(r, 'sequencia').summary).toBe('2 de 4 · falta 5 e 8 provas seguidas');
    expect(dueOf(r, 'sequencia', 'seq2')).toEqual([expect.objectContaining({
      periodKey: '', value: 2, valueLabel: null, raceId: 'b', awardedOn: '2026-02-10',
      title: '2 provas seguidas',
      line: '2 provas seguidas com a corrida registada — a última foi Prova b, a 10 fev.',
    })]);
  });

  it('re-cunhagem: cada recorde novo enche o encaixe seguinte, nunca o mesmo duas vezes', () => {
    // 3 seguidas, quebra, e depois 5 seguidas: as medalhas das 2 e das 3 não
    // se repetem quando a sequência nova volta a passar por lá.
    const primeiras = [elo('a', '2026-01-10'), elo('b', '2026-01-20'), elo('c', '2026-01-30')];
    const falhada = prova({ id: 'x', name: 'Falhada', date: '2026-02-10', status: 'agendada', distance_km: 10 });
    const segundas = [1, 2, 3, 4, 5].map((n) => elo(`s${n}`, `2026-0${n + 2}-15`));
    const r = correr([...primeiras, ...segundas], [falhada]);

    expect(dueOf(r, 'sequencia', 'seq2')).toHaveLength(1);
    expect(dueOf(r, 'sequencia', 'seq3')).toHaveLength(1);
    expect(dueOf(r, 'sequencia', 'seq3')[0].awardedOn).toBe('2026-01-30');
    // A 5.ª da sequência nova é a que confirma o recorde de 5.
    expect(dueOf(r, 'sequencia', 'seq5')).toEqual([expect.objectContaining({ raceId: 's5', awardedOn: '2026-07-15' })]);
    expect(dueOf(r, 'sequencia', 'seq8')).toEqual([]);
    expect(slotOf(r, 'sequencia', 'seq8').progress).toBeCloseTo(5 / 8);
    expect(med(r, 'sequencia').footer).toBe('5 PROVAS SEGUIDAS');
    const chaves = r.due.filter((d) => d.medalhao === 'sequencia').map((d) => d.slot);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it('uma prova futura não entra nem quebra; uma concluída sem corrida ligada quebra', () => {
    const elos = [elo('a', '2026-01-10'), elo('b', '2026-02-10')];
    const futura = prova({ id: 'f', name: 'Corrida de Outono', date: '2026-10-04', status: 'agendada', distance_km: 10 });
    expect(slotOf(correr(elos, [futura]), 'sequencia', 'seq2').state).toBe('won');

    // "Concluída" na agenda mas sem corrida gravada: não há números — quebra.
    const semCorrida = prova({ id: 'n', name: 'Sem registo', date: '2026-01-20', distance_km: 10 });
    const r = correr(elos, [semCorrida]);
    expect(slotOf(r, 'sequencia', 'seq2').state).toBe('empty');
    expect(slotOf(r, 'sequencia', 'seq2').progress).toBeCloseTo(0.5);
  });

  it('os registos por trás do encaixe: as provas da sequência que o encheu', () => {
    const r = correr([elo('a', '2026-01-10'), elo('b', '2026-02-10'), elo('c', '2026-03-10')]);
    const seq2 = slotOf(r, 'sequencia', 'seq2');
    expect(seq2.contributions.map((c) => [c.kind, c.raceId, c.runId])).toEqual([
      ['race', 'b', 'run-b'],
      ['race', 'a', 'run-a'],
    ]);
    expect(seq2.contributionsPeriodLabel).toBe('10 jan a 10 fev');
    expect(seq2.contributionsSummary).toBe('2 provas seguidas');
    // Por ganhar: a sequência em curso.
    const seq5 = slotOf(r, 'sequencia', 'seq5');
    expect(seq5.contributions.map((c) => c.raceId)).toEqual(['c', 'b', 'a']);
    expect(seq5.contributionsSummary).toBe('3 provas seguidas');
  });

  it('sem provas: lista vazia e o convite para começar', () => {
    const s = slotOf(compute({ today: '2026-09-15' }), 'sequencia', 'seq2');
    expect(s.contributions).toEqual([]);
    expect(s.contributionsPeriodLabel).toBeNull();
    expect(s.detail).toBe('regista a corrida de cada prova que corres e a sequência começa');
    expect(s.progress).toBe(0);
  });
});

describe('progressLine', () => {
  it('As Distâncias dizem quanto falta até a prova marcada, mesmo sem fração', () => {
    const r = compute({
      raceEvents: [prova({ id: 'fut', name: 'Corrida de Outono', date: '2026-10-04', distance_km: 10, status: 'agendada' })],
      today: '2026-09-15',
    });
    expect(slotOf(r, 'distancias', '10k').progress).toBeNull();
    expect(med(r, 'distancias').progressLine).toBe('A 19 dias da medalha dos 10 km');
  });
});

// ── Herói e devidos ──────────────────────────────────────────────────────

describe('heroKey', () => {
  const prova10 = (id, date) => ({
    race: prova({ id, name: `Prova ${id}`, date, distance_km: 10 }),
    run: competicao({ id: `run-${id}`, race_id: id, date, distance_km: 10, duration_seconds: 3300 }),
  });

  it('o mais perto da próxima medalha ganha', () => {
    // Uma prova registada: A Sequência fica a meio caminho das 2 seguidas
    // (0,5), e é o começo do ano — O Ano em Km ainda mal andou.
    const a = prova10('a', '2026-01-03');
    const r = compute({ runs: [a.run], raceEvents: [a.race], today: '2026-01-05' });
    expect(slotOf(r, 'sequencia', 'seq2').progress).toBe(0.5);
    expect(r.heroKey).toBe('sequencia');
  });

  it('em empate, O Ano em Km', () => {
    // 14 fev: meio fevereiro (14/28) e meio trimestre (45/90) — 0,5 exato.
    // A Sequência com 1 prova de 2 — também 0,5.
    const a = prova10('a', '2026-02-07');
    const r = compute({ runs: [run('2026-02-01', 5), a.run], raceEvents: [a.race], today: '2026-02-14' });
    expect(slotOf(r, 'ano_km', 'mes').progress).toBe(0.5);
    expect(slotOf(r, 'sequencia', 'seq2').progress).toBe(0.5);
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

// ── Os registos por trás de cada encaixe ─────────────────────────────────

/* `contributions`: a lista que a persiana dos registos mostra
   (Perfil/MedalhaoContribSheet.jsx), da mais recente para a mais antiga.
   Uma corrida de prova é `kind: 'race'`, para abrir o hub. */

describe('contributions — O Ano em Km', () => {
  const raceEvents = [prova({ id: 'r-ago', name: 'Meia de Agosto', date: '2026-08-28', distance_km: 21.0975 })];
  const runs = [
    run('2026-07-10', 100),
    run('2026-08-05', 90, { training_type: 'longo' }),
    competicao({ id: 'rm', race_id: 'r-ago', date: '2026-08-28', distance_km: 21.1, duration_seconds: 6730 }),
    run('2026-09-10', 20),
    run('2026-09-30', 50), // futura: não conta
  ];
  const r = compute({ runs, raceEvents, today: '2026-09-15' });

  it('encaixe ganho: as corridas do melhor período, a de prova abre o hub', () => {
    const mes = slotOf(r, 'ano_km', 'mes');
    expect(mes.state).toBe('won');
    expect(mes.contributionsPeriodLabel).toBe('agosto de 2026');
    expect(mes.contributionsTotal).toBe(111.1);
    expect(mes.contributionsSummary).toBe('111 km · 2 corridas');
    expect(mes.contributions).toEqual([
      { kind: 'race', id: 'r-ago', raceId: 'r-ago', runId: 'rm', date: '2026-08-28', title: 'Meia de Agosto', meta: '21,1 km · 1:52:10' },
      { kind: 'run', id: 'run-2026-08-05-90', raceId: null, runId: 'run-2026-08-05-90', date: '2026-08-05', title: 'Longo', meta: '90 km · 8:15:00' },
    ]);
  });

  it('encaixe por ganhar: as corridas do período em curso, sem as futuras', () => {
    const tri = slotOf(r, 'ano_km', 'trimestre');
    expect(tri.state).toBe('empty');
    expect(tri.contributionsPeriodLabel).toBe('3.º trimestre de 2026');
    expect(tri.contributions.map((c) => c.date)).toEqual(['2026-09-10', '2026-08-28', '2026-08-05', '2026-07-10']);
    expect(tri.contributions[0]).toEqual(expect.objectContaining({ kind: 'run', title: 'Corrida' }));
    expect(slotOf(r, 'ano_km', 'ano').contributionsPeriodLabel).toBe('2026');
  });

  it('sem corridas: lista vazia, sem resumo', () => {
    const vazio = slotOf(compute({ today: '2026-09-15' }), 'ano_km', 'mes');
    expect(vazio.contributions).toEqual([]);
    expect(vazio.contributionsSummary).toBeNull();
    expect(vazio.contributionsPeriodLabel).toBe('setembro de 2026');
  });
});

describe('contributions — provas', () => {
  const dez = (id, date, seconds, over = {}) => ({
    race: prova({ id, name: `Dez ${id}`, date, distance_km: 10, ...over }),
    run: competicao({ id: `run-${id}`, race_id: id, date, distance_km: 10, duration_seconds: seconds }),
  });
  const a = dez('a', '2026-05-01', 3200, { target_time_seconds: 3300 });
  const b = dez('b', '2026-06-01', 3107, { target_time_seconds: 3200 });
  const c = dez('c', '2026-07-01', 3150);
  const r = compute({ runs: [...TREINOS, a.run, b.run, c.run], raceEvents: [a.race, b.race, c.race], today: '2026-09-15' });

  it('As Distâncias: todas as provas na distância, a primeira marcada', () => {
    const s = slotOf(r, 'distancias', '10k');
    expect(s.contributions.map((x) => [x.kind, x.raceId, x.runId, !!x.first])).toEqual([
      ['race', 'c', 'run-c', false],
      ['race', 'b', 'run-b', false],
      ['race', 'a', 'run-a', true],
    ]);
    expect(s.contributions[2].meta).toContain('53:20');
    expect(s.contributionsSummary).toBe('3 provas nesta distância');
    expect(slotOf(r, 'distancias', '21k').contributions).toEqual([]);
  });

  it('Os Recordes: as provas com tempo, com pb e o que baixou', () => {
    const s = slotOf(r, 'recordes', '10k');
    expect(s.contributions.map((x) => [x.raceId, x.pb, x.deltaSeconds])).toEqual([
      ['c', false, null],
      ['b', true, 93],
      ['a', false, null],
    ]);
    expect(s.contributions[1].meta).toContain('recorde, menos 1:33');
    expect(s.contributionsSummary).toBe('3 provas com tempo · 1 recorde');
  });

  it('A Superação: os primeiros N objetivos batidos', () => {
    expect(slotOf(r, 'superacao', 'o1').contributions.map((x) => x.raceId)).toEqual(['a']);
    const o3 = slotOf(r, 'superacao', 'o3');
    expect(o3.state).toBe('empty');
    expect(o3.contributions.map((x) => x.raceId)).toEqual(['b', 'a']);
    expect(o3.contributions[0].meta).toContain('objetivo 53:20');
    expect(o3.contributionsSummary).toBe('2 de 3 objetivos batidos');
  });
});
