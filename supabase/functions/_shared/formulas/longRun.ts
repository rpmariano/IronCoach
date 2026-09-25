// O treino longo: percentagem do volume semanal e teto absoluto, por nível —
// fórmula pura.
//
// @doutrina src/coach-knowledge/02-corrida-carga-progressao.md, Corrida 2.1 #4
//
// Iniciante: 25-33% do volume · teto 10-12 km ou 75-90 min
// Básico:    25-30% · teto 16-18 km ou 105-120 min
// Médio:     25-30% · teto 25-28 km ou 150 min
// Avançado:  20-25% · teto 30-32 km ou 150 min (Daniels); na preparação de
//            maratona, 35-38 km ou 180 min (Pfitzinger) — a doutrina diz qual:
//            o de Pfitzinger quando a prova é maratona.
// Em trail com D+ significativo, o teto regula-se por tempo, não por
// distância. Os minutos são o limite de cima de cada gama.
//
// Até aqui a doutrina só estava escrita; o parecer da prova passa a dizê-la a
// cada atleta (src/utils/phaseGuidance.js, 2026-09-25).

import { categorizeDistance } from "./vocabulary.ts";

export interface LongRunCap {
  /** Percentagem do volume semanal, [de, até]. */
  pct: [number, number];
  /** Teto absoluto, [de, até] km. */
  km: [number, number];
  /** Teto em tempo, minutos. */
  minutes: number;
}

const LONG_RUN: Record<string, LongRunCap> = {
  iniciante: { pct: [25, 33], km: [10, 12], minutes: 90 },
  basico: { pct: [25, 30], km: [16, 18], minutes: 120 },
  medio: { pct: [25, 30], km: [25, 28], minutes: 150 },
  avancado: { pct: [20, 25], km: [30, 32], minutes: 150 },
};
const LONG_RUN_MARATHON_ADVANCED: LongRunCap = { pct: [20, 25], km: [35, 38], minutes: 180 };

export interface LongRunGuide extends LongRunCap {
  /** O longo mais comprido pelo volume semanal do atleta (a percentagem de
   *  cima), antes do teto. null sem volume conhecido. */
  byVolumeKm: number | null;
  /** Em trail, o teto é por tempo. */
  byTime: boolean;
}

export function longRunGuide(opts: {
  experienceLevel?: string | null;
  distanceKm?: number | null;
  raceType?: string | null;
  weeklyVolumeKm?: number | null;
}): LongRunGuide {
  const level = opts.experienceLevel && LONG_RUN[opts.experienceLevel] ? opts.experienceLevel : "iniciante";
  const marathon = categorizeDistance(opts.distanceKm ?? null) === "maratona";
  const cap = level === "avancado" && marathon ? LONG_RUN_MARATHON_ADVANCED : LONG_RUN[level];
  const vol = opts.weeklyVolumeKm;
  const byVolumeKm = typeof vol === "number" && vol > 0 ? Math.round((vol * cap.pct[1]) / 100) : null;
  return { ...cap, byVolumeKm, byTime: opts.raceType === "trail" };
}
