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
