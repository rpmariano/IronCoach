// Séries e volume-carga por grupo muscular (categorias), sobre um período
// relativo — alimenta o gráfico de barras "volume por grupo muscular" e,
// desde a Fase E, o painel de indicadores da Carol.
//
// @contexto Migrado de src/utils/biEngine.js calculateMuscleGroupVolume
// (specs/formulas-checklist.md Fase E).
//
// G1 (2026-10-04): antes, cada grupo de `categories` recebia TODAS as séries
// e TODO o volume-carga da sessão — Peito+Tríceps com 20 séries dava
// Peito 20 + Tríceps 20 (40 para 20 séries reais), e o ecrã e a Carol
// diziam "20 séries em Peito" como se fosse exato. O modelo de dados não
// permite fazer melhor por série: `workout_session_sets` só guarda
// `exercise_name` (texto livre) e o grupo muscular vive na SESSÃO
// (`workout_sessions.categories`); não há mapa exercício→grupo no repo.
// Por isso, em vez de duplicar, só entram sessões de força com UM grupo (aí
// o grupo é inequívoco e a contagem é exata). As sessões com vários grupos
// ficam de fora e são contadas à parte (`multiGroupSessions`), para o ecrã
// dizer "N sessões com vários grupos não entram" em vez de inventar uma
// repartição. Aulas (kind 'aula') e sessões sem séries nem carga não criam
// grupos (nada de "Pernas 0").

import { computeSessionVolumeKg, type SessionForVolume } from "./sessionVolumeKg.ts";
import { filterByRelativeDateRange, type RelativeDateRange } from "./relativeDateRange.ts";

export interface SessionForMuscleGroups extends SessionForVolume {
  date: string;
  kind?: string | null;
  categories?: string[] | null;
}

export interface MuscleGroupStats {
  sets: number;
  volumeLoad: number;
}

export interface MuscleGroupVolume {
  groups: Record<string, MuscleGroupStats>;
  /** Sessões de força do período, com séries ou carga, que têm 2+ grupos e
   *  por isso NÃO entram em `groups` (não há como repartir as séries). */
  multiGroupSessions: number;
}

export function computeMuscleGroupVolumeDetailed(
  sessions: SessionForMuscleGroups[],
  todayISO: string,
  range: string,
): MuscleGroupVolume {
  const filtered = filterByRelativeDateRange(sessions, todayISO, range as RelativeDateRange);
  const groups: Record<string, MuscleGroupStats> = {};
  let multiGroupSessions = 0;

  for (const s of filtered) {
    if (s.kind === "aula") continue;
    const sets = s.workout_session_sets?.length || 0;
    const volumeLoad = computeSessionVolumeKg(s);
    if (sets === 0 && volumeLoad === 0) continue;

    // Grupos distintos, sem vazios nem repetidos ("Peito" duas vezes é um).
    const cats = [...new Set((s.categories || []).map((c) => (typeof c === "string" ? c.trim() : "")).filter(Boolean))];
    if (cats.length === 0) continue;
    if (cats.length > 1) {
      multiGroupSessions++;
      continue;
    }

    const cat = cats[0];
    if (!groups[cat]) groups[cat] = { sets: 0, volumeLoad: 0 };
    groups[cat].sets += sets;
    groups[cat].volumeLoad += volumeLoad;
  }

  return { groups, multiGroupSessions };
}

/** Só os grupos (contrato antigo, usado pelo coach-chat e pelo biEngine).
 *  Para saber quantas sessões ficaram de fora, usar a variante `Detailed`. */
export function computeMuscleGroupVolume(
  sessions: SessionForMuscleGroups[],
  todayISO: string,
  range: string,
): Record<string, MuscleGroupStats> {
  return computeMuscleGroupVolumeDetailed(sessions, todayISO, range).groups;
}
