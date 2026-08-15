/**
 * biConstants.js
 * Todas as constantes quantitativas e limiares da doutrina de treinadores para o IronHealth.
 */

// ACWR Thresholds
export const ACWR_UNDER_TRAINING = 0.80; // (Yellow) < 0.80
export const ACWR_SAFE_MIN = 0.80;
export const ACWR_SAFE_MAX = 1.30; // (Green) 0.80 - 1.30
export const ACWR_CAUTION_MAX = 1.49; // (Orange) 1.31 - 1.49
export const ACWR_DANGER = 1.50; // (Red) >= 1.50
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

// RED-S / Energy Availability (EA)
export const EA_OPTIMAL = 45; // >= 45 kcal/kg FFM/day
export const EA_SUBCLINICAL_MIN = 30; // 30-45
export const EA_CRITICAL = 30; // < 30
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
export const VISCERAL_FAT_HEALTHY_MAX = 9;
export const VISCERAL_FAT_ALERT_MAX = 14;

// Riegel Race Prediction
export const RIEGEL_FACTOR = {
  iniciante: 1.085,
  basico: 1.085,
  medio: 1.06,
  avancado: 1.06
};

// Nutrition Targets (g/kg/day)
export const PROTEIN_TARGETS = {
  iniciante: { base: 1.6, intensidade: 1.8 },
  basico: { base: 1.8, intensidade: 2.0 },
  medio: { base: 2.0, intensidade: 2.2 },
  avancado: { base: 2.2, intensidade: 2.5 }
};

export const CARB_TARGETS = {
  iniciante: { base: 3.0, intensidade: 5.0 },
  basico: { base: 4.0, intensidade: 6.0 },
  medio: { base: 5.0, intensidade: 8.0 },
  avancado: { base: 6.0, intensidade: 10.0 }
};

// Weight Loss Limits
export const MAX_WEIGHT_LOSS_PCT_WEEK = {
  iniciante: 1.0,
  basico: 0.8,
  medio: 0.5,
  avancado: 0.5
};

// Recovery & Fatigue
export const RHR_FATIGUE_THRESHOLD_BPM = 5;
export const RPE_PACE_DISCREPANCY = 2;
export const CADENCE_DEGRADATION_PCT = 5;
