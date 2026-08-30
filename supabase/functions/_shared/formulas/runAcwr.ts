// ACWR de corrida (rácio agudo:crónico, carga em km) — janela de 7 dias
// (hoje + 6 anteriores) para a carga aguda, 28 dias (hoje + 27 anteriores)
// para a crónica.
//
// @contexto Unifica duas implementações que já delegavam a MESMA
// classificação (`classifyAcwrZone`, `_shared/formulas/acwr.ts`, desde a
// Fase C) mas com o próprio somatório das janelas duplicado E DIVERGENTE:
// `src/utils/biEngine.js calculateACWR` usava uma janela de 7/28 dias
// exatos; `supabase/functions/coach-chat/index.ts computeACWR` usava `>=`
// num limite pensado para `>`, dando 8/29 dias — o P0-3 original da
// auditoria (specs/formulas-checklist.md Fase A), que tinha ficado por
// resolver. Confirmado com o utilizador (2026-08-25, Fase E): unifica na
// janela do biEngine.js (7/28 dias), que é a que a UI já mostra — o
// coach-chat passa a alinhar com o ecrã, não o contrário.

import { computeAcwr, classifyAcwrZone } from "./acwr.ts";

const ACUTE_WINDOW_DAYS = 7;
const CHRONIC_WINDOW_DAYS = 28;

export interface RunForAcwr {
  date: string;
  distance_km?: number | null;
}

export interface RunAcwr {
  acuteKm: number;
  chronicWeeklyKm: number;
  ratio: number;
  status: ReturnType<typeof classifyAcwrZone> | "unknown";
  hasEnoughData: boolean;
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function computeRunAcwr(runs: RunForAcwr[], todayISO: string): RunAcwr {
  const acuteStart = addDaysISO(todayISO, -(ACUTE_WINDOW_DAYS - 1));
  const chronicStart = addDaysISO(todayISO, -(CHRONIC_WINDOW_DAYS - 1));

  let acuteKm = 0;
  let chronicKm = 0;
  for (const run of runs || []) {
    if (!run.date || run.date > todayISO || run.date < chronicStart) continue;
    const km = Number(run.distance_km) || 0;
    chronicKm += km;
    if (run.date >= acuteStart) acuteKm += km;
  }

  const chronicWeeklyKm = chronicKm / 4;
  const { ratio, zone } = computeAcwr(acuteKm, chronicWeeklyKm);
  const hasEnoughData = (runs || []).some((r) => r.date && r.date < acuteStart);

  return {
    acuteKm,
    chronicWeeklyKm,
    ratio: ratio ?? 0,
    status: zone,
    hasEnoughData,
  };
}
