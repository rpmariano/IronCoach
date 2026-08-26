// Recordes pessoais de pace por escalão de distância (5/10/21 km) — melhor
// (mais rápido) pace já feito nesse escalão, a partir de splits gravados
// (prioridade) ou de corridas cuja distância total já é ~esse escalão.
//
// @contexto Migrado de getBestPaceData em src/components/Run/RunDashboard.jsx
// (specs/formulas-checklist.md Fase E) — só o KPI de recordes existia no
// dashboard; a Carol não tinha acesso a estes números.

export interface SplitEntry {
  distance_km?: number | null;
  time_seconds?: number | null;
}

export interface RunForBestPace {
  date: string;
  distance_km: number | null;
  duration_seconds: number | null;
  details?: { splits?: SplitEntry[] | null } | null;
}

export interface BestPaceResult {
  pace: number; // segundos por km
  date: string;
  count: number;
  runCount: number;
  source: "split" | "run";
}

export type BestPaceBucket = 5 | 10 | 21;

// Tolerância por escalão — igual à tabela DISTANCE_RANGES do RunDashboard:
// aceita como "uma corrida de 10 km", por exemplo, qualquer coisa entre
// 8.5 e 12.0 km (watches raramente cravam a distância exata).
const DISTANCE_RANGES: Record<BestPaceBucket, { min: number; max: number }> = {
  5: { min: 4.0, max: 6.5 },
  10: { min: 8.5, max: 12.0 },
  21: { min: 19.0, max: 23.0 },
};

interface PaceEntry {
  pace: number;
  date: string;
  source: "split" | "run";
}

export function computeBestPace(runs: RunForBestPace[], targetKm: BestPaceBucket): BestPaceResult | null {
  const range = DISTANCE_RANGES[targetKm];
  if (!range) return null;

  const entries: PaceEntry[] = [];

  for (const r of runs) {
    const totalDist = Number(r.distance_km || 0);

    // Prioridade 1: splits com distância ≈ targetKm — um split guarda o
    // tempo acumulado a essa marca (ex.: {distance_km:5, time_seconds:1380}).
    const splits = r.details?.splits || [];
    for (const s of splits) {
      const splitDist = Number(s.distance_km || 0);
      const splitTime = Number(s.time_seconds || 0);
      if (splitDist >= range.min && splitDist <= range.max && splitTime > 0) {
        entries.push({ pace: splitTime / splitDist, date: r.date, source: "split" });
      }
    }

    // Prioridade 2: a corrida inteira É ~targetKm (não um esforço maior).
    if (totalDist >= range.min && totalDist <= range.max) {
      const secPerKm = r.duration_seconds && totalDist > 0 ? Number(r.duration_seconds) / totalDist : null;
      if (secPerKm && secPerKm > 0) {
        entries.push({ pace: secPerKm, date: r.date, source: "run" });
      }
    }
  }

  if (entries.length === 0) return null;

  // Melhor pace = mais baixo (mais rápido); em empate (±0.1s/km), prefere o
  // split — é a medição mais precisa das duas.
  entries.sort((a, b) => {
    if (Math.abs(a.pace - b.pace) > 0.1) return a.pace - b.pace;
    if (a.source === "split" && b.source !== "split") return -1;
    if (b.source === "split" && a.source !== "split") return 1;
    return 0;
  });

  const best = entries[0];
  const runCount = entries.filter((e) => e.source === "run").length;
  return {
    pace: best.pace,
    date: best.date,
    count: entries.length,
    runCount,
    source: best.source,
  };
}
