import { describe, it, expect } from 'vitest';
import { bodyVerdict } from './body';
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
    expect(v.text.startsWith('Em setembro só há uma pesagem, de 74,0 kg.')).toBe(true);
  });

  it('período fechado fala no passado', () => {
    const v = bodyVerdict({ weightTrend: trend(-0.4, 'descendo', [77.8, 77.4, 77.0]), period: SETEMBRO });
    expect(v.text).toBe('Em setembro, o peso desceu 0,4 kg por semana. Sem gordura medida, não sei se foi gordura ou massa magra.');
    const est = bodyVerdict({ weightTrend: trend(0, 'estavel', [75, 75, 75]), period: SETEMBRO });
    expect(est).toEqual({ text: 'Em setembro, o peso esteve estável, em 75,0 kg.', tone: 'ok' });
    expectCarolVoice(v.text);
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
    expect(v.text).toBe('Tenho sete pesagens na semana passada, de 80,0 a 78,2 kg. Para o ritmo preciso de pesagens espalhadas por pelo menos 10 dias — nas duas semanas até à última há 7, em 6 dias.');
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
