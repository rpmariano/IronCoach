import { describe, it, expect } from 'vitest';
import { bodyVerdict, trendNeedText } from './body';
import { expectCarolVoice } from '../../test/carolVoice';

/* Veredicto do Corpo num período de calendário (2026-10-04, fase 5 — plano §3
   Corpo; C1, C2, C5). Sem `period` as frases são as de sempre (testadas em
   dashboardVerdicts.test.js); com ele, a frase diz de que período fala e vai
   para o passado quando o período fechou. */

const pts = (weights, start = 1) => weights.map((w, i) => ({ date: `2026-09-${String(start + i * 4).padStart(2, '0')}`, weight: w }));
const trend = (weeklyRate, label, weights) => ({
  trend: label,
  weeklyRate,
  sufficient: weeklyRate !== null,
  spanDays: 12,
  pointsInWindow: weights.length,
  rawPoints: pts(weights),
  movingAverage: pts(weights),
});
const SETEMBRO = { where: 'em setembro', isCurrent: false };
const OUTUBRO = { where: 'em outubro', isCurrent: true };

describe('bodyVerdict com período', () => {
  it('período sem avaliações, com histórico: diz de quando é a última pesagem (C5)', () => {
    const v = bodyVerdict({ assessmentCount: 0, period: { where: 'nesta semana', isCurrent: true }, lastOutside: { date: '2026-10-02', weight: 74.2 } });
    expect(v).toEqual({ text: 'Ainda sem avaliações nesta semana. A última pesagem foi a 2 out: 74,2 kg.', tone: 'neutral' });
    const p = bodyVerdict({ assessmentCount: 0, period: SETEMBRO, lastOutside: { date: '2026-08-20', weight: 75 } });
    expect(p.text).toBe('Sem avaliações em setembro. A última pesagem antes disso foi a 20 ago: 75,0 kg.');
    expectCarolVoice(p.text);
  });

  it('pesagens que não chegam: "Tenho duas pesagens em outubro" e o que falta', () => {
    const v = bodyVerdict({ weightTrend: trend(null, null, [76.4, 76.2]), period: OUTUBRO, assessmentCount: 2 });
    expect(v.tone).toBe('neutral');
    expect(v.text).toContain('Tenho duas pesagens em outubro, de 76,4 a 76,2 kg');
    expect(v.text).toContain('três pesagens');
  });

  it('três pesagens iguais: "todas de", não "ambas de"', () => {
    const v = bodyVerdict({ weightTrend: trend(null, null, [80, 80, 80]), period: OUTUBRO });
    expect(v.text).toContain('todas de 80,0 kg');
  });

  it('uma pesagem no período com outras fora: "Em setembro só há uma pesagem"', () => {
    const v = bodyVerdict({ weightTrend: trend(null, null, [74]), period: SETEMBRO, hasWeighInsOutside: true, assessmentCount: 1 });
    // Fechado: o que havia na janela, não um pedido (2026-10-05).
    expect(v.text).toBe('Em setembro só há uma pesagem, de 74,0 kg; nas duas semanas até 1 set não havia outras — a tendência precisa de três em pelo menos 10 dias.');
  });

  it('período fechado fala no passado', () => {
    const v = bodyVerdict({ weightTrend: trend(-0.4, 'descendo', [77.8, 77.4, 77.0]), period: SETEMBRO });
    expect(v.text).toBe('Em setembro, o peso desceu 0,4 kg por semana. Sem gordura medida, não sei se foi gordura ou massa magra.');
    const est = bodyVerdict({ weightTrend: trend(0, 'estavel', [75, 75, 75]), period: SETEMBRO });
    expect(est).toEqual({ text: 'Em setembro, o peso esteve estável, em 75,0 kg.', tone: 'ok' });
    expectCarolVoice(v.text);
  });

  /* 2026-10-04 (revisão no browser, Corpo › jul–set): ritmo recente dentro da
     banda de estável, mas o trimestre inteiro perdeu 3,2 kg — não é «estável». */
  it('período fechado com o ritmo final estável mas uma mudança real no período: diz quanto mudou', () => {
    const Q3 = { where: 'no 3.º trimestre', isCurrent: false };
    const t = { ...trend(-0.2, 'estavel', [77.5, 76, 74.3]), rawPoints: [
      { date: '2026-07-02', weight: 77.5 }, { date: '2026-08-15', weight: 76 }, { date: '2026-09-28', weight: 74.3 },
    ] };
    const v = bodyVerdict({ weightTrend: t, period: Q3 });
    expect(v).toEqual({ text: 'No 3.º trimestre, o peso desceu 3,2 kg, de 77,5 a 74,3 kg (≈0,25 kg por semana); nas últimas semanas estabilizou.', tone: 'neutral' });
    expectCarolVoice(v.text);
    // Abaixo do ruído da balança continua «estável».
    const pouco = { ...t, rawPoints: [{ date: '2026-07-02', weight: 74.9 }, { date: '2026-09-28', weight: 74.3 }] };
    expect(bodyVerdict({ weightTrend: pouco, period: Q3 }).text).toBe('No 3.º trimestre, o peso esteve estável, em 74,3 kg.');
    // Período em curso: fala das últimas semanas, como sempre.
    expect(bodyVerdict({ weightTrend: t, period: OUTUBRO }).text).toBe('O peso estabilizou nas últimas semanas, em 74,3 kg.');
  });

  it('perder depressa demais: perigo no período em curso, aviso num fechado (é história)', () => {
    const w = [80, 78.6, 77.2];
    expect(bodyVerdict({ weightTrend: trend(-1.4, 'descendo', w), period: OUTUBRO }).tone).toBe('danger');
    const past = bodyVerdict({ weightTrend: trend(-1.4, 'descendo', w), period: SETEMBRO });
    expect(past.tone).toBe('warn');
    expect(past.text).toContain('Em setembro, perdeste peso depressa demais');
  });

  it('ganhar peso nunca é perigo; a caminho do objetivo é bom', () => {
    const w = [70, 71, 72];
    const sem = bodyVerdict({ weightTrend: trend(1.5, 'subindo', w), period: OUTUBRO });
    expect(sem.tone).toBe('warn');
    const com = bodyVerdict({ weightTrend: trend(0.4, 'subindo', w), period: OUTUBRO, goalWeight: 75 });
    expect(com.tone).toBe('ok');
    expect(com.text).toContain('a caminho do objetivo de 75,0 kg');
  });

  /* 2026-10-04, revisão: "em curso" é a recência da última pesagem. */
  it('período em curso com a última pesagem velha: passado, com a data, e aviso — não perigo', () => {
    const ANO = { where: 'em 2026', isCurrent: true };
    const t = { ...trend(-2.3, 'descendo', [80, 78.7, 77.4]), rawPoints: [
      { date: '2026-03-05', weight: 80 }, { date: '2026-03-09', weight: 78.7 }, { date: '2026-03-13', weight: 77.4 },
    ] };
    const v = bodyVerdict({ weightTrend: t, period: ANO, todayISO: '2026-10-04' });
    expect(v.tone).toBe('warn');
    expect(v.text.startsWith('Até 13 mar perdias peso depressa demais: ')).toBe(true);
    expectCarolVoice(v.text);
    // Recente (≤14 dias): continua a ser perigo de agora.
    const r = bodyVerdict({ weightTrend: t, period: ANO, todayISO: '2026-03-20' });
    expect(r.tone).toBe('danger');
    // Outros ramos também passam ao passado, com a data.
    const est = bodyVerdict({ weightTrend: { ...t, trend: 'estavel', weeklyRate: 0 }, period: ANO, todayISO: '2026-10-04' });
    expect(est.text).toBe('Até 13 mar, o peso esteve estável, em 77,4 kg.');
  });

  it('pesagens que chegam mas juntas: pede espaço, não "três pesagens"', () => {
    const t = { ...trend(null, null, [80, 79.7, 79.4, 79.1, 78.8, 78.5, 78.2]), spanDays: 6 };
    const v = bodyVerdict({ weightTrend: t, period: { where: 'na semana passada', isCurrent: false } });
    expect(v.text).toBe('Tenho sete pesagens na semana passada, de 80,0 a 78,2 kg; nas duas semanas até à última havia 7, em 6 dias — para a tendência eram precisos pelo menos 10 dias entre a primeira e a última.');
    expectCarolVoice(v.text);
  });

  it('uma só pesagem no período, mas ritmo medido no histórico: usa o ritmo', () => {
    const t = { ...trend(-0.4, 'descendo', [76.2]), pointsInWindow: 5, spanDays: 14 };
    const v = bodyVerdict({ weightTrend: t, period: { where: 'na semana passada', isCurrent: false }, hasWeighInsOutside: true, assessmentCount: 1 });
    expect(v.text).toBe('Na semana passada, o peso desceu 0,4 kg por semana. Sem gordura medida, não sei se foi gordura ou massa magra.');
  });

  it('o "peso atual" da frase é a última pesagem, não o último ponto da EWMA', () => {
    const t = { ...trend(0, 'estavel', [75, 75.2, 74.8]), movingAverage: pts([75, 75.05, 75.0]) };
    expect(bodyVerdict({ weightTrend: t }).text).toContain('em 74,8 kg');
  });
});

/* 2026-10-05: sem tendência, o separador Corpo diz o facto e o que falta em
   concreto ("preciso de mais duas até 4 out"), nunca a regra solta. */
describe('bodyVerdict — o que falta em concreto e a estimativa com 2 pesagens', () => {
  const SEMANA = { where: 'nesta semana', isCurrent: true };

  it('trendNeedText: até quando, entre que dias, ou a partir de quando', () => {
    expect(trendNeedText({ more: 2, start: '2026-09-25', from: '2026-09-25', until: '2026-09-28' })).toBe('para a tendência preciso de mais duas até 28 set');
    expect(trendNeedText({ more: 1, start: '2026-09-30', from: '2026-10-02', until: '2026-10-06' })).toBe('para a tendência preciso de mais uma, a última entre 2 e 6 out');
    expect(trendNeedText({ more: 1, start: '2026-09-28', from: '2026-09-29', until: '2026-10-02' })).toBe('para a tendência preciso de mais uma, a última entre 29 set e 2 out');
    expect(trendNeedText({ more: 1, start: '2026-10-01', from: '2026-10-03', until: '2026-10-03' })).toBe('para a tendência preciso de mais uma, a última a 3 out');
    // Revisão de 2026-10-05: com um limite — a janela é de 14 dias.
    expect(trendNeedText({ more: 3, start: '2026-10-05', from: '2026-10-15', until: '2026-10-19', fresh: true })).toBe('para a tendência preciso de três pesagens em 10 a 14 dias — a primeira hoje, a última entre 15 e 19 out');
  });

  it('1 pesagem na semana em curso: "Nesta semana só há uma pesagem…; para a tendência preciso de mais duas até 28 set"', () => {
    const t = { ...trend(null, null, [76.2]), rawPoints: [{ date: '2026-09-24', weight: 76.2 }], pointsInWindow: 1, spanDays: 0 };
    const v = bodyVerdict({ weightTrend: t, period: SEMANA, hasWeighInsOutside: true, assessmentCount: 1, todayISO: '2026-09-25',
      trendNeed: { more: 2, start: '2026-09-25', from: '2026-09-25', until: '2026-09-28' } });
    expect(v).toEqual({ text: 'Nesta semana só há uma pesagem, de 76,2 kg; para a tendência preciso de mais duas até 28 set.', tone: 'neutral' });
    expectCarolVoice(v.text);
  });

  it('2 pesagens: o facto e a 3.ª que falta — nunca "preciso de três pesagens"', () => {
    const t = { ...trend(null, null, [77.3, 76.2]), rawPoints: [{ date: '2026-09-20', weight: 77.3 }, { date: '2026-10-02', weight: 76.2 }], pointsInWindow: 2, spanDays: 12 };
    const est = { first: t.rawPoints[0], last: t.rawPoints[1], n: 2, diff: -1.1, days: 12, weeklyRate: -0.64 };
    const v = bodyVerdict({ weightTrend: t, weightEstimate: est, period: { where: 'em 2026', isCurrent: true }, todayISO: '2026-10-04',
      trendNeed: { more: 1, start: '2026-10-04', from: '2026-10-04', until: '2026-10-04' } });
    expect(v.text).toBe('Desceste 1,1 kg em 12 dias (≈0,6 kg por semana). Com só duas pesagens é uma estimativa pouco fiável — mais uma pesagem até 4 out e passo a dar-te a tendência a sério.');
    expect(v.text).not.toMatch(/três pesagens/);
    expectCarolVoice(v.text);
    // A subir, e com menos de 7 dias: sem kg por semana inventado.
    const sobe = { ...est, diff: 0.6, days: 3, weeklyRate: null };
    expect(bodyVerdict({ weightTrend: t, weightEstimate: sobe, period: { where: 'em 2026', isCurrent: true }, trendNeed: null }).text)
      .toMatch(/^Subiste 0,6 kg em 3 dias\. Com só duas pesagens/);
  });

  it('sem `period` (Geral, Carol): as frases de sempre', () => {
    const v = bodyVerdict({ weightTrend: trend(null, null, [76.4, 76.2]) });
    expect(v.text).toContain('Preciso de três pesagens espalhadas por pelo menos 10 dias');
  });
});
