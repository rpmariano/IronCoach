import { describe, it, expect } from 'vitest';
import { nutritionPeriodVerdict, nutritionVerdict, NUTRITION_VERDICT_MIN_DAYS } from './nutrition';
import { NO_DATA_TEXT } from './shared';

/* Veredicto da Nutrição por período (fase 4 da Evolução, 2026-10-04): factos
   do mock-up aprovado, só dias fechados, uma só régua (N7). */

const key = (status, pctLabel, daysInGoal, nDays, extra = {}) => ({ status, pctLabel, daysInGoal, nDays, daysAbove: 0, ...extra });
const summary = ({ cal = key('ok', 96, 4, 6), prot = key('ok', 95, 5, 6), carbs = key('ok', 95, 4, 6), n = 6, both = { k: 4, n: 6 } } = {}) =>
  ({ nDays: n, byKey: { calories: cal, protein: prot, carbs, fat: key('ok', 98, 5, 6), water: key(null, null, 0, 0) }, both });

describe('nutritionPeriodVerdict', () => {
  it('a semana do mock-up: calorias no sítio, proteína curta, "só 2 de 6 dias lá chegaram"', () => {
    const v = nutritionPeriodVerdict({ summary: summary({ prot: key('below', 88, 2, 6) }), isCurrent: true });
    expect(v).toEqual({
      text: 'Calorias no sítio (96%), mas a proteína está curta: 88% do objetivo — só 2 de 6 dias lá chegaram.',
      tone: 'warn',
    });
  });

  it('num período passado abre com o período e fala no passado (mock-up do trimestre)', () => {
    const v = nutritionPeriodVerdict({
      summary: summary({ cal: key('ok', 93, 40, 72), prot: key('below', 89, 33, 72), n: 72 }),
      isCurrent: false,
      where: 'no 3.º trimestre',
    });
    expect(v.text).toBe('No 3.º trimestre as calorias ficaram no sítio (93%), mas a proteína ficou curta: 89% do objetivo — só 33 de 72 dias lá chegaram.');
  });

  it('concordância: "só 1 de 6 dias lá chegou", "nenhum dos 6 dias", sem "só" quando foi a maioria', () => {
    expect(nutritionPeriodVerdict({ summary: summary({ prot: key('below', 80, 1, 6) }) }).text).toContain('só 1 de 6 dias lá chegou');
    expect(nutritionPeriodVerdict({ summary: summary({ prot: key('below', 70, 0, 6) }) }).text).toContain('nenhum dos 6 dias lá chegou');
    expect(nutritionPeriodVerdict({ summary: summary({ prot: key('below', 89, 4, 6) }) }).text).toContain('— 4 de 6 dias lá chegaram');
  });

  it('a mesma régua dos números (N7): 85–89% é curto, não "Comes o que precisas"', () => {
    const v = nutritionPeriodVerdict({ summary: summary({ cal: key('below', 87, 2, 6) }) });
    expect(v.tone).toBe('warn');
    expect(v.text).toBe('As calorias estão curtas: 87% do objetivo — 2 de 6 dias no objetivo.');
  });

  it('calorias acima, e as duas curtas', () => {
    expect(nutritionPeriodVerdict({ summary: summary({ cal: key('above', 122, 1, 6, { daysAbove: 5 }) }) }).text)
      .toBe('As calorias passam do objetivo: 122% — 5 de 6 dias acima.');
    expect(nutritionPeriodVerdict({ summary: summary({ cal: key('below', 80, 1, 6), prot: key('below', 75, 1, 6), both: { k: 0, n: 6 } }) }).text)
      .toBe('As calorias e a proteína estão curtas: 80% e 75% do objetivo — nenhum dia com as duas no objetivo.');
  });

  it('a média no sítio mas os dias de treino abaixo (mock-up de setembro), com "sobretudo às quartas"', () => {
    const eating = { withTraining: { belowDays: ['2026-09-02', '2026-09-09', '2026-09-19', '2026-09-30', '2026-09-23'] } };
    const v = nutritionPeriodVerdict({
      summary: summary({ cal: key('ok', 95, 19, 28), prot: key('ok', 92, 17, 28), n: 28 }),
      isCurrent: false,
      where: 'em setembro',
      eating,
    });
    expect(v).toEqual({
      text: 'Em setembro a média esteve no sítio — 95% das calorias e 92% da proteína —, mas em 5 dias de treino comeste abaixo do objetivo, sobretudo às quartas.',
      tone: 'warn',
    });
  });

  it('EA abaixo de 30: perigo só com massa magra de uma avaliação; por omissão é aviso (estimativa)', () => {
    const ea = { nDays: 6, average: 26, leanMassSource: 'medida' };
    expect(nutritionPeriodVerdict({ summary: summary(), ea }).tone).toBe('danger');
    const est = nutritionPeriodVerdict({ summary: summary(), ea: { ...ea, leanMassSource: 'omissao' } });
    expect(est.tone).toBe('warn');
    expect(est.text).toContain('estimativa');
    // Poucos dias: não há alarme.
    expect(nutritionPeriodVerdict({ summary: summary(), ea: { ...ea, nDays: 2 } }).tone).toBe('ok');
  });

  it('tudo no sítio', () => {
    expect(nutritionPeriodVerdict({ summary: summary() })).toEqual({ text: 'A média está no sítio: 96% das calorias e 95% da proteína.', tone: 'ok' });
  });

  it(`mínimos (R6): sem dias, ou menos de ${NUTRITION_VERDICT_MIN_DAYS}, não há estado`, () => {
    expect(nutritionPeriodVerdict({ summary: summary({ n: 0 }), isCurrent: false, where: 'em agosto' }))
      .toEqual({ text: 'Em agosto não registaste refeições.', tone: 'neutral' });
    expect(nutritionPeriodVerdict({ summary: summary({ n: 2, prot: key('below', 50, 0, 2) }), isCurrent: false, where: 'em setembro' }))
      .toEqual({ text: 'Só 2 dias com registo em setembro — poucos para conclusões.', tone: 'neutral' });
    expect(nutritionPeriodVerdict({}).tone).toBe('neutral');
  });
});

describe('nutritionVerdict (vista Dia) — a régua única (N7)', () => {
  const adherence = ({ cal = 100, prot = 100, carb = 100 } = {}) => ({
    calories: { actual: 2400, target: 2400, compliance_pct: cal },
    protein: { actual_g: 160, target: 160, compliance_pct: prot },
    carbs: { actual_g: 320, target: 320, compliance_pct: carb },
    dailyBreakdown: [{ date: '2026-09-01' }],
  });

  it('proteína a 88% já é curta (era 85)', () => {
    expect(nutritionVerdict({ adherence: adherence({ prot: 88 }), ea: { average: 50 } }).tone).toBe('warn');
  });

  it('calorias a 87% já são curtas (era 85)', () => {
    expect(nutritionVerdict({ adherence: adherence({ cal: 87 }), ea: { average: 50 } }).text).toContain('87% do alvo');
  });

  it('hidratos a 85% já são curtos (era 80)', () => {
    expect(nutritionVerdict({ adherence: adherence({ carb: 85 }), ea: { average: 50 } }).text).toContain('hidratos');
  });

  it('sem dados continua a dizer que não sabe', () => {
    expect(nutritionVerdict({}).text).toBe(NO_DATA_TEXT);
  });
});
