import { describe, it, expect } from 'vitest';
import { computeAchievements, achievementsForRace, missedInRace, completedRaces } from './achievements';

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

  it('achievementsForRace devolve só as desta prova', () => {
    const desta = achievementsForRace(lista, 'r1');
    expect(desta.map((x) => x.key)).toEqual(['prova_concluida', 'objetivo_batido']);
    expect(achievementsForRace(lista, 'outra')).toEqual([]);
  });

  it('missedInRace devolve o que esta prova ainda podia ter dado', () => {
    expect(missedInRace(lista, 'r1').map((x) => x.key)).toEqual(['recorde_pessoal']);
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
