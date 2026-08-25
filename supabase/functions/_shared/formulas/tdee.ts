// T1 — TMB (Mifflin-St Jeor) e GETD/TDEE, fórmula pura.
//
// @doutrina src/coach-knowledge/04-nutricao-base-diaria.md Bloco 4.1 #4
// GETD = TMB × fator de atividade NÃO-TREINO (1,2-1,4) + custo do treino à
// parte (custo de corrida ≈1,0 kcal/kg/km). Antes desta migração havia 2
// fatores diferentes nas Edge Functions: coach-chat usava ×1,3 + custo do
// treino (já batia com a doutrina); coach-daily-summary usava ×1,55 sem
// nenhum custo de treino somado — chegava a divergir ~400+ kcal do mesmo
// perfil no mesmo dia (P0-4, specs/formulas-checklist.md). Fase C escolheu
// 1,3 (meio da faixa 1,2-1,4) como fator único — decisão do utilizador.

// Mifflin-St Jeor (1990) — 2ª opção da doutrina quando a massa magra por
// DXA não está disponível (1ª opção, Cunningham 1980, não implementada:
// a app não tem massa magra por DXA, só por BIA).
export function computeBMR(
  weightKg: number,
  heightCm: number,
  age: number,
  isFemale: boolean,
): number {
  return isFemale
    ? 10 * weightKg + 6.25 * heightCm - 5 * age - 161
    : 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
}

export const TDEE_ACTIVITY_FACTOR = 1.3;

// weeklyVolumeKm: km corridos nos últimos 7 dias — o custo do treino é a
// média diária desse volume (≈1 kcal/kg/km), somado à TMB×fator. Sem
// volume ou sem peso, o custo fica 0 (não inventa treino que não houve).
export function computeTDEE(
  bmr: number,
  weeklyVolumeKm: number | null | undefined,
  weightKg: number | null | undefined,
): number {
  const runCost = (weeklyVolumeKm && weightKg) ? Math.round((weeklyVolumeKm * weightKg) / 7) : 0;
  return Math.round(bmr * TDEE_ACTIVITY_FACTOR) + runCost;
}
