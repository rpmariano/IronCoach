// Tendência de composição corporal (massa gorda vs. massa magra) ao longo
// do tempo, a partir das avaliações corporais.
//
// @contexto Migrado de src/utils/biEngine.js calculateCompositionTrend
// (specs/formulas-checklist.md Fase E). Já era puro no original — só de
// casa, sem mudança de comportamento.
//
// C3 (2026-10-04, specs/evolucao-2026-10/erros-verificados.md): só entram
// as avaliações com peso E gordura medidos. Uma pesagem sem body_fat_pct
// dava massa gorda 0 e massa magra = peso inteiro (80 kg/20% seguido de
// 78 kg sem gordura: "+14,0 kg de massa magra", "Massa gorda 0,0 kg"), e
// com o campo undefined dava NaN. O bodyVerdict já filtrava gordura > 0;
// passa a ser regra da fórmula, para o gráfico e a Carol lerem o mesmo.

export interface BodyAssessmentForComposition {
  date: string;
  weight_kg: number | null;
  body_fat_pct?: number | null;
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
  const sorted = bodyAssessments
    .filter((a) => (a.weight_kg ?? 0) > 0 && (a.body_fat_pct ?? 0) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const dates: string[] = [];
  const fatMassKg: number[] = [];
  const leanMassKg: number[] = [];

  for (const a of sorted) {
    dates.push(a.date);
    const weight = a.weight_kg as number;
    const fat = weight * ((a.body_fat_pct as number) / 100);
    fatMassKg.push(fat);
    leanMassKg.push(a.lean_body_mass_kg || weight - fat);
  }

  return { dates, fatMassKg, leanMassKg };
}
