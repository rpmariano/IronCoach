// T1 — Classificação de compliance calórica (% do alvo diário).
//
// Não é doutrina científica — não há literatura a definir estas bandas,
// é uma escolha de UX/produto (specs/formulas-checklist.md Fase C/E:
// pergunta feita ao utilizador, sem "resposta certa" a pesquisar). Antes
// desta unificação havia 3 escalas diferentes para a mesma pergunta ("como
// está a adesão calórica hoje?"): NutritionDashboard.jsx (85/115, 3 tons),
// OverviewDashboard.jsx (90/70/115, 4 zonas — escolhida aqui como única) e
// biEngine.js (75/90/110, pontuação do Pilar de Prontidão). Escolha do
// utilizador: usar a escala do OverviewDashboard (mais granular) em todo o
// lado.

export type CalorieComplianceZone = 'no_data' | 'critical' | 'low' | 'ok' | 'over';

export const CALORIE_COMPLIANCE_LOW_MIN = 70;
export const CALORIE_COMPLIANCE_OK_MIN = 90;
export const CALORIE_COMPLIANCE_OVER_MIN = 115; // > este valor, não >=

export function classifyCalorieCompliance(pct: number | null | undefined): CalorieComplianceZone {
  if (!pct || pct <= 0) return 'no_data';
  if (pct > CALORIE_COMPLIANCE_OVER_MIN) return 'over';
  if (pct >= CALORIE_COMPLIANCE_OK_MIN) return 'ok';
  if (pct >= CALORIE_COMPLIANCE_LOW_MIN) return 'low';
  return 'critical';
}
