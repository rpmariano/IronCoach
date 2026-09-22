import { describe, it, expect } from 'vitest';
import { computeBadges, BADGE_KEYS, segundaDe } from './badges';

/* Os badges de treino (fase 2 da reforma da gamificação).

   O que estes testes guardam, por ordem de importância:

   1. a SESSÃO INDETERMINADA — uma corrida sem o campo que a regra exige não
      conta nem a favor nem contra, e isso tem de ser visível (é metade da
      razão de o motor existir);
   2. a LEI DA COR — âmbar só no badge que nasce de uma prova;
   3. o calendário dos badges semanais: uma semana só se julga depois de
      fechada, e o dia do prémio é a segunda seguinte;
   4. a forma do `due`, que é o que vai parar a `user_badges` para sempre. */

const PROFILE = { id: 'atleta', experience_level: 'medio' };
const HOJE = '2026-09-22'; // uma terça-feira

const compute = (over) => computeBadges({
  runs: [], raceEvents: [], planItems: [], gymSessions: [], profile: PROFILE, today: HOJE, ...over,
});

const bad = (r, key) => r.badges.find((b) => b.key === key);
const dueDe = (r, key) => r.due.filter((d) => d.badgeKey === key);
const estados = (b, status) => (b.sessoes || []).filter((s) => s.status === status);

const treino = (date, over = {}) => ({
  id: `run-${date}`, date, kind: 'treino', training_type: 'continuo',
  distance_km: 10, duration_seconds: 3600, details: {}, ...over,
});

const zonas = (z1, z2, z3) => ({ hr_zones: [{ zone: 1, minutes: z1 }, { zone: 2, minutes: z2 }, { zone: 3, minutes: z3 }] });

/** Parciais de 1 km: `tempos` em segundos, um por quilómetro. */
const splits = (tempos) => ({ splits: tempos.map((t) => ({ distance_km: 1, time_seconds: t })) });

describe('computeBadges — forma', () => {
  const r = compute();

  it('devolve os oito badges pela ordem fixa da grelha', () => {
    expect(r.badges.map((b) => b.key)).toEqual(BADGE_KEYS);
    expect(BADGE_KEYS).toHaveLength(8);
  });

  /* A regra da casa: o relógio entra sempre, nunca se lê o real. */
  it('sem o dia de hoje, recusa-se a adivinhar', () => {
    expect(() => computeBadges({ runs: [], raceEvents: [] })).toThrow(/today/);
  });

  it('sem dados: tudo por ganhar e nada devido', () => {
    expect(r.badges.every((b) => b.state === 'empty')).toBe(true);
    expect(r.due).toEqual([]);
    expect(r.badges.every((b) => b.rule.length > 20)).toBe(true);
  });

  /* Cada badge tem de dizer de que dado vive e o que fazer quando ele falta:
     é o contrato desta fase, e é o que o ecrã de detalhe mostra. */
  it('cada badge declara o campo de que depende e o caminho para o resolver', () => {
    for (const b of r.badges) {
      expect(b.campo, b.key).toBeTruthy();
      expect(b.campoLabel, b.key).toBeTruthy();
      expect(b.dependeDe, b.key).toMatch(/^Precisa/);
      expect(b.comoResolver, b.key).toBeTruthy();
    }
  });

  /* "Uma cor, um significado": âmbar (--race) SÓ no badge que nasce de uma
     prova. Nenhum badge de treino o pode usar. */
  it('a lei da cor: âmbar só no badge que nasce de uma prova', () => {
    expect(r.badges.filter((b) => b.cor === 'race').map((b) => b.key)).toEqual(['recorde_pessoal']);
    expect(r.badges.every((b) => ['run', 'ok', 'race'].includes(b.cor))).toBe(true);
  });

  it('a competição não é treino: não entra em nenhum badge de treino', () => {
    const prova = treino('2026-09-01', { id: 'run-prova', kind: 'competicao', details: { elevation_gain_m: 900 } });
    const comProva = compute({ runs: [prova] });
    expect(bad(comProva, 'escalada').value).toBe(0);
    expect(bad(comProva, 'escalada').sessoes).toHaveLength(0);
  });
});

describe('Mestre da Z2 — o treino sem zonas fica indeterminado', () => {
  it('90% ou mais do tempo em Z1-Z2 ganha o badge, e o `due` guarda a percentagem', () => {
    const r = compute({ runs: [treino('2026-09-10', { details: zonas(20, 40, 0) })] });
    const b = bad(r, 'z2_mestre');
    expect(b.state).toBe('won');
    expect(b.centro).toBe('100');
    expect(b.count).toBe(1);

    const due = dueDe(r, 'z2_mestre');
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      badgeKey: 'z2_mestre', tier: '', periodKey: 'run-2026-09-10',
      value: 100, valueUnit: 'pct', raceId: null, awardedOn: '2026-09-10',
    });
  });

  it('abaixo do alvo, o número cinzento diz quanto faltou', () => {
    const r = compute({ runs: [treino('2026-09-10', { details: zonas(10, 20, 30) })] });
    const b = bad(r, 'z2_mestre');
    expect(b.state).toBe('empty');
    expect(b.centro).toBe('+40'); // 50% em Z1-Z2, alvo 90
    expect(estados(b, 'falhou')).toHaveLength(1);
  });

  /* O ponto crítico: sem `hr_zones` não se sabe nada, e um badge que ficasse
     por ganhar em silêncio era o que este comportamento existe para evitar. */
  it('sem hr_zones: a sessão não conta nem a favor nem contra, e o ecrã sabe dizê-lo', () => {
    const r = compute({ runs: [treino('2026-09-10')] });
    const b = bad(r, 'z2_mestre');
    expect(b.state).toBe('empty');
    expect(estados(b, 'conta')).toHaveLength(0);
    expect(estados(b, 'falhou')).toHaveLength(0);
    expect(estados(b, 'indeterminada')).toHaveLength(1);
    expect(b.indeterminadas.n).toBe(1);
    expect(b.indeterminadas.frase).toContain('zonas de frequência cardíaca');
    expect(b.indeterminadas.comoResolver).toMatch(/minutos por zona/);
    expect(r.due).toEqual([]);
  });

  it('um treino curto não é sequer candidato — não aparece como indeterminado', () => {
    const r = compute({ runs: [treino('2026-09-10', { duration_seconds: 1500 })] });
    expect(bad(r, 'z2_mestre').sessoes).toHaveLength(0);
    expect(bad(r, 'z2_mestre').indeterminadas).toBeNull();
  });
});

describe('Negative split', () => {
  const rapidaNoFim = splits([300, 300, 300, 300, 280, 280, 280, 280]);
  const lentaNoFim = splits([280, 280, 280, 280, 300, 300, 300, 300]);

  it('segunda metade mais rápida ganha o badge', () => {
    const r = compute({ runs: [treino('2026-09-12', { distance_km: 8, details: rapidaNoFim })] });
    const b = bad(r, 'negative_split');
    expect(b.state).toBe('won');
    expect(b.centro).toBe('7%');
    expect(dueDe(r, 'negative_split')[0].valueUnit).toBe('pct');
  });

  it('segunda metade mais lenta fica por ganhar, com a melhor tentativa à vista', () => {
    const r = compute({ runs: [treino('2026-09-12', { distance_km: 8, details: lentaNoFim })] });
    const b = bad(r, 'negative_split');
    expect(b.state).toBe('empty');
    expect(b.linha).toContain('mais lenta');
  });

  it('sem parciais, a corrida fica indeterminada', () => {
    const r = compute({ runs: [treino('2026-09-12', { distance_km: 12 })] });
    expect(bad(r, 'negative_split').indeterminadas.n).toBe(1);
  });
});

describe('Cabra-montesa e A Escalada — o D+ que falta não conta contra', () => {
  it('50 m/km ou mais num treino de 8 km ganha a Cabra-montesa', () => {
    const r = compute({ runs: [treino('2026-09-05', { distance_km: 10, details: { elevation_gain_m: 600 } })] });
    const b = bad(r, 'cabra_montesa');
    expect(b.state).toBe('won');
    expect(b.centro).toBe('60');
    expect(b.cor).toBe('run');
    expect(dueDe(r, 'cabra_montesa')[0].valueUnit).toBe('metros');
  });

  it('A Escalada sobe de nível no dia em que o acumulado passa o limiar', () => {
    const runs = [
      treino('2026-05-01', { details: { elevation_gain_m: 4000 } }),
      treino('2026-06-01', { details: { elevation_gain_m: 4000 } }),
      treino('2026-07-01', { details: { elevation_gain_m: 4000 } }),
    ];
    const r = compute({ runs });
    const b = bad(r, 'escalada');
    expect(b.state).toBe('won');
    expect(b.tier).toBe('bronze');
    expect(b.centro).toBe('12k');
    expect(b.linha).toContain('prata');

    const due = dueDe(r, 'escalada');
    expect(due).toHaveLength(1);
    // O dia do prémio é aquele em que o acumulado passou os 10 000 m.
    expect(due[0]).toMatchObject({ tier: 'bronze', periodKey: '', awardedOn: '2026-07-01', value: 12000 });
  });

  it('a caminho do bronze mostra o acumulado, e as corridas sem D+ ficam à parte', () => {
    const r = compute({
      runs: [
        treino('2026-05-01', { details: { elevation_gain_m: 5000 } }),
        treino('2026-06-01'),
      ],
    });
    const b = bad(r, 'escalada');
    expect(b.state).toBe('progress');
    expect(b.centro).toBe('5k');
    expect(b.ring).toBeCloseTo(0.5, 2);
    expect(b.indeterminadas.n).toBe(1);
    expect(b.indeterminadas.frase).toContain('desnível positivo');
  });
});

describe('Coruja — a hora que falta', () => {
  const noite = (date) => treino(date, { start_time: '21:30:00' });

  it('cinco treinos noturnos dão bronze', () => {
    const runs = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'].map(noite);
    const b = bad(compute({ runs }), 'coruja');
    expect(b.state).toBe('won');
    expect(b.tier).toBe('bronze');
    expect(b.centro).toBe('5');
  });

  it('a caminho mostra o corrente sobre o alvo', () => {
    const runs = ['2026-09-01', '2026-09-02'].map(noite);
    const b = bad(compute({ runs }), 'coruja');
    expect(b.state).toBe('progress');
    expect(b.centro).toBe('2/5');
  });

  it('uma corrida de madrugada conta; uma sem hora fica indeterminada', () => {
    const r = compute({
      runs: [
        treino('2026-09-01', { start_time: '05:30' }),
        treino('2026-09-02', { start_time: '10:00' }),
        treino('2026-09-03'),
      ],
    });
    const b = bad(r, 'coruja');
    expect(estados(b, 'conta')).toHaveLength(1);
    expect(estados(b, 'falhou')).toHaveLength(1);
    expect(estados(b, 'indeterminada')).toHaveLength(1);
    expect(b.indeterminadas.comoResolver).toMatch(/hora/);
  });
});

describe('Os badges semanais — o plano da Carol', () => {
  // A semana de 7 a 13 de setembro, já fechada a 22.
  const SEGUNDA = '2026-09-07';
  const item = (date, over = {}) => ({
    id: `item-${date}-${over.kind || 'corrida'}`, plan_id: 'plano-1', planned_date: date,
    kind: 'corrida', target_distance_km: 10, status: 'pendente', ...over,
  });

  it('a segunda-feira de um dia qualquer', () => {
    expect(segundaDe('2026-09-13')).toBe(SEGUNDA); // domingo
    expect(segundaDe('2026-09-07')).toBe(SEGUNDA); // a própria segunda
  });

  it('semana inteira cumprida: badge ganho, premiado na segunda seguinte', () => {
    const r = compute({
      planItems: [item('2026-09-08'), item('2026-09-10')],
      runs: [treino('2026-09-08'), treino('2026-09-10')],
    });
    const b = bad(r, 'semana_100');
    expect(b.state).toBe('won');
    expect(b.centro).toBe('1');
    expect(b.cor).toBe('ok');

    const due = dueDe(r, 'semana_100');
    expect(due[0]).toMatchObject({ periodKey: SEGUNDA, value: 100, valueUnit: 'pct', awardedOn: '2026-09-14' });
  });

  it('um treino por fazer: a semana não conta, e diz-se a quanto ficou', () => {
    const r = compute({
      planItems: [item('2026-09-08'), item('2026-09-10')],
      runs: [treino('2026-09-08')],
    });
    const b = bad(r, 'semana_100');
    expect(b.state).toBe('empty');
    expect(b.centro).toBe('+50');
    expect(r.due.filter((d) => d.badgeKey === 'semana_100')).toEqual([]);
  });

  it('a semana em curso ainda não se julga: mostra-se como "a caminho"', () => {
    // 21 e 22 de setembro: a semana de 21 ainda está a decorrer.
    const r = compute({
      planItems: [item('2026-09-21'), item('2026-09-23')],
      runs: [treino('2026-09-21')],
    });
    const b = bad(r, 'semana_100');
    expect(b.state).toBe('progress');
    expect(b.centro).toBe('100/100');
    expect(r.due.filter((d) => d.badgeKey === 'semana_100')).toEqual([]);
  });

  it('Descanso cumprido: os dias de descanso respeitados numa semana fechada', () => {
    const r = compute({
      planItems: [
        item('2026-09-08'),
        item('2026-09-09', { kind: 'descanso', target_distance_km: null }),
        item('2026-09-11', { kind: 'descanso', target_distance_km: null }),
      ],
      runs: [treino('2026-09-08')],
    });
    const b = bad(r, 'descanso_cumprido');
    expect(b.state).toBe('won');
    expect(b.cor).toBe('ok');
    expect(dueDe(r, 'descanso_cumprido')[0]).toMatchObject({ periodKey: SEGUNDA, value: 2, valueUnit: 'count' });
  });

  it('treinar no dia de descanso deita a semana abaixo', () => {
    const r = compute({
      planItems: [
        item('2026-09-08'),
        item('2026-09-09', { kind: 'descanso', target_distance_km: null }),
      ],
      runs: [treino('2026-09-08'), treino('2026-09-09')],
    });
    const b = bad(r, 'descanso_cumprido');
    expect(b.state).toBe('empty');
    expect(estados(b, 'falhou')).toHaveLength(1);
  });
});

describe('Recorde pessoal — o único âmbar', () => {
  const prova = (id, date, seconds, over = {}) => ({
    race: { id, name: `Prova ${id}`, date, distance_km: 10, status: 'concluida', race_type: 'estrada', ...over },
    run: {
      id: `run-${id}`, date, kind: 'competicao', race_id: id, distance_km: 10,
      duration_seconds: seconds, details: { official_time_seconds: seconds },
    },
  });

  const cenario = (lista) => ({
    raceEvents: lista.map((p) => p.race),
    runs: lista.map((p) => p.run),
  });

  it('bater o melhor de sempre na mesma distância ganha o badge, com a prova no `due`', () => {
    const r = compute(cenario([prova('p1', '2026-03-01', 3000), prova('p2', '2026-06-01', 2900)]));
    const b = bad(r, 'recorde_pessoal');
    expect(b.state).toBe('won');
    expect(b.cor).toBe('race');
    expect(b.count).toBe(1);

    const due = dueDe(r, 'recorde_pessoal');
    expect(due[0]).toMatchObject({ periodKey: 'p2', raceId: 'p2', value: 2900, valueUnit: 'seconds', awardedOn: '2026-06-01' });
  });

  it('sem tempo oficial, a prova fica indeterminada', () => {
    const p = prova('p1', '2026-03-01', 3000);
    delete p.run.details;
    p.run.duration_seconds = null;
    const r = compute(cenario([p]));
    const b = bad(r, 'recorde_pessoal');
    expect(b.indeterminadas.n).toBe(1);
    expect(b.indeterminadas.frase).toContain('tempo oficial');
  });

  it('a prova mais perto do recorde diz a quanto ficou', () => {
    const r = compute(cenario([prova('p1', '2026-03-01', 2900), prova('p2', '2026-06-01', 2942)]));
    const b = bad(r, 'recorde_pessoal');
    expect(b.state).toBe('empty');
    expect(b.centro).toBe('+42s');
  });
});
