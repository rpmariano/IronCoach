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

// ─── Início real da preparação (macrociclo comprimido) ─────────────────────
// O início "ideal" do plano (`raceDate − totalWeeks×7`) é só uma janela
// teórica: se a prova foi registada DEPOIS desse dia, a preparação não pôde
// começar nele — fingir que começou fabrica um histórico de treino
// (fases "concluídas" sem uma única corrida, alerta de tempo insuficiente
// escondido). O início real é o mais tardio dos dois: o ideal, ou o dia em
// que a prova passou a existir para o atleta.
export interface EffectivePrepStart {
  effectiveStartISO: string;
  isCompressed: boolean;
  // Semanas realmente disponíveis até à prova a partir do início efetivo —
  // é este número, não `totalWeeks`, que mede se há tempo para a preparação
  // recomendada.
  effectiveWeeksAvailable: number;
}

export function computeEffectivePrepStart(
  raceDateISO: string,
  totalWeeks: number,
  raceCreatedAtISO?: string | null,
): EffectivePrepStart {
  const raceDateObj = new Date(raceDateISO + "T00:00:00Z");
  const idealStartObj = new Date(raceDateObj.getTime() - totalWeeks * 7 * 86400000);
  const idealStartISO = idealStartObj.toISOString().slice(0, 10);

  // created_at é um timestamp (traz hora) — só a data interessa aqui, e a
  // comparação lexicográfica de strings "YYYY-MM-DD" já ordena por data.
  const createdAtISO = raceCreatedAtISO ? raceCreatedAtISO.slice(0, 10) : null;

  if (!createdAtISO || createdAtISO <= idealStartISO) {
    return { effectiveStartISO: idealStartISO, isCompressed: false, effectiveWeeksAvailable: totalWeeks };
  }

  const createdAtObj = new Date(createdAtISO + "T00:00:00Z");
  const effectiveWeeksAvailable = Math.max(
    0,
    Math.round((raceDateObj.getTime() - createdAtObj.getTime()) / (7 * 86400000)),
  );
  return { effectiveStartISO: createdAtISO, isCompressed: true, effectiveWeeksAvailable };
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
