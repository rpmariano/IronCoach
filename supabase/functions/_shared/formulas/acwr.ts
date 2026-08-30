// T1 — ACWR (Acute:Chronic Workload Ratio), fórmula pura.
//
// @doutrina specs/coach-investigacao.md Bloco 2.3 #2 (progressão de carga)
// @doutrina specs/formulas-centralizacao.md §5.1 — decisão tomada: grandeza
// única em KM (não sRPE). Antes desta migração havia 3 implementações
// (biEngine.js em sRPE — min×RPE; coach-chat e coach-daily-summary em km,
// com janelas 7d/28d ligeiramente diferentes e limiares `>=` vs `>`
// divergentes). Esta é a única fórmula de classificação a partir de agora —
// ver specs/formulas-checklist.md Fase C.
//
// Regra de pureza: recebe carga já agregada (agudo = total dos últimos 7
// dias; crónico = MÉDIA SEMANAL dos últimos 28 dias, ou seja total/4) — a
// filtragem por data e a soma por corrida ficam no chamador, que já tem
// date-fns (frontend) ou já sabe formatar `today` em ISO (edge functions).

export const ACWR_DANGER = 1.50;
export const ACWR_SAFE_MAX = 1.30;
export const ACWR_UNDER_TRAINING = 0.80;

export type AcwrZone = 'danger' | 'caution' | 'safe' | 'undertrained';

// Fronteiras exatas (P0-2, specs/formulas-checklist.md): intervalos
// semi-abertos — (0.80, 1.30] → safe, (1.30, 1.50] → caution, > 1.50 →
// danger, < 0.80 → undertrained. O valor exato de cada limiar cai sempre
// no lado mais seguro (1.30 é safe, 1.50 é caution, não danger).
export function classifyAcwrZone(ratio: number): AcwrZone {
  if (ratio > ACWR_DANGER) return 'danger';
  if (ratio > ACWR_SAFE_MAX) return 'caution';
  if (ratio < ACWR_UNDER_TRAINING) return 'undertrained';
  return 'safe';
}

// acuteKm: total dos últimos 7 dias (incluindo hoje).
// chronicWeeklyKm: média semanal dos últimos 28 dias (total ÷ 4).
// Devolve ratio null (zona 'unknown') quando não há base crónica
// suficiente — um rácio sobre quase-zero é matematicamente inútil, não um
// "risco baixo" real.
export function computeAcwr(
  acuteKm: number,
  chronicWeeklyKm: number,
): { ratio: number | null; zone: AcwrZone | 'unknown' } {
  if (!(chronicWeeklyKm > 0)) return { ratio: null, zone: 'unknown' };
  const ratio = acuteKm / chronicWeeklyKm;
  return { ratio, zone: classifyAcwrZone(ratio) };
}
