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
import { runsOnly } from "./runKinds.ts";

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
  // Média do RPE REGISTADO nas corridas dessa semana; null quando nenhuma
  // corrida da semana tem RPE (buraco no gráfico, nunca 0 nem 5) — O6.
  runRPE: number | null;
}
export interface CrossMetrics {
  weightVsPace: WeightVsPacePoint[];
  gymLoadVsRunRPE: GymLoadVsRunRpePoint[];
  combinedACWR: number;
}

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
  // Caminhadas fora (runKinds.ts, 2026-10-05): o peso vs. PACE e o RPE "de
  // corrida" são da corrida; o ACWR já as tira sozinho.
  const filteredRuns = filterByRelativeDateRange(runsOnly(runs), todayISO, range);
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
  //
  // O6 (2026-10-04): só contam corridas com RPE REAL. Antes, uma corrida sem
  // effort_rpe valia 5 ("moderado") e uma semana sem corridas valia 0 — e a
  // Análise Cruzada dizia "Boa gestão da carga cruzada… Continua assim!" a
  // quem nunca registou um RPE. RPE é opcional no registo, por isso o que
  // falta é um buraco (null), não um número. Uma semana só entra na série se
  // tiver ginásio ou RPE real: semanas só com corridas sem RPE não dizem nada.
  const weeklyGym: Record<string, number> = {};
  for (const s of filteredGym) {
    const wk = mondayOfWeek(s.date);
    weeklyGym[wk] = (weeklyGym[wk] || 0) + computeSessionVolumeKg(s);
  }
  const weeklyRunRPE: Record<string, { total: number; count: number }> = {};
  for (const r of filteredRuns) {
    const rpe = Number(r.effort_rpe);
    if (!(rpe > 0)) continue; // sem RPE registado: não entra na média
    const wk = mondayOfWeek(r.date);
    if (!weeklyRunRPE[wk]) weeklyRunRPE[wk] = { total: 0, count: 0 };
    weeklyRunRPE[wk].total += rpe;
    weeklyRunRPE[wk].count += 1;
  }
  const weeks = new Set([...Object.keys(weeklyGym), ...Object.keys(weeklyRunRPE)]);
  const gymLoadVsRunRPE: GymLoadVsRunRpePoint[] = [...weeks]
    .map((wk) => {
      const rpe = weeklyRunRPE[wk]
        ? Math.round((weeklyRunRPE[wk].total / weeklyRunRPE[wk].count) * 10) / 10
        : null;
      return { date: wk, gymVolume: weeklyGym[wk] || 0, runRPE: rpe };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // ACWR combinado — o maior dos dois, sobre TODO o histórico (não só o
  // `range` selecionado), tal como cada ACWR já faz individualmente.
  // Cada um só conta com histórico que o sustente — sem ele, 0 (o chat e a
  // Home não o mostram). Pedido 2026-09-24: "se a app não tem dados, não
  // apresenta dados".
  const runACWR = computeRunAcwr(runs, todayISO);
  const gymVL = computeGymVolumeLoad(gymSessions, todayISO, "todos");
  const combinedACWR = Math.max(
    runACWR.hasEnoughData ? runACWR.ratio : 0,
    gymVL.acwrHasEnoughData ? gymVL.acwr || 0 : 0,
  );

  return { weightVsPace, gymLoadVsRunRPE, combinedACWR };
}
