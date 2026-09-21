import { describe, it, expect } from 'vitest';
import { achievementsForRace, missedInRace, describeMissedInRace, ACHIEVEMENT_KEYS } from './achievements';
import { completedRaces } from './premios';

/* As conquistas de uma prova (specs/gamificacao-provas.md). O que estes
   testes guardam é sobretudo a régua: uma prova só conta quando está
   concluída, tem corrida ligada E o dia dela já passou, e "objetivo
   batido"/"recorde pessoal" saem do raceOutcome — não de uma comparação
   escrita outra vez aqui.

   Desde a fusão dos motores (utils/premios.js) já não há palmarés GLOBAL de
   conquistas: o Palmarés são os medalhões (utils/medalhoes.test.js). Cada
   prova avalia-se nela própria, que é a única leitura que a app mostra. */

const HOJE = '2026-09-12';
const PROFILE = { id: 'atleta', experience_level: 'medio' };

// Treino suficiente para a previsão de Riegel ter de onde sair.
const TREINOS = [
  { id: 't1', date: '2026-04-02', distance_km: 10, duration_seconds: 3000, kind: 'treino' },
  { id: 't2', date: '2026-04-20', distance_km: 16, duration_seconds: 5100, kind: 'treino' },
  { id: 't3', date: '2026-08-15', distance_km: 18, duration_seconds: 5700, kind: 'treino' },
];

const meia = (over) => ({
  race_type: 'estrada', distance_km: 21.0975, status: 'concluida', ...over,
});

const corrida = (over) => ({
  kind: 'competicao', distance_km: 21.0975, ...over,
});

const byKey = (list) => Object.fromEntries(list.map((a) => [a.key, a]));

describe('a ordem das conquistas é o contrato com o coach-chat', () => {
  it('as seis chaves, sempre as mesmas', () => {
    expect(ACHIEVEMENT_KEYS).toEqual([
      'prova_concluida', 'objetivo_batido', 'acima_do_treino', 'recorde_pessoal', 'primeira_trail', 'sequencia',
    ]);
  });
});

describe('uma prova concluída', () => {
  const race = meia({ id: 'r1', name: 'Meia de Lisboa', date: '2026-09-10', target_time_seconds: 6900 });
  const run = corrida({ id: 'run1', race_id: 'r1', date: '2026-09-10', duration_seconds: 6822, details: { official_time_seconds: 6822 } });
  const dados = { raceEvents: [race], runs: [...TREINOS, run], profile: PROFILE, today: HOJE };
  const a = byKey(achievementsForRace(dados, 'r1'));

  it('conta a prova, diz o ordinal e aponta para ela', () => {
    expect(Object.keys(a)).toEqual(['prova_concluida', 'objetivo_batido']);
    expect(a.prova_concluida.detail).toBe('1.ª prova');
    expect(a.prova_concluida.raceId).toBe('r1');
    expect(a.prova_concluida.raceName).toBe('Meia de Lisboa');
    expect(a.prova_concluida.date).toBe('2026-09-10');
  });

  it('marca como nova porque a prova foi há menos de 7 dias', () => {
    expect(a.prova_concluida.isNew).toBe(true);
  });

  it('dá o objetivo batido com o tempo e o objetivo', () => {
    expect(a.objetivo_batido.detail).toBe('Meia de Lisboa, 1:53:42 (objetivo 1:55:00)');
  });

  it('não inventa recorde pessoal sem prova anterior na mesma distância', () => {
    expect(missedInRace(dados, 'r1').map((x) => x.key)).toEqual(['recorde_pessoal']);
  });

  it('uma prova só não faz sequência', () => {
    expect(a.sequencia).toBeUndefined();
  });

  it('uma prova que não existe, ou sem id, não dá nada', () => {
    expect(achievementsForRace(dados, 'outra')).toEqual([]);
    expect(achievementsForRace(dados, null)).toEqual([]);
  });
});

describe('"nova" pela data do registo', () => {
  const race = meia({ id: 'r1', name: 'Meia de Lisboa', date: '2026-08-20', target_time_seconds: 6900 });
  it('uma prova de há três semanas registada ontem ainda é nova; registada há dez dias já não', () => {
    const ontem = corrida({ id: 'run1', race_id: 'r1', date: '2026-08-20', duration_seconds: 6822, details: { official_time_seconds: 6822 }, created_at: '2026-09-11T20:15:00Z' });
    const dados = { raceEvents: [race], runs: [...TREINOS, ontem], profile: PROFILE, today: HOJE };
    expect(achievementsForRace(dados, 'r1').every((a) => a.isNew)).toBe(true);
    const antiga = { ...ontem, created_at: '2026-09-01T10:00:00Z' };
    expect(achievementsForRace({ ...dados, runs: [...TREINOS, antiga] }, 'r1').every((a) => a.isNew)).toBe(false);
    // sem created_at vale a data da prova (há mais de 7 dias → não é nova)
    const semData = { ...ontem, created_at: undefined };
    expect(achievementsForRace({ ...dados, runs: [...TREINOS, semData] }, 'r1').every((a) => a.isNew)).toBe(false);
  });
});

describe('recorde pessoal e sequência', () => {
  const antiga = meia({ id: 'r0', name: 'Meia do Estoril', date: '2026-05-10' });
  const nova = meia({ id: 'r1', name: 'Meia de Lisboa', date: '2026-09-10' });
  const runs = [
    ...TREINOS,
    corrida({ id: 'run0', race_id: 'r0', date: '2026-05-10', duration_seconds: 7066, details: { official_time_seconds: 7066 } }),
    corrida({ id: 'run1', race_id: 'r1', date: '2026-09-10', duration_seconds: 6822, details: { official_time_seconds: 6822 } }),
  ];
  const dados = { raceEvents: [antiga, nova], runs, profile: PROFILE, today: HOJE };

  it('a mais recente dá o recorde, com a categoria, o tempo e a diferença', () => {
    const a = byKey(achievementsForRace(dados, 'r1'));
    expect(a.recorde_pessoal.detail).toBe('Meia: 1:53:42, 4:04 abaixo do anterior');
  });

  it('cada prova avalia-se nela própria: a antiga é a 1.ª e não faz sequência, a nova é a 2.ª, com recorde e sequência', () => {
    expect(achievementsForRace(dados, 'r0').map((x) => `${x.key}:${x.detail}`)).toEqual(['prova_concluida:1.ª prova']);
    expect(achievementsForRace(dados, 'r0')[0].isNew).toBe(false);
    expect(achievementsForRace(dados, 'r1').map((x) => x.key)).toEqual(['prova_concluida', 'recorde_pessoal', 'sequencia']);
    expect(byKey(achievementsForRace(dados, 'r1')).sequencia.detail).toBe('2 provas seguidas');
  });

  it('completedRaces devolve da mais recente para a mais antiga', () => {
    const feitas = completedRaces({ raceEvents: [antiga, nova], runs, profile: PROFILE, today: HOJE });
    expect(feitas.map((f) => f.race.id)).toEqual(['r1', 'r0']);
    expect(feitas[0].outcome.officialSeconds).toBe(6822);
  });
});

describe('duas provas com objetivo batido têm-no as duas', () => {
  const antiga = meia({ id: 'r0', name: 'Meia do Estoril', date: '2026-05-10', target_time_seconds: 7200 });
  const nova = meia({ id: 'r1', name: 'Meia de Lisboa', date: '2026-09-10', target_time_seconds: 6900 });
  const runs = [
    ...TREINOS,
    corrida({ id: 'run0', race_id: 'r0', date: '2026-05-10', duration_seconds: 7066, details: { official_time_seconds: 7066 } }),
    corrida({ id: 'run1', race_id: 'r1', date: '2026-09-10', duration_seconds: 6822, details: { official_time_seconds: 6822 } }),
  ];
  const dados = { raceEvents: [antiga, nova], runs, profile: PROFILE, today: HOJE };

  it('a antiga não perde o objetivo por a nova também o ter batido', () => {
    expect(achievementsForRace(dados, 'r0').map((x) => x.key)).toEqual(['prova_concluida', 'objetivo_batido']);
    expect(missedInRace(dados, 'r0').map((x) => x.key)).toEqual(['recorde_pessoal']);
    expect(achievementsForRace(dados, 'r1').map((x) => x.key)).toEqual(['prova_concluida', 'objetivo_batido', 'recorde_pessoal', 'sequencia']);
    expect(missedInRace(dados, 'r1')).toEqual([]);
  });
});

/* A sequência é a mesma lei da medalha d'A Sequência: o que se ganhou não se
   perde. Antes, o elo de cada prova saía da sequência que chega a HOJE — e
   uma prova antiga perdia o "2 provas seguidas" por causa de uma prova
   posterior que ficou por registar. */
describe('a sequência quebra-se para a frente, não para trás', () => {
  const r0 = meia({ id: 'r0', name: 'Meia do Estoril', date: '2026-05-10' });
  const r1 = meia({ id: 'r1', name: 'Meia do Tejo', date: '2026-06-20' });
  // Passou, não foi registada: corta a sequência a partir daqui.
  const r2 = { id: 'r2', name: 'Corrida da Serra', date: '2026-07-20', distance_km: 10, race_type: 'estrada', status: 'agendada' };
  const r3 = meia({ id: 'r3', name: 'Meia de Lisboa', date: '2026-09-10' });
  const runs = [
    ...TREINOS,
    corrida({ id: 'run0', race_id: 'r0', date: '2026-05-10', duration_seconds: 7400, details: { official_time_seconds: 7400 } }),
    corrida({ id: 'run1', race_id: 'r1', date: '2026-06-20', duration_seconds: 7200, details: { official_time_seconds: 7200 } }),
    corrida({ id: 'run3', race_id: 'r3', date: '2026-09-10', duration_seconds: 6822, details: { official_time_seconds: 6822 } }),
  ];
  const dados = { raceEvents: [r0, r1, r2, r3], runs, profile: PROFILE, today: HOJE };

  it('a prova que foi a 2.ª seguida guarda o seu elo', () => {
    expect(byKey(achievementsForRace(dados, 'r1')).sequencia.detail).toBe('2 provas seguidas');
  });

  it('a prova depois do corte recomeça do primeiro elo, e um elo só não é conquista', () => {
    expect(byKey(achievementsForRace(dados, 'r3')).sequencia).toBeUndefined();
  });

  it('mas as provas registadas continuam a contar para o total', () => {
    expect(byKey(achievementsForRace(dados, 'r3')).prova_concluida.detail).toBe('3.ª prova');
  });
});

describe('trail', () => {
  const trailAntigo = { id: 't-old', name: 'Trail dos Moinhos', date: '2026-03-08', distance_km: 15, race_type: 'trail', status: 'concluida' };
  const trailNovo = { id: 't-new', name: 'Trail da Serra', date: '2026-09-10', distance_km: 18, race_type: 'trail', status: 'concluida' };
  const runs = [
    ...TREINOS,
    { id: 'run-old', kind: 'competicao', race_id: 't-old', date: '2026-03-08', distance_km: 15, duration_seconds: 6600, details: { official_time_seconds: 6600 } },
    { id: 'run-new', kind: 'competicao', race_id: 't-new', date: '2026-09-10', distance_km: 18, duration_seconds: 7800, details: { official_time_seconds: 7800 } },
  ];
  const dados = { raceEvents: [trailAntigo, trailNovo], runs, profile: PROFILE, today: HOJE };

  it('a "primeira de trail" é a primeira por data, não a mais recente', () => {
    const a = byKey(achievementsForRace(dados, 't-old'));
    expect(a.primeira_trail.detail).toBe('Trail dos Moinhos, 1:50:00');
    // e já não é nova — foi há mais de 7 dias
    expect(a.primeira_trail.isNew).toBe(false);
    expect(byKey(achievementsForRace(dados, 't-new')).primeira_trail).toBeUndefined();
  });
});

describe('o que não conta como prova feita', () => {
  const race = meia({ id: 'r1', name: 'Meia de Lisboa', date: '2026-09-10', target_time_seconds: 6900 });

  it('marcar "concluída" na agenda sem registo não dá conquista nenhuma', () => {
    expect(achievementsForRace({ raceEvents: [race], runs: TREINOS, profile: PROFILE, today: HOJE }, 'r1')).toEqual([]);
    expect(completedRaces({ raceEvents: [race], runs: TREINOS, profile: PROFILE, today: HOJE })).toEqual([]);
  });

  /* A divergência que a fusão dos motores veio fechar: `completedRaces` não
     filtrava datas futuras e `computeMedalhoes` filtrava — uma prova marcada
     concluída com data à frente contava num motor e não no outro. */
  it('uma prova concluída com data no futuro ainda não aconteceu', () => {
    const futura = meia({ id: 'r9', name: 'Meia de Outubro', date: '2026-10-04' });
    const run = corrida({ id: 'run9', race_id: 'r9', date: '2026-10-04', duration_seconds: 6822, details: { official_time_seconds: 6822 } });
    const dados = { raceEvents: [race, futura], runs: [...TREINOS, run], profile: PROFILE, today: HOJE };
    expect(completedRaces(dados).map((f) => f.race.id)).toEqual([]);
    expect(achievementsForRace(dados, 'r9')).toEqual([]);
  });

  it('sem o dia de hoje injetado, o motor recusa-se a adivinhar', () => {
    expect(() => achievementsForRace({ raceEvents: [race], runs: TREINOS, profile: PROFILE }, 'r1')).toThrow(/today/);
    expect(() => completedRaces({ raceEvents: [race], runs: TREINOS, profile: PROFILE })).toThrow(/today/);
  });
});

describe('missedInRace / describeMissedInRace — o que ficou para a próxima', () => {
  const antiga = meia({ id: 'r0', name: 'Meia do Estoril', date: '2026-05-10', target_time_seconds: 7200 });
  const nova = meia({ id: 'r1', name: 'Meia de Lisboa', date: '2026-09-10', target_time_seconds: 6900 });
  const runs = [
    ...TREINOS,
    // A do Estoril foi mais rápida (6938): Lisboa não bate recorde nenhum.
    corrida({ id: 'run0', race_id: 'r0', date: '2026-05-10', duration_seconds: 6938, details: { official_time_seconds: 6938 } }),
    corrida({ id: 'run1', race_id: 'r1', date: '2026-09-10', duration_seconds: 7002, details: { official_time_seconds: 7002 } }),
  ];
  const dados = { raceEvents: [antiga, nova], runs, profile: PROFILE, today: HOJE };

  it('uma conquista dada por OUTRA prova conta como não dada nesta', () => {
    // O objetivo foi batido na do Estoril (6938 < 7200), não em Lisboa.
    expect(missedInRace(dados, 'r1').map((x) => x.key)).toEqual(['objetivo_batido', 'recorde_pessoal']);
    expect(missedInRace(dados, 'r0').map((x) => x.key)).toEqual(['recorde_pessoal']);
  });

  it('a linha diz de quanto foi, com o número', () => {
    const outcome = completedRaces({ raceEvents: [antiga, nova], runs, profile: PROFILE, today: HOJE })[0].outcome;
    const [objetivo, recorde] = missedInRace(dados, 'r1');
    expect(describeMissedInRace(objetivo, outcome)).toBe('Objetivo batido fica para a próxima: ficaste a 1:42');
    expect(describeMissedInRace(recorde, outcome)).toBe('Recorde pessoal fica para a próxima: 1:04 acima do teu melhor na meia');
  });

  it('sem objetivo marcado e sem histórico, diz o que falta em vez de um número', () => {
    const semNada = meia({ id: 'r9', name: 'Meia Solta', date: '2026-09-10' });
    const run = corrida({ id: 'run9', race_id: 'r9', date: '2026-09-10', duration_seconds: 7002, details: { official_time_seconds: 7002 } });
    const soltos = { raceEvents: [semNada], runs: [...TREINOS, run], profile: PROFILE, today: HOJE };
    const outcome = completedRaces(soltos)[0].outcome;
    const perdidas = missedInRace(soltos, 'r9');
    expect(describeMissedInRace(perdidas[0], outcome)).toBe('Objetivo batido fica para a próxima: esta prova não tinha objetivo marcado');
    expect(describeMissedInRace(perdidas[1], outcome)).toBe('Recorde pessoal fica para a próxima: precisa de duas provas na mesma distância');
  });
});

/* "Acima do treino" (pedido 2026-09-20: os tempos objetivo/previsão/real
   "poderão ser tema interessante para prémios"). É a única conquista sem par
   nos medalhões: não precisa de objetivo marcado nem de histórico na
   distância — só de ter corrido além do que as corridas anteriores faziam
   esperar. A fusão dos motores preservou-a tal e qual. */
describe('acima do que o treino previa', () => {
  const TREINO_LENTO = [
    { id: 'l1', date: '2026-08-01', distance_km: 10, duration_seconds: 3600, kind: 'treino' },
    { id: 'l2', date: '2026-08-20', distance_km: 14, duration_seconds: 5100, kind: 'treino' },
  ];

  it('a prova que a deu mostra-a no seu próprio palmarés, com os dois tempos e sem objetivo marcado', () => {
    // Treino a 6:00/km numa 10 km; a meia corrida em 1:40 está muito
    // abaixo do que Riegel extrapolava desse treino.
    const race = meia({ id: 'r1', name: 'Meia Rápida', date: '2026-09-06', target_time: null, target_time_seconds: null });
    const run = corrida({ id: 'c1', race_id: 'r1', date: '2026-09-06', duration_seconds: 6000, created_at: '2026-09-06T12:00:00Z' });
    const daProva = byKey(achievementsForRace({ raceEvents: [race], runs: [...TREINO_LENTO, run], profile: PROFILE, today: HOJE }, 'r1'));

    expect(daProva.acima_do_treino).toBeTruthy();
    expect(daProva.acima_do_treino.detail).toContain('1:40:00');
    expect(daProva.acima_do_treino.detail).toMatch(/do que o treino previa \(\d/);
    // O objetivo não existe — e mesmo assim a prova foi premiada.
    expect(daProva.objetivo_batido).toBeUndefined();
  });

  it('não desbloqueia quando a prova fica dentro do que o treino previa, e não entra nas perdidas', () => {
    const race = meia({ id: 'r2', name: 'Meia Certinha', date: '2026-09-06' });
    // 2:15:00 — na banda do que este treino lento perspetivava.
    const run = corrida({ id: 'c2', race_id: 'r2', date: '2026-09-06', duration_seconds: 8100, created_at: '2026-09-06T12:00:00Z' });
    const dados = { raceEvents: [race], runs: [...TREINO_LENTO, run], profile: PROFILE, today: HOJE };

    expect(byKey(achievementsForRace(dados, 'r2')).acima_do_treino).toBeUndefined();
    expect(missedInRace(dados, 'r2').map((a) => a.key)).not.toContain('acima_do_treino');
  });
});
