// Bloco 1 — Objetivo e viabilidade de uma prova.
//
// @doutrina src/coach-knowledge/01-objetivo-viabilidade.md. Fontes: Daniels'
// Running Formula 4th Ed (2021); Faster Road Racing / Advanced Marathoning
// 3rd Ed (Pfitzinger 2014/2019); Hal Higdon Training Programs (2021);
// Training Essentials for Ultrarunning 2nd Ed (Koop, 2021). Confiança: ALTA.
//
// @contexto Migrado de src/utils/raceViability.js (specs/formulas-checklist.md
// Fase E). `MIN_PREP_WEEKS`/`MIN_VOLUME_KM`/`categorizeDistance` já viviam em
// vocabulary.ts (T0) desde a Fase B — usados diretamente daqui.
//
// NOTA — parâmetro `racePriority` sem efeito, replicado fielmente: a
// assinatura e o comentário original de `assessRaceViability` descreviam
// "'tempo_insuficiente' ... (ignorado se tiver base ou B/C race)", mas o
// corpo da função nunca usa `racePriority` nem a variável local
// `hasBaseFitness` para suprimir essa flag — só a calcula. Isto é uma
// divergência doutrina↔código pré-existente (comentário descreve um
// comportamento que o código não implementa), não introduzida por esta
// migração. Portado como está; decidir a intenção correta fica para uma
// revisão à parte, não silenciosa dentro de uma migração de casa.

import { categorizeDistance, MIN_PREP_WEEKS, MIN_VOLUME_KM } from "./vocabulary.ts";

export interface RunForVolume {
  date: string;
  distance_km?: number | null;
}

/** Volume médio semanal das últimas `weeks` semanas (0 se sem dados). */
export function computeRecentWeeklyVolume(runs: RunForVolume[], todayISO: string, weeks = 4): number {
  if (!Array.isArray(runs) || runs.length === 0) return 0;
  const cutoffMs = new Date(todayISO + "T00:00:00Z").getTime() - weeks * 7 * 86400000;
  const total = runs
    .filter((r) => r.date && new Date(r.date + "T00:00:00Z").getTime() >= cutoffMs)
    .reduce((s, r) => s + (Number(r.distance_km) || 0), 0);
  return Math.round((total / weeks) * 10) / 10;
}

export type ViabilityFlag = "ultra_para_iniciante" | "tempo_insuficiente" | "volume_insuficiente";

export interface RaceViabilityInput {
  distanceKm: number | null;
  experienceLevel: string | null;
  weeksToRace: number;
  weeklyVolumeKm: number | null;
  racePriority?: string;
}

export interface RaceViabilityResult {
  flags: ViabilityFlag[];
  isViable: boolean;
}

export function assessRaceViability(opts: RaceViabilityInput): RaceViabilityResult {
  const { distanceKm, experienceLevel, weeksToRace, weeklyVolumeKm } = opts;
  const flags: ViabilityFlag[] = [];

  // Não avaliar provas já passadas ou de hoje — sem tempo de preparar de qualquer forma.
  if (weeksToRace <= 0) return { flags, isViable: true };

  const cat = categorizeDistance(distanceKm ?? undefined);
  const level = experienceLevel;

  // Sem dados suficientes para avaliar.
  if (!cat || !level || !MIN_PREP_WEEKS[level]) {
    return { flags, isViable: true };
  }

  if (cat === "ultra" && level === "iniciante") {
    flags.push("ultra_para_iniciante");
  }

  const minWeeks = MIN_PREP_WEEKS[level]?.[cat];
  const minVol = MIN_VOLUME_KM[level]?.[cat];

  if (minVol != null && weeklyVolumeKm != null && weeklyVolumeKm < minVol) {
    flags.push("volume_insuficiente");
  }

  if (minWeeks != null && weeksToRace < minWeeks) {
    flags.push("tempo_insuficiente");
  }

  return { flags, isViable: flags.length === 0 };
}
