import { describe, it, expect, vi, afterEach } from 'vitest';
import { ageFromBirthDate } from './body';

// Congelar "hoje" — sem isto os testes passam a falhar sozinhos com o tempo.
function comHoje(iso, fn) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
  try { fn(); } finally { vi.useRealTimers(); }
}

afterEach(() => vi.useRealTimers());

describe('ageFromBirthDate', () => {
  it('calcula a idade quando o aniversário já passou este ano', () => {
    comHoje('2026-08-07', () => {
      expect(ageFromBirthDate('1990-03-15')).toBe(36);
    });
  });

  it('não conta o ano quando o aniversário ainda não chegou', () => {
    comHoje('2026-08-07', () => {
      expect(ageFromBirthDate('1990-12-25')).toBe(35);
    });
  });

  it('conta o ano no próprio dia do aniversário', () => {
    comHoje('2026-08-07', () => {
      expect(ageFromBirthDate('1990-08-07')).toBe(36);
    });
  });

  it('não conta no dia anterior ao aniversário', () => {
    comHoje('2026-08-07', () => {
      expect(ageFromBirthDate('1990-08-08')).toBe(35);
    });
  });

  it('devolve null sem data ou com data inválida', () => {
    expect(ageFromBirthDate(null)).toBeNull();
    expect(ageFromBirthDate('')).toBeNull();
    expect(ageFromBirthDate('não é uma data')).toBeNull();
  });

  it('rejeita datas absurdas em vez de devolver um número enganador', () => {
    comHoje('2026-08-07', () => {
      expect(ageFromBirthDate('2030-01-01')).toBeNull(); // futuro
      expect(ageFromBirthDate('1850-01-01')).toBeNull(); // 176 anos
    });
  });
});

import {
  BODY_METRIC_BY_KEY as M,
  fmtMetric,
  fmtSigned,
  readingOf,
  compareValues,
  betterDirection,
  comparisonChoices,
  resolveComparison,
  compareAssessments,
  fmtDayShort,
  fmtWeekdayDay,
  sortAssessments,
  metricsRegistered,
} from './body';

/* Ajudantes do Corpo (2026-10-04, fase 5 — plano §3 Corpo e D1). */

describe('formatação (C4)', () => {
  it('vírgula decimal e unidade uma só vez', () => {
    expect(fmtMetric(M.weight_kg, 72.4)).toBe('72,4 kg');
    expect(fmtMetric(M.bmr_kcal, 1650).replace(/[\u00a0\u202f]/g, ' ')).toBe('1 650 kcal');
    expect(fmtMetric(M.bmi, 23.4)).toBe('23,4');
    expect(fmtMetric(M.weight_kg, null)).toBe('—');
    expect(fmtSigned(M.weight_kg, 0.4)).toBe('+0,4 kg');
    expect(fmtSigned(M.weight_kg, -0.4)).toBe('−0,4 kg');
  });

  // 2026-10-04 (verificação no browser, Corpo · Trimestre): «+1 anos».
  it('idade metabólica: singular com ±1, plural no resto', () => {
    expect(fmtSigned(M.metabolic_age, 1)).toBe('+1 ano');
    expect(fmtSigned(M.metabolic_age, -1)).toBe('−1 ano');
    expect(fmtSigned(M.metabolic_age, 2)).toBe('+2 anos');
    expect(fmtMetric(M.metabolic_age, 35)).toBe('35 anos');
    expect(fmtSigned(M.metabolic_age, 0)).toBe('0 anos');
  });

  it('datas curtas com o ano só quando não é o corrente', () => {
    expect(fmtDayShort('2026-09-12', '2026-10-04')).toBe('12 set');
    expect(fmtDayShort('2025-11-01', '2026-10-04')).toBe('1 nov 2025');
    expect(fmtWeekdayDay('2026-10-01', '2026-10-04')).toBe('qui, 1 out');
  });

  it('0 ou vazio não são leituras', () => {
    expect(readingOf({ weight_kg: 0 }, 'weight_kg')).toBeNull();
    expect(readingOf({ weight_kg: '' }, 'weight_kg')).toBeNull();
    expect(readingOf({ weight_kg: '72.5' }, 'weight_kg')).toBe(72.5);
  });
});

describe('compareValues — direção boa, objetivo e ruído', () => {
  it('sem objetivo: a direção natural da métrica; o peso fica neutro', () => {
    expect(compareValues(M.body_fat_pct, 18, 20).tone).toBe('good');
    expect(compareValues(M.muscle_mass_kg, 56, 58).tone).toBe('bad');
    expect(compareValues(M.weight_kg, 75, 78).tone).toBe('neutral');
  });

  it('com objetivo: para o lado do objetivo é bom (também no peso e no sentido "contra" a métrica)', () => {
    expect(compareValues(M.weight_kg, 75, 78, { goal: 72 }).tone).toBe('good');
    expect(compareValues(M.weight_kg, 75, 78, { goal: 80 }).tone).toBe('bad');
    expect(betterDirection(M.body_fat_pct, 10, 12)).toBe('up');
  });

  /* 2026-10-04, revisão: passar o objetivo e acabar mais longe dele do que
     se estava não é "no bom sentido". */
  it('passar o objetivo: bom se fica mais perto, mau se fica mais longe', () => {
    expect(compareValues(M.weight_kg, 65, 73, { goal: 72 }).tone).toBe('bad');
    expect(compareValues(M.weight_kg, 71.5, 73, { goal: 72 }).tone).toBe('good');
    expect(compareValues(M.body_fat_pct, 8, 15, { goal: 14 }).tone).toBe('bad');
  });

  it('abaixo do limiar de ruído é igual', () => {
    const c = compareValues(M.weight_kg, 78.3, 78);
    expect(c.direction).toBe('flat');
    expect(c.tone).toBe('neutral');
    expect(compareValues(M.weight_kg, 78.5, 78).direction).toBe('up');
  });
});

describe('Comparar com… (D1)', () => {
  const datas = ['2026-01-10', '2026-06-01', '2026-07-05', '2026-08-20', '2026-09-12', '2026-10-04'];
  const sorted = datas.map((date, i) => ({ id: `x${i}`, date, weight_kg: 80 - i }));

  it('a anterior, a primeira e "há ~3 meses" (a mais perto de 91 dias antes)', () => {
    const ch = comparisonChoices(sorted, 5);
    expect(ch.previous).toBe(4);
    expect(ch.first).toBe(0);
    expect(ch.quarter).toBe(2); // 5 jul: 91 dias antes de 4 out
    expect(ch.earlier).toEqual([4, 3, 2, 1, 0]);
  });

  it('sem avaliação perto de 3 meses não há atalho; a primeira não se repete se for a anterior', () => {
    expect(comparisonChoices(sorted, 1)).toEqual({ previous: 0, first: null, quarter: null, earlier: [0] });
  });

  it('a primeira avaliação não tem com que comparar', () => {
    expect(comparisonChoices(sorted, 0).previous).toBeNull();
    expect(resolveComparison(sorted, 0, 'prev')).toBeNull();
  });

  it('resolve modos e ids, e um id que já não é anterior volta à anterior', () => {
    expect(resolveComparison(sorted, 5, 'first')).toBe(0);
    expect(resolveComparison(sorted, 5, 'quarter')).toBe(2);
    expect(resolveComparison(sorted, 5, 'id:x3')).toBe(3);
    expect(resolveComparison(sorted, 2, 'id:x3')).toBe(1);
  });

  it('compareAssessments: só as métricas medidas, e sem referência quando a outra não a mediu', () => {
    const rows = compareAssessments({ weight_kg: 76, body_fat_pct: 18 }, { weight_kg: 78 }, { goal_weight_kg: 72 });
    expect(rows.map((r) => r.key)).toEqual(['weight_kg', 'body_fat_pct']);
    expect(rows[0].cmp.tone).toBe('good');
    expect(rows[1].refValue).toBeNull();
    expect(rows[1].cmp).toBeNull();
  });
});

describe('ordem e métricas registadas', () => {
  it('ordena por data, hora de criação e id; ignora as sem data', () => {
    const s = sortAssessments([
      { id: 'b', date: '2026-10-01', created_at: '2026-10-01T09:00' },
      { id: 'a', date: '2026-10-01', created_at: '2026-10-01T08:00' },
      { id: 'c', date: '2026-09-01' },
      { id: 'd' },
    ]);
    expect(s.map((a) => a.id)).toEqual(['c', 'a', 'b']);
  });

  it('só as métricas com alguma leitura', () => {
    expect(metricsRegistered([{ weight_kg: 70 }, { visceral_fat: 8 }]).map((m) => m.key)).toEqual(['weight_kg', 'visceral_fat']);
  });
});

import { bodyGoalSince, goalProgress, weightTrendNeed, weightEstimate } from './body';
import { computeWeightTrend } from '@formulas/weightTrend.ts';

/* Barras do resumo do Corpo e o que falta para a tendência (2026-10-05). */

describe('bodyGoalSince — o dia em que o objetivo foi definido', () => {
  it('o histórico de hoje não tem os objetivos do corpo: sem dia, aproximado', () => {
    const hist = [{ valid_from: '2026-10-03T22:49:00Z', calorie_goal: 2400, source: 'inicial' }];
    expect(bodyGoalSince(hist, 'weight_kg', 76)).toEqual({ since: null, approx: 'sem_historico' });
    expect(bodyGoalSince([], 'weight_kg', 76)).toEqual({ since: null, approx: 'sem_historico' });
  });

  it('com a coluna: o 1.º dia do troço final com este valor (dia de Lisboa)', () => {
    const hist = [
      { valid_from: '2026-07-01T10:00:00Z', goal_weight_kg: 76 },
      { valid_from: '2026-08-01T10:00:00Z', goal_weight_kg: 74 },
      { valid_from: '2026-10-04T23:30:00Z', goal_weight_kg: 76 }, // 5 out em Lisboa
    ];
    expect(bodyGoalSince(hist, 'weight_kg', 76)).toEqual({ since: '2026-10-05', approx: null });
    // Anterior a 3 out: aproximado (o histórico só é de verdade desde aí).
    expect(bodyGoalSince(hist.slice(0, 2), 'weight_kg', 74)).toEqual({ since: '2026-08-01', approx: 'antes_do_historico' });
    // O perfil já mudou e a releitura não chegou: não se sabe o dia.
    expect(bodyGoalSince(hist, 'weight_kg', 72).since).toBeNull();
  });
});

describe('goalProgress — o caminho até ao objetivo', () => {
  const W = M.weight_kg;
  const leituras = [{ date: '2026-07-12', value: 79.4 }, { date: '2026-09-20', value: 78 }, { date: '2026-10-02', value: 77.3 }];

  it('sem dia conhecido: desde a 1.ª leitura dos últimos 90 dias, aproximado — 77,3 → 76,0 é 62% do caminho', () => {
    const p = goalProgress(W, leituras, leituras[2], 76, { since: null, approx: 'sem_historico' });
    expect(p).toMatchObject({ start: leituras[0], remaining: 1.3, pct: 62, reached: false, away: false, approx: 'sem_historico' });
  });

  it('com dia: a última leitura até esse dia é o ponto de partida', () => {
    const p = goalProgress(W, leituras, leituras[2], 76, { since: '2026-09-25', approx: null });
    expect(p.start).toEqual(leituras[1]);
    expect(p.pct).toBe(35); // 0,7 de 2,0
    expect(p.approx).toBeNull();
  });

  it('chegar (a menos do ruído da balança): 100 e "atingido"; afastar-se: 0 com `away`', () => {
    expect(goalProgress(W, leituras, { date: '2026-10-04', value: 75.8 }, 76, null)).toMatchObject({ pct: 100, reached: true });
    expect(goalProgress(W, leituras, { date: '2026-10-04', value: 76.04 }, 76, null)).toMatchObject({ reached: true, remaining: 0 });
    expect(goalProgress(W, leituras, { date: '2026-10-04', value: 80 }, 76, null)).toMatchObject({ pct: 0, away: true, reached: false });
  });

  it('subir para o objetivo (músculo) também conta', () => {
    const m = [{ date: '2026-07-05', value: 30 }, { date: '2026-10-01', value: 32 }];
    expect(goalProgress(M.muscle_mass_kg, m, m[1], 34, null).pct).toBe(50);
  });

  /* Revisão de 2026-10-05: o sentido é o da métrica (ou, no peso, o lado do
     objetivo a partir de AGORA), e o ponto de partida sem dia conhecido é a 1.ª
     leitura dos últimos 90 dias — orientar pela 1.ª leitura de sempre inventava
     "objetivo atingido". */
  const G = M.body_fat_pct;
  const HOJE = { date: '2026-10-05', value: 23 };

  it('gordura acima do objetivo depois de ter estado abaixo: nunca "atingido"', () => {
    const r = [{ date: '2025-03-01', value: 16 }, { date: '2026-07-12', value: 24.5 }, HOJE];
    const p = goalProgress(G, r, HOJE, 18, { since: null, approx: 'sem_historico' });
    expect(p).toMatchObject({ reached: false, away: false, remaining: 5, pct: 23, start: r[1] });
    // Com o dia do objetivo conhecido e a partida do lado bom: afastaste-te.
    const q = goalProgress(G, r, HOJE, 18, { since: '2025-06-01', approx: null });
    expect(q).toMatchObject({ reached: false, away: true, pct: 0, start: r[0] });
  });

  it('gordura já abaixo do objetivo: atingido, mesmo a subir', () => {
    const r = [{ date: '2026-07-12', value: 16 }, { date: '2026-10-05', value: 17 }];
    expect(goalProgress(G, r, r[1], 18, { since: null, approx: 'sem_historico' })).toMatchObject({ reached: true, pct: 100 });
  });

  it('peso com a 1.ª leitura de sempre abaixo do objetivo: conta desde julho, não 2024', () => {
    const r = [{ date: '2024-05-01', value: 72 }, { date: '2026-07-12', value: 79.4 }, { date: '2026-10-05', value: 77.3 }];
    const p = goalProgress(W, r, r[2], 76, { since: null, approx: 'sem_historico' });
    expect(p).toMatchObject({ reached: false, away: false, remaining: 1.3, pct: 62, start: r[1] });
  });

  it('peso do outro lado do objetivo: mais longe que a partida é afastar-se; mais perto só é "atingido" com o dia certo', () => {
    // Julho 75 kg (1 abaixo), hoje 77,3 (1,3 acima): afastou-se.
    const a = [{ date: '2026-07-12', value: 75 }, { date: '2026-10-05', value: 77.3 }];
    expect(goalProgress(W, a, a[1], 76, { since: null, approx: 'sem_historico' })).toMatchObject({ reached: false, away: true });
    // 79,4 → 75: passou os 76 a descer. Com a partida aproximada não se sabe se o
    // queria passar — só o que falta, sem barra; com o dia certo, atingido.
    const b = [{ date: '2026-07-12', value: 79.4 }, { date: '2026-10-05', value: 75 }];
    expect(goalProgress(W, b, b[1], 76, { since: null, approx: 'sem_historico' })).toMatchObject({ reached: false, away: false, noPath: true, remaining: 1 });
    expect(goalProgress(W, b, b[1], 76, { since: '2026-07-12', approx: null })).toMatchObject({ reached: true, pct: 100 });
  });

  it('a única leitura dos 90 dias é a de agora: só o que falta, sem caminho', () => {
    const r = [{ date: '2025-01-01', value: 72 }, { date: '2026-10-05', value: 77.3 }];
    expect(goalProgress(W, r, r[1], 76, { since: null, approx: 'sem_historico' })).toMatchObject({ noPath: true, reached: false, away: false, remaining: 1.3 });
  });

  it('sem objetivo, ou um período anterior ao ponto de partida: nada', () => {
    expect(goalProgress(W, leituras, leituras[2], null, null)).toBeNull();
    expect(goalProgress(W, leituras, leituras[0], 76, { since: '2026-09-25', approx: null })).toBeNull();
  });
});

describe('weightTrendNeed — o que falta, em concreto', () => {
  it('semana com 1 pesagem e outra a 22 set: mais uma, a última entre 2 e 6 out', () => {
    expect(weightTrendNeed(['2026-09-22', '2026-09-29'], '2026-09-30'))
      .toEqual({ more: 1, start: '2026-09-30', from: '2026-10-02', until: '2026-10-06', fresh: false });
  });

  /* Revisão de 2026-10-05: "a última a partir de 14 out" não tinha limite, mas
     a janela é de 14 dias — pesar a 4, 5 e 20 out não dá tendência. */
  it('sem nada nas duas semanas: três novas, a última 10 a 14 dias depois de hoje', () => {
    expect(weightTrendNeed(['2026-03-13'], '2026-10-04')).toEqual({ more: 3, start: '2026-10-04', from: '2026-10-14', until: '2026-10-18', fresh: true });
    expect(weightTrendNeed([], '2026-10-05')).toEqual({ more: 3, start: '2026-10-05', from: '2026-10-15', until: '2026-10-19', fresh: true });
  });

  it('o plano cumpre a régua do weightTrend.ts nas duas pontas, e não passa delas', () => {
    const ok = (dates) => computeWeightTrend(dates.map((date, i) => ({ date, weight: 80 - i * 0.2 }))).sufficient;
    expect(ok(['2026-10-05', '2026-10-06', '2026-10-15'])).toBe(true);
    expect(ok(['2026-10-05', '2026-10-06', '2026-10-19'])).toBe(true);
    expect(ok(['2026-10-05', '2026-10-06', '2026-10-20'])).toBe(false);
  });

  it('as que já tens chegam: null (não pede o que não falta)', () => {
    expect(weightTrendNeed(['2026-09-23', '2026-09-24', '2026-10-05'], '2026-10-05')).toBeNull();
  });

  it('pesou-se hoje: a próxima só conta amanhã (uma por dia)', () => {
    expect(weightTrendNeed(['2026-09-26', '2026-10-04'], '2026-10-04'))
      .toEqual({ more: 1, start: '2026-10-05', from: '2026-10-06', until: '2026-10-10', fresh: false });
    // A de 20 set sai da janela já amanhã: faltam duas, não uma.
    expect(weightTrendNeed(['2026-09-20', '2026-10-04'], '2026-10-04').more).toBe(2);
  });

  it('duas pesagens a 12 dias, ainda dentro da janela: mais uma até hoje', () => {
    expect(weightTrendNeed(['2026-09-20', '2026-10-02'], '2026-10-04'))
      .toEqual({ more: 1, start: '2026-10-04', from: '2026-10-04', until: '2026-10-04', fresh: false });
  });
});

describe('weightEstimate — a reta da 1.ª à última pesagem', () => {
  it('12 dias, −1,1 kg ≈ −0,64 kg/semana', () => {
    const e = weightEstimate([{ date: '2026-09-20', weight: 77.3 }, { date: '2026-10-02', weight: 76.2 }]);
    expect(e).toMatchObject({ n: 2, diff: -1.1, days: 12 });
    expect(e.weeklyRate).toBeCloseTo(-0.64, 2);
  });

  it('menos de 7 dias: sem ritmo semanal (esticar 3 dias a uma semana é inventar)', () => {
    expect(weightEstimate([{ date: '2026-10-01', weight: 80 }, { date: '2026-10-04', weight: 80.6 }]).weeklyRate).toBeNull();
  });

  it('uma pesagem, ou duas no mesmo dia: sem estimativa', () => {
    expect(weightEstimate([{ date: '2026-10-01', weight: 80 }])).toBeNull();
    expect(weightEstimate([{ date: '2026-10-01', weight: 80 }, { date: '2026-10-01', weight: 79 }])).toBeNull();
  });
});
