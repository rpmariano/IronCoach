// Métricas cruzadas entre corrida, ginásio, nutrição e corpo — para a vista
// holística (peso vs. pace, carga de ginásio vs. RPE de corrida) e o ACWR
// combinado.
//
// @contexto Migrado de src/utils/biEngine.js calculateCrossMetrics
// (specs/formulas-checklist.md Fase E). `combinedACWR = max(ACWR de
// corrida, ACWR de ginásio)` já existia no ecrã (Cruzamento de Análises)
// mas nunca tinha chegado à Carol — ela só via o ACWR de corrida.

import { computeRunAcwr, type RunForAcwr } from "./runAcwr.ts";
import { computeGymVolumeLoad } from "./volumeLoad.ts";
import { computeSessionVolumeKg, type SessionForVolume } from "./sessionVolumeKg.ts";
import { filterByRelativeDateRange } from "./relativeDateRange.ts";

export interface RunForCrossMetrics extends RunForAcwr {
  duration_seconds?: number | null;
  effort_rpe?: number | null;
}
export interface GymSessionForCrossMetrics extends SessionForVolume {
  date: string;
}
export interface BodyAssessmentForCrossMetrics {
  date: string;
  weight_kg?: number | null;
}

export interface WeightVsPacePoint {
  date: string;
  weight: number;
  pace: number;
}
export interface GymLoadVsRunRpePoint {
  date: string; // segunda-feira da semana
  gymVolume: number;
  runRPE: number;
}
export interface CrossMetrics {
  weightVsPace: WeightVsPacePoint[];
  gymLoadVsRunRPE: GymLoadVsRunRpePoint[];
  combinedACWR: number;
}

// RPE assumido quando a corrida não tem effort_rpe registado — mesmo
// fallback do biEngine.js original (esforço "moderado" por omissão).
const DEFAULT_RUN_RPE = 5;

function mondayOfWeek(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00Z");
  const dow = d.getUTCDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

// Diferença absoluta entre duas datas ISO, em dias — usada para encontrar a
// avaliação corporal mais próxima de cada corrida (par temporal).
function daysBetween(aISO: string, bISO: string): number {
  const a = new Date(aISO + "T00:00:00Z").getTime();
  const b = new Date(bISO + "T00:00:00Z").getTime();
  return Math.abs(a - b) / 86400000;
}

export function computeCrossMetrics(
  runs: RunForCrossMetrics[],
  gymSessions: GymSessionForCrossMetrics[],
  bodyAssessments: BodyAssessmentForCrossMetrics[],
  todayISO: string,
  range: string,
): CrossMetrics {
  const filteredRuns = filterByRelativeDateRange(runs, todayISO, range);
  const filteredBody = filterByRelativeDateRange(bodyAssessments, todayISO, range);
  const filteredGym = filterByRelativeDateRange(gymSessions, todayISO, range);

  // Peso vs. pace — par temporal com a avaliação corporal mais próxima.
  const weightVsPace: WeightVsPacePoint[] = [];
  for (const run of filteredRuns) {
    if (!run.distance_km || !run.duration_seconds) continue;
    const pace = run.duration_seconds / run.distance_km;
    let closest: { weight: number; diff: number } | null = null;
    for (const ba of filteredBody) {
      if (ba.weight_kg == null) continue;
      const diff = daysBetween(ba.date, run.date);
      if (!closest || diff < closest.diff) closest = { weight: ba.weight_kg, diff };
    }
    if (closest) weightVsPace.push({ date: run.date, weight: closest.weight, pace: Math.round(pace) });
  }

  // Carga de ginásio vs. RPE de corrida, por semana de calendário.
  const weeklyGym: Record<string, number> = {};
  for (const s of filteredGym) {
    const wk = mondayOfWeek(s.date);
    weeklyGym[wk] = (weeklyGym[wk] || 0) + computeSessionVolumeKg(s);
  }
  const weeklyRunRPE: Record<string, { total: number; count: number }> = {};
  for (const r of filteredRuns) {
    const wk = mondayOfWeek(r.date);
    if (!weeklyRunRPE[wk]) weeklyRunRPE[wk] = { total: 0, count: 0 };
    weeklyRunRPE[wk].total += r.effort_rpe || DEFAULT_RUN_RPE;
    weeklyRunRPE[wk].count += 1;
  }
  const weeks = new Set([...Object.keys(weeklyGym), ...Object.keys(weeklyRunRPE)]);
  const gymLoadVsRunRPE: GymLoadVsRunRpePoint[] = [...weeks]
    .map((wk) => {
      const rpe = weeklyRunRPE[wk] ? weeklyRunRPE[wk].total / weeklyRunRPE[wk].count : 0;
      return { date: wk, gymVolume: weeklyGym[wk] || 0, runRPE: Math.round(rpe * 10) / 10 };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // ACWR combinado — o maior dos dois, sobre TODO o histórico (não só o
  // `range` selecionado), tal como cada ACWR já faz individualmente.
  const runACWR = computeRunAcwr(runs, todayISO);
  const gymVL = computeGymVolumeLoad(gymSessions, todayISO, "todos");
  const combinedACWR = Math.max(runACWR.ratio, gymVL.acwr || 0);

  return { weightVsPace, gymLoadVsRunRPE, combinedACWR };
}
