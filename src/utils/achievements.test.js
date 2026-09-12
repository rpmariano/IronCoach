import { describe, it, expect } from 'vitest';
import { computeAchievements, achievementsForRace, missedInRace, describeMissedInRace, completedRaces } from './achievements';

/* O Palmarés (specs/gamificacao-provas.md). O que estes testes guardam é
   sobretudo a régua: uma prova só conta quando está concluída E tem corrida
   ligada, e "objetivo batido"/"recorde pessoal" saem do raceOutcome — não de
   uma comparação escrita outra vez aqui. */

const AGORA = new Date('2026-09-12T10:00:00');
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

describe('computeAchievements — sem provas', () => {
  const lista = computeAchievements({ raceEvents: [], runs: [], profile: PROFILE, now: AGORA });

  it('devolve sempre as cinco, pela mesma ordem', () => {
    expect(lista.map((a) => a.key)).toEqual([
      'prova_concluida', 'objetivo_batido', 'recorde_pessoal', 'primeira_trail', 'sequencia',
    ]);
    expect(lista.every((a) => a.unlocked === false)).toBe(true);
  });

  it('bloqueada diz o que falta, não o que falhou', () => {
    const a = byKey(lista);
    expect(a.prova_concluida.detail).toBe('Regista a tua primeira prova');
    expect(a.objetivo_batido.detail).toBe('Marca um objetivo e bate-o');
    expect(a.recorde_pessoal.detail).toBe('Precisa de duas provas na mesma distância');
    expect(a.primeira_trail.detail).toBe('Ainda sem trail concluído');
    expect(a.sequencia.detail).toBe('Duas provas seguidas registadas');
  });
});

describe('computeAchievements — uma prova concluída', () => {
  const race = meia({ id: 'r1', name: 'Meia de Lisboa', date: '2026-09-10', target_time_seconds: 6900 });
  const run = corrida({ id: 'run1', race_id: 'r1', date: '2026-09-10', duration_seconds: 6822, details: { official_time_seconds: 6822 } });
  const lista = computeAchievements({ raceEvents: [race], runs: [...TREINOS, run], profile: PROFILE, now: AGORA });
  const a = byKey(lista);

  it('conta a prova e diz o ordinal', () => {
    expect(a.prova_concluida.unlocked).toBe(true);
    expect(a.prova_concluida.detail).toBe('1.ª prova');
    expect(a.prova_concluida.raceId).toBe('r1');
    expect(a.prova_concluida.raceName).toBe('Meia de Lisboa');
    expect(a.prova_concluida.date).toBe('2026-09-10');
  });

  it('marca como nova porque a prova foi há menos de 7 dias', () => {
    expect(a.prova_concluida.isNew).toBe(true);
  });

  it('dá o objetivo batido com o tempo e o objetivo', () => {
    expect(a.objetivo_batido.unlocked).toBe(true);
    expect(a.objetivo_batido.detail).toBe('Meia de Lisboa, 1:53:42 (objetivo 1:55:00)');
  });

  it('não inventa recorde pessoal sem prova anterior na mesma distância', () => {
    expect(a.recorde_pessoal.unlocked).toBe(false);
    expect(a.recorde_pessoal.detail).toBe('Precisa de duas provas na mesma distância');
  });

  it('uma prova só não faz sequência', () => {
    expect(a.sequencia.unlocked).toBe(false);
  });

  const dados = { raceEvents: [race], runs: [...TREINOS, run], profile: PROFILE, now: AGORA };

  it('achievementsForRace devolve só as desta prova', () => {
    const desta = achievementsForRace(dados, 'r1');
    expect(desta.map((x) => x.key)).toEqual(['prova_concluida', 'objetivo_batido']);
    expect(desta[0].detail).toBe('1.ª prova');
    expect(desta.every((x) => x.unlocked && x.isNew && x.raceId === 'r1')).toBe(true);
    expect(achievementsForRace(dados, 'outra')).toEqual([]);
    expect(achievementsForRace(dados, null)).toEqual([]);
  });

  it('missedInRace devolve o que esta prova ainda podia ter dado', () => {
    expect(missedInRace(dados, 'r1').map((x) => x.key)).toEqual(['recorde_pessoal']);
  });
});

describe('computeAchievements — o objetivo que ficou por bater', () => {
  const race = meia({ id: 'r1', name: 'Meia de Lisboa', date: '2026-09-10', target_time_seconds: 6900 });
  // 6900 + 102 = 7002 → ficou a 1:42 do objetivo.
  const run = corrida({ id: 'run1', race_id: 'r1', date: '2026-09-10', duration_seconds: 7002, details: { official_time_seconds: 7002 } });
  const a = byKey(computeAchievements({ raceEvents: [race], runs: [...TREINOS, run], profile: PROFILE, now: AGORA }));

  it('a frase bloqueada diz de quanto foi, e em que prova', () => {
    expect(a.objetivo_batido.unlocked).toBe(false);
    expect(a.objetivo_batido.detail).toBe('Ficaste a 1:42 na Meia de Lisboa');
  });
});

describe('computeAchievements — recorde pessoal', () => {
  const antiga = meia({ id: 'r0', name: 'Meia do Estoril', date: '2026-05-10' });
  const nova = meia({ id: 'r1', name: 'Meia de Lisboa', date: '2026-09-10' });
  const runs = [
    ...TREINOS,
    corrida({ id: 'run0', race_id: 'r0', date: '2026-05-10', duration_seconds: 7066, details: { official_time_seconds: 7066 } }),
    corrida({ id: 'run1', race_id: 'r1', date: '2026-09-10', duration_seconds: 6822, details: { official_time_seconds: 6822 } }),
  ];
  const lista = computeAchievements({ raceEvents: [antiga, nova], runs, profile: PROFILE, now: AGORA });
  const a = byKey(lista);

  it('desbloqueia com a categoria, o tempo e a diferença', () => {
    expect(a.recorde_pessoal.unlocked).toBe(true);
    expect(a.recorde_pessoal.raceId).toBe('r1');
    expect(a.recorde_pessoal.detail).toBe('Meia: 1:53:42, 4:04 abaixo do anterior');
  });

  it('a contagem de provas conta as duas', () => {
    expect(a.prova_concluida.detail).toBe('2.ª prova');
  });

  it('duas provas seguidas registadas fazem sequência', () => {
    expect(a.sequencia.unlocked).toBe(true);
    expect(a.sequencia.detail).toBe('2 provas seguidas');
    expect(a.sequencia.raceId).toBe('r1');
  });

  it('completedRaces devolve da mais recente para a mais antiga', () => {
    const feitas = completedRaces({ raceEvents: [antiga, nova], runs, profile: PROFILE });
    expect(feitas.map((f) => f.race.id)).toEqual(['r1', 'r0']);
    expect(feitas[0].outcome.officialSeconds).toBe(6822);
  });

  it('cada prova avalia-se nela própria: a antiga é a 1.ª e não faz sequência, a nova é a 2.ª, com recorde e sequência', () => {
    const dados = { raceEvents: [antiga, nova], runs, profile: PROFILE, now: AGORA };
    expect(achievementsForRace(dados, 'r0').map((x) => `${x.key}:${x.detail}`)).toEqual(['prova_concluida:1.ª prova']);
    expect(achievementsForRace(dados, 'r0')[0].isNew).toBe(false);
    expect(achievementsForRace(dados, 'r1').map((x) => x.key)).toEqual(['prova_concluida', 'recorde_pessoal', 'sequencia']);
    expect(achievementsForRace(dados, 'r1').find((x) => x.key === 'sequencia').detail).toBe('2 provas seguidas');
  });
});

describe('achievementsForRace — duas provas com objetivo batido têm-no as duas', () => {
  const antiga = meia({ id: 'r0', name: 'Meia do Estoril', date: '2026-05-10', target_time_seconds: 7200 });
  const nova = meia({ id: 'r1', name: 'Meia de Lisboa', date: '2026-09-10', target_time_seconds: 6900 });
  const runs = [
    ...TREINOS,
    corrida({ id: 'run0', race_id: 'r0', date: '2026-05-10', duration_seconds: 7066, details: { official_time_seconds: 7066 } }),
    corrida({ id: 'run1', race_id: 'r1', date: '2026-09-10', duration_seconds: 6822, details: { official_time_seconds: 6822 } }),
  ];
  const dados = { raceEvents: [antiga, nova], runs, profile: PROFILE, now: AGORA };

  it('a antiga não perde o objetivo por a nova também o ter batido', () => {
    expect(achievementsForRace(dados, 'r0').map((x) => x.key)).toEqual(['prova_concluida', 'objetivo_batido']);
    expect(missedInRace(dados, 'r0').map((x) => x.key)).toEqual(['recorde_pessoal']);
    expect(achievementsForRace(dados, 'r1').map((x) => x.key)).toEqual(['prova_concluida', 'objetivo_batido', 'recorde_pessoal', 'sequencia']);
    expect(missedInRace(dados, 'r1')).toEqual([]);
  });

  it('o palmarés global continua a apontar para a mais recente', () => {
    expect(byKey(computeAchievements(dados)).objetivo_batido.raceId).toBe('r1');
  });
});

describe('computeAchievements — a sequência corta-se numa prova por registar', () => {
  const r0 = meia({ id: 'r0', name: 'Meia do Estoril', date: '2026-05-10' });
  // Passou, não foi registada: corta a sequência, mesmo estando as outras duas.
  const r1 = { id: 'r1', name: 'Corrida do Tejo', date: '2026-06-20', distance_km: 10, race_type: 'estrada', status: 'agendada' };
  const r2 = meia({ id: 'r2', name: 'Meia de Lisboa', date: '2026-09-10' });
  const runs = [
    ...TREINOS,
    corrida({ id: 'run0', race_id: 'r0', date: '2026-05-10', duration_seconds: 7066, details: { official_time_seconds: 7066 } }),
    corrida({ id: 'run2', race_id: 'r2', date: '2026-09-10', duration_seconds: 6822, details: { official_time_seconds: 6822 } }),
  ];
  const a = byKey(computeAchievements({ raceEvents: [r0, r1, r2], runs, profile: PROFILE, now: AGORA }));

  it('só a última conta, e uma não chega', () => {
    expect(a.sequencia.unlocked).toBe(false);
  });

  it('mas as provas registadas continuam a contar para o total', () => {
    expect(a.prova_concluida.detail).toBe('2.ª prova');
  });
});

describe('computeAchievements — trail e provas antigas', () => {
  const trailAntigo = { id: 't-old', name: 'Trail dos Moinhos', date: '2026-03-08', distance_km: 15, race_type: 'trail', status: 'concluida' };
  const trailNovo = { id: 't-new', name: 'Trail da Serra', date: '2026-09-10', distance_km: 18, race_type: 'trail', status: 'concluida' };
  const runs = [
    ...TREINOS,
    { id: 'run-old', kind: 'competicao', race_id: 't-old', date: '2026-03-08', distance_km: 15, duration_seconds: 6600, details: { official_time_seconds: 6600 } },
    { id: 'run-new', kind: 'competicao', race_id: 't-new', date: '2026-09-10', distance_km: 18, duration_seconds: 7800, details: { official_time_seconds: 7800 } },
  ];
  const a = byKey(computeAchievements({ raceEvents: [trailAntigo, trailNovo], runs, profile: PROFILE, now: AGORA }));

  it('a "primeira de trail" é a primeira por data, não a mais recente', () => {
    expect(a.primeira_trail.unlocked).toBe(true);
    expect(a.primeira_trail.raceId).toBe('t-old');
    expect(a.primeira_trail.detail).toBe('Trail dos Moinhos, 1:50:00');
  });

  it('e já não é nova — foi há mais de 7 dias', () => {
    expect(a.primeira_trail.isNew).toBe(false);
  });
});

describe('computeAchievements — concluída sem corrida ligada não conta', () => {
  const race = meia({ id: 'r1', name: 'Meia de Lisboa', date: '2026-09-10', target_time_seconds: 6900 });
  const a = byKey(computeAchievements({ raceEvents: [race], runs: TREINOS, profile: PROFILE, now: AGORA }));

  it('marcar "concluída" na agenda não dá conquista nenhuma', () => {
    expect(a.prova_concluida.unlocked).toBe(false);
    expect(a.objetivo_batido.unlocked).toBe(false);
    expect(completedRaces({ raceEvents: [race], runs: TREINOS, profile: PROFILE })).toEqual([]);
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
  const dados = { raceEvents: [antiga, nova], runs, profile: PROFILE, now: AGORA };
  const lista = computeAchievements(dados);

  it('uma conquista dada por OUTRA prova conta como não dada nesta', () => {
    // O objetivo foi batido na do Estoril (6938 < 7200), não em Lisboa.
    expect(byKey(lista).objetivo_batido.raceId).toBe('r0');
    expect(missedInRace(dados, 'r1').map((x) => x.key)).toEqual(['objetivo_batido', 'recorde_pessoal']);
    expect(missedInRace(dados, 'r0').map((x) => x.key)).toEqual(['recorde_pessoal']);
  });

  it('a linha diz de quanto foi, com o número', () => {
    const outcome = completedRaces({ raceEvents: [antiga, nova], runs, profile: PROFILE })[0].outcome;
    const [objetivo, recorde] = missedInRace(dados, 'r1');
    expect(describeMissedInRace(objetivo, outcome)).toBe('Objetivo batido fica para a próxima: ficaste a 1:42');
    expect(describeMissedInRace(recorde, outcome)).toBe('Recorde pessoal fica para a próxima: 1:04 acima do teu melhor na meia');
  });

  it('sem objetivo marcado e sem histórico, diz o que falta em vez de um número', () => {
    const semNada = meia({ id: 'r9', name: 'Meia Solta', date: '2026-09-10' });
    const run = corrida({ id: 'run9', race_id: 'r9', date: '2026-09-10', duration_seconds: 7002, details: { official_time_seconds: 7002 } });
    const outcome = completedRaces({ raceEvents: [semNada], runs: [...TREINOS, run], profile: PROFILE })[0].outcome;
    const perdidas = missedInRace({ raceEvents: [semNada], runs: [...TREINOS, run], profile: PROFILE, now: AGORA }, 'r9');
    expect(describeMissedInRace(perdidas[0], outcome)).toBe('Objetivo batido fica para a próxima: esta prova não tinha objetivo marcado');
    expect(describeMissedInRace(perdidas[1], outcome)).toBe('Recorde pessoal fica para a próxima: precisa de duas provas na mesma distância');
  });
});
