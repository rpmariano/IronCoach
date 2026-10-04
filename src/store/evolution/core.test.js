import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runAcwrCore, runAcwrHistoryCore, weightTrendCore, vdotTrendCore, resetEvolutionCore } from './core';
import { calculateACWR, calculateACWRHistory, calculateWeightTrend, getVDOTTrend } from '../../utils/biEngine';

/* Cálculos de base partilhados (2026-10-04, F6): têm de dar EXATAMENTE o
   mesmo que o biEngine (que os ecrãs usam hoje) — só deixam de se repetir. */
const TODAY = '2026-10-04'; // domingo

function runsEvery(days, km, from = TODAY) {
  const out = [];
  const base = new Date(`${from}T00:00:00Z`);
  for (let i = 0; i < days; i += 2) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    out.push({
      id: `r${i}`, date: d.toISOString().slice(0, 10), distance_km: km + (i % 5),
      duration_seconds: (km + (i % 5)) * 330, training_type: i % 6 === 0 ? 'tempo' : 'easy', effort_rpe: 5,
    });
  }
  return out;
}

describe('core da Evolução', () => {
  beforeEach(() => {
    resetEvolutionCore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 12, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('ACWR: igual ao do biEngine e memorizado por identidade + dia', () => {
    const runs = runsEvery(60, 8);
    const a = runAcwrCore(runs, TODAY);
    const { color, ...bi } = calculateACWR(runs, TODAY);
    expect(a).toEqual(bi);
    expect(color).toBeTruthy();
    expect(runAcwrCore(runs, TODAY)).toBe(a);
    expect(runAcwrCore(runs, '2026-10-05')).not.toBe(a);
    expect(runAcwrCore([...runs], TODAY)).not.toBe(a); // lista nova = outra chave
  });

  it('histórico do ACWR: os mesmos números do calculateACWRHistory, preso ao dia dado', () => {
    const runs = runsEvery(120, 6);
    const hist = runAcwrHistoryCore(runs, TODAY);
    const bi = calculateACWRHistory(runs);
    expect(hist).toHaveLength(12);
    expect(hist.map(({ acuteLoad, chronicLoad, ratio, hasEnoughData }) => ({ acuteLoad, chronicLoad, ratio, hasEnoughData })))
      .toEqual(bi.map(({ acuteLoad, chronicLoad, ratio, hasEnoughData }) => ({ acuteLoad, chronicLoad, ratio, hasEnoughData })));
    expect(hist[11]).toMatchObject({ weekStart: '2026-09-28', inProgress: true });
    expect(hist[10]).toMatchObject({ weekStart: '2026-09-21', inProgress: false });
    expect(runAcwrHistoryCore(runs, TODAY)).toBe(hist);
  });

  it('histórico do ACWR: sem corridas em 3 de 4 semanas não há rácio; ignora o futuro e datas más', () => {
    const hist = runAcwrHistoryCore([
      { date: '2026-10-01', distance_km: 10 },
      { date: '2026-10-20', distance_km: 99 },
      { date: null, distance_km: 5 },
    ], TODAY);
    expect(hist[11]).toMatchObject({ acuteLoad: 10, ratio: null, hasEnoughData: false });
  });

  it('tendência de peso: igual ao biEngine, null sem pesagens, memorizada', () => {
    const body = [
      { date: '2026-09-20', weight_kg: 80 },
      { date: '2026-09-25', weight_kg: 79.6 },
      { date: '2026-09-28', weight_kg: 0 },
      { date: '2026-10-02', weight_kg: 79.1 },
      { date: '2026-10-04', weight_kg: 78.9 },
    ];
    const t = weightTrendCore(body);
    expect(t).toEqual(calculateWeightTrend(body));
    expect(weightTrendCore(body)).toBe(t);
    expect(weightTrendCore([])).toBeNull();
    expect(weightTrendCore(null)).toBeNull();
  });

  it('VDOT: igual ao biEngine e memorizado; o resultado não está congelado', () => {
    const runs = runsEvery(40, 5);
    const v = vdotTrendCore(runs);
    expect(v).toEqual(getVDOTTrend(runs));
    expect(v.length).toBeGreaterThan(0);
    expect(vdotTrendCore(runs)).toBe(v);
    expect(Object.isFrozen(v)).toBe(false);
    expect(vdotTrendCore(undefined)).toEqual([]);
  });
});
