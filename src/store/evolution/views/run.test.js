import { describe, it, expect, beforeEach } from 'vitest';
import { buildRunView, weeklyAcwr, watchMetricsOf, fmtRange, RUN_MIN_CLOSED } from './run';
import { getEvolutionViewDef } from '../registry';
import { resetEvolutionCore } from '../core';

/* Vista da Corrida (2026-10-04, fase 5): período de calendário, só dias
   fechados, "desde", ▲/▼ contra o anterior equivalente, barras com o mesmo
   intervalo dos KPIs e o ACWR por semanas fechadas (R1, R5, R6, R10). "Hoje" é
   passado por argumento — a vista é pura. */

const HOJE = '2026-10-04'; // domingo
const run = (date, km = 10, over = {}) => ({ id: `${date}-${km}`, date, distance_km: km, duration_seconds: km * 300, kind: 'treino', details: {}, ...over });
const view = (runs, kind, offset = 0, today = HOJE, extra = {}) =>
  buildRunView([runs, extra.profile || {}, extra.raceEvents || [], [], []], { kind, offset }, today);

beforeEach(() => resetEvolutionCore());

describe('registo', () => {
  it('regista a vista "corrida" com os dados de que depende', () => {
    const def = getEvolutionViewDef('corrida');
    expect(def).toBeTruthy();
    const state = { runs: [1], profile: [2], raceEvents: [3], coachPlans: [4], coachPlanItems: [5], meals: [6] };
    expect(def.deps(state)).toEqual([[1], [2], [3], [4], [5]]);
  });
});

describe('só dias fechados do período (R2)', () => {
  it('hoje (domingo 4 out) fica fora da semana em curso', () => {
    const v = view([run('2026-09-28', 5), run('2026-10-03', 8), run(HOJE, 99)], 'semana');
    expect(v.cur.count).toBe(2);
    expect(v.cur.km).toBe(13);
    expect(v.closedDays).toBe(6);
    expect(v.bars.values).toEqual([5, 0, 0, 0, 0, 8]);
    expect(v.bars.total).toBe(13);
  });

  it('a soma das barras é o total dos KPIs em todos os tipos de período', () => {
    const runs = [run('2026-01-10', 7), run('2026-02-02', 5), run('2026-09-12', 12), run('2026-10-01', 4), run('2026-10-03', 6.5), run(HOJE, 50)];
    for (const kind of ['semana', 'mes', 'trimestre', 'ano']) {
      const v = view(runs, kind);
      expect(v.bars.total).toBeCloseTo(v.cur.km, 6);
      expect(v.bars.values.reduce((s, x) => s + x, 0)).toBeCloseTo(v.cur.km, 6);
    }
  });

  it('por dia em Semana e Mês, por semana em Trimestre e Ano', () => {
    const runs = [run('2026-07-01', 5), run('2026-10-02', 5)];
    expect(view(runs, 'semana').bars.unit).toBe('day');
    expect(view(runs, 'mes').bars.unit).toBe('day');
    expect(view(runs, 'trimestre').bars.unit).toBe('week');
    expect(view(runs, 'ano').bars.unit).toBe('week');
  });

  it('nenhum dia antes do 1.º registo é uma barra a zero ("desde")', () => {
    const v = view([run('2026-09-20', 10), run('2026-09-27', 6)], 'ano');
    expect(v.dataStartISO).toBe('2026-09-20');
    expect(v.bars.labels[0]).toBe('20 set (1 dia)');
    expect(v.bars.counts.reduce((s, x) => s + x, 0)).toBe(v.closedDays);
    expect(v.closedDays).toBe(14); // 20 set … 3 out
  });

  it('a semana parcial diz quantos dias tem (trimestre a começar a meio da semana)', () => {
    const v = view([run('2026-09-01', 5), run('2026-10-02', 5)], 'trimestre');
    expect(v.bars.labels).toEqual(['1 – 3 out (3 dias)']);
  });

  it('sem dias fechados não há barras', () => {
    const v = view([run('2026-09-30', 5)], 'semana', 0, '2026-10-05');
    expect(v.bars).toBeNull();
    expect(v.closedDays).toBe(0);
  });

  it('o pace só conta corridas com distância E tempo, e conta quantas', () => {
    const v = view([run('2026-10-01', 10, { duration_seconds: 3000 }), run('2026-10-02', 10, { duration_seconds: null }), run('2026-10-03', null, { duration_seconds: 900 })], 'semana');
    expect(v.cur.count).toBe(3);
    expect(v.cur.withTime).toBe(1);
    expect(v.cur.paceSec).toBe(300);
  });
});

describe('estado de arranque (R6/R8)', () => {
  it('segunda-feira: a começar', () => {
    const v = view([run('2026-09-29', 5)], 'semana', 0, '2026-10-05');
    expect(v.earlyState).toBe('a_comecar');
    expect(v.firstDay).toBe(false);
    expect(v.prevFull.count).toBe(1);
    expect(v.todayRuns.count).toBe(0);
  });

  it('o mês com 3 dias fechados é "cedo"; com 4 já é "ok"', () => {
    const base = [run('2026-09-01', 5)];
    expect(view(base, 'mes', 0, '2026-10-04').earlyState).toBe('cedo');
    expect(view(base, 'mes', 0, '2026-10-05').earlyState).toBe('ok');
    expect(RUN_MIN_CLOSED).toBe(4);
  });

  it('conta os dias fechados COM registo: quem começou a 2 out tem 2, não 3 (cedo)', () => {
    const v = view([run('2026-10-02', 5)], 'mes');
    expect(v.closedDays).toBe(2);
    expect(v.earlyState).toBe('cedo');
  });

  it('o 1.º registo é de hoje: a começar, sem dizer que "o mês começou hoje"', () => {
    const v = view([run(HOJE, 5)], 'mes');
    expect(v.closedDays).toBe(0);
    expect(v.earlyState).toBe('a_comecar');
    expect(v.firstDay).toBe(true);
    expect(v.todayRuns).toMatchObject({ count: 1, km: 5 });
  });

  it('um período anterior ao 1.º registo não é "a começar": é antes dos dados', () => {
    const v = view([run('2026-09-12', 5)], 'mes', -12);
    expect(v.beforeData).toBe(true);
    expect(v.earlyState).toBe('ok');
    expect(v.cur.count).toBe(0);
    expect(v.bars).toBeNull();
  });
});

describe('▲/▼ contra o anterior equivalente e fechado (R5)', () => {
  it('semana em curso com 6 dias fechados: os mesmos 6 dias da anterior (21 – 26 set)', () => {
    const v = view([run('2026-09-01', 3), run('2026-09-22', 5), run('2026-09-27', 20), run('2026-09-29', 9)], 'semana');
    expect(v.prevCoverage).toBe('full');
    expect(v.delta).toMatchObject({ label: '21 – 26 set', windowDays: 6, km: { cur: 9, prev: 5 }, count: { cur: 1, prev: 1 } });
  });

  it('período anterior com o mesmo nº de dias: o nome', () => {
    const v = view([run('2026-09-01', 3), run('2026-09-22', 5), run('2026-09-29', 9)], 'semana', -1);
    expect(v.delta.label).toBe('semana de 14 set');
    expect(v.delta.windowDays).toBe(7);
  });

  it('mês fechado contra um mês mais comprido: compara-se o mesmo número de dias', () => {
    const v = view([run('2026-08-01', 5), run('2026-08-31', 50), run('2026-09-02', 8)], 'mes', -1);
    expect(v.delta.windowDays).toBe(30);
    expect(v.delta.label).toBe('1 – 30 ago');
    expect(v.delta.km).toEqual({ cur: 8, prev: 5 }); // o dia 31 de agosto fica de fora
  });

  it('sem anterior com registos desde o início não há seta', () => {
    expect(view([run('2026-09-12', 5)], 'mes', -1).delta).toBeNull();
    expect(view([run('2026-09-12', 5)], 'mes', -1).prevCoverage).toBe('none');
    // o anterior só em parte antes do 1.º registo
    const parcial = view([run('2026-08-20', 5), run('2026-09-12', 5)], 'mes', -1);
    expect(parcial.prevCoverage).toBe('partial');
    expect(parcial.delta).toBeNull();
  });

  it('em "cedo" não há seta (o anterior vai em linha simples)', () => {
    const v = view([run('2026-09-01', 5), run('2026-10-02', 5)], 'mes');
    expect(v.earlyState).toBe('cedo');
    expect(v.delta).toBeNull();
    expect(v.prevFull.count).toBe(1);
  });

  it('o pace só tem seta com pelo menos 2 corridas com tempo em cada período', () => {
    const uma = view([run('2026-08-01', 10), run('2026-09-02', 10), run('2026-09-08', 10)], 'mes', -1);
    expect(uma.delta.pace).toBeNull();
    const duas = view([run('2026-08-01', 10), run('2026-08-08', 10), run('2026-09-02', 10, { duration_seconds: 2700 }), run('2026-09-08', 10, { duration_seconds: 2700 })], 'mes', -1);
    expect(duas.delta.pace).toEqual({ cur: 270, prev: 300 });
  });

  it('a média por semana usa as semanas fechadas que tocam o período (R4, 2026-10-05)', () => {
    // Setembro: 31 ago, 7, 14 e 21 set; a de 28 set só fecha a 4 out e a corrida de 30 set fica para outubro.
    const v = view([run('2026-08-01', 1), run('2026-09-08', 10), run('2026-09-15', 20), run('2026-09-22', 30), run('2026-09-30', 99)], 'mes', -1);
    expect(v.weekly.weeks).toBe(4);
    expect(v.weekly.avgKm).toBe(15);
    expect(v.weekly.range).toBe('31 ago – 27 set');
    const outubro = view([run('2026-09-01', 1)], 'mes');
    expect(outubro.weekly).toEqual({ weeks: 0, avgKm: null, range: null, nextCloseISO: '2026-10-04' });
    expect(view([run('2026-09-01', 1)], 'semana').weekly.avgKm).toBeNull();
  });

  it('outubro a 12 out já tem 2 semanas que o tocam (28 set – 4 out e 5 – 11 out) e a média aparece', () => {
    // A semana que cruza a fronteira conta o km da semana toda (28 e 30 set incluídos).
    const v = view([run('2026-09-01', 1), run('2026-09-28', 6), run('2026-10-01', 4), run('2026-10-06', 10)], 'mes', 0, '2026-10-12');
    expect(v.weekly.weeks).toBe(2);
    expect(v.weekly.avgKm).toBe(10);
    expect(v.weekly.range).toBe('28 set – 11 out');
  });
});

describe('R1 — ACWR por semanas fechadas', () => {
  const regulares = [run('2026-08-31', 20), run('2026-09-07', 20), run('2026-09-14', 20), run('2026-09-21', 36.02)];

  it('12 semanas; a última é a em curso e não tem rácio', () => {
    const w = weeklyAcwr(regulares, HOJE);
    expect(w).toHaveLength(12);
    expect(w.at(-1)).toMatchObject({ weekStart: '2026-09-28', inProgress: true, ratio: null, zone: null, hasEnoughData: false });
    expect(w.filter((x) => x.inProgress)).toHaveLength(1);
  });

  it('a semana em curso fica fora das contas: o rácio das fechadas não muda com a corrida de hoje', () => {
    const sem = weeklyAcwr(regulares, HOJE);
    const com = weeklyAcwr([...regulares, run('2026-10-03', 80), run(HOJE, 80)], HOJE);
    expect(com.slice(0, -1)).toEqual(sem.slice(0, -1));
    expect(com.at(-1).acuteLoad).toBe(160);
  });

  it('o rácio e o estado da semana de 21 set: 1,5005 é "Perigo" (> e não >=, sobre o rácio sem arredondar)', () => {
    const w = weeklyAcwr(regulares, HOJE).find((x) => x.weekStart === '2026-09-21');
    expect(w.ratio).toBeCloseTo(1.5005, 3); // sem arredondar: quem mostra formata com fmtRatio
    expect(w.zone).toBe('danger'); // …mas o estado é o do valor real
    expect(w.hasEnoughData).toBe(true);
  });

  it('exatamente 1,30 é zona segura (limiar `>`)', () => {
    const w = weeklyAcwr([run('2026-08-31', 18), run('2026-09-07', 18), run('2026-09-14', 18), run('2026-09-21', 26)], HOJE).find((x) => x.weekStart === '2026-09-21');
    expect(w.ratio).toBe(1.3);
    expect(w.zone).toBe('safe');
  });

  it('sem corridas em 3 das 4 semanas não há rácio', () => {
    const w = weeklyAcwr([run('2026-09-14', 20), run('2026-09-21', 20)], HOJE).find((x) => x.weekStart === '2026-09-21');
    expect(w.hasEnoughData).toBe(false);
    expect(w.ratio).toBeNull();
  });

  it('semanas inteiras antes do 1.º registo não são zero', () => {
    const w = weeklyAcwr([run('2026-09-21', 20)], HOJE, '2026-09-21');
    expect(w[0].acuteLoad).toBeNull();
    expect(w.find((x) => x.weekStart === '2026-09-21').acuteLoad).toBe(20);
    expect(w.find((x) => x.weekStart === '2026-09-14').acuteLoad).toBeNull();
  });

  it('o KPI é o de runAcwr (hoje, 7 d vs 28 d) e não depende do período', () => {
    const runs = [run('2026-09-10', 10), run('2026-09-17', 10), run('2026-09-24', 10), run('2026-10-01', 10)];
    const a = view(runs, 'semana');
    const b = view(runs, 'ano');
    expect(a.acwr).toBe(b.acwr); // a mesma lista, o mesmo objeto (core)
    expect(a.acwr.hasEnoughData).toBe(true);
    expect(a.weeklyAcwr).toEqual(b.weeklyAcwr);
  });
});

describe('VDOT, recordes e previsão', () => {
  const tempo = (date, seconds, km = 10) => run(date, km, { duration_seconds: seconds, training_type: 'tempo' });

  it('o VDOT de um período compara-se com o do anterior (≥3 pontos em cada)', () => {
    const runs = [
      tempo('2026-08-01', 3300), tempo('2026-08-09', 3300), tempo('2026-08-16', 3300),
      tempo('2026-09-02', 3000), tempo('2026-09-09', 3000), tempo('2026-09-16', 3000),
    ];
    const v = view(runs, 'mes', -1);
    expect(v.vdotNote).toBeNull();
    expect(v.vdotCompare).toMatchObject({ nCurrent: 3, nPrevious: 3, previousLabel: 'agosto', previousWhere: 'em agosto' });
    expect(v.vdotCompare.current).toBeGreaterThan(v.vdotCompare.previous);
  });

  it('com 2 pontos num dos períodos, não compara', () => {
    const runs = [tempo('2026-08-02', 3300), tempo('2026-08-09', 3300), tempo('2026-09-02', 3000), tempo('2026-09-09', 3000), tempo('2026-09-16', 3000)];
    expect(view(runs, 'mes', -1).vdotCompare).toBeNull();
  });

  it('o recorde de sempre diz se é deste período', () => {
    const runs = [tempo('2026-06-01', 3300, 5), run('2026-09-10', 5, { duration_seconds: 1200 })];
    const v = view(runs, 'mes', -1);
    const r5 = v.records.find((r) => r.km === 5);
    expect(r5.best.date).toBe('2026-09-10');
    expect(r5.inPeriod).toBe(true);
    expect(view(runs, 'mes', -3).records.find((r) => r.km === 5).inPeriod).toBe(false);
    expect(view(runs, 'mes', -3).records.find((r) => r.km === 5).best.date).toBe('2026-09-10'); // de sempre, fora do período
  });

  it('a previsão não cai a 00:00 com corridas sem tempo (R2): só entram as com distância e tempo', () => {
    const raceEvents = [{ id: 'p', name: 'Dez', date: '2026-11-15', distance_km: 10, status: 'agendada', race_type: 'road', race_priority: 'a' }];
    const v = view([run('2026-09-12', 10, { duration_seconds: 3000 }), run('2026-09-20', 8, { duration_seconds: null })], 'ano', 0, HOJE, { raceEvents });
    expect(Math.round(v.racePrediction.predictedSeconds)).toBe(3000);
  });
});

describe('veredicto e vazio', () => {
  it('período sem corridas diz a última (antes do período) e não "zero corridas"', () => {
    const v = view([run('2026-09-12', 10), run('2026-08-01', 10)], 'semana');
    expect(v.cur.count).toBe(0);
    expect(v.lastRunDate).toBe('2026-09-12');
    expect(v.verdict.text).not.toMatch(/zero/);
  });

  it('a "última" de um período fechado é a última até ao fim dele, não a de depois', () => {
    const v = view([run('2026-08-12', 10), run('2026-09-12', 10)], 'mes', -2);
    expect(v.lastRunDate).toBe('2026-08-12');
    expect(v.cur.count).toBe(1);
  });

  it('o scope diz onde cai o período', () => {
    expect(view([run('2026-09-12')], 'mes').scope).toBe('em outubro');
    expect(view([run('2026-09-12')], 'semana').scope).toBe('nesta semana');
    expect(view([run('2026-09-12')], 'mes', -1).scope).toBe('em setembro');
  });
});

describe('relógio (desnível, calorias, cadência)', () => {
  it('cada métrica diz em quantas corridas existe', () => {
    const w = watchMetricsOf([
      run('2026-09-01', 10, { details: { elevation_gain_m: 100, calories_kcal: 500 } }),
      run('2026-09-02', 10, { details: { elevation_gain_m: 50 } }),
      run('2026-09-03', 10, { details: {} }),
    ]);
    expect(w).toMatchObject({ total: 3, elevation: 150, nElevation: 2, calories: 500, nCalories: 1, avgCadence: null, nCadence: 0, hasAny: true });
  });

  it('a cadência é ponderada pelo tempo', () => {
    const w = watchMetricsOf([
      run('2026-09-01', 10, { duration_seconds: 3600, details: { cadence_spm: 160 } }),
      run('2026-09-02', 3, { duration_seconds: 1200, details: { cadence_spm: 180 } }),
    ]);
    expect(w.avgCadence).toBe(165);
    expect(w.cadenceWeighted).toBe(true);
  });

  it('sem tempo em nenhuma, cai na média simples e diz que não é ponderada', () => {
    const w = watchMetricsOf([
      run('2026-09-01', 10, { duration_seconds: null, details: { cadence_spm: 160 } }),
      run('2026-09-02', 10, { duration_seconds: null, details: { cadence_spm: 180 } }),
    ]);
    expect(w.avgCadence).toBe(170);
    expect(w.cadenceWeighted).toBe(false);
  });

  it('sem nada, não há cartão', () => {
    expect(watchMetricsOf([run('2026-09-01')]).hasAny).toBe(false);
  });
});

describe('fmtRange', () => {
  it('um dia, o mesmo mês e meses diferentes', () => {
    expect(fmtRange('2026-10-03', '2026-10-03')).toBe('3 out');
    expect(fmtRange('2026-09-21', '2026-09-26')).toBe('21 – 26 set');
    expect(fmtRange('2026-09-28', '2026-10-03')).toBe('28 set – 3 out');
  });

  it('com o dia de hoje, acrescenta o ano quando não é o corrente (como o formatRange do calendário)', () => {
    const hoje = '2026-10-04';
    expect(fmtRange('2026-01-01', '2026-10-03', hoje)).toBe('1 jan – 3 out');
    expect(fmtRange('2025-01-01', '2025-10-03', hoje)).toBe('1 jan – 3 out 2025');
    expect(fmtRange('2025-09-21', '2025-09-26', hoje)).toBe('21 – 26 set 2025');
    expect(fmtRange('2025-12-28', '2026-01-03', hoje)).toBe('28 dez 2025 – 3 jan 2026');
    expect(fmtRange('2025-03-03', '2025-03-03', hoje)).toBe('3 mar 2025');
  });
});

describe('revisão da Corrida (2026-10-04) — a janela atual é a dos KPIs', () => {
  it('outubro fechado contra setembro, com corrida a 31 out: delta.cur === KPI', () => {
    const runs = [run('2026-09-01', 10), run('2026-10-10', 10), run('2026-10-31', 21)];
    const v = view(runs, 'mes', -1, '2026-11-05');
    expect(v.cur).toMatchObject({ count: 2, km: 31 });
    expect(v.delta.count.cur).toBe(v.cur.count);
    expect(v.delta.km.cur).toBe(v.cur.km);
    expect(v.delta.km.prev).toBe(10);
    expect(v.delta.label).toBe('setembro'); // inteiro contra inteiro: o nome
  });

  it('3.º trimestre fechado contra o 2.º, com 21 km a 30 set', () => {
    const runs = [run('2026-04-01', 10), run('2026-09-30', 21)];
    const v = view(runs, 'trimestre', -1);
    expect(v.delta.km).toEqual({ cur: v.cur.km, prev: 10 });
    expect(v.cur.km).toBe(21);
    expect(v.delta.label).toBe('abr – jun 2026');
  });

  it('março em curso no dia 31 contra fevereiro', () => {
    const runs = [run('2026-02-01', 10), run('2026-03-30', 31)];
    const v = view(runs, 'mes', 0, '2026-03-31');
    expect(v.cur.km).toBe(31);
    expect(v.delta.km.cur).toBe(v.cur.km);
    expect(v.delta.km.prev).toBe(10);
    expect(v.delta.label).toBe('fevereiro');
  });

  it('2024 (366 dias) fechado contra 2023: o atual é o ano todo', () => {
    const runs = [run('2023-01-01', 10), run('2024-12-31', 30)];
    const v = view(runs, 'ano', -2, '2026-10-04');
    expect(v.delta.km.cur).toBe(v.cur.km);
    expect(v.cur.km).toBe(30);
  });

  it('a média por semana do anterior é sobre a mesma janela do rótulo', () => {
    // hoje 21 out: 20 dias fechados; o anterior corta-se em 1 – 20 set
    const runs = [run('2026-08-01', 1), run('2026-09-08', 10), run('2026-09-15', 10), run('2026-09-25', 100), run('2026-10-06', 14), run('2026-10-13', 14)];
    const v = view(runs, 'mes', 0, '2026-10-21');
    expect(v.delta.label).toBe('1 – 20 set');
    // Semanas que tocam: outubro 28 set, 5 e 12 out (0, 14, 14); setembro 1 – 20: 31 ago, 7 e 14 set (0, 10, 10).
    expect(v.delta.weekly.cur).toBeCloseTo(28 / 3, 6);
    expect(v.delta.weekly.prev).toBeCloseTo(20 / 3, 6);
  });

  it('o rótulo do anterior leva o ano quando não é o corrente', () => {
    const v = view([run('2024-12-20', 5), run('2026-03-10', 5)], 'ano');
    expect(v.delta.label).toBe('1 jan – 3 out 2025');
    const fechado = view([run('2023-12-20', 5), run('2025-03-10', 5)], 'ano', -1);
    expect(fechado.delta.label).toBe('1 jan – 30 dez 2024');
  });

  it('"cedo" só existe em períodos em curso; um fechado com poucos dias é "ok"', () => {
    const v = view([run('2026-09-28', 5), run('2026-09-29', 5)], 'mes', -1);
    expect(v.closedDays).toBe(3);
    expect(v.earlyState).toBe('ok');
  });

  it('período anterior ao 1.º registo: o veredicto não diz "sem corridas em agosto"', () => {
    const v = view([run('2026-09-12', 5)], 'mes', -2);
    expect(v.verdict.text).toMatch(/anterior ao teu primeiro registo/);
  });
});

describe('limiares (2026-10-05): R2/R3, R4, R5, R10 e para onde ir', () => {
  const zonas = (date, km = 8) => run(date, km, { details: { hr_zones: [{ minutes: 20 }, { minutes: 5 }] } });
  const comFc = (date, km = 8) => run(date, km, { details: { avg_heart_rate_bpm: 150 } });

  it('R2/R3: 0 corridas com zonas neste mês mas com histórico → a vista sabe a última e onde há as 3', () => {
    const runs = [zonas('2026-09-02'), zonas('2026-09-09'), zonas('2026-09-16'), run('2026-10-01', 5)];
    const v = view(runs, 'mes');
    expect(v.zoneRuns).toBe(0);
    expect(v.zonesEver).toEqual({ count: 3, lastDate: '2026-09-16' });
    expect(v.fallbacks.zones).toMatchObject({ type: 'prev', label: 'Ver setembro', where: 'em setembro', count: 3 });
    // Quem nunca teve zonas não leva "última foi a…" nem botão.
    const nunca = view([run('2026-09-02'), run('2026-10-01')], 'mes');
    expect(nunca.zonesEver.count).toBe(0);
    expect(nunca.fallbacks.zones).toBeNull();
  });

  it('R2: se nem o mês passado tem 3, oferece o Ano (o tipo maior) — o que CONTÉM o período', () => {
    const runs = [zonas('2026-02-02'), zonas('2026-04-09'), zonas('2026-09-16'), run('2026-10-01', 5)];
    const v = view(runs, 'mes');
    expect(v.fallbacks.zones).toMatchObject({ type: 'kind', kind: 'ano', count: 3 });
    expect(v.fallbacks.zones.label).toBe('Ver o ano');
    // Julho (mês −3): o ano que o contém é o de hoje — leva lá (2026-10-05).
    expect(view(runs, 'mes', -3).fallbacks.zones).toMatchObject({ type: 'kind', kind: 'ano', count: 3 });
    // Outubro de 2025: nem setembro de 2025 nem 2025 têm nada → sem botão.
    expect(view(runs, 'mes', -12).fallbacks.zones).toBeNull();
  });

  it('semana passada com 1 corrida com zonas: leva a setembro, o mês onde a semana começa (verificação no browser, 2026-10-05)', () => {
    // Hoje 5 out (segunda): semana passada = 28 set – 4 out (1 com zonas); 21–27 set sem nenhuma.
    const runs = [zonas('2026-09-02'), zonas('2026-09-09'), zonas('2026-09-29')];
    const v = view(runs, 'semana', -1, '2026-10-05');
    expect(v.zoneRuns).toBe(1);
    expect(v.fallbacks.zones).toMatchObject({ type: 'period', kind: 'mes', offset: -1, label: 'Ver setembro', where: 'em setembro', count: 3 });
  });

  it('R2/R3: a corrida com zonas/FC de HOJE não conta para "a última foi a…" (hoje ainda não entra no período)', () => {
    // 5 out: o mês de outubro só tem hoje (nenhum dia fechado). A corrida de hoje não é "a última".
    const runs = [zonas('2026-09-02'), zonas('2026-09-09'), zonas('2026-09-16'), zonas('2026-10-05')];
    const v = view(runs, 'mes', 0, '2026-10-05');
    expect(v.zonesEver).toEqual({ count: 3, lastDate: '2026-09-16' });
    expect(v.hrEver.lastDate).toBeNull();
    // Só a de hoje: para a vista, o atleta ainda não tem nenhuma com zonas.
    const soHoje = view([zonas('2026-10-05')], 'mes', 0, '2026-10-05');
    expect(soHoje.zonesEver).toEqual({ count: 0, lastDate: null });
    expect(soHoje.fallbacks.zones).toBeNull();
    // Com FC: idem.
    const fc = view([comFc('2026-09-02'), comFc('2026-09-09'), comFc('2026-09-16'), comFc('2026-10-05')], 'mes', 0, '2026-10-05');
    expect(fc.hrEver).toEqual({ count: 3, lastDate: '2026-09-16' });
  });

  it('R3: a eficiência conta corridas com FC média, distância e tempo', () => {
    const runs = [comFc('2026-09-02'), comFc('2026-09-09'), comFc('2026-09-16'), run('2026-10-01', 5)];
    const v = view(runs, 'mes');
    expect(v.scatter).toHaveLength(0);
    expect(v.hrEver.count).toBe(3);
    expect(v.fallbacks.efficiency).toMatchObject({ type: 'prev', label: 'Ver setembro' });
  });

  it('R10: mês sem corridas fechadas mas com setembro: a vista diz onde há corridas', () => {
    const v = view([run('2026-09-10', 8), run('2026-09-20', 12)], 'mes', 0, '2026-10-12');
    expect(v.cur.count).toBe(0);
    expect(v.fallbacks.data).toMatchObject({ type: 'prev', label: 'Ver setembro', count: 2, km: 20 });
  });

  it('R5: o VDOT não se compara numa semana e a vista di-lo uma vez', () => {
    const tempo = (date, seconds) => run(date, 10, { duration_seconds: seconds, training_type: 'tempo' });
    const runs = [tempo('2026-09-21', 3000), tempo('2026-09-23', 3000), tempo('2026-09-25', 3000), tempo('2026-09-14', 3300), tempo('2026-09-16', 3300), tempo('2026-09-18', 3300)];
    const v = view(runs, 'semana', -1);
    expect(v.vdotCompare).toBeNull();
    expect(v.vdotNote).toBe('A comparação do VDOT é por mês ou mais.');
  });

  it('R5: o mês em curso compara com o anterior cortado aos mesmos dias, e diz o que falta', () => {
    const tempo = (date, seconds) => run(date, 10, { duration_seconds: seconds, training_type: 'tempo' });
    // Hoje 12 out (11 dias fechados): outubro 1–11 vs setembro 1–11. Setembro teve 4 treinos, só 2 nos primeiros 11 dias.
    const runs = [tempo('2026-09-01', 3300), tempo('2026-09-08', 3300), tempo('2026-09-15', 3300), tempo('2026-09-22', 3300), tempo('2026-10-03', 3000)];
    const v = view(runs, 'mes', 0, '2026-10-12');
    expect(v.vdotCompare).toBeNull();
    expect(v.vdotNote).toBe('Para comparar o VDOT preciso de 3 treinos de qualidade em cada mês — outubro vai em 1, setembro (1 – 11 set) teve 2.');
  });

  it('R5: com ≥3 pontos nos mesmos dias dos dois lados compara, sem nota', () => {
    const tempo = (date, seconds) => run(date, 10, { duration_seconds: seconds, training_type: 'tempo' });
    const runs = [
      tempo('2026-09-01', 3300), tempo('2026-09-04', 3300), tempo('2026-09-08', 3300), tempo('2026-09-25', 3300),
      tempo('2026-10-02', 3000), tempo('2026-10-06', 3000), tempo('2026-10-10', 3000),
    ];
    const v = view(runs, 'mes', 0, '2026-10-12');
    expect(v.vdotNote).toBeNull();
    expect(v.vdotCompare).toMatchObject({ nCurrent: 3, nPrevious: 3 }); // a corrida de 25 set fica fora da janela
  });

  it('R5: o anterior começou antes do 1.º registo → diz porquê', () => {
    const tempo = (date, seconds) => run(date, 10, { duration_seconds: seconds, training_type: 'tempo' });
    const v = view([tempo('2026-09-05', 3300), tempo('2026-10-01', 3000)], 'mes', 0, '2026-10-12');
    expect(v.vdotNote).toMatch(/^Setembro começou antes do teu primeiro registo/);
  });
});

/* Caminhada (2026-10-05, runKinds.ts): a vista da Corrida é só de corridas e
   diz as caminhadas do período à parte ("N caminhadas · X km"). */
describe('caminhadas à parte', () => {
  const walk = (date, km, over = {}) => run(date, km, { training_type: 'caminhada', duration_seconds: km * 700, ...over });

  it('não entram nos KPIs, no ritmo, nas barras, na carga nem nos recordes', () => {
    const runs = [run('2026-09-29', 8), run('2026-10-02', 6)];
    const withWalks = [...runs, walk('2026-09-30', 5), walk('2026-10-03', 4)];
    const a = view(runs, 'semana');
    const b = view(withWalks, 'semana');
    expect(b.cur).toEqual(a.cur);
    expect(b.bars.values).toEqual(a.bars.values);
    expect(b.acwr).toEqual(a.acwr);
    expect(b.records.map((r) => r.best)).toEqual(a.records.map((r) => r.best));
  });

  it('dizem-se à parte, do 1.º dia do período até hoje (inclusive)', () => {
    const v = view([run('2026-09-29', 8), walk('2026-09-30', 5), walk('2026-10-03', 4.2), walk(HOJE, 3)], 'semana');
    expect(v.walks).toMatchObject({ count: 3, km: 12.2, from: '2026-09-28', to: HOJE });
    expect(view([run('2026-09-29', 8)], 'semana').walks).toBeNull();
  });

  it('quem só caminha (pós-operatório) não tem corridas, mas vê as caminhadas', () => {
    const v = view([walk('2026-10-01', 3), walk('2026-10-02', 3.5)], 'semana');
    expect(v.hasRuns).toBe(false);
    expect(v.walks).toMatchObject({ count: 2, km: 6.5 });
  });
});
