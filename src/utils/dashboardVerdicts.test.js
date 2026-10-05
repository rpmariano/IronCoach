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
import { expectCarolVoice } from '../test/carolVoice';
import { computeCompositionTrend } from '@formulas/compositionTrend.ts';

/* Ponto 6 do redesenho: as frases de veredicto dos dashboards de módulo.
   São funções puras — testam-se com números à mão. Três cenários mínimos
   por módulo (bem, mal, sem dados) mais os limiares que decidem cada regra.

   As frases não se testam à letra (mudam com o tom da Carol); testa-se o
   TOM, o número que serve de prova e as palavras que só aparecem naquela
   regra. */

const weeks = (...kms) => kms.map((km, i) => ({ weekLabel: `S${i}`, acuteLoad: km }));
const SEGUNDA = '2026-09-21';
const DOMINGO = '2026-09-27';

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
    // R10: só semanas fechadas — sem `today` a última (parcial) fica de fora.
    expect(v.text).toContain('três semanas seguidas');
    expect(v.text).toContain('zona segura');
  });

  it('mal e urgente: ACWR em perigo cita o rácio como prova', () => {
    const v = runVerdict({
      acwr: { ratio: 1.72, status: 'danger', hasEnoughData: true },
      weeklyVolume: weeks(20, 25, 44),
      runCount: 9,
    });
    expect(v.tone).toBe('danger');
    expect(v.text).toContain('1,7×');
    expect(v.text).toContain('últimos 7 dias');
    expect(v.text).not.toContain('vezes acima');
    expect(v.text).not.toContain('esta semana');
  });

  it('mal: ACWR em atenção é aviso, não perigo', () => {
    const v = runVerdict({
      acwr: { ratio: 1.38, status: 'caution', hasEnoughData: true },
      weeklyVolume: weeks(20, 25, 33),
      runCount: 9,
    });
    expect(v.tone).toBe('warn');
    expect(v.text).toContain('1,4×');
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

  it('mal: volume a cair duas semanas seguidas (ao domingo a semana em curso já conta)', () => {
    const v = runVerdict({
      acwr: { ratio: 0.95, status: 'safe', hasEnoughData: true },
      weeklyVolume: weeks(42.6, 35, 28.1),
      distribution: { lowIntensityPct: 85, highIntensityPct: 15, targetLowPct: 80 },
      runCount: 8,
      today: DOMINGO,
    });
    expect(v.tone).toBe('warn');
    expect(v.text).toContain('duas semanas seguidas');
    expect(v.text).toContain('28,1');
    // "Ficaste curto" tinha género; "aquém" serve a qualquer atleta.
    expect(v.text).toContain('Ficaste aquém');
  });

  /* Revisão de 2026-09-26: à segunda-feira a semana em curso tem 0 km
     porque mal começou, e contava como semana curta — "desceu de 50,0
     para 0,0 km". Só entra ao domingo, quando está praticamente fechada. */
  describe('a semana em curso e o plano', () => {
    const base = {
      acwr: { ratio: 0.95, status: 'safe', hasEnoughData: true },
      distribution: { lowIntensityPct: 85, highIntensityPct: 15, targetLowPct: 80 },
      runCount: 8,
    };

    it('à segunda-feira, a semana que mal começou não é uma semana curta', () => {
      const v = runVerdict({ ...base, weeklyVolume: weeks(50, 45, 0), today: SEGUNDA });
      expect(v.text).not.toContain('semanas seguidas');
      expect(v.text).not.toContain('0,0 km');
    });

    it('sem saber o dia, a semana em curso fica de fora', () => {
      const v = runVerdict({ ...base, weeklyVolume: weeks(50, 45, 0) });
      expect(v.text).not.toContain('semanas seguidas');
    });

    it('à segunda-feira conta as duas semanas fechadas que desceram', () => {
      const v = runVerdict({ ...base, weeklyVolume: weeks(50, 45, 40, 3), today: SEGUNDA });
      expect(v.tone).toBe('warn');
      expect(v.text).toContain('duas semanas seguidas');
      expect(v.text).toContain('de 50,0 para 40,0 km');
    });

    it('no polimento, o volume a descer não é ficar aquém', () => {
      const v = runVerdict({ ...base, weeklyVolume: weeks(50, 40, 30, 5), today: SEGUNDA, taper: true });
      expect(v.text).not.toContain('semanas seguidas');
    });

    // Semanas de 31 ago, 7, 14 e 21 set (a em curso). O plano previa 45 km
    // na de 7 e 30 na de 14: a descida da de 14 é a descarga dele.
    const plano = [
      { plan_id: 'p', kind: 'corrida', status: 'concluido', planned_date: '2026-09-08', target_distance_km: 20 },
      { plan_id: 'p', kind: 'corrida', status: 'concluido', planned_date: '2026-09-12', target_distance_km: 25 },
      { plan_id: 'p', kind: 'corrida', status: 'concluido', planned_date: '2026-09-16', target_distance_km: 12 },
      { plan_id: 'p', kind: 'corrida', status: 'concluido', planned_date: '2026-09-19', target_distance_km: 18 },
    ];

    it('uma semana em que o próprio plano também descia (descarga) não conta como curta', () => {
      const v = runVerdict({ ...base, weeklyVolume: weeks(50, 45, 30, 0), today: SEGUNDA, planItems: plano });
      expect(v.text).not.toContain('semanas seguidas');
    });

    it('sem essa descarga no plano, as mesmas semanas são curtas', () => {
      const v = runVerdict({ ...base, weeklyVolume: weeks(50, 45, 30, 0), today: SEGUNDA });
      expect(v.text).toContain('duas semanas seguidas');
    });

    it('um treino cancelado não faz o plano descer', () => {
      const cancelado = [...plano.slice(0, 2), { plan_id: 'p', kind: 'corrida', status: 'cancelado', planned_date: '2026-09-15', target_distance_km: 40 }, ...plano.slice(2)];
      const v = runVerdict({ ...base, weeklyVolume: weeks(50, 45, 30, 0), today: SEGUNDA, planItems: cancelado });
      expect(v.text).not.toContain('semanas seguidas');
    });
  });

  /* Revisão de 2026-09-26: no polimento antes da prova a carga desce de
     propósito, e o veredicto mandava carregar mais. */
  it('no polimento, a carga baixa é de propósito — não manda carregar', () => {
    const v = runVerdict({
      acwr: { ratio: 0.62, status: 'undertrained', hasEnoughData: true },
      weeklyVolume: weeks(40, 42, 40, 20),
      runCount: 10,
      today: SEGUNDA,
      taper: true,
    });
    expect(v.tone).toBe('ok');
    expect(v.text).toBe('Estás no polimento: a carga baixa é de propósito.');
    expectCarolVoice(v.text);
  });

  it('fora do polimento, a carga baixa continua a ser aviso', () => {
    const v = runVerdict({
      acwr: { ratio: 0.62, status: 'undertrained', hasEnoughData: true },
      weeklyVolume: weeks(40, 42, 40, 20),
      runCount: 10,
      today: SEGUNDA,
    });
    expect(v.tone).toBe('warn');
    expect(v.text).toContain('0,6×');
  });

  it('com corridas mas sem histórico de carga, não finge saber e diz quantas faltam', () => {
    const v = runVerdict({
      acwr: { ratio: 0, status: 'unknown', hasEnoughData: false, historyWeeks: 1 },
      weeklyVolume: weeks(0, 0, 8),
      runCount: 2,
    });
    expect(v.tone).toBe('neutral');
    expect(v.text).toContain('duas corridas registadas');
    expect(v.text).toContain('3 das últimas 4 semanas');
    expect(v.text).toContain('faltam duas semanas');
    expect(v.text).not.toContain('quatro semanas seguidas');
  });

  // R7 (2026-10-04): concordância e período vazio com histórico.
  it('R7: uma só corrida concorda no singular', () => {
    const v = runVerdict({
      acwr: { ratio: 0, status: 'unknown', hasEnoughData: false, historyWeeks: 2 },
      weeklyVolume: weeks(0, 0, 8),
      runCount: 1,
    });
    expect(v.text).toContain('uma corrida registada');
    expect(v.text).not.toContain('uma corridas');
    expect(v.text).toContain('falta uma semana');
  });

  it('R7: período vazio com histórico não diz "zero corridas"', () => {
    const v = runVerdict({
      acwr: { ratio: 0, status: 'unknown', hasEnoughData: false, historyWeeks: 1 },
      weeklyVolume: weeks(0, 12, 0),
      runCount: 0,
      lastRunDate: '2026-09-12',
    });
    expect(v.text).toContain('Sem corridas neste período (a última foi a 12 de setembro)');
    expect(v.text).not.toContain('zero');
  });

  it('R7: período e 12 semanas vazios, mas com última corrida antiga', () => {
    const v = runVerdict({ runCount: 0, weeklyVolume: weeks(0, 0), lastRunDate: '2026-03-02' });
    expect(v.text).toBe('Sem corridas neste período (a última foi a 2 de março).');
  });

  // R10 (2026-10-04)
  it('R10: sem ACWR com dados, não diz "zona segura"', () => {
    const v = runVerdict({
      acwr: { ratio: 1.56, status: 'unknown', hasEnoughData: false, historyWeeks: 2 },
      weeklyVolume: weeks(10, 14, 18, 22, 30),
      runCount: 12,
    });
    expect(v.text).not.toContain('zona segura');
  });

  it('R10: a semana em curso (parcial) não conta para a subida', () => {
    const base = {
      acwr: { ratio: 1.1, status: 'safe', hasEnoughData: true, acuteKm: 30, chronicWeeklyKm: 27 },
      runCount: 12,
    };
    // Segunda: 10, 14, 18, 22 fechadas = 3 subidas; a parcial (2) não desfaz nem acrescenta.
    const seg = runVerdict({ ...base, weeklyVolume: weeks(10, 14, 18, 22, 2), today: SEGUNDA });
    expect(seg.text).toContain('três semanas seguidas');
    const sem = runVerdict({ ...base, weeklyVolume: weeks(10, 14, 18, 2), today: SEGUNDA });
    expect(sem.text).not.toContain('semanas seguidas');
  });

  it('Textos de carga falam de 7 dias rolantes e de "×" com os km', () => {
    const v = runVerdict({
      acwr: { ratio: 1.62, status: 'danger', hasEnoughData: true, acuteKm: 48.6, chronicWeeklyKm: 30 },
      weeklyVolume: weeks(20, 25, 44),
      runCount: 9,
    });
    expect(v.text).toContain('Nos últimos 7 dias correste 1,6× a tua média semanal das últimas 4 semanas (48,6 vs 30,0 km)');
  });
});

/* gymVerdict: os testes passaram para verdicts/gym.test.js (Ginásio por períodos de
   calendário, 2026-10-04, G2) — a assinatura mudou: semanas fechadas, só força. */

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
    sufficient: true,
    spanDays: 14,
    pointsInWindow: weights.length,
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
    expect(v.text).toContain('massa magra mantém-se');
  });

  it('mal e urgente: perder acima do máximo do nível (% do peso por semana)', () => {
    const v = bodyVerdict({ weightTrend: trend(-1.4, 'descendo') });
    expect(v.tone).toBe('danger');
    expect(v.text).toContain('1,4 kg');
    expect(v.text).toContain('% do peso por semana');
    expect(v.text).not.toContain('Para o teu nível');
    expect(v.text).toContain('Sem nível declarado, conto com um máximo de 0,7%');
    expect(v.text).not.toMatch(/sai também massa magra/);
    expect(v.text).toContain('arriscas perder também massa magra');
  });

  it('perigo com nível: o número mostrado é maior do que o máximo mostrado', () => {
    const v = bodyVerdict({ weightTrend: trend(-0.3, 'descendo', [72.6, 72.4]), experienceLevel: 'avancado' });
    expect(v.tone).toBe('danger');
    expect(v.text).toContain('Para o teu nível o máximo saudável é 0,4%');
    const mostrado = Number(/: (\d+,\d+)% do peso/.exec(v.text)[1].replace(',', '.'));
    expect(mostrado).toBeGreaterThan(0.4);
  });

  it('colado ao máximo até à 2.ª casa: "um pouco mais de 0,5%", não "0,504%" (2026-10-05)', () => {
    // 0,4032 kg em 80 kg = 0,504% por semana, contra o máximo de 0,5% do nível médio.
    const v = bodyVerdict({ weightTrend: trend(-0.4032, 'descendo', [80.4, 80]), experienceLevel: 'medio' });
    expect(v.tone).toBe('danger');
    expect(v.text).toContain('depressa demais: um pouco mais de 0,5% do peso por semana (0,4 kg)');
    expect(v.text).not.toMatch(/0,50\d%/);
    expect(v.text).toContain('Para o teu nível o máximo saudável é 0,5%');
  });

  it('duas pesagens iguais: "ambas de"', () => {
    const v = bodyVerdict({ weightTrend: { ...trend(null, null, [80, 80]), weeklyRate: null, sufficient: false } });
    expect(v.text).toContain('ambas de 80,0 kg');
  });

  it('mal: a perder peso e massa magra ao mesmo tempo', () => {
    const v = bodyVerdict({
      weightTrend: trend(-0.4, 'descendo'),
      composition: { dates: ['a', 'b'], leanMassKg: [64.2, 62.9], fatMassKg: [8.9, 8.7] },
    });
    expect(v.tone).toBe('warn');
    expect(v.text).toContain('massa magra');
    expect(v.text).toContain('menos 1,3 kg');
  });

  /* Revisão de 2026-09-26: só com pesagens, sem nenhuma percentagem de
     gordura, a massa magra era o próprio peso e saía "−1,2 kg de músculo". */
  describe('sem gordura medida não há massa magra', () => {
    const soPesagens = computeCompositionTrend([
      { date: '2026-08-01', weight_kg: 73.1, body_fat_pct: null },
      { date: '2026-08-08', weight_kg: 72.5, body_fat_pct: null },
      { date: '2026-08-15', weight_kg: 71.9, body_fat_pct: null },
    ]);

    it('não afirma perda de músculo a partir do peso', () => {
      const v = bodyVerdict({ weightTrend: trend(-0.4, 'descendo', [73.1, 72.5, 71.9]), composition: soPesagens, gymSessionCount: 4 });
      expect(v.text).toBe('O peso desce 0,4 kg por semana. Sem gordura medida, não sei se é gordura ou massa magra.');
      expect(v.tone).toBe('neutral');
      expect(v.text).not.toContain('perdeste');
      expect(v.text).not.toContain('ginásio');
      expectCarolVoice(v.text);
    });

    it('com uma só medição de gordura também não', () => {
      const v = bodyVerdict({
        weightTrend: trend(-0.4, 'descendo'),
        composition: { dates: ['a', 'b', 'c'], leanMassKg: [64.2, 72.7, 72.4], fatMassKg: [8.9, 0, 0] },
      });
      expect(v.text).toContain('uma só medição de gordura');
      expect(v.text).not.toContain('músculo');
    });

    it('o ginásio só entra na frase com sessões registadas', () => {
      const perda = {
        weightTrend: trend(-0.4, 'descendo'),
        composition: { dates: ['a', 'b'], leanMassKg: [64.2, 62.9], fatMassKg: [8.9, 8.7] },
      };
      expect(bodyVerdict(perda).text).not.toContain('ginásio');
      expect(bodyVerdict({ ...perda, gymSessionCount: 3 }).text).toContain('não cortes o ginásio');
    });
  });

  /* Revisão de 2026-09-26: "o peso desce −0,4 kg" — o sinal a dobrar. */
  it('a perda lenta diz o valor sem sinal: o verbo já diz que desce', () => {
    const v = bodyVerdict({
      weightTrend: trend(-0.4, 'descendo'),
      composition: { dates: ['a', 'b'], leanMassKg: [64.2, 64.1], fatMassKg: [8.9, 8.3] },
    });
    expect(v.text).toContain('o peso desce 0,4 kg por semana');
    expect(v.text).not.toContain('−');
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

  // Contrato novo (2026-10-04): sem `sufficient` não há tendência.
  it('sem pesagens suficientes: diz o que falta, sem "estabilizou" nem "perda"', () => {
    const v = bodyVerdict({
      weightTrend: { ...trend(null, null, [73.1, 72.4]), weeklyRate: null, sufficient: false, spanDays: 5, pointsInWindow: 2 },
      composition: { dates: ['a', 'b'], leanMassKg: [64.2, 64.1], fatMassKg: [8.9, 8.3] },
    });
    expect(v.tone).toBe('neutral');
    expect(v.text).toContain('três pesagens espalhadas por pelo menos 10 dias');
    expect(v.text).toContain('duas pesagens');
    expect(v.text).not.toMatch(/estabilizou|depressa demais|Perda lenta/);
    expectCarolVoice(v.text);
  });

  it('com uma só pesagem no período mas outras fora, diz-o', () => {
    const v = bodyVerdict({ weightTrend: trend(null, null, [72.4]), assessmentCount: 1, hasWeighInsOutside: true });
    expect(v.text).toContain('Neste período só há uma pesagem');
    expect(v.text).not.toContain('Só tenho');
  });

  it('o limiar de perda rápida é em % do peso e depende do nível', () => {
    // −0,45 kg/semana em 60 kg = 0,75%: acima do máximo de todos os níveis.
    const leve = { weightTrend: trend(-0.45, 'descendo', [60.4, 60.2, 60.0]) };
    expect(bodyVerdict({ ...leve, experienceLevel: 'iniciante' }).tone).toBe('danger');
    // −0,3 kg em 72,4 = 0,41%: ok para médio (0,5%), demasiado para avançado? 0,41 > 0,4.
    const d = { weightTrend: trend(-0.3, 'descendo') };
    expect(bodyVerdict({ ...d, experienceLevel: 'medio' }).tone).not.toBe('danger');
    expect(bodyVerdict({ ...d, experienceLevel: 'avancado' }).tone).toBe('danger');
    // −0,9 kg/semana em 120 kg = 0,75% mas −0,8 kg = 0,67%: não é "−1 kg" absoluto.
    expect(bodyVerdict({ weightTrend: trend(-0.8, 'descendo', [120.4, 120.0, 119.6]), experienceLevel: 'iniciante' }).tone).not.toBe('danger');
  });

  it('nenhuma frase leva emoji, exclamação ou "talvez"', () => {
    const frases = [
      runVerdict({ acwr: { ratio: 1.72, status: 'danger', hasEnoughData: true }, weeklyVolume: weeks(20, 44), runCount: 9 }).text,
      gymVerdict({ kind: 'mes', scope: 'neste mês', periodStrength: 8, closedWeeks: 4, strengthInWeeks: 8, weeklyLoads: [6200, 8400, 8400, 8400] }).text,
      nutritionVerdict({ adherence: { calories: { actual: 2000, compliance_pct: 70 }, protein: { compliance_pct: 70 }, carbs: { compliance_pct: 70 }, dailyBreakdown: [{}] }, ea: { average: 50 } }).text,
      bodyVerdict({ weightTrend: trend(-0.3, 'descendo') }).text,
      NO_DATA_TEXT,
    ];
    for (const f of frases) expectCarolVoice(f);
  });
});
