import { describe, it, expect } from 'vitest';
import { computeBadges, badgesForRace, BADGE_KEYS, FAMILIAS, FAMILIA_KEYS, segundaDe } from './badges';

/* Os badges de treino (fase 2 da reforma da gamificação).

   O que estes testes guardam, por ordem de importância:

   1. a SESSÃO INDETERMINADA — uma corrida sem o campo que a regra exige não
      conta nem a favor nem contra, e isso tem de ser visível (é metade da
      razão de o motor existir);
   2. a LEI DA COR — âmbar só no badge que nasce de uma prova, e prata
      (`neutro`) só nos amuletos;
   2b. a FAMÍLIA — é o que diz à Carol o que ela nunca pode sugerir
      (doutrina 6 #6), por isso não pode faltar a nenhum badge;
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

  it('devolve os vinte e três badges pela ordem fixa da grelha', () => {
    expect(r.badges.map((b) => b.key)).toEqual(BADGE_KEYS);
    // Dezasseis até à fase A; os seis d'O Palmarés (os medalhões passaram a
    // badges) fizeram vinte e dois, e O Passo — o encaixe do medalhão que
    // não coube nos três degraus d'Os Níveis — faz vinte e três.
    expect(BADGE_KEYS).toHaveLength(23);
  });

  /* A família é o que a Vitrina agrupa e, sobretudo, o que diz à Carol o que
     ela nunca pode sugerir (doutrina 6 #6: nada de `acumulacao`, nada de
     `amuletos`). Um badge sem família seria um badge que ela não sabe
     classificar — e classificaria mal. */
  it('cada badge declara uma família conhecida', () => {
    for (const b of r.badges) {
      expect(FAMILIA_KEYS, b.key).toContain(b.familia);
    }
    expect(FAMILIAS.map((f) => f.key)).toEqual(['desempenho', 'disciplina', 'acumulacao', 'amuletos']);
  });

  it('as duas famílias que a Carol não pode sugerir são as que se espera', () => {
    const daFamilia = (f) => r.badges.filter((b) => b.familia === f).map((b) => b.key);
    expect(daFamilia('acumulacao')).toEqual(['quilometros', 'escalada']);
    expect(daFamilia('amuletos')).toEqual([
      'coruja', 'volta_ao_relogio', 'relogio_suico', 'quatro_estacoes', 'solsticio', 'anos', 'numero_certo',
    ]);
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

  /* "Uma cor, um significado": âmbar (--race) SÓ nos badges que nascem de uma
     prova. Nenhum badge de treino o pode usar. */
  it('a lei da cor: âmbar só nos badges que nascem de uma prova', () => {
    expect(r.badges.filter((b) => b.cor === 'race').map((b) => b.key))
      .toEqual(['distancias', 'terreno', 'niveis', 'superacao', 'recorde_pessoal']);
    expect(r.badges.every((b) => ['run', 'ok', 'race', 'neutro'].includes(b.cor))).toBe(true);
  });

  /* O outro lado da mesma lei, e o caso que a torna visível: A Sequência
     conta PROVAS e é verde. A cor não pergunta de que tabela veio o dado,
     pergunta o que o badge mede — e o que ela mede é aparecer, que é
     disciplina como a Semana 100%. */
  it('A Sequência conta provas e mesmo assim é verde, porque o que mede é disciplina', () => {
    const b = bad(r, 'sequencia');
    expect(b.cor).toBe('ok');
    expect(b.familia).toBe('disciplina');
  });

  /* Os badges de prova leem `completedRaces` e os de treino leem `treinos`;
     nenhum lê as duas listas. Sem provas nenhumas, os cinco âmbar e A
     Sequência não têm nada para mostrar por muitos treinos que haja. */
  it('um treino não alimenta badge de prova nenhum', () => {
    const so = compute({ runs: [treino('2026-09-10', { distance_km: 42.2 })] });
    for (const key of ['distancias', 'terreno', 'niveis', 'superacao', 'recorde_pessoal', 'sequencia']) {
      expect(bad(so, key).state, key).toBe('empty');
    }
  });

  /* A ausência de cor: um amuleto não mede desempenho nenhum, logo não
     reclama nenhuma cor de significado — e nenhum badge que meça alguma
     coisa se pode disfarçar de amuleto. A Coruja é o caso que mudou: era
     `run`. */
  it('os amuletos não levam cor de significado, e mais ninguém leva a prata', () => {
    const amuletos = r.badges.filter((b) => b.familia === 'amuletos');
    expect(amuletos.every((b) => b.cor === 'neutro')).toBe(true);
    expect(r.badges.filter((b) => b.cor === 'neutro').map((b) => b.familia))
      .toEqual(amuletos.map(() => 'amuletos'));
    expect(r.badges.find((b) => b.key === 'coruja').cor).toBe('neutro');
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
    // `dueDe`, e não `r.due`: o treino de fixture tem 10,00 km certos e
    // ganha o Número certo — que é exatamente o que esse amuleto faz.
    expect(dueDe(r, 'z2_mestre')).toEqual([]);
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

describe('Recorde pessoal — o âmbar que já cá estava', () => {
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

  /* O que o estúdio do mural mostra: só os badges cujo prémio traz o
     `raceId` DESTA prova. É o filtro que impede o mural de uma prova de
     exibir um badge ganho noutra (ou num treino). */
  describe('badgesForRace — o que esta prova deu ao mural', () => {
    const params = (lista) => ({
      runs: [], raceEvents: [], planItems: [], gymSessions: [], profile: PROFILE, today: HOJE, ...cenario(lista),
    });

    /* MUDOU NA FASE A, e de propósito: a p1 deixou de devolver lista vazia.
       Ela é a primeira prova de 10 km, a primeira de estrada e a que subiu o
       VDOT do zero ao bronze — três feitos que o Palmarés já cunhava em
       medalhões e que agora são badges com o `raceId` dela. O mural de uma
       prova mostra o que ESSA prova deu, e ela deu isto. */
    it('devolve os badges da prova que os deu, e não os de outra prova', () => {
      const p = params([prova('p1', '2026-03-01', 3000), prova('p2', '2026-06-01', 2900)]);
      const daP2 = badgesForRace(p, 'p2');
      expect(daP2.map((b) => b.key)).toEqual(['recorde_pessoal']);
      expect(daP2[0].centro).toBe('1');
      expect(daP2[0].awardLine).toContain('melhor tempo de sempre');

      const daP1 = badgesForRace(p, 'p1');
      expect(daP1.map((b) => b.key)).toEqual(['distancias', 'terreno', 'niveis']);
      expect(daP1.find((b) => b.key === 'distancias').awardTitle).toBe('Primeiros 10 km');
      expect(daP1.find((b) => b.key === 'terreno').awardTitle).toBe('Primeira em estrada');
      // O recorde pessoal não: a primeira prova não bate melhor nenhum.
      expect(daP1.some((b) => b.key === 'recorde_pessoal')).toBe(false);
    });

    it('sem prova nenhuma pedida, não devolve nada', () => {
      expect(badgesForRace(params([prova('p1', '2026-03-01', 3000)]), null)).toEqual([]);
    });
  });
});

/* A régua da cadência é a da doutrina 2.4 #3
   (src/coach-knowledge/02-corrida-tecnica-sinais.md):

     esperado = 150 + 6,0 × v(m/s) − 0,7 × (altura − 175)

   Os treinos destes testes são 10 km em 3600 s — 2,778 m/s — o que dá 166,7
   spm esperados a 175 cm de altura. Daí os números: 156 spm é −10,7 (baixa),
   164 spm é −2,7 (de volta ao esperado). */
describe('Cadência corrigida — a mudança, não o número', () => {
  const COM_ALTURA = { ...PROFILE, height_cm: 175 };
  const corrida = (date, spm) => treino(date, { details: { cadence_spm: spm } });
  /* Quartas-feiras: a de 19 ago é a semana de 17 ago, e as três seguintes
     são as semanas de 24 ago, 31 ago e 7 set — todas já fechadas a 22 set. */
  const BAIXA = '2026-08-19';
  const CORRIGIDAS = ['2026-08-26', '2026-09-02', '2026-09-09'];

  const cenario = (over = {}) => compute({ profile: COM_ALTURA, ...over });

  it('três semanas seguidas de volta ao esperado, depois de uma abaixo, ganham o badge', () => {
    const r = cenario({ runs: [corrida(BAIXA, 156), ...CORRIGIDAS.map((d) => corrida(d, 164))] });
    const b = bad(r, 'cadencia_corrigida');
    expect(b.state).toBe('won');
    expect(b.cor).toBe('run');
    // 164 − 156 = 8 spm ganhos face à régua (a velocidade é a mesma).
    expect(b.centro).toBe('+8');
    expect(b.count).toBe(1);
    expect(estados(b, 'conta')).toHaveLength(3);

    const due = dueDe(r, 'cadencia_corrigida');
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      tier: '', periodKey: '2026-08-24', value: 8, valueUnit: 'spm', awardedOn: '2026-09-14', raceId: null,
    });
  });

  it('duas semanas ainda não são três', () => {
    const r = cenario({ runs: [corrida(BAIXA, 156), ...CORRIGIDAS.slice(0, 2).map((d) => corrida(d, 164))] });
    const b = bad(r, 'cadencia_corrigida');
    expect(b.state).toBe('progress');
    expect(b.centro).toBe('2/3');
    expect(dueDe(r, 'cadencia_corrigida')).toEqual([]);
  });

  /* O badge NÃO é "tens boa cadência" — é "corrigiste a tua". Sem uma fase
     abaixo do esperado não há correção nenhuma a premiar. */
  it('sem uma fase abaixo do esperado não há nada a corrigir, por muito boa que a cadência seja', () => {
    const r = cenario({ runs: [corrida(BAIXA, 172), ...CORRIGIDAS.map((d) => corrida(d, 174))] });
    const b = bad(r, 'cadencia_corrigida');
    expect(b.state).toBe('empty');
    expect(b.linha).toContain('não há nada a corrigir');
    expect(dueDe(r, 'cadencia_corrigida')).toEqual([]);
  });

  it('sem cadência no registo, a corrida fica indeterminada', () => {
    const r = cenario({ runs: [treino('2026-09-09'), corrida('2026-09-10', 164)] });
    const b = bad(r, 'cadencia_corrigida');
    expect(b.indeterminadas.n).toBe(1);
    expect(b.indeterminadas.frase).toContain('a cadência média');
    expect(estados(b, 'indeterminada')).toHaveLength(1);
  });

  /* A fraqueza conhecida, tratada pelo lado seguro: a velocidade média de um
     intervalado não representa nada, e a subida levanta a cadência sem que a
     mecânica seja melhor. Nenhum dos dois entra na régua. */
  it('o intervalado e a subida não entram na régua', () => {
    const r = cenario({
      runs: [
        treino('2026-08-19', { training_type: 'intervalos', details: { cadence_spm: 150 } }),
        treino('2026-08-26', { training_type: 'trail', details: { cadence_spm: 150 } }),
        // 'continuo', mas 40 m de D+ por km: acima da banda rolante.
        treino('2026-09-02', { details: { cadence_spm: 150, elevation_gain_m: 400 } }),
      ],
    });
    const b = bad(r, 'cadencia_corrigida');
    expect(b.sessoes).toHaveLength(0);
    expect(b.state).toBe('empty');
    expect(b.linha).toContain('contínuas em plano');
  });

  /* Sem altura no perfil, a régua perde o termo de estatura e podia acusar
     de baixa a cadência certa de alguém alto. A doutrina manda descer a
     exigência: sem altura, só abaixo dos 155 spm — o sinal vermelho do #1. */
  it('sem altura no perfil, só abaixo de 155 spm é que a fase conta como baixa', () => {
    const runs156 = [corrida(BAIXA, 156), ...CORRIGIDAS.map((d) => corrida(d, 164))];
    expect(bad(compute({ runs: runs156 }), 'cadencia_corrigida').state).toBe('empty');

    const runs152 = [corrida(BAIXA, 152), ...CORRIGIDAS.map((d) => corrida(d, 164))];
    expect(bad(compute({ runs: runs152 }), 'cadencia_corrigida').state).toBe('won');
  });

  /* O −0,7 spm por cm acima de 175: a 190 cm, 156 spm é a cadência esperada
     para este ritmo, não uma cadência baixa. */
  it('a régua desconta a estatura — 156 spm a 190 cm não é fase baixa', () => {
    const runs = [corrida(BAIXA, 156), ...CORRIGIDAS.map((d) => corrida(d, 164))];
    const r = compute({ profile: { ...PROFILE, height_cm: 190 }, runs });
    expect(bad(r, 'cadencia_corrigida').state).toBe('empty');
  });

  /* Os "180 spm" são Jack Daniels a contar passos em Los Angeles, 1984 — 46
     fundistas de elite em prova — e estão proibidos pela doutrina (#1, #3.1).
     Nada do que o atleta lê neste badge os pode ressuscitar. */
  it('nenhuma frase deste badge diz 180', () => {
    const r = cenario({ runs: [corrida(BAIXA, 156), ...CORRIGIDAS.map((d) => corrida(d, 164))] });
    const b = bad(r, 'cadencia_corrigida');
    const texto = [b.rule, b.linha, b.detalhe, b.dependeDe, b.comoResolver, b.centroAria,
      ...dueDe(r, 'cadencia_corrigida').map((d) => d.line),
      ...b.sessoes.map((s) => `${s.meta} ${s.porque}`)].join(' ');
    expect(texto).not.toMatch(/180/);
    expect(texto).not.toMatch(/lesõ|lesão/);
  });
});

/* O badge de especificidade: a régua não é um número da casa, é a da prova
   do atleta. Sem prova principal marcada não há alvo — e o badge diz isso
   em vez de ficar um anel vazio sem explicação. */
describe('À medida da prova — o alvo sai da prova principal', () => {
  // 1 800 m em 30 km = 60 m de subida por quilómetro.
  const provaA = (over = {}) => ({
    id: 'alvo', name: 'Trail da Serra', date: '2026-11-15', status: 'agendada',
    race_priority: 'a', race_type: 'trail', distance_km: 30, elevation_gain_m: 1800, ...over,
  });
  const saida = (date, dmais, km = 12) => treino(date, { distance_km: km, details: { elevation_gain_m: dmais } });

  it('uma saída com o desnível por quilómetro que a prova exige ganha o badge', () => {
    // 800 m em 12 km = 66,7 m/km = 111% dos 60 m/km exigidos.
    const r = compute({ raceEvents: [provaA()], runs: [saida('2026-09-05', 800)] });
    const b = bad(r, 'medida_da_prova');
    expect(b.state).toBe('won');
    expect(b.centro).toBe('111%');
    expect(b.familia).toBe('desempenho');
    expect(b.rule).toContain('60 m/km');
    expect(b.rule).toContain('Trail da Serra');
    expect(dueDe(r, 'medida_da_prova')[0]).toMatchObject({ valueUnit: 'pct', awardedOn: '2026-09-05' });
  });

  it('abaixo do exigido, o número diz a que percentagem ficou', () => {
    // 400 m em 12 km = 33,3 m/km = 56% do exigido.
    const b = bad(compute({ raceEvents: [provaA()], runs: [saida('2026-09-05', 400)] }), 'medida_da_prova');
    expect(b.state).toBe('empty');
    expect(b.centro).toBe('+44%');
  });

  /* O ponto do badge: o MESMO treino é específico para uma prova e
     irrelevante para outra. 800 m em 12 km chega para um alvo de 60 m/km e
     não chega para um de 100. */
  it('o mesmo treino chega para uma prova e não chega para outra', () => {
    const exigente = provaA({ elevation_gain_m: 3000 }); // 100 m/km
    expect(bad(compute({ raceEvents: [exigente], runs: [saida('2026-09-05', 800)] }), 'medida_da_prova').state).toBe('empty');
  });

  it('sem prova principal marcada não há alvo, e o badge explica-o', () => {
    const b = bad(compute({ runs: [saida('2026-09-05', 800)] }), 'medida_da_prova');
    expect(b.state).toBe('empty');
    expect(b.centro).toBe('—');
    expect(b.linha).toContain('sem prova principal marcada');
    expect(b.sessoes).toHaveLength(0);
  });

  it('prova principal sem D+ preenchido também não dá alvo, e diz porquê', () => {
    const b = bad(compute({ raceEvents: [provaA({ elevation_gain_m: null })], runs: [saida('2026-09-05', 800)] }), 'medida_da_prova');
    expect(b.state).toBe('empty');
    expect(b.linha).toContain('desnível');
    expect(b.linha).toContain('Trail da Serra');
  });

  it('uma prova secundária, ou já concluída, não é alvo de nada', () => {
    expect(bad(compute({ raceEvents: [provaA({ race_priority: 'b' })] }), 'medida_da_prova').centro).toBe('—');
    expect(bad(compute({ raceEvents: [provaA({ status: 'concluida', date: '2026-01-10' })] }), 'medida_da_prova').centro).toBe('—');
  });

  it('uma saída sem D+ no registo fica indeterminada, como nas outras', () => {
    const r = compute({ raceEvents: [provaA()], runs: [treino('2026-09-05', { distance_km: 12 })] });
    expect(bad(r, 'medida_da_prova').indeterminadas.n).toBe(1);
  });
});

/* Os amuletos. O que estes testes guardam não é a graça de nenhum deles — é
   que continuam a cumprir o contrato da casa (campo, dependência, sessão
   indeterminada) e que a família os mantém fora do alcance da Carol. */
describe('Amuletos — Volta ao relógio', () => {
  const hora = (date, hhmm) => treino(date, { start_time: hhmm });

  it('as quatro faixas do dia fecham o badge', () => {
    const r = compute({
      runs: [hora('2026-09-01', '05:10'), hora('2026-09-02', '09:00'), hora('2026-09-03', '15:20'), hora('2026-09-04', '22:00')],
    });
    const b = bad(r, 'volta_ao_relogio');
    expect(b.state).toBe('won');
    expect(b.centro).toBe('4');
    expect(b.cor).toBe('neutro');
    expect(dueDe(r, 'volta_ao_relogio')[0]).toMatchObject({ periodKey: '', value: 4, valueUnit: 'count', awardedOn: '2026-09-04' });
  });

  it('a caminho, diz que faixas faltam', () => {
    const b = bad(compute({ runs: [hora('2026-09-01', '05:10'), hora('2026-09-02', '09:00')] }), 'volta_ao_relogio');
    expect(b.state).toBe('progress');
    expect(b.centro).toBe('2/4');
    expect(b.linha).toBe('faltam tarde e noite');
  });

  it('sem hora de início, a corrida fica indeterminada', () => {
    const b = bad(compute({ runs: [treino('2026-09-01')] }), 'volta_ao_relogio');
    expect(b.indeterminadas.n).toBe(1);
    expect(estados(b, 'indeterminada')).toHaveLength(1);
  });
});

describe('Amuletos — Relógio suíço', () => {
  const dez = (n) => Array.from({ length: n }, (_, i) => treino(`2026-09-${String(i + 1).padStart(2, '0')}`, { start_time: '07:15' }));

  it('dez corridas na mesma meia-hora do relógio', () => {
    const r = compute({ runs: dez(10) });
    const b = bad(r, 'relogio_suico');
    expect(b.state).toBe('won');
    expect(b.centro).toBe('10');
    expect(b.linha).toContain('07:00-07:29');
    expect(dueDe(r, 'relogio_suico')[0]).toMatchObject({ value: 10, valueUnit: 'count', awardedOn: '2026-09-10' });
  });

  it('nove ainda não são dez', () => {
    const b = bad(compute({ runs: dez(9) }), 'relogio_suico');
    expect(b.state).toBe('progress');
    expect(b.centro).toBe('9/10');
  });

  /* A meia-hora é a do relógio, não uma janela deslizante: às 07:29 e às
     07:31 são duas gavetas diferentes, e é de propósito. */
  it('a meia-hora é a do relógio, não uma janela deslizante', () => {
    const runs = [...dez(9), treino('2026-09-20', { start_time: '07:31' })];
    expect(bad(compute({ runs }), 'relogio_suico').state).toBe('progress');
  });
});

/* As estações são as astronómicas, calculadas do ângulo do Sol — não as do
   calendário comercial. Em 2026 o equinócio de março é a 20; o dia da
   viragem conta para a estação nova. */
describe('Amuletos — Quatro estações e Solstício', () => {
  it('uma corrida em cada estação fecha as Quatro estações', () => {
    const r = compute({
      runs: [treino('2026-01-10'), treino('2026-04-10'), treino('2026-07-10'), treino('2025-10-10')],
    });
    const b = bad(r, 'quatro_estacoes');
    expect(b.state).toBe('won');
    expect(b.centro).toBe('4');
    // A data é obrigatória em qualquer registo: aqui não há indeterminadas.
    expect(b.indeterminadas).toBeNull();
  });

  it('o dia do equinócio já é da estação nova', () => {
    // 19 de março de 2026 é inverno; 20 de março é o equinócio, e é primavera.
    const b = bad(compute({ runs: [treino('2026-03-19'), treino('2026-03-20')] }), 'quatro_estacoes');
    expect(b.state).toBe('progress');
    expect(b.centro).toBe('2/4');
    expect(b.linha).toBe('faltam verão e outono');
  });

  it('o dia mais longo e o mais curto — e as datas não são fixas', () => {
    // 2025: solstícios a 21 de junho e a 21 de dezembro (hora de Lisboa).
    const r = compute({ runs: [treino('2025-06-21'), treino('2025-12-21')] });
    const b = bad(r, 'solsticio');
    expect(b.state).toBe('won');
    expect(b.centro).toBe('2');
    expect(dueDe(r, 'solsticio')).toHaveLength(1);

    // 2024: o solstício de junho foi a 20, não a 21 — um dia fixo falhava
    // aqui, e falha de quatro em quatro anos.
    expect(bad(compute({ runs: [treino('2024-06-20')] }), 'solsticio').centro).toBe('1/2');
    expect(bad(compute({ runs: [treino('2024-06-21')] }), 'solsticio').centro).toBe('0/2');
  });

  /* Uma corrida a 3 de maio não tem dado nenhum em falta — está só fora dos
     dois dias. Se entrasse como indeterminada, o histórico inteiro aparecia
     no ecrã de detalhe como "por decidir". */
  it('uma corrida fora dos dois dias não é uma sessão por decidir', () => {
    const b = bad(compute({ runs: [treino('2026-05-03')] }), 'solsticio');
    expect(b.sessoes).toHaveLength(0);
    expect(b.indeterminadas).toBeNull();
    expect(b.state).toBe('empty');
  });
});

describe('Amuletos — Anos e Número certo', () => {
  const COM_ANOS = { ...PROFILE, birth_date: '1985-09-14' };

  it('correr no dia de anos, uma linha por ano', () => {
    const r = compute({ profile: COM_ANOS, runs: [treino('2025-09-14'), treino('2026-09-14')] });
    const b = bad(r, 'anos');
    expect(b.state).toBe('won');
    expect(b.centro).toBe('41');
    expect(b.count).toBe(2);
    const due = dueDe(r, 'anos');
    expect(due.map((d) => d.periodKey)).toEqual(['2025', '2026']);
    expect(due[1]).toMatchObject({ value: 41, valueUnit: 'anos', awardedOn: '2026-09-14' });
  });

  /* Sem data de nascimento não há candidato nenhum — e isso diz-se, em vez
     de deixar o badge por ganhar sem explicação. */
  it('sem data de nascimento no Perfil, o badge diz porquê', () => {
    const b = bad(compute({ runs: [treino('2026-09-14')] }), 'anos');
    expect(b.state).toBe('empty');
    expect(b.centro).toBe('—');
    expect(b.linha).toContain('data de nascimento');
    expect(b.sessoes).toHaveLength(0);
  });

  it('os 10,00 km certos, com vinte metros de margem', () => {
    const r = compute({ runs: [treino('2026-09-10', { distance_km: 10.005 })] });
    const b = bad(r, 'numero_certo');
    expect(b.state).toBe('won');
    expect(b.centro).toBe('10');
    expect(dueDe(r, 'numero_certo')[0]).toMatchObject({ valueUnit: 'km', awardedOn: '2026-09-10' });

    const fora = bad(compute({ runs: [treino('2026-09-10', { distance_km: 10.4 })] }), 'numero_certo');
    expect(fora.state).toBe('empty');
    expect(fora.centro).toBe('+400');
  });

  it('sem distância no registo, a corrida fica indeterminada', () => {
    const b = bad(compute({ runs: [treino('2026-09-10', { distance_km: null })] }), 'numero_certo');
    expect(b.indeterminadas.n).toBe(1);
  });
});

/* ── Os seis que vieram d'O Palmarés (fase A) ─────────────────────────────

   Os medalhões passaram a badges. O que estes testes guardam, além do que já
   se guardava acima:

   · a LEI DA COR no caso difícil — quatro âmbar novos porque nascem de
     provas, e A Sequência VERDE apesar de também contar provas;
   · a terceira resposta do `encaixeDe` (NENHUM_ENCAIXE): uma prova de 15 km,
     ou a 3.ª de estrada, não enchem encaixe nenhum E TAMBÉM NÃO ficam "por
     decidir" — a indeterminada é para a falta de dado, não para o "não";
   · o prémio POR ENCAIXE d'As Distâncias e d'O Terreno, que é o que impede a
     primeira meia maratona de ficar à espera de uma maratona;
   · os limiares, que são decisões de produto e não podem mudar por acidente. */

/** Uma prova concluída com a corrida registada — a matéria dos badges de
 *  prova. `semRegisto` devolve-a sem corrida nenhuma: é a que quebra a série. */
const feita = (id, date, {
  km = 10, seconds = 3000, terreno = 'estrada', objetivo = null, semTempo = false, semRegisto = false,
} = {}) => {
  const race = {
    id, name: `Prova ${id}`, date, distance_km: km, status: 'concluida', race_type: terreno,
    ...(objetivo ? { target_time_seconds: objetivo } : {}),
  };
  const run = semRegisto ? null : {
    id: `run-${id}`,
    date,
    kind: 'competicao',
    race_id: id,
    distance_km: km,
    duration_seconds: semTempo ? null : seconds,
    details: semTempo ? {} : { official_time_seconds: seconds },
  };
  return { race, run };
};

const cenarioDeProvas = (lista) => ({
  raceEvents: lista.map((p) => p.race),
  runs: lista.map((p) => p.run).filter(Boolean),
});

describe('Os Quilómetros — o acumulado de treino', () => {
  const longo = (date, km) => treino(date, { distance_km: km });

  it('500 km acumulados dão bronze no dia em que o acumulado passa o limiar', () => {
    const r = compute({ runs: [longo('2026-03-01', 200), longo('2026-05-01', 200), longo('2026-07-01', 200)] });
    const b = bad(r, 'quilometros');
    expect(b.state).toBe('won');
    expect(b.tier).toBe('bronze');
    expect(b.cor).toBe('run');
    expect(b.familia).toBe('acumulacao');
    expect(b.centro).toBe('600');
    expect(b.linha).toContain('prata');

    const due = dueDe(r, 'quilometros');
    expect(due).toHaveLength(1);
    // O dia do prémio é aquele em que o acumulado passou os 500 km.
    expect(due[0]).toMatchObject({ tier: 'bronze', periodKey: '', awardedOn: '2026-07-01', value: 600, valueUnit: 'km' });
  });

  it('a caminho do bronze mostra o acumulado, e a corrida sem distância fica à parte', () => {
    const r = compute({ runs: [longo('2026-05-01', 250), treino('2026-06-01', { distance_km: null })] });
    const b = bad(r, 'quilometros');
    expect(b.state).toBe('progress');
    expect(b.centro).toBe('250');
    expect(b.ring).toBeCloseTo(0.5, 2);
    expect(b.indeterminadas.n).toBe(1);
    expect(b.indeterminadas.frase).toContain('distância');
  });

  /* É ciano, e o ciano não conta provas — ao contrário d'O Ano em Km, que
     somava tudo. Os quilómetros de prova têm os seus quatro badges âmbar. */
  it('os quilómetros de prova não entram', () => {
    const r = compute({ runs: [{ id: 'r1', date: '2026-05-01', kind: 'competicao', distance_km: 600, details: {} }] });
    expect(bad(r, 'quilometros').value).toBe(0);
  });
});

describe('As Distâncias — a primeira vez em cada uma', () => {
  it('a primeira prova de 10 km enche o encaixe e cunha o SEU prémio', () => {
    const r = compute(cenarioDeProvas([feita('p1', '2026-03-01')]));
    const b = bad(r, 'distancias');
    expect(b.state).toBe('progress');
    expect(b.centro).toBe('1/4');
    expect(b.cor).toBe('race');
    expect(b.familia).toBe('desempenho');

    const due = dueDe(r, 'distancias');
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      periodKey: '10k', raceId: 'p1', value: 10, valueUnit: 'km',
      title: 'Primeiros 10 km', awardedOn: '2026-03-01',
    });
  });

  it('só a primeira de cada distância cunha: a segunda não repete o prémio', () => {
    const r = compute(cenarioDeProvas([feita('p1', '2026-03-01'), feita('p2', '2026-06-01')]));
    expect(dueDe(r, 'distancias').map((d) => d.raceId)).toEqual(['p1']);
  });

  /* A terceira resposta do `encaixeDe`: tem o dado, e a resposta é "nenhum". */
  it('uma prova de 15 km não enche encaixe nenhum, e também não fica por decidir', () => {
    const b = bad(compute(cenarioDeProvas([feita('p1', '2026-03-01', { km: 15 })])), 'distancias');
    expect(b.state).toBe('empty');
    expect(b.indeterminadas).toBeNull();
    expect(estados(b, 'indeterminada')).toHaveLength(0);
  });

  it('uma prova sem distância fica indeterminada — não se adivinha o encaixe', () => {
    const b = bad(compute(cenarioDeProvas([feita('p1', '2026-03-01', { km: null })])), 'distancias');
    expect(b.indeterminadas.n).toBe(1);
    expect(b.indeterminadas.frase).toContain('distância da prova');
  });

  it('as quatro distâncias fecham o anel, com um prémio por cada', () => {
    const r = compute(cenarioDeProvas([
      feita('p1', '2026-01-04', { km: 5, seconds: 1500 }),
      feita('p2', '2026-02-01', { km: 10 }),
      feita('p3', '2026-03-01', { km: 21.1, seconds: 7200 }),
      feita('p4', '2026-04-01', { km: 42.2, seconds: 15000 }),
    ]));
    const b = bad(r, 'distancias');
    expect(b.state).toBe('won');
    expect(b.centro).toBe('4');
    expect(dueDe(r, 'distancias').map((d) => d.periodKey)).toEqual(['5k', '10k', '21k', '42k']);
  });
});

describe('Os Níveis — a escala VDOT', () => {
  it('10 km em 55:00 dão bronze, e o prémio guarda o VDOT com a casa decimal', () => {
    const r = compute(cenarioDeProvas([feita('p1', '2026-03-01', { seconds: 3300 })]));
    const b = bad(r, 'niveis');
    expect(b.state).toBe('won');
    expect(b.tier).toBe('bronze');
    expect(b.cor).toBe('race');
    expect(b.centro).toBe('36');

    const due = dueDe(r, 'niveis');
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ tier: 'bronze', value: 35.8, valueUnit: 'vdot', raceId: 'p1' });
  });

  /* A escala não soma: só a prova que SUBIU o melhor conta. E uma prova que
     não subiu nada não é uma dúvida — é uma prova que não chegou lá. */
  it('só a prova que sobe o melhor VDOT conta; as outras falharam, não ficaram por decidir', () => {
    const b = bad(compute(cenarioDeProvas([
      feita('p1', '2026-03-01', { seconds: 2400 }),
      feita('p2', '2026-06-01', { seconds: 3300 }),
    ])), 'niveis');
    expect(b.tier).toBe('prata');
    expect(estados(b, 'conta').map((s) => s.raceId)).toEqual(['p1']);
    expect(estados(b, 'falhou').map((s) => s.raceId)).toEqual(['p2']);
    expect(estados(b, 'indeterminada')).toHaveLength(0);
  });

  it('sem tempo oficial, a prova fica indeterminada', () => {
    const b = bad(compute(cenarioDeProvas([feita('p1', '2026-03-01', { semTempo: true })])), 'niveis');
    expect(b.state).toBe('empty');
    expect(b.indeterminadas.n).toBe(1);
    expect(b.indeterminadas.frase).toContain('tempo oficial');
  });
});

/* O Passo — a única escala da casa que DESCE.

   O que estes testes guardam, além do molde dos outros badges de níveis:
   que mais baixo é melhor (e que isso não se partiu no `badgeDeNiveis`, que
   os outros continuam a usar a subir), que o passo se lê como passo e não
   como um número solto, que conta prova E treino, e sobretudo o TETO DE
   PLAUSIBILIDADE — `user_badges` é append-only, e um ouro cunhado por um
   GPS a delirar ficava lá para sempre. */
describe('O Passo — o passo mais rápido de sempre', () => {
  // 10 km em 50:00 = 300 s/km, que é o limiar da prata (5.00/km).
  const rapido = (date, over = {}) => treino(date, { distance_km: 10, duration_seconds: 3000, ...over });

  it('10 km a 5.00/km dão prata, e o prémio guarda os segundos por km', () => {
    const r = compute({ runs: [rapido('2026-05-01')] });
    const b = bad(r, 'melhor_passo');
    expect(b.state).toBe('won');
    expect(b.tier).toBe('prata');
    expect(b.familia).toBe('desempenho');
    // O número do anel é um PASSO, não um número solto: "5.00" e não "300".
    expect(b.centro).toBe('5.00');
    expect(b.linha).toBe('Prata · faltam 45 s por km para ouro');

    // Um degrau é um prémio: quem chega à prata ganha também o bronze, os
    // dois no dia da corrida que os provou.
    const due = dueDe(r, 'melhor_passo');
    expect(due.map((d) => d.tier)).toEqual(['bronze', 'prata']);
    expect(due[1]).toMatchObject({
      tier: 'prata', periodKey: '', value: 300, valueUnit: 'seconds', awardedOn: '2026-05-01',
    });
    expect(due[1].line).toContain('5.00/km');
  });

  /* A lei da cor, e a razão de ele não ser âmbar: conta treino também. */
  it('é ciano, porque conta treino — mas uma prova também o dá', () => {
    const so = compute({ runs: [rapido('2026-05-01')] });
    expect(bad(so, 'melhor_passo').cor).toBe('run');

    // A mesma corrida como PROVA (10 km em 50:00): o badge ganha-se na mesma.
    const comProva = compute(cenarioDeProvas([feita('p1', '2026-03-01', { seconds: 3000 })]));
    const b = bad(comProva, 'melhor_passo');
    expect(b.state).toBe('won');
    expect(b.tier).toBe('prata');
    // O prémio não traz `raceId`: o badge não nasce da prova, e pô-lo no
    // mural dela era dizer que sim.
    expect(dueDe(comProva, 'melhor_passo').every((d) => d.raceId === null)).toBe(true);
    expect(badgesForRace({
      ...cenarioDeProvas([feita('p1', '2026-03-01', { seconds: 3000 })]),
      profile: PROFILE, today: HOJE,
    }, 'p1').map((x) => x.key)).not.toContain('melhor_passo');
  });

  /* A escala DESCE: o recorde é o mínimo, e uma corrida mais lenta depois do
     recorde não é uma dúvida — é uma corrida que não o baixou. */
  it('só a corrida que baixa o passo conta, venha ela antes ou depois', () => {
    const r = compute({
      runs: [
        treino('2026-03-01', { distance_km: 10, duration_seconds: 3600 }), // 6.00/km
        rapido('2026-05-01'), // 5.00/km — baixa
        treino('2026-07-01', { distance_km: 10, duration_seconds: 3300 }), // 5.30/km — não baixa
      ],
    });
    const b = bad(r, 'melhor_passo');
    expect(b.tier).toBe('prata');
    expect(b.centro).toBe('5.00');
    expect(estados(b, 'conta').map((s) => s.date)).toEqual(['2026-05-01', '2026-03-01']);
    expect(estados(b, 'falhou').map((s) => s.date)).toEqual(['2026-07-01']);
    expect(estados(b, 'indeterminada')).toHaveLength(0);
    // O prémio do bronze é do dia em que o passo passou os 6.00/km, não do
    // dia do recorde: é o primeiro dia em que os dados o provam.
    expect(dueDe(r, 'melhor_passo').map((d) => d.awardedOn)).toEqual(['2026-03-01', '2026-05-01']);
  });

  it('a escala inteira: 6.00 bronze, 5.00 prata, 4.15 ouro', () => {
    const tier = (segundos) => bad(compute({
      runs: [treino('2026-05-01', { distance_km: 10, duration_seconds: segundos * 10 })],
    }), 'melhor_passo').tier;
    expect(tier(361)).toBe(null);
    expect(tier(360)).toBe('bronze');
    expect(tier(301)).toBe('bronze');
    expect(tier(300)).toBe('prata');
    expect(tier(255)).toBe('ouro');
    expect(tier(200)).toBe('ouro');

    const b = bad(compute({ runs: [treino('2026-05-01', { distance_km: 10, duration_seconds: 2550 })] }), 'melhor_passo');
    expect(b.centro).toBe('4.15');
    expect(b.linha).toBe('Ouro — o degrau mais alto');
  });

  it('a caminho do bronze diz quantos segundos por km faltam', () => {
    const r = compute({
      runs: [treino('2026-05-01', { distance_km: 10, duration_seconds: 3900 })], // 6.30/km
    });
    const b = bad(r, 'melhor_passo');
    expect(b.state).toBe('progress');
    expect(b.centro).toBe('6.30');
    expect(b.linha).toBe('faltam 30 s por km para bronze');
    // O anel mede o caminho pelo lado certo da divisão: 6.30/km está perto
    // dos 6.00, não a 108% deles.
    expect(b.ring).toBeGreaterThan(0.9);
    expect(b.ring).toBeLessThan(1);
    expect(dueDe(r, 'melhor_passo')).toEqual([]);
  });

  it('sem corridas que se possam medir, fica por ganhar e diz o que falta', () => {
    const b = bad(compute(), 'melhor_passo');
    expect(b.state).toBe('empty');
    expect(b.centro).toBe('6.00');
    expect(b.linha).toContain('5, 10 ou 21 km');
    expect(b.ring).toBe(0);
  });

  /* Uma corrida que o `computeBestPace` não sabe ler (nem inteira nem em
     parcial cai nos escalões) não conta contra ninguém. */
  it('uma saída de 3 km fica indeterminada, não falhada', () => {
    const b = bad(compute({
      runs: [treino('2026-05-01', { distance_km: 3, duration_seconds: 900 })], // 5.00/km, mas 3 km
    }), 'melhor_passo');
    expect(b.state).toBe('empty');
    expect(b.indeterminadas.n).toBe(1);
    expect(estados(b, 'indeterminada')).toHaveLength(1);
    expect(b.indeterminadas.frase).toContain('nem a favor nem contra');
  });

  /* O TETO DE PLAUSIBILIDADE. `user_badges` é append-only e não tem política
     de delete: um ouro cunhado por um registo errado fica lá para sempre,
     mesmo depois de o atleta corrigir a corrida. */
  it('um GPS a delirar não cunha ouro nenhum', () => {
    const r = compute({
      runs: [treino('2026-05-01', { distance_km: 10, duration_seconds: 1200 })], // 2.00/km
    });
    const b = bad(r, 'melhor_passo');
    expect(b.state).toBe('empty');
    expect(dueDe(r, 'melhor_passo')).toEqual([]);
    expect(estados(b, 'indeterminada')[0].porque).toContain('fora do plausível');
  });

  /* E o outro lado do mesmo teto: ele é largo de propósito. Cortar um passo
     que alguém correu de verdade é o erro que não se pode cometer, por isso
     o limite fica ABAIXO do recorde mundial dos 10 000 m (~157 s/km). */
  it('um passo de recorde mundial passa: o teto fica abaixo dele', () => {
    const b = bad(compute({
      runs: [treino('2026-05-01', { distance_km: 10, duration_seconds: 1570 })], // 2.37/km
    }), 'melhor_passo');
    expect(b.state).toBe('won');
    expect(b.tier).toBe('ouro');
    expect(b.centro).toBe('2.37');
  });

  /* Um parcial de 5 km vale como esforço: é a régua do `computeBestPace`,
     a mesma dos recordes de ritmo do dashboard de corrida. */
  it('um parcial de 5 km dentro de uma corrida longa conta', () => {
    const b = bad(compute({
      runs: [treino('2026-05-01', {
        distance_km: 15, duration_seconds: 5400, // 6.00/km na saída inteira
        details: { splits: [{ distance_km: 5, time_seconds: 1400 }] }, // 4.40/km
      })],
    }), 'melhor_passo');
    expect(b.tier).toBe('prata');
    expect(b.centro).toBe('4.40');
    expect(estados(b, 'conta')[0].meta).toContain('parcial');
  });
});

describe('A Superação — o objetivo batido', () => {
  it('bater o objetivo ganha o badge e repete-se: uma linha por prova', () => {
    const r = compute(cenarioDeProvas([
      feita('p1', '2026-03-01', { seconds: 2900, objetivo: 3000 }),
      feita('p2', '2026-06-01', { seconds: 2800, objetivo: 3000 }),
    ]));
    const b = bad(r, 'superacao');
    expect(b.state).toBe('won');
    expect(b.cor).toBe('race');
    expect(b.count).toBe(2);
    expect(b.centro).toBe('2');

    const due = dueDe(r, 'superacao');
    expect(due).toHaveLength(2);
    expect(due[0]).toMatchObject({
      periodKey: 'p1', raceId: 'p1', value: 2900, valueUnit: 'seconds', awardedOn: '2026-03-01',
    });
  });

  /* Quem nunca marcou objetivo não falhou nada: dizer-lhe que falhou era
     mentir-lhe sobre uma coisa que ele não fez. */
  it('sem objetivo marcado, a prova fica indeterminada — e não "falhou"', () => {
    const b = bad(compute(cenarioDeProvas([feita('p1', '2026-03-01')])), 'superacao');
    expect(b.state).toBe('empty');
    expect(estados(b, 'falhou')).toHaveLength(0);
    expect(b.indeterminadas.n).toBe(1);
    expect(b.indeterminadas.frase).toContain('objetivo de tempo');
  });

  it('falhar por 30 segundos diz quanto faltou', () => {
    const b = bad(compute(cenarioDeProvas([feita('p1', '2026-03-01', { seconds: 3030, objetivo: 3000 })])), 'superacao');
    expect(b.state).toBe('empty');
    expect(b.centro).toBe('+30s');
  });
});

describe('O Terreno — estrada e trail em separado', () => {
  it('a primeira de cada terreno enche dois dos quatro encaixes', () => {
    const r = compute(cenarioDeProvas([feita('p1', '2026-03-01'), feita('p2', '2026-04-01', { terreno: 'trail' })]));
    const b = bad(r, 'terreno');
    expect(b.state).toBe('progress');
    expect(b.centro).toBe('2/4');
    expect(b.cor).toBe('race');

    const due = dueDe(r, 'terreno');
    expect(due.map((d) => d.periodKey)).toEqual(['estrada1', 'trail1']);
    expect(due[0]).toMatchObject({ raceId: 'p1', value: 1, valueUnit: 'count', title: 'Primeira em estrada' });
  });

  it('a quinta de estrada enche o outro encaixe, e as três do meio não ficam por decidir', () => {
    const r = compute(cenarioDeProvas([1, 2, 3, 4, 5].map((n) => feita(`p${n}`, `2026-0${n}-01`))));
    const b = bad(r, 'terreno');
    expect(b.centro).toBe('2/4');
    expect(dueDe(r, 'terreno').map((d) => d.periodKey)).toEqual(['estrada1', 'estrada5']);
    expect(b.indeterminadas).toBeNull();
    expect(estados(b, 'indeterminada')).toHaveLength(0);
    expect(estados(b, 'conta')).toHaveLength(2);
  });
});

describe('A Sequência — as provas seguidas com a corrida registada', () => {
  it('três provas seguidas dão bronze, no dia da terceira', () => {
    const r = compute(cenarioDeProvas([
      feita('p1', '2026-03-01'), feita('p2', '2026-04-01'), feita('p3', '2026-05-01'),
    ]));
    const b = bad(r, 'sequencia');
    expect(b.state).toBe('won');
    expect(b.tier).toBe('bronze');
    expect(b.cor).toBe('ok');
    expect(b.centro).toBe('3');
    expect(dueDe(r, 'sequencia')[0]).toMatchObject({
      tier: 'bronze', value: 3, valueUnit: 'count', raceId: 'p3', awardedOn: '2026-05-01',
    });
  });

  /* A regra inteira do badge: a prova que passa sem registo QUEBRA — não fica
     por decidir — e o que já foi ganho não se perde com ela. */
  it('uma prova sem registo quebra a série, e não apaga o que já estava ganho', () => {
    const r = compute(cenarioDeProvas([
      feita('p1', '2026-03-01'), feita('p2', '2026-04-01'), feita('p3', '2026-05-01'),
      feita('p4', '2026-06-01', { semRegisto: true }), feita('p5', '2026-07-01'),
    ]));
    const b = bad(r, 'sequencia');
    expect(b.tier).toBe('bronze');
    expect(b.value).toBe(3);
    expect(b.indeterminadas).toBeNull();
    expect(estados(b, 'falhou').map((s) => s.raceId)).toEqual(['p4']);
  });

  it('duas seguidas ainda não são uma série: mostra 2/3 e não cunha nada', () => {
    const r = compute(cenarioDeProvas([feita('p1', '2026-03-01'), feita('p2', '2026-04-01')]));
    const b = bad(r, 'sequencia');
    expect(b.state).toBe('progress');
    expect(b.centro).toBe('2/3');
    expect(dueDe(r, 'sequencia')).toEqual([]);
  });
});
