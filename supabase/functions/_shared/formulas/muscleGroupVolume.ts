// Séries e volume-carga por grupo muscular (categorias), sobre um período
// relativo — alimenta o gráfico de barras "volume por grupo muscular" e,
// desde a Fase E, o painel de indicadores da Carol.
//
// @contexto Migrado de src/utils/biEngine.js calculateMuscleGroupVolume
// (specs/formulas-checklist.md Fase E).

import { computeSessionVolumeKg, type SessionForVolume } from "./sessionVolumeKg.ts";
import { filterByRelativeDateRange, type RelativeDateRange } from "./relativeDateRange.ts";

export interface SessionForMuscleGroups extends SessionForVolume {
  date: string;
  categories?: string[] | null;
}

export interface MuscleGroupStats {
  sets: number;
  volumeLoad: number;
}

export function computeMuscleGroupVolume(
  sessions: SessionForMuscleGroups[],
  todayISO: string,
  range: string,
): Record<string, MuscleGroupStats> {
  const filtered = filterByRelativeDateRange(sessions, todayISO, range as RelativeDateRange);
  const groups: Record<string, MuscleGroupStats> = {};

  for (const s of filtered) {
    const cats = s.categories || [];
    for (const cat of cats) {
      if (!groups[cat]) groups[cat] = { sets: 0, volumeLoad: 0 };
      groups[cat].sets += s.workout_session_sets?.length || 0;
      groups[cat].volumeLoad += computeSessionVolumeKg(s);
    }
  }

  return groups;
}
