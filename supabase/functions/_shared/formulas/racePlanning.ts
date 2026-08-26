// Semanas de preparação recomendadas, nível de experiência efetivo e
// previsão de tempo/pace para UMA prova — as peças de "planeamento de
// prova" de que o Índice de Prontidão (pilar tático) precisa.
//
// @contexto Migrado de src/utils/racePlanEngine.js (specs/formulas-checklist.md
// Fase E): getRecommendedPrepWeeks, getEffectiveDistanceKm,
// resolveExperienceLevel, getRacePrediction — as quatro funções eram já
// puras no original, só não estavam partilhadas. `calculateEquivalentFlatKm`
// e `predictRaceTime` já vivem em racePrediction.ts desde a Fase C.

import { categorizeDistance, MIN_PREP_WEEKS } from "./vocabulary.ts";
import { calculateEquivalentFlatKm, predictRaceTime, type RaceRun, type RiegelPrediction } from "./racePrediction.ts";

// ─── Duração total do plano em semanas ─────────────────────────────────────
export function getRecommendedPrepWeeks(distanceKm: number, experienceLevel = "iniciante"): number {
  const cat = categorizeDistance(distanceKm) || "10k";
  const level = experienceLevel || "iniciante";

  const fromTable = MIN_PREP_WEEKS[level]?.[cat];
  if (fromTable != null) return fromTable;

  // Fallbacks seguros por categoria (mesmos do original).
  switch (cat) {
    case "5k": return 6;
    case "10k": return 8;
    case "meia": return 12;
    case "maratona": return 18;
    case "ultra": return 24;
    default: return 12;
  }
}

export interface RaceForPlanning {
  distance_km?: string | number | null;
  elevation_gain_m?: string | number | null;
  race_type?: string | null;
  experience_level?: string | null;
}

export interface ProfileForPlanning {
  experience_level?: string | null;
}

// Distância equivalente (ITRA/Naismith) de uma prova — é esta (não a bruta)
// que alimenta predictRaceTime/getTaperWeeks; as outras contas do
// macrociclo (semanas de preparação, recuperação, volume mínimo) usam a
// distância em bruto, ver o comentário completo no original.
export function getEffectiveDistanceKm(race: RaceForPlanning | null | undefined): number {
  const distanceKm = parseFloat((race?.distance_km ?? "10").toString().replace(",", ".")) || 10;
  const elevationGainM = race?.elevation_gain_m ? parseFloat(race.elevation_gain_m.toString()) : null;
  return calculateEquivalentFlatKm(distanceKm, elevationGainM, race?.race_type || "estrada");
}

// Nível de experiência a usar para esta prova — o autodeclarado na própria
// prova tem sempre prioridade sobre o geral do Perfil (ver o comentário
// completo no original: existe precisamente para poder diferir dele).
export function resolveExperienceLevel(race: RaceForPlanning | null | undefined, profile: ProfileForPlanning | null | undefined): string {
  return race?.experience_level || profile?.experience_level || "iniciante";
}

export interface RacePrediction extends RiegelPrediction {
  predictedPaceReal: number;
  effectiveDistanceKm: number;
  realDistanceKm: number;
  experienceLevel: string;
}

// Previsão de tempo/pace para UMA prova — ponto único que resolve nível de
// experiência e distância equivalente ITRA antes de chamar predictRaceTime,
// para todos os consumidores lerem sempre o mesmo número (ver o comentário
// completo no original sobre o bug que isto substituiu).
export function getRacePrediction(
  race: RaceForPlanning | null | undefined,
  profile: ProfileForPlanning | null | undefined,
  runs: RaceRun[],
): RacePrediction {
  const experienceLevel = resolveExperienceLevel(race, profile);
  const effectiveDistanceKm = getEffectiveDistanceKm(race);
  const realDistanceKm = parseFloat((race?.distance_km ?? "10").toString().replace(",", ".")) || 10;
  const raw = predictRaceTime(runs || [], effectiveDistanceKm, experienceLevel);
  return {
    ...raw,
    predictedPaceReal: raw.predictedSeconds > 0 ? raw.predictedSeconds / realDistanceKm : 0,
    effectiveDistanceKm,
    realDistanceKm,
    experienceLevel,
  };
}
