// Divisão do macrociclo nas 4 fases de treino (base → construção → pico →
// polimento) e estado temporal de cada uma.
//
// @doutrina Periodização clássica (Bompa 2015, Issurin 2008): a base ocupa
// ~45% do bloco pré-taper, o pico ~20%, e a construção o que sobra; o taper
// vem por cima, dimensionado à parte por nível/distância/prioridade
// (@formulas/taper.ts).
//
// @contexto Migrado de `calculateRaceTrainingPlan` em
// src/utils/racePlanEngine.js (specs/formulas-checklist.md Fase F). Sem
// isto, `racePhaseEvaluation.ts` era inútil para a Carol: ela tinha como
// avaliar uma fase, mas não sabia onde cada fase começa e acaba.
//
// NOTA: a 5.ª "fase" do ecrã (Prova & Recuperação) não vem daqui — não é
// uma fase de treino avaliável, é a prova em si mais os dias de
// recuperação (@formulas/recovery.ts), montada pelo chamador.
//
// O `determinePhaseState` original recebia `(startW, endW, startDateStr,
// endDateStr)` mas nunca usava os dois primeiros — aqui só existem os que
// contam.

export type TrainingPhaseId = "base" | "build" | "peak" | "taper";
export type TrainingStatus = "not_started" | "in_progress" | "race_day" | "completed";
export type PhaseState = "upcoming" | "active" | "completed";

export interface PhaseWindow {
  id: TrainingPhaseId;
  startWeek: number;
  endWeek: number;
  weeksCount: number;
  startDate: string;
  endDate: string;
}

// Proporções do bloco pré-taper.
const BASE_SHARE = 0.45;
const PEAK_SHARE = 0.20;
// O bloco pré-taper nunca desce de 2 semanas, nem cada fase de 1.
const MIN_PRE_TAPER_WEEKS = 2;
const MIN_PHASE_WEEKS = 1;

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Janelas das 4 fases de treino. `planStartISO` é o dia 1 da semana 1
 * (tipicamente `raceDate − totalWeeks × 7`).
 */
export function computePhaseWindows(
  totalWeeks: number,
  taperWeeks: number,
  planStartISO: string,
): PhaseWindow[] {
  // O taper nunca pode comer mais de 1/3 do macrociclo nem descer de 1
  // semana. No original este clamp vivia no CHAMADOR
  // (`calculateRaceTrainingPlan`); trazê-lo para aqui torna o módulo seguro
  // por si só — sem ele, um taper >= totalWeeks produzia uma janela
  // degenerada (0 semanas, endDate antes de startDate). Para o frontend, que
  // já clampava antes de chamar, o resultado é exatamente o mesmo.
  const effectiveTaperWeeks = Math.min(Math.max(1, taperWeeks), Math.max(1, Math.floor(totalWeeks / 3)));
  const preTaperWeeks = Math.max(MIN_PRE_TAPER_WEEKS, totalWeeks - effectiveTaperWeeks);
  const baseWeeks = Math.max(MIN_PHASE_WEEKS, Math.round(preTaperWeeks * BASE_SHARE));
  const peakWeeks = Math.max(MIN_PHASE_WEEKS, Math.round(preTaperWeeks * PEAK_SHARE));
  const buildWeeks = Math.max(MIN_PHASE_WEEKS, preTaperWeeks - baseWeeks - peakWeeks);

  const wBaseEnd = baseWeeks;
  const wBuildEnd = wBaseEnd + buildWeeks;
  const wPeakEnd = wBuildEnd + peakWeeks;

  const ranges: Array<{ id: TrainingPhaseId; startWeek: number; endWeek: number }> = [
    { id: "base", startWeek: 1, endWeek: wBaseEnd },
    { id: "build", startWeek: wBaseEnd + 1, endWeek: wBuildEnd },
    { id: "peak", startWeek: wBuildEnd + 1, endWeek: wPeakEnd },
    // O taper fecha o plano, mas nunca com menos de 1 semana: com um
    // `totalWeeks` muito pequeno os mínimos das 3 fases anteriores podem
    // consumir tudo, e `endWeek: totalWeeks` produzia uma janela negativa.
    // Inalcançável na prática (o mínimo de getRecommendedPrepWeeks é 4
    // semanas), mas o módulo não deve depender disso.
    { id: "taper", startWeek: wPeakEnd + 1, endWeek: Math.max(totalWeeks, wPeakEnd + 1) },
  ];

  return ranges.map(({ id, startWeek, endWeek }) => ({
    id,
    startWeek,
    endWeek,
    weeksCount: endWeek - startWeek + 1,
    startDate: addDaysISO(planStartISO, (startWeek - 1) * 7),
    endDate: addDaysISO(planStartISO, endWeek * 7 - 1),
  }));
}

/** Estado de uma fase face a hoje, dado o estado global do macrociclo. */
export function resolvePhaseState(
  trainingStatus: TrainingStatus,
  todayISO: string,
  startDateStr: string,
  endDateStr: string,
): PhaseState {
  if (trainingStatus === "completed") return "completed";
  if (trainingStatus === "not_started") return "upcoming";
  if (todayISO > endDateStr) return "completed";
  if (todayISO >= startDateStr && todayISO <= endDateStr) return "active";
  return "upcoming";
}
