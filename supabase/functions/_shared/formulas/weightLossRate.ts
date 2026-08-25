// T1 — Ritmo de perda de peso (défice calórico sustentável), fórmula pura.
//
// @doutrina src/coach-knowledge/04-nutricao-seguranca.md Bloco 4.2 #3
// @doutrina src/coach-knowledge/04-nutricao-base-diaria.md Bloco 4.1 #5
// (convergência tripla e independente — Bloco 1 #6, 4.1 #5 e 4.2 #3 chegam
// exatamente ao mesmo intervalo, confiança ALTA, "não requer reconciliação").
//
// Valor: ≤0,5-0,7% da massa corporal/semana; acima de 1,0%/semana já indica
// perda de massa magra e depleção de glicogénio. Por nível (Bloco 4.1 #5):
// iniciante/básico ≤0,7% · médio ≤0,5% · avançado ≤0,3-0,4%.
//
// ⚠️ Distinto de propósito da "queda súbita de peso" (Bloco 5 #11,
// src/coach-knowledge/05-corpo.md #209: >1,5-2,0% em 48-72h) — esse é um
// sinal AGUDO de desidratação/doença, não o ritmo sustentado de um défice
// calórico. Os dois ficam por unificar: são doutrinas diferentes, não
// cópias uma da outra (ver specs/formulas-checklist.md Fase C).

export type ExperienceLevelKey = 'iniciante' | 'basico' | 'medio' | 'avancado';

export const MAX_WEIGHT_LOSS_PCT_WEEK: Record<ExperienceLevelKey, number> = {
  iniciante: 0.7,
  basico: 0.7,
  medio: 0.5,
  avancado: 0.4,
};

const DEFAULT_MAX_PCT = 0.7;

export interface WeightLossRateResult {
  lossPct: number;   // % do peso perdido por semana (positivo = a perder)
  maxPct: number;    // limiar máximo saudável para este nível
  isTooFast: boolean;
}

// weeklyRateKg: negativo = a perder peso (mesma convenção de
// weightTrend.ts). currentWeightKg: peso mais recente, para converter
// kg/semana em %/semana — a doutrina é sempre relativa à massa corporal,
// nunca um valor absoluto (0,9 kg/semana não significa o mesmo para um
// atleta de 50 kg e um de 100 kg).
export function assessWeightLossRate(
  weeklyRateKg: number,
  currentWeightKg: number,
  experienceLevel: string | null | undefined,
): WeightLossRateResult | null {
  if (!(currentWeightKg > 0) || weeklyRateKg >= 0) return null;
  const maxPct = MAX_WEIGHT_LOSS_PCT_WEEK[experienceLevel as ExperienceLevelKey] ?? DEFAULT_MAX_PCT;
  const lossPct = (Math.abs(weeklyRateKg) / currentWeightKg) * 100;
  return { lossPct, maxPct, isTooFast: lossPct > maxPct };
}
