import { describe, it, expect } from 'vitest';
import {
  runVerdict,
  gymVerdict,
  nutritionVerdict,
  bodyVerdict,
  fmtNumber,
  streakDirection,
  NO_DATA_TEXT,
} from './dashboardVerdicts';

/* Ponto 6 do redesenho: as frases de veredicto dos dashboards de módulo.
   São funções puras — testam-se com números à mão. Três cenários mínimos
   por módulo (bem, mal, sem dados) mais os limiares que decidem cada regra.

   As frases não se testam à letra (mudam com o tom da Carol); testa-se o
   TOM, o número que serve de prova e as palavras que só aparecem naquela
   regra. */

const weeks = (...kms) => kms.map((km, i) => ({ weekLabel: `S${i}`, acuteLoad: km }));
const gymWeeks = (...kgs) => kgs.map((kg, i) => ({ weekLabel: `S${i}`, volumeLoad: kg }));

describe('fmtNumber', () => {
  it('usa vírgula decimal e espaço de milhar', () => {
    expect(fmtNumber(72.4, 1)).toBe('72,4');
    expect(fmtNumber(1980, 0)).toBe('1 980');
    expect(fmtNumber(-0.3, 1)).toBe('−0,3');
  });

  it('devolve travessão para valores que não são número', () => {
    expect(fmtNumber(undefined)).toBe('—');
    expect(fmtNumber(NaN)).toBe('—');
  });
});

describe('streakDirection', () => {
  it('conta as subidas seguidas a contar do fim', () => {
    expect(streakDirection([10, 12, 14, 18])).toEqual({ direction: 1, weeks: 3 });
  });

  it('conta as descidas seguidas a contar do fim', () => {
    expect(streakDirection([30, 28, 20])).toEqual({ direction: -1, weeks: 2 });
  });

  it('ignora séries curtas e a última variação nula', () => {
    expect(streakDirection([10])).toEqual({ direction: 0, weeks: 0 });
    expect(streakDirection([10, 10])).toEqual({ direction: 0, weeks: 0 });
  });
});

describe('runVerdict', () => {
  it('sem dados: diz que não sabe, em tom neutro', () => {
    const v = runVerdict({ runCount: 0, weeklyVolume: [] });
    expect(v).toEqual({ text: NO_DATA_TEXT, tone: 'neutral' });
  });

  it('bem: volume a subir três ou mais semanas com carga segura', () => {
    const v = runVerdict({
      acwr: { ratio: 1.12, status: 'safe', hasEnoughData: true },
      weeklyVolume: weeks(24, 28, 32, 36, 42.6),
      distribution: { lowIntensityPct: 82, highIntensityPct: 18, targetLowPct: 80 },
      runCount: 17,
    });
    expect(v.tone).toBe('ok');
    expect(v.text).toContain('quatro semanas seguidas');
    expect(v.text).toContain('zona segura');
  });

  it('mal e urgente: ACWR em perigo cita o rácio como prova', () => {
    const v = runVerdict({
      acwr: { ratio: 1.72, status: 'danger', hasEnoughData: true },
      weeklyVolume: weeks(20, 25, 44),
      runCount: 9,
    });
    expect(v.tone).toBe('danger');
    expect(v.text).toContain('1,72');
  });

  it('mal: ACWR em atenção é aviso, não perigo', () => {
    const v = runVerdict({
      acwr: { ratio: 1.38, status: 'caution', hasEnoughData: true },
      weeklyVolume: weeks(20, 25, 33),
      runCount: 9,
    });
    expect(v.tone).toBe('warn');
    expect(v.text).toContain('1,38');
  });

  it('mal: intensidade acima do alvo com mais de 10 pontos de folga', () => {
    const v = runVerdict({
      acwr: { ratio: 1.0, status: 'safe', hasEnoughData: true },
      weeklyVolume: weeks(30, 30, 30),
      distribution: { lowIntensityPct: 55, highIntensityPct: 45, targetLowPct: 80 },
      runCount: 12,
    });
    expect(v.tone).toBe('warn');
    expect(v.text).toContain('45%');
    expect(v.text).toContain('Z3+');
  });

  it('mal: volume a cair duas semanas seguidas', () => {
    const v = runVerdict({
      acwr: { ratio: 0.95, status: 'safe', hasEnoughData: true },
      weeklyVolume: weeks(42.6, 35, 28.1),
      distribution: { lowIntensityPct: 85, highIntensityPct: 15, targetLowPct: 80 },
      runCount: 8,
    });
    expect(v.tone).toBe('warn');
    expect(v.text).toContain('duas semanas seguidas');
    expect(v.text).toContain('28,1');
  });

  it('com corridas mas sem quatro semanas de carga, não finge saber', () => {
    const v = runVerdict({
      acwr: { ratio: 0, status: 'unknown', hasEnoughData: false },
      weeklyVolume: weeks(0, 0, 8),
      runCount: 2,
    });
    expect(v.tone).toBe('neutral');
    expect(v.text).toContain('quatro semanas');
  });
});

describe('gymVerdict', () => {
  it('sem dados: diz que não sabe, em tom neutro', () => {
    expect(gymVerdict({ strengthSessions: 0, classes: 0 })).toEqual({ text: NO_DATA_TEXT, tone: 'neutral' });
  });

  it('bem: duas por semana com carga a subir', () => {
    const v = gymVerdict({
      weeklyBreakdown: gymWeeks(6200, 7100, 8400),
      strengthSessions: 8,
      classes: 0,
      weeksInRange: 4,
      totalVolumeLoad: 33600,
    });
    expect(v.tone).toBe('ok');
    expect(v.text).toContain('carga a subir');
  });

  it('mal: menos de uma sessão por semana', () => {
    const v = gymVerdict({
      weeklyBreakdown: gymWeeks(3000, 3200),
      strengthSessions: 2,
      classes: 0,
      weeksInRange: 4,
      totalVolumeLoad: 6200,
    });
    expect(v.tone).toBe('warn');
    expect(v.text).toContain('2 sessões em quatro semanas');
  });

  it('mal: carga a cair duas semanas seguidas apesar de ir lá', () => {
    const v = gymVerdict({
      weeklyBreakdown: gymWeeks(9000, 7400, 5900),
      strengthSessions: 8,
      classes: 0,
      weeksInRange: 4,
      totalVolumeLoad: 22300,
    });
    expect(v.tone).toBe('warn');
    expect(v.text).toContain('duas semanas seguidas');
    expect(v.text).toContain('5 900');
  });

  it('uma sessão por semana é pouco, mas não é falta de dados', () => {
    const v = gymVerdict({
      weeklyBreakdown: gymWeeks(4000, 4000, 4000),
      strengthSessions: 4,
      classes: 0,
      weeksInRange: 4,
      totalVolumeLoad: 12000,
    });
    expect(v.tone).toBe('warn');
    expect(v.text).toContain('O alvo são duas');
  });
});

describe('nutritionVerdict', () => {
  const adherence = ({ cal = 100, prot = 100, carb = 100 } = {}) => ({
    calories: { actual: 2400, target: 2400, compliance_pct: cal },
    protein: { actual_g: 160, target: 160, compliance_pct: prot },
    carbs: { actual_g: 320, target: 320, compliance_pct: carb },
    fat: { actual_g: 75, target: 75, compliance_pct: 100 },
    dailyBreakdown: [{ date: '2026-09-01', protein: 160, carbs: 320, fat: 75 }],
  });

  it('sem dados: diz que não sabe, em tom neutro', () => {
    expect(nutritionVerdict({})).toEqual({ text: NO_DATA_TEXT, tone: 'neutral' });
    expect(nutritionVerdict({ adherence: { calories: { actual: 0 }, dailyBreakdown: [] } }))
      .toEqual({ text: NO_DATA_TEXT, tone: 'neutral' });
  });

  it('bem: tudo dentro do alvo cita calorias e proteína', () => {
    const v = nutritionVerdict({ adherence: adherence(), ea: { average: 48 } });
    expect(v.tone).toBe('ok');
    expect(v.text).toContain('100%');
  });

  it('mal e urgente: energia disponível abaixo de 30 kcal/kg', () => {
    const v = nutritionVerdict({ adherence: adherence({ cal: 88 }), ea: { average: 28, isAtRisk: true } });
    expect(v.tone).toBe('danger');
    expect(v.text).toContain('28 kcal/kg');
  });

  it('mal: proteína abaixo do alvo diz de quanto', () => {
    const v = nutritionVerdict({ adherence: adherence({ prot: 80 }), ea: { average: 50 } });
    expect(v.tone).toBe('warn');
    expect(v.text).toContain('20% abaixo do alvo');
  });

  it('mal: calorias acima do alvo também é aviso', () => {
    const v = nutritionVerdict({ adherence: adherence({ cal: 132 }), ea: { average: 55 } });
    expect(v.tone).toBe('warn');
    expect(v.text).toContain('132%');
  });
});

describe('bodyVerdict', () => {
  const trend = (weeklyRate, trendLabel, weights = [73.1, 72.7, 72.4]) => ({
    trend: trendLabel,
    weeklyRate,
    rawPoints: weights.map((w, i) => ({ date: `2026-08-0${i + 1}`, weight: w })),
    movingAverage: weights.map((w, i) => ({ date: `2026-08-0${i + 1}`, weight: w })),
  });

  it('sem dados: diz que não sabe, em tom neutro', () => {
    expect(bodyVerdict({ assessmentCount: 0 })).toEqual({ text: NO_DATA_TEXT, tone: 'neutral' });
  });

  it('bem: perda lenta com a massa magra a aguentar', () => {
    const v = bodyVerdict({
      weightTrend: trend(-0.3, 'descendo'),
      composition: { dates: ['a', 'b'], leanMassKg: [64.2, 64.1], fatMassKg: [8.9, 8.3] },
    });
    expect(v.tone).toBe('ok');
    expect(v.text).toContain('massa muscular mantém-se');
  });

  it('mal e urgente: perder mais de um quilo por semana', () => {
    const v = bodyVerdict({ weightTrend: trend(-1.4, 'descendo') });
    expect(v.tone).toBe('danger');
    expect(v.text).toContain('1,4 kg por semana');
  });

  it('mal: a perder peso e massa magra ao mesmo tempo', () => {
    const v = bodyVerdict({
      weightTrend: trend(-0.6, 'descendo'),
      composition: { dates: ['a', 'b'], leanMassKg: [64.2, 62.9], fatMassKg: [8.9, 8.7] },
    });
    expect(v.tone).toBe('warn');
    expect(v.text).toContain('massa magra');
  });

  it('estável: diz que estabilizou e cita o peso', () => {
    const v = bodyVerdict({ weightTrend: trend(0, 'estavel', [72.4, 72.4, 72.4]) });
    expect(v.tone).toBe('ok');
    expect(v.text).toContain('estabilizou');
    expect(v.text).toContain('72,4');
  });

  it('com uma só pesagem, não inventa tendência', () => {
    const v = bodyVerdict({ weightTrend: trend(0, 'estavel', [72.4]), assessmentCount: 1 });
    expect(v.tone).toBe('neutral');
    expect(v.text).toContain('uma pesagem');
  });

  it('nenhuma frase leva emoji, exclamação ou "talvez"', () => {
    const frases = [
      runVerdict({ acwr: { ratio: 1.72, status: 'danger', hasEnoughData: true }, weeklyVolume: weeks(20, 44), runCount: 9 }).text,
      gymVerdict({ weeklyBreakdown: gymWeeks(6200, 8400), strengthSessions: 8, weeksInRange: 4 }).text,
      nutritionVerdict({ adherence: { calories: { actual: 2000, compliance_pct: 70 }, protein: { compliance_pct: 70 }, carbs: { compliance_pct: 70 }, dailyBreakdown: [{}] }, ea: { average: 50 } }).text,
      bodyVerdict({ weightTrend: trend(-0.3, 'descendo') }).text,
      NO_DATA_TEXT,
    ];
    for (const f of frases) {
      expect(f).not.toMatch(/!/);
      expect(f.toLowerCase()).not.toContain('talvez');
      expect(f).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
