// Agregados dos dados de relógio/GPS de um período: desnível acumulado,
// calorias totais, cadência média.
//
// @contexto Migrado de "watchMetrics" em src/components/Run/RunDashboard.jsx
// (specs/formulas-checklist.md Fase E). BUG DE PARIDADE encontrado ao migrar
// (2026-08-25): o original lia `r.elevation_gain_m`, `r.calories_kcal` e
// `r.avg_cadence_spm` como colunas de TOPO de `runs` — mas a tabela real só
// tem `details` (jsonb); estes três valores vivem em `details.elevation_gain_m`
// /`details.calories_kcal`/`details.cadence_spm` (não "avg_cadence_spm" — essa
// chave nunca existiu, nem em `RunRegistration.jsx` nem no schema). O cartão
// "Watch metrics" do RunDashboard mostrava sempre 0 km de desnível, 0 kcal e
// cadência "—", mesmo com dados gravados — mesma classe de bug do P0 da Fase E0
// (queries a pedirem/lerem o sítio errado), desta vez no frontend. Corrigido
// ao migrar: os nomes abaixo são os reais.

export interface RunForWatchMetrics {
  details?: {
    elevation_gain_m?: number | null;
    calories_kcal?: number | null;
    cadence_spm?: number | null;
  } | null;
}

export interface RunWatchMetrics {
  totalElevation: number;
  totalCalories: number;
  avgCadence: number | null;
}

export function computeRunWatchMetrics(runs: RunForWatchMetrics[]): RunWatchMetrics {
  let elevation = 0;
  let calories = 0;
  let cadenceSum = 0;
  let cadenceCount = 0;

  for (const r of runs) {
    const d = r.details || {};
    if (d.elevation_gain_m) elevation += Number(d.elevation_gain_m);
    if (d.calories_kcal) calories += Number(d.calories_kcal);
    if (d.cadence_spm) {
      cadenceSum += Number(d.cadence_spm);
      cadenceCount++;
    }
  }

  return {
    totalElevation: elevation,
    totalCalories: calories,
    avgCadence: cadenceCount > 0 ? Math.round(cadenceSum / cadenceCount) : null,
  };
}
