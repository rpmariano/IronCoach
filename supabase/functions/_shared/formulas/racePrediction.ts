// T1 — Previsão de prova: Riegel, VDOT (Daniels-Gilbert), equivalente ITRA
// (trail). Fórmulas puras, sem cópias a eliminar — já eram sítio único no
// frontend (`src/utils/biEngine.js`/`racePlanEngine.js`); esta migração só
// muda de casa, sem mudar comportamento (ver
// specs/formulas-centralizacao.md §4, specs/formulas-checklist.md Fase C).

// ─── Riegel — previsão de tempo de prova ──────────────────────────────────
// @doutrina specs/coach-investigacao.md (fator por nível: iniciante/básico
// 1,085 · médio/avançado 1,06 — atletas menos treinados perdem mais ritmo
// em distâncias maiores).
export const RIEGEL_FACTOR: Record<string, number> = {
  iniciante: 1.085,
  basico: 1.085,
  medio: 1.06,
  avancado: 1.06,
};

export interface RaceRun {
  distance_km: number;
  duration_seconds: number;
  date?: string;
}

export interface RiegelPrediction {
  predictedSeconds: number;
  predictedPace: number;
  confidence: number;
  basedOn: { distance: number; time: number; date?: string } | null;
}

// Escolhe a corrida com melhor ritmo (duration/distance mínimo) entre as
// que têm distância > 0 — é essa que alimenta a extrapolação de Riegel.
function fastestRun(runs: RaceRun[]): RaceRun | null {
  const valid = (runs || []).filter(r => r.distance_km > 0);
  if (valid.length === 0) return null;
  return valid.reduce((best, r) => {
    const paceR = r.duration_seconds / r.distance_km;
    const paceBest = best.duration_seconds / best.distance_km;
    return paceR < paceBest ? r : best;
  });
}

export function predictRaceTime(runs: RaceRun[], targetDistanceKm: number, experienceLevel = 'medio'): RiegelPrediction {
  const recentBest = fastestRun(runs);
  if (!recentBest) return { predictedSeconds: 0, predictedPace: 0, confidence: 0, basedOn: null };

  const t1 = recentBest.duration_seconds;
  const d1 = recentBest.distance_km;
  const factor = RIEGEL_FACTOR[experienceLevel] || 1.06;

  const t2 = t1 * Math.pow(targetDistanceKm / d1, factor);

  return {
    predictedSeconds: t2,
    predictedPace: t2 / targetDistanceKm,
    confidence: d1 / targetDistanceKm > 0.5 ? 0.8 : 0.4,
    basedOn: { distance: d1, time: t1, date: recentBest.date },
  };
}

// ─── VDOT (Daniels-Gilbert) ────────────────────────────────────────────────
// @doutrina Daniels & Gilbert (1979) — equação de regressão original.
export function calculateVDOT(distanceKm: number, timeSeconds: number): number {
  if (!distanceKm || distanceKm <= 0 || !timeSeconds || timeSeconds <= 0) return 0;
  const distanceMeters = distanceKm * 1000;
  const timeMinutes = timeSeconds / 60;
  const velocityMPerMin = distanceMeters / timeMinutes;

  // VO2 da corrida (ml/kg/min): VO2 = -4.60 + 0.182258*v + 0.000104*v²
  const vo2Run = -4.60 + 0.182258 * velocityMPerMin + 0.000104 * Math.pow(velocityMPerMin, 2);

  // Fração de VO2max utilizada, em função do tempo (minutos):
  // %VO2max = 0.8 + 0.1894393*e^(-0.012778t) + 0.2989558*e^(-0.1932605t)
  const pctVO2max = 0.8 + 0.1894393 * Math.exp(-0.012778 * timeMinutes)
                       + 0.2989558 * Math.exp(-0.1932605 * timeMinutes);

  const vdot = pctVO2max > 0 ? vo2Run / pctVO2max : 0;
  return Math.max(0, Math.round(vdot * 10) / 10);
}

// ─── Equivalente ITRA/Naismith (trail) ─────────────────────────────────────
// @doutrina src/coach-knowledge/02-corrida-prova.md Bloco 2.3 #3
// Fator MVP: 100 m D+ = 1,0 km plano. Não distingue declive/técnico.
export function calculateEquivalentFlatKm(
  distanceKm: number,
  elevationGainM: number | null | undefined,
  raceType: string | null | undefined,
): number {
  const km = Number(distanceKm) || 0;
  if (raceType !== 'trail' || !elevationGainM) return km;
  const dPlus = Number(elevationGainM) || 0;
  return Math.round((km + dPlus / 100) * 10) / 10;
}
