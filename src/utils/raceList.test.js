import { describe, it, expect } from 'vitest';
import { groupRaces, countdownLabel, daysUntil } from './raceList';
import { cupListingOf } from './cupCalendar';
import { findRaceRun } from './run';
import { classifyRaceOutcome } from './raceOutcome';
import { achievementsForRace } from './achievements';

/* Todas as provas num sítio só (pedido 2026-09-13): três grupos, pela mesma
   régua do hub, da agenda e do Palmarés. */

const TODAY = '2026-09-13';

const race = (id, date, extra = {}) => ({
  id, name: `Prova ${id}`, date, distance_km: 10, race_type: 'estrada', status: 'agendada', ...extra,
});

describe('groupRaces', () => {
  it('separa próximas, por registar e concluídas, cada grupo pela ordem que se lê', () => {
    const raceEvents = [
      race('longe', '2026-12-01'),
      race('hoje', TODAY),
      race('perto', '2026-09-20'),
      race('esquecida', '2026-08-01'),
      race('ontem', '2026-09-12'),
      race('antiga', '2026-04-10', { status: 'concluida' }),
      race('recente', '2026-08-30', { status: 'concluida' }),
    ];
    const { proximas, porRegistar, concluidas, total } = groupRaces({ raceEvents, runs: [], today: TODAY });

    expect(proximas.map((p) => p.race.id)).toEqual(['hoje', 'perto', 'longe']);
    expect(proximas.map((p) => p.days)).toEqual([0, 7, 79]);
    // As por registar vêm da mais recente para trás, sem limite de dias.
    expect(porRegistar.map((p) => p.race.id)).toEqual(['ontem', 'esquecida']);
    expect(concluidas.map((c) => c.race.id)).toEqual(['recente', 'antiga']);
    expect(total).toBe(7);
  });

  it('uma concluída com corrida ligada traz o tempo e as conquistas; fechada à mão fica sem números', () => {
    const raceEvents = [
      race('com', '2026-08-30', { status: 'concluida', target_time: '50:00' }),
      race('sem', '2026-07-01', { status: 'concluida' }),
    ];
    const runs = [{
      id: 'run-1', race_id: 'com', kind: 'competicao', date: '2026-08-30',
      distance_km: 10, duration_seconds: 2950, details: { official_time_seconds: 2950 },
    }];
    const { concluidas } = groupRaces({ raceEvents, runs, today: TODAY });

    const com = concluidas.find((c) => c.race.id === 'com');
    expect(com.run.id).toBe('run-1');
    expect(com.outcome.officialSeconds).toBe(2950);
    expect(com.achievements.map((a) => a.key)).toContain('prova_concluida');

    const sem = concluidas.find((c) => c.race.id === 'sem');
    expect(sem.run).toBeNull();
    expect(sem.outcome).toBeNull();
    expect(sem.achievements).toEqual([]);
  });

  it('ignora provas sem id ou sem data, e aguenta listas vazias', () => {
    expect(groupRaces({ raceEvents: [{ name: 'x' }, race('ok', '2026-10-01'), { id: 'y' }, race('torta', '2026-13-45')], today: TODAY }).total).toBe(1);
    expect(groupRaces({ today: TODAY })).toEqual({ proximas: [], porRegistar: [], concluidas: [], total: 0 });
  });
});

describe('contagem', () => {
  it('diz hoje, amanhã e daqui a N dias', () => {
    expect(daysUntil('2026-09-20', TODAY)).toBe(7);
    expect(countdownLabel(0)).toBe('hoje');
    expect(countdownLabel(1)).toBe('amanhã');
    expect(countdownLabel(12)).toBe('daqui a 12 dias');
  });
});

/* ── Fase 3 do Troféu (specs/trofeu.md §4.3, 2026-09-27) ──────────────────
   INVARIÂNCIA: sem inscrição, groupRaces dá a saída de hoje. A cópia abaixo
   é o corpo de groupRaces ANTES da Fase 3 (commit ef3c4af), congelado: não
   se mexe nela. */
function dayOfAntes(value) {
  if (typeof value !== 'string' || value.length < 10) return null;
  const day = value.slice(0, 10);
  return Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? null : day;
}
function groupRacesAntesDaFase3({ raceEvents = [], runs = [], profile = {}, today } = {}) {
  const valid = (raceEvents || []).filter((race) => race?.id && dayOfAntes(race.date));

  const proximas = valid
    .filter((race) => race.status !== 'concluida' && dayOfAntes(race.date) >= today)
    .sort((a, b) => dayOfAntes(a.date).localeCompare(dayOfAntes(b.date)))
    .map((race) => ({ race, days: daysUntil(dayOfAntes(race.date), today) }));

  const porRegistar = valid
    .filter((race) => race.status !== 'concluida' && dayOfAntes(race.date) < today)
    .sort((a, b) => dayOfAntes(b.date).localeCompare(dayOfAntes(a.date)))
    .map((race) => ({ race, days: daysUntil(dayOfAntes(race.date), today) }));

  const data = { raceEvents: valid, runs, profile, today };
  const concluidas = valid
    .filter((race) => race.status === 'concluida')
    .sort((a, b) => dayOfAntes(b.date).localeCompare(dayOfAntes(a.date)))
    .map((race) => {
      const run = findRaceRun(runs, race);
      if (!run) return { race, run: null, outcome: null, achievements: [] };
      return {
        race,
        run,
        outcome: classifyRaceOutcome({ race, run, runs, profile, races: valid }),
        achievements: achievementsForRace(data, race.id),
      };
    });

  return { proximas, porRegistar, concluidas, total: valid.length };
}

// Um calendário com tudo: provas de jornadas de quem saiu (concluídas e por
// registar), principais, b/c, sem prioridade, sem data e datas tortas.
const MISTURA = {
  today: TODAY,
  profile: { gender: 'M', birth_date: '1982-01-24' },
  raceEvents: [
    race('meia', '2026-11-15', { race_priority: 'a' }),
    race('semprio', '2026-10-04', { race_priority: null }),
    race('b1', '2026-09-20', { race_priority: 'b' }),
    race('c1', '2026-12-06', { race_priority: 'c' }),
    race('jornada-saiu', '2026-10-18', { race_priority: 'b', cup_round_id: 'r-velha' }),
    race('jornada-saiu-passada', '2026-09-06', { race_priority: 'b', cup_round_id: 'r-velha-2' }),
    race('jornada-feita', '2026-08-23', { race_priority: 'b', cup_round_id: 'r-velha-3', status: 'concluida' }),
    race('fechada', '2026-07-12', { status: 'concluida' }),
    race('esquecida', '2026-08-01'),
    { id: 'semdata', name: 'Sem data', status: 'agendada' },
    race('torta', '2026-13-45'),
    { name: 'sem id', date: '2026-10-10' },
  ],
  runs: [
    { id: 'run-f', race_id: 'jornada-feita', kind: 'competicao', date: '2026-08-23', distance_km: 7.4, duration_seconds: 1900, details: { official_time_seconds: 1900 } },
    { id: 'run-x', kind: 'treino', date: '2026-09-01', distance_km: 10, duration_seconds: 3000 },
  ],
};

describe('groupRaces — invariância sem inscrição (Fase 3)', () => {
  it('sem `cup` (ou cup null): a mesma saída da cópia de antes da Fase 3, com as mesmas quatro chaves', () => {
    const antes = groupRacesAntesDaFase3(MISTURA);
    const hoje = groupRaces(MISTURA);
    expect(hoje).toStrictEqual(antes);
    expect(groupRaces({ ...MISTURA, cup: null })).toStrictEqual(antes);
    expect(groupRaces({ ...MISTURA, cup: undefined })).toStrictEqual(antes);
    expect(Object.keys(hoje)).toEqual(['proximas', 'porRegistar', 'concluidas', 'total']);
    // Nenhum campo novo nas entradas (nem `jornada: undefined`).
    for (const e of [...hoje.proximas, ...hoje.porRegistar]) expect(Object.keys(e)).toEqual(['race', 'days']);
    for (const e of hoje.concluidas) expect(Object.keys(e)).toEqual(['race', 'run', 'outcome', 'achievements']);
    // Sem vista nem pista, o listing é null: groupRaces não chega a mudar.
    expect(cupListingOf(null, false)).toBeNull();
  });
});

describe('groupRaces — com inscrição (o bloco fixo do Troféu)', () => {
  const VIEW = {
    catalogReady: true,
    catalogStatus: 'ready',
    roundLabel: 'Jornada',
    rounds: [
      { id: 'r2', round_no: 2, chip: 'J2' },
      { id: 'r3', round_no: 3, chip: 'J3' },
      { id: 'r4', round_no: 4, chip: 'J4' },
      { id: 'r5', round_no: 5, chip: 'J5' },
      { id: 'r1', round_no: 1, chip: 'J1' },
    ],
  };
  const INSCRITO = {
    today: TODAY,
    raceEvents: [
      race('normal', '2026-10-04', { race_priority: 'a' }),
      race('j3', '2026-09-27', { race_priority: 'b', cup_round_id: 'r3' }),
      race('j4', '2026-10-11', { race_priority: 'b', cup_round_id: 'r4' }),
      race('j5-promovida', '2026-10-25', { race_priority: 'a', cup_round_id: 'r5' }),
      race('j2', '2026-09-06', { race_priority: 'b', cup_round_id: 'r2' }),
      race('j1', '2026-08-23', { race_priority: 'b', cup_round_id: 'r1', status: 'concluida' }),
      race('esquecida', '2026-08-01', { race_priority: 'b' }),
      race('outra-edicao', '2026-09-01', { race_priority: 'b', cup_round_id: 'r-de-outra-edicao' }),
    ],
    runs: [],
  };

  it('as jornadas fixas saem das próximas e das por registar para `trofeu`, pela mesma ordem', () => {
    const cup = cupListingOf(VIEW);
    const g = groupRaces({ ...INSCRITO, cup });
    const base = groupRaces(INSCRITO);
    expect(g.proximas.map((e) => e.race.id)).toEqual(['normal', 'j5-promovida']);
    expect(g.trofeu.proximas.map((e) => e.race.id)).toEqual(['j3', 'j4']);
    expect(g.porRegistar.map((e) => e.race.id)).toEqual(['outra-edicao', 'esquecida']);
    expect(g.trofeu.porRegistar.map((e) => e.race.id)).toEqual(['j2']);
    expect(g.total).toBe(base.total);
    // Os dias continuam os mesmos.
    expect(g.trofeu.proximas.map((e) => e.days)).toEqual([14, 28]);
  });

  it('`jornada` só nas provas das jornadas desta edição — também a promovida e as concluídas', () => {
    const g = groupRaces({ ...INSCRITO, cup: cupListingOf(VIEW) });
    const promovida = g.proximas.find((e) => e.race.id === 'j5-promovida');
    expect(promovida.jornada).toEqual({ roundId: 'r5', roundNo: 5, chip: 'J5', roundLabel: 'Jornada' });
    expect(g.proximas.find((e) => e.race.id === 'normal')).not.toHaveProperty('jornada');
    expect(g.porRegistar.find((e) => e.race.id === 'outra-edicao')).not.toHaveProperty('jornada');
    expect(g.trofeu.proximas[0].jornada.chip).toBe('J3');
    expect(g.concluidas.map((e) => [e.race.id, e.jornada?.chip ?? null])).toEqual([['j1', 'J1']]);
  });

  it('com a pista e a vista a chegar: qualquer prova de jornada não promovida já sai (sem piscar), e sem chip', () => {
    for (const cup of [cupListingOf(null, true), cupListingOf({ ...VIEW, catalogReady: false, catalogStatus: 'loading' })]) {
      expect(cup.loading).toBe(true);
      const g = groupRaces({ ...INSCRITO, cup });
      expect(g.trofeu.proximas.map((e) => e.race.id)).toEqual(['j3', 'j4']);
      expect(g.trofeu.porRegistar.map((e) => e.race.id)).toEqual(['j2', 'outra-edicao']);
      expect(g.proximas.map((e) => e.race.id)).toEqual(['normal', 'j5-promovida']);
      expect([...g.proximas, ...g.porRegistar, ...g.concluidas].some((e) => 'jornada' in e)).toBe(false);
    }
  });

  it('catálogo em erro: nenhuma prova fica presa no bloco (voltam às linhas normais)', () => {
    const cup = cupListingOf({ ...VIEW, catalogReady: false, catalogStatus: 'erro' });
    const g = groupRaces({ ...INSCRITO, cup });
    expect(g.trofeu).toEqual({ proximas: [], porRegistar: [] });
    expect(g.proximas.length + g.porRegistar.length).toBe(groupRaces(INSCRITO).proximas.length + groupRaces(INSCRITO).porRegistar.length);
  });
});
