// Tendência de composição corporal (massa gorda vs. massa magra) ao longo
// do tempo, a partir das avaliações corporais.
//
// @contexto Migrado de src/utils/biEngine.js calculateCompositionTrend
// (specs/formulas-checklist.md Fase E). Já era puro no original — só de
// casa, sem mudança de comportamento.

export interface BodyAssessmentForComposition {
  date: string;
  weight_kg: number;
  body_fat_pct: number;
  lean_body_mass_kg?: number | null;
}

export interface CompositionTrend {
  dates: string[];
  fatMassKg: number[];
  leanMassKg: number[];
}

export function computeCompositionTrend(
  bodyAssessments: BodyAssessmentForComposition[],
): CompositionTrend {
  const sorted = [...bodyAssessments].sort((a, b) => a.date.localeCompare(b.date));
  const dates: string[] = [];
  const fatMassKg: number[] = [];
  const leanMassKg: number[] = [];

  for (const a of sorted) {
    dates.push(a.date);
    const fat = a.weight_kg * (a.body_fat_pct / 100);
    fatMassKg.push(fat);
    leanMassKg.push(a.lean_body_mass_kg || a.weight_kg - fat);
  }

  return { dates, fatMassKg, leanMassKg };
}
