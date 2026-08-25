// T1 — Classificação de gordura visceral (escala Renpho, a usada pela app).
//
// @doutrina src/coach-knowledge (Bloco 5 #8, "CORPO #8")
// 1-9: saudável (<100 cm² área visceral) · 10-14: alerta (100-130 cm²) ·
// ≥15: risco elevado (>130 cm²). Antes desta migração, coach-chat/index.ts
// já tinha os 3 escalões certos; src/utils/biEngine.js só verificava
// `>= 14`, saltando por completo a faixa de alerta 10-13 e sem distinguir
// 14 de "risco elevado" (ver specs/formulas-centralizacao.md §4,
// specs/formulas-checklist.md Fase C).

export type VisceralFatZone = 'healthy' | 'alert' | 'high_risk';

export const VISCERAL_FAT_ALERT_MIN = 10;
export const VISCERAL_FAT_HIGH_RISK_MIN = 15;

export function classifyVisceralFat(vf: number | null | undefined): VisceralFatZone | null {
  if (vf == null || Number.isNaN(vf)) return null;
  if (vf >= VISCERAL_FAT_HIGH_RISK_MIN) return 'high_risk';
  if (vf >= VISCERAL_FAT_ALERT_MIN) return 'alert';
  return 'healthy';
}
