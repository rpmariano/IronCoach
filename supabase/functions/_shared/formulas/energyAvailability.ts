// T1 — Disponibilidade Energética (EA) e deteção de risco RED-S, fórmula pura.
//
// @doutrina src/coach-knowledge/04-nutricao-seguranca.md Bloco 4.2 #1
// @doutrina specs/coach-investigacao.md "Bloco 4.2 — Nutrição: segurança" #1
//
// EA = (ingestão − gasto do exercício) / massa magra (kg).
// Ótima ≥45 kcal/kg FFM/dia · subclínica 30-45 · risco RED-S <30.
//
// ⚠️ LIMITAÇÃO DE DOUTRINA, NÃO CORRIGIDA NESTA MIGRAÇÃO (decisão explícita
// do utilizador — specs/formulas-checklist.md Fase C, item EA): o
// denominador (`lean_body_mass_kg`) só está disponível via BIA, a mesma
// fonte que a doutrina (04-nutricao-seguranca.md:40) já desaconselha para
// cálculo de precisão — "o numerador é bom, o denominador é fraco". A
// doutrina é explícita: "o EA calculado é uma estimativa fraca de uma
// estimativa fraca [...] não deve gerar um alarme automático sozinho" —
// só faz sentido em conjunto com outros sinais independentes (gordura no
// piso fisiológico, perda de peso rápida, FC de repouso elevada), nunca
// isolado. Mantém-se `lean_body_mass_kg` como denominador por não haver
// alternativa implementada; isto fica registado como ponto a melhorar na
// doutrina, para quem um dia avaliar uma fonte de massa magra mais fiável.

export type EnergyAvailabilityStatus = 'optimal' | 'subclinical' | 'critical';

export const EA_OPTIMAL = 45;   // >= 45 kcal/kg FFM/dia
export const EA_CRITICAL = 30;  // < 30 kcal/kg FFM/dia — limiar RED-S

export function classifyEnergyAvailability(ea: number): EnergyAvailabilityStatus {
  if (ea < EA_CRITICAL) return 'critical';
  if (ea < EA_OPTIMAL) return 'subclinical';
  return 'optimal';
}

// intake/exercise em kcal, leanMass em kg. Devolve null se leanMass <= 0
// (rácio matematicamente inútil, não "EA zero").
export function computeEnergyAvailability(
  intake: number,
  exercise: number,
  leanMass: number,
): { ea: number; status: EnergyAvailabilityStatus } | null {
  if (!(leanMass > 0)) return null;
  const ea = (intake - exercise) / leanMass;
  return { ea, status: classifyEnergyAvailability(ea) };
}
