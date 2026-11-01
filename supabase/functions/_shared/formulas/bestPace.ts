// Recordes pessoais de pace por escalão de distância (5/10/21 km) — melhor
// (mais rápido) pace já feito nesse escalão.
//
// @contexto Migrado de getBestPaceData em src/components/Run/RunDashboard.jsx
// (specs/formulas-checklist.md Fase E) — só o KPI de recordes existia no
// dashboard; a Carol não tinha acesso a estes números.
//
// 2026-11-01 (pedido do Rui: «estes paces devem de ter em conta os primeiros
// 5km, 10km e 21 de uma corrida»): o melhor pace de D km é, em cada corrida
// com pelo menos D km, o dos PRIMEIROS D km — o tempo acumulado das voltas
// até ao km D a dividir por D. Antes um split lia-se como uma marca acumulada
// ("5 km em 23:00") numa faixa de 4–6,5 km, mas os splits gravados são voltas
// de ~1 km (analyze-run): nenhum caía na faixa, e uma prova de 10 km a
// 4:53/km (com os primeiros 5 km a 4:33) não contava para os 5 km, cujo melhor
// ficava num treino a 5:24. As faixas largas (8,5–12 km) também deixavam um
// treino de 8,5 km ser «o melhor 10 km».
//
// Regras, por corrida e escalão D:
// · a corrida inteira tem ~D km (de D −1% a D +3%: o relógio raramente crava
//   a distância): conta a corrida inteira;
// · é mais longa: contam os primeiros D km, pelas voltas — uma volta conta
//   pela distância que tem, por isso um parcial final curto (bug #94) nunca
//   vale um km; a marca D a meio de uma volta interpola-se nessa volta;
// · é mais curta, ou não tem voltas que cheguem a D: não conta.

import { runsOnly } from "./runKinds.ts";

export interface SplitEntry {
  distance_km?: number | null;
  time_seconds?: number | null;
}

export interface RunForBestPace {
  date: string;
  distance_km: number | null;
  duration_seconds: number | null;
  details?: { splits?: SplitEntry[] | null } | null;
  kind?: string | null;
  training_type?: string | null;
}

export interface BestPaceResult {
  pace: number; // segundos por km
  date: string;
  count: number; // corridas que contam neste escalão
  runCount: number; // dessas, as que contam pela corrida inteira
  source: "split" | "run";
}

export type BestPaceBucket = 5 | 10 | 21;

/** A distância de cada escalão: a meia maratona é 21,0975 km. */
export const BUCKET_KM: Record<BestPaceBucket, number> = { 5: 5, 10: 10, 21: 21.0975 };

/** Uma corrida «de D km» pela distância total: de D −1% a D +3%. */
export const WHOLE_RUN_TOLERANCE = { below: 0.01, above: 0.03 };

export function wholeRunRange(bucket: BestPaceBucket): { min: number; max: number } | null {
  const d = BUCKET_KM[bucket];
  if (!d) return null;
  return { min: d * (1 - WHOLE_RUN_TOLERANCE.below), max: d * (1 + WHOLE_RUN_TOLERANCE.above) };
}

// 5 m: um acumulado de 4,999 km chega aos 5.
const EPS_KM = 0.005;

/**
 * O tempo acumulado até ao km `d`, pelas voltas, ou null se não chegam lá.
 * Cada volta conta pela distância que tem; a marca a meio de uma volta
 * interpola-se no ritmo dessa volta. Uma linha incompleta antes da marca
 * (sem distância ou sem tempo) deixa o acumulado por saber: null.
 */
export function timeToDistance(splits: SplitEntry[] | null | undefined, d: number): number | null {
  if (!Array.isArray(splits) || !(d > 0)) return null;
  let dist = 0;
  let time = 0;
  for (const s of splits) {
    const sd = Number(s?.distance_km);
    const st = Number(s?.time_seconds);
    if (!(sd > 0) || !(st > 0)) return null;
    if (dist + sd >= d - EPS_KM) return time + st * Math.min(1, Math.max(0, d - dist) / sd);
    dist += sd;
    time += st;
  }
  return null;
}

/**
 * A linha de uma consulta que projeta só as voltas (`splits:details->splits`,
 * nunca `details` inteiro) na forma que computeBestPace lê. Até 2026-11-01 as
 * consultas usavam `details:details->splits`, que põe o array em `details` —
 * `details.splits` ficava undefined e as voltas nunca contavam (não fazia
 * diferença enquanto as voltas não chegavam às faixas; agora faz).
 */
export function withProjectedSplits<T extends { splits?: unknown }>(row: T): Omit<T, "splits"> & { details: { splits: SplitEntry[] | null } } {
  const { splits, ...rest } = row;
  return { ...rest, details: { splits: Array.isArray(splits) ? splits as SplitEntry[] : null } };
}

interface PaceEntry {
  pace: number;
  date: string;
  source: "split" | "run";
}

/** O pace desta corrida no escalão, ou null se não conta (ver as regras acima). */
export function runBucketPace(r: RunForBestPace, targetKm: BestPaceBucket): PaceEntry | null {
  const range = wholeRunRange(targetKm);
  if (!range) return null;
  const d = BUCKET_KM[targetKm];
  const total = Number(r.distance_km) || 0;
  const duration = Number(r.duration_seconds) || 0;
  if (total >= range.min && total <= range.max) {
    return duration > 0 ? { pace: duration / total, date: r.date, source: "run" } : null;
  }
  // Mais curta do que D não conta; sem distância gravada, as voltas dizem.
  if (total > 0 && total < d) return null;
  const t = timeToDistance(r.details?.splits, d);
  return t && t > 0 ? { pace: t / d, date: r.date, source: "split" } : null;
}

export function computeBestPace(runs: RunForBestPace[], targetKm: BestPaceBucket): BestPaceResult | null {
  if (!wholeRunRange(targetKm)) return null;

  // Caminhadas fora (runKinds.ts, 2026-10-05): um recorde de pace é de corrida.
  const entries = runsOnly(runs)
    .map((r) => runBucketPace(r, targetKm))
    .filter((e): e is PaceEntry => !!e);
  if (entries.length === 0) return null;

  // Melhor pace = mais baixo (mais rápido); em empate (±0.1s/km), prefere as
  // voltas — é a medição mais precisa das duas.
  entries.sort((a, b) => {
    if (Math.abs(a.pace - b.pace) > 0.1) return a.pace - b.pace;
    if (a.source === "split" && b.source !== "split") return -1;
    if (b.source === "split" && a.source !== "split") return 1;
    return 0;
  });

  const best = entries[0];
  return {
    pace: best.pace,
    date: best.date,
    count: entries.length,
    runCount: entries.filter((e) => e.source === "run").length,
    source: best.source,
  };
}
