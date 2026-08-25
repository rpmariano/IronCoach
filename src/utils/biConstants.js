/**
 * biConstants.js
 * Todas as constantes quantitativas e limiares da doutrina de treinadores para o IronHealth.
 */

// ACWR Thresholds — ACWR_UNDER_TRAINING/ACWR_SAFE_MAX/ACWR_DANGER vivem em
// supabase/functions/_shared/formulas/acwr.ts (T1), a mesma fórmula que as
// Edge Functions usam. Reexportados aqui para não quebrar os consumidores
// existentes (ver specs/formulas-checklist.md Fase C).
import { ACWR_UNDER_TRAINING, ACWR_SAFE_MAX, ACWR_DANGER } from '@formulas/acwr.ts';
export { ACWR_UNDER_TRAINING, ACWR_SAFE_MAX, ACWR_DANGER };
export const ACWR_SAFE_MIN = 0.80;
export const ACWR_CAUTION_MAX = 1.49; // (Orange) 1.31 - 1.49 — só usado como valor de referência num insight, não na classificação
export const ACWR_MIN_HISTORY_DAYS = 28;

// Volume Progression
export const MAX_WEEKLY_INCREASE_PCT = {
  iniciante: 10,
  basico: 10,
  medio: 10,
  avancado: 10
};
export const GYM_VOLUME_ELEVATED_RISK_PCT = 15;
export const GYM_VOLUME_HIGH_RISK_PCT = 20;

// RED-S / Energy Availability (EA) — EA_OPTIMAL/EA_CRITICAL vivem em
// @formulas/energyAvailability.ts (T1); reexportados aqui pelo mesmo motivo
// do ACWR acima (specs/formulas-checklist.md Fase C).
import { EA_OPTIMAL, EA_CRITICAL } from '@formulas/energyAvailability.ts';
export { EA_OPTIMAL, EA_CRITICAL };
export const EA_SUBCLINICAL_MIN = 30; // 30-45
export const EA_CRITICAL_DURATION_DAYS = 5;
export const RUNNING_COST_KCAL_PER_KG_KM = 1.0;

// Training Distribution (80/20)
export const TARGET_LOW_INTENSITY_PCT = {
  iniciante: 95,
  basico: 87.5,
  medio: 80,
  avancado: 77.5
};

export const TARGET_HIGH_INTENSITY_PCT = {
  iniciante: 5,
  basico: 12.5,
  medio: 20,
  avancado: 22.5
};

// Body Composition
export const BF_FLOOR_MEN = 6;
export const BF_FLOOR_WOMEN = 14;
export const BF_ALARM_MEN = 8;
export const BF_ALARM_WOMEN = 16;
// VISCERAL_FAT_HEALTHY_MAX/VISCERAL_FAT_ALERT_MAX viviam aqui — migradas
// para @formulas/bodyComposition.ts (T1) na Fase C, que corrige o limiar
// (o único consumidor comparava `>= 14`, saltando a faixa de alerta 10-13
// da doutrina). Ver specs/formulas-checklist.md Fase C.

// Riegel Race Prediction
export const RIEGEL_FACTOR = {
  iniciante: 1.085,
  basico: 1.085,
  medio: 1.06,
  avancado: 1.06
};

// Nutrition Targets (g/kg/dia) — Bloco 4.1 #1 da doutrina do Coach, ver
// src/coach-knowledge/04-nutricao-base-diaria.md e a tabela PROTEIN_MAINT em
// supabase/functions/coach-chat/index.ts.
//
// A forma anterior ({ base, intensidade }) não correspondia à doutrina: os
// valores de "base" eram na verdade os de PERDA DE GORDURA, o que fazia a
// dashboard prescrever mais proteína do que o Coach dizia no chat para o
// mesmo atleta. Passa a espelhar os três objetivos da doutrina, cada um com
// o seu intervalo [min, max].
export const PROTEIN_TARGETS = {
  iniciante: { manutencao: [1.2, 1.4], perda: [1.6, 1.8], ganho: [1.6, 2.0] },
  basico:    { manutencao: [1.4, 1.6], perda: [1.8, 2.0], ganho: [1.6, 2.0] },
  medio:     { manutencao: [1.6, 1.8], perda: [2.0, 2.2], ganho: [1.8, 2.2] },
  avancado:  { manutencao: [1.6, 2.0], perda: [2.0, 2.4], ganho: [1.8, 2.2] }
};
// Escalamento por volume: +0,1-0,2 g/kg/dia por cada +20 km/sem acima de
// 30 km/sem (mesma regra que buildNutritionTargets aplica no coach-chat).
export const PROTEIN_VOLUME_BONUS_PER_20KM = 0.15;
export const PROTEIN_VOLUME_BONUS_FROM_KM = 30;

// Hidratos por nível (g/kg/dia) — "fuel for the work required" (Burke 2011).
// Dia de descanso vs dia de treino, não "base vs intensidade".
export const CARB_TARGETS = {
  iniciante: { descanso: [3.0, 5.0], treino: [4.0, 5.0] },
  basico:    { descanso: [3.0, 4.0], treino: [5.0, 7.0] },
  medio:     { descanso: [4.0, 5.0], treino: [6.0, 8.0] },
  avancado:  { descanso: [5.0, 6.0], treino: [8.0, 10.0] }
};

// Weight Loss Limits (% da massa corporal por semana)
// Bloco 5 #4 da doutrina: o teto seguro é 0,7%/semana. Três rondas da
// investigação (Bloco 1 #6, Nutrição 4.1 #5, Nutrição 4.2 #3) convergiram
// em 0,5-0,7%; uma quarta (Bloco 5 #4, Garthe 2011) deu 0,5-1,0%. Vale a
// regra do valor mais conservador — 0,7% como teto, nunca 1,0%.
//
// Médio e Avançado apertam mais, por o défice máximo da doutrina ser dado
// em kg/semana (Bloco 4.1 #5): médio ≤0,25-0,40 kg/sem e avançado
// ≤0,20-0,30 kg/sem, que para um atleta de 70 kg dão ~0,5% e ~0,4%.
export const MAX_WEIGHT_LOSS_PCT_WEEK = {
  iniciante: 0.7,
  basico: 0.7,
  medio: 0.5,
  avancado: 0.4
};

// Recovery & Fatigue
export const RHR_FATIGUE_THRESHOLD_BPM = 5;
export const RPE_PACE_DISCREPANCY = 2;
export const CADENCE_DEGRADATION_PCT = 5;
